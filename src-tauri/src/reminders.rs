//! Reminder scheduler.
//!
//! Reminders are computed from the database (`store::reminders_for_today`) whenever the plan
//! changes, at startup, and when a new day begins. This task sleeps until the next one is due
//! and shows a native notification. It keeps working while the window is closed.
//!
//! Sleep is capped at 60 s: the monotonic clock may pause while the PC sleeps, so a
//! once-a-minute re-check against the wall clock is what makes wake-up catch-up reliable.
//! That is one tiny wake-up per minute, never per-second polling.

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use chrono::{Local, TimeZone};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Notify;

use crate::db::Db;
use crate::{store, window};

/// The notification identity registered at startup (see identity.rs).
static APP_ID: std::sync::OnceLock<String> = std::sync::OnceLock::new();

pub fn set_app_id(id: String) {
    let _ = APP_ID.set(id);
}

const MAX_SLEEP: Duration = Duration::from_secs(60);
/// A reminder more than this late was missed (PC asleep/off) and goes into the catch-up summary.
const LATE_MS: i64 = 2 * 60 * 1000;
const SNOOZE_MS: i64 = 10 * 60 * 1000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: String,
    pub block_id: String,
    /// "upcoming" | "starting" | "ending" | "missed"
    pub kind: String,
    pub title: String,
    pub body: String,
    /// Unix epoch, milliseconds.
    pub at: i64,
}

/// Something the user chose in a notification, for the UI to apply.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub block_id: String,
    /// "done" | "skip" | "extend" | "tomorrow" | "backlog" | "focus" | "catchup"
    pub action: String,
}

#[derive(Default)]
pub struct Scheduler {
    reminders: Mutex<Vec<Reminder>>,
    /// Snoozed reminders survive a recompute (they aren't part of the plan).
    snoozed: Mutex<Vec<Reminder>>,
    fired: Mutex<HashSet<String>>,
    /// Actions taken while the window was closed; the UI collects them when it opens.
    pending: Mutex<Vec<Action>>,
    /// Just after the next local midnight: roll the day over.
    next_day_at: Mutex<i64>,
    wake: Notify,
}

/// One minute after the next local midnight.
fn next_day_at() -> i64 {
    let tomorrow = store::local_today().succ_opt().unwrap_or_else(store::local_today);
    Local
        .from_local_datetime(&tomorrow.and_hms_opt(0, 1, 0).expect("valid time"))
        .earliest()
        .map(|t| t.timestamp_millis())
        .unwrap_or_else(|| store::now_ms() + 3_600_000)
}

/// Recompute today's reminders from the database and wake the scheduler.
pub fn refresh(app: &AppHandle) {
    let reminders = {
        let db = app.state::<Db>();
        let conn = match db.0.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        store::reminders_for_today(&conn, store::local_today()).unwrap_or_default()
    };
    let scheduler = app.state::<Scheduler>();
    *scheduler.reminders.lock().unwrap() = reminders;
    *scheduler.next_day_at.lock().unwrap() = next_day_at();
    scheduler.wake.notify_one();
}

/// A new day began: roll over in the database, back it up, refresh reminders, tell an open window.
pub fn start_new_day(app: &AppHandle) {
    {
        let db = app.state::<Db>();
        let Ok(mut conn) = db.0.lock() else { return };
        let today = store::local_today();
        if let Err(err) = store::ensure_today(&mut conn, today) {
            eprintln!("day rollover failed: {err}");
        }
        crate::backup_today(app, &conn);
    }
    refresh(app);
    if window::is_open(app) {
        let _ = app.emit_to(window::MAIN, "refresh-day", ());
    }
}

/// Show one notification right now (used by the dev prototype controls to test real toasts).
#[tauri::command]
pub fn preview_notification(app: AppHandle, reminder: Reminder) {
    deliver(&app, vec![reminder], store::now_ms());
}

#[tauri::command]
pub fn take_pending_actions(state: State<'_, Scheduler>) -> Vec<Action> {
    std::mem::take(&mut *state.pending.lock().unwrap())
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let scheduler = app.state::<Scheduler>();
            let now = store::now_ms();

            if now >= *scheduler.next_day_at.lock().unwrap() {
                start_new_day(&app); // also sets the next day boundary
                continue;
            }

            let (due, next_at) = {
                let mut all = scheduler.reminders.lock().unwrap().clone();
                all.extend(scheduler.snoozed.lock().unwrap().iter().cloned());
                let mut fired = scheduler.fired.lock().unwrap();
                let due: Vec<Reminder> = all.iter().filter(|r| r.at <= now && !fired.contains(&r.id)).cloned().collect();
                for r in &due {
                    fired.insert(r.id.clone());
                }
                let next_at = all.iter().filter(|r| r.at > now && !fired.contains(&r.id)).map(|r| r.at).min();
                (due, next_at)
            };

            deliver(&app, due, now);

            let next_at = next_at.unwrap_or(i64::MAX).min(*scheduler.next_day_at.lock().unwrap());
            let wait = Duration::from_millis((next_at - now).max(0) as u64).min(MAX_SLEEP);

            tokio::select! {
                _ = tokio::time::sleep(wait) => {}
                _ = scheduler.wake.notified() => {}
            }
        }
    });
}

fn deliver(app: &AppHandle, due: Vec<Reminder>, now: i64) {
    let (late, fresh): (Vec<_>, Vec<_>) = due.into_iter().partition(|r| now - r.at > LATE_MS);

    for r in fresh {
        let buttons: &[(&str, &str)] = match r.kind.as_str() {
            "ending" => &[("Done", "done"), ("+10 min", "extend"), ("Not yet", "dismiss")],
            "missed" => &[("Tomorrow", "tomorrow"), ("Backlog", "backlog"), ("Open", "open")],
            _ => &[("Start focus", "focus"), ("Snooze", "snooze"), ("Skip", "skip")],
        };
        let (title, body) = (r.title.clone(), r.body.clone());
        notify(app, &title, &body, buttons, Some(r));
    }

    // One calm summary instead of a burst of stale notifications.
    if !late.is_empty() {
        let n = late.len();
        let body = format!("{n} {} passed while you were away.", if n == 1 { "reminder" } else { "reminders" });
        notify(app, "Welcome back", &body, &[("Review", "catchup")], None);
    }
}

fn handle(app: &AppHandle, reminder: Option<&Reminder>, action: Option<&str>) {
    let block_id = reminder.map(|r| r.block_id.clone()).unwrap_or_default();
    match action {
        // Snooze is handled entirely here, no window needed.
        Some("snooze") => {
            if let Some(r) = reminder {
                let mut again = r.clone();
                again.at = store::now_ms() + SNOOZE_MS;
                again.id = format!("{}:snooze:{}", r.id, again.at);
                let scheduler = app.state::<Scheduler>();
                scheduler.snoozed.lock().unwrap().push(again);
                scheduler.wake.notify_one();
            }
        }
        Some("dismiss") => {}
        // These need the UI in front of the user.
        Some(a @ ("focus" | "catchup")) => {
            dispatch(app, Action { block_id, action: a.into() });
            window::show_main(app, None);
        }
        // These just change data; apply quietly, even with the window closed.
        Some(a @ ("done" | "skip" | "extend" | "tomorrow" | "backlog")) => {
            dispatch(app, Action { block_id, action: a.into() })
        }
        // "open", or a click on the notification body.
        _ => window::show_main(app, None),
    }
}

/// Send to the open window, or keep it until the window opens next.
fn dispatch(app: &AppHandle, action: Action) {
    if window::is_open(app) {
        let _ = app.emit_to(window::MAIN, "reminder-action", action);
    } else {
        app.state::<Scheduler>().pending.lock().unwrap().push(action);
    }
}

#[cfg(windows)]
fn notify(app: &AppHandle, title: &str, body: &str, buttons: &[(&str, &str)], reminder: Option<Reminder>) {
    use tauri_winrt_notification::Toast;

    // Our own registered identity; PowerShell's only as a last-resort fallback.
    let app_id = APP_ID.get().cloned().unwrap_or_else(|| Toast::POWERSHELL_APP_ID.to_string());

    let mut toast = Toast::new(&app_id).title(title).text1(body);
    for (label, action) in buttons {
        toast = toast.add_button(label, action);
    }
    let handle_app = app.clone();
    let toast = toast.on_activated(move |action| {
        handle(&handle_app, reminder.as_ref(), action.as_deref());
        Ok(())
    });
    if let Err(err) = toast.show() {
        eprintln!("notification failed: {err:?}");
    }
}

#[cfg(not(windows))]
fn notify(_app: &AppHandle, title: &str, body: &str, _buttons: &[(&str, &str)], _reminder: Option<Reminder>) {
    println!("[reminder] {title}: {body}");
}
