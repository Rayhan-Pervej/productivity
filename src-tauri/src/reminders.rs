//! Reminder scheduler.
//!
//! The UI sends the list of upcoming reminders; this task sleeps until the next one is due
//! and shows a native notification. It keeps working while the window is closed.
//!
//! Sleep is capped at 60 s: the monotonic clock may pause while the PC sleeps, so a
//! once-a-minute re-check against the wall clock is what makes wake-up catch-up reliable.
//! That is one tiny wake-up per minute â€” no per-second polling.

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Notify;

use crate::window;

const MAX_SLEEP: Duration = Duration::from_secs(60);
/// A reminder more than this late was missed (PC asleep/off) and goes into the catch-up summary.
const LATE_MS: i64 = 2 * 60 * 1000;
const SNOOZE_MS: i64 = 10 * 60 * 1000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: String,
    pub block_id: String,
    /// "upcoming" | "starting" | "ending"
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
    /// "done" | "skip" | "extend" | "focus" | "catchup"
    pub action: String,
}

#[derive(Default)]
pub struct Scheduler {
    reminders: Mutex<Vec<Reminder>>,
    fired: Mutex<HashSet<String>>,
    /// Actions taken while the window was closed; the UI collects them when it opens.
    pending: Mutex<Vec<Action>>,
    /// When to reload the plan (just after local midnight), as told by the UI.
    refresh_at: Mutex<Option<i64>>,
    wake: Notify,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn set_reminders(reminders: Vec<Reminder>, refresh_at: Option<i64>, state: State<'_, Scheduler>) {
    *state.reminders.lock().unwrap() = reminders;
    *state.refresh_at.lock().unwrap() = refresh_at;
    state.wake.notify_one();
}

#[tauri::command]
pub fn take_pending_actions(state: State<'_, Scheduler>) -> Vec<Action> {
    std::mem::take(&mut *state.pending.lock().unwrap())
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let scheduler = app.state::<Scheduler>();
            let now = now_ms();

            let (due, next_at) = {
                let reminders = scheduler.reminders.lock().unwrap();
                let mut fired = scheduler.fired.lock().unwrap();
                let due: Vec<Reminder> = reminders
                    .iter()
                    .filter(|r| r.at <= now && !fired.contains(&r.id))
                    .cloned()
                    .collect();
                for r in &due {
                    fired.insert(r.id.clone());
                }
                let next_at = reminders
                    .iter()
                    .filter(|r| r.at > now && !fired.contains(&r.id))
                    .map(|r| r.at)
                    .min();
                (due, next_at)
            };

            deliver(&app, due, now);

            // New day: reload the plan so tomorrow's reminders exist.
            let refresh = *scheduler.refresh_at.lock().unwrap();
            if let Some(at) = refresh {
                if at <= now {
                    *scheduler.refresh_at.lock().unwrap() = None;
                    window::background_sync(&app);
                }
            }
            let next_at = match (next_at, *scheduler.refresh_at.lock().unwrap()) {
                (Some(a), Some(b)) => Some(a.min(b)),
                (a, b) => a.or(b),
            };

            let wait = next_at
                .map(|at| Duration::from_millis((at - now).max(0) as u64))
                .unwrap_or(MAX_SLEEP)
                .min(MAX_SLEEP);

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
        // Snooze is handled entirely here â€” no window needed.
        Some("snooze") => {
            if let Some(r) = reminder {
                let mut again = r.clone();
                again.at = now_ms() + SNOOZE_MS;
                again.id = format!("{}:snooze:{}", r.id, again.at);
                let scheduler = app.state::<Scheduler>();
                scheduler.reminders.lock().unwrap().push(again);
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
        Some(a @ ("done" | "skip" | "extend")) => dispatch(app, Action { block_id, action: a.into() }),
        // Clicking the notification body opens the app.
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

    // Unpackaged dev builds have no registered app id, so borrow PowerShell's;
    // the installed app uses its own identifier (registered by the installer's shortcut).
    let app_id = if cfg!(debug_assertions) {
        Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    };

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
    println!("[reminder] {title} â€” {body}");
}
