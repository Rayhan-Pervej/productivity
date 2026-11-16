//! Reminder timing derived from the stored plan: which reminders fire today, quiet hours,
//! time formatting and the chosen notification sound. The scheduler lives in `crate::reminders`.

use std::collections::HashMap;

use chrono::{Local, NaiveDate, TimeZone};
use rusqlite::Connection;
use serde_json::Value;

use crate::reminders::Reminder;

use super::load::load_blocks;
use super::util::{day_key, meta_get, now_ms};

/// Reminders for today's tracked blocks, computed from the database (same rules and wording as the UI).
pub fn reminders_for_today(conn: &Connection, today: NaiveDate) -> rusqlite::Result<Vec<Reminder>> {
    let settings: Value = meta_get(conn, "settings")?
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null);
    let lead = settings["leadMinutes"].as_f64().unwrap_or(5.0);
    let quiet_from = settings["quietFrom"].as_f64().unwrap_or(30.0);
    let quiet_to = settings["quietTo"].as_f64().unwrap_or(420.0);
    let twelve_hour = settings["timeFormat"].as_str() != Some("24h");

    let areas: HashMap<String, String> = {
        let mut st = conn.prepare("SELECT id, name FROM areas WHERE deleted_at IS NULL")?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.collect::<Result<_, _>>()?
    };

    let today_key = day_key(today);
    let midnight = Local
        .from_local_datetime(&today.and_hms_opt(0, 0, 0).expect("valid midnight"))
        .earliest()
        .map(|t| t.timestamp_millis())
        .unwrap_or_else(now_ms);
    let now = now_ms();

    let mut out = Vec::new();
    for b in load_blocks(conn, "day = ?1", &today_key)? {
        if b.kind != "commitment" || b.status != "planned" {
            continue;
        }
        let area = areas.get(&b.area_id).cloned().unwrap_or_default();
        let span = format!("{} – {}", fmt_time(b.start, twelve_hour), fmt_time(b.end, twelve_hour));
        let mut add = |kind: &str, minute: f64, title: String, body: String| {
            if in_quiet_hours(minute, quiet_from, quiet_to) {
                return;
            }
            let at = midnight + (minute * 60_000.0).round() as i64;
            if at <= now {
                return;
            }
            out.push(Reminder {
                id: format!("{}:{}:{}", b.id, kind, minute),
                block_id: b.id.clone(),
                kind: kind.into(),
                title,
                body,
                at,
            });
        };
        if lead > 0.0 {
            add(
                "upcoming",
                b.start - lead,
                b.title.clone(),
                format!("Starts in {lead} min · {span}"),
            );
        }
        let who = if area.is_empty() { b.title.clone() } else { area.clone() };
        add("starting", b.start, format!("Time for {who}"), b.title.clone());
        let owner = if area.is_empty() {
            "Your".to_string()
        } else {
            area.clone()
        };
        add(
            "ending",
            b.end,
            format!("{owner} block is ending"),
            format!("Is {} done?", b.title),
        );
    }
    Ok(out)
}

/// The reminder sound chosen in Settings: "default" (Windows), "none", or one of ours (e.g. "marimba").
/// A sound that no longer exists (removed in an update) falls back to the default.
pub fn notification_sound(conn: &Connection) -> String {
    meta_get(conn, "settings")
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v["notificationSound"].as_str().map(String::from))
        .filter(|s| s == "default" || s == "none" || crate::sound::is_custom(s))
        .unwrap_or_else(|| "marimba".into())
}

pub fn in_quiet_hours(minute: f64, from: f64, to: f64) -> bool {
    let m = minute.rem_euclid(1440.0);
    if from <= to {
        m >= from && m < to
    } else {
        m >= from || m < to
    }
}

pub fn fmt_time(minute: f64, twelve_hour: bool) -> String {
    let m = minute.round() as i64;
    let (h, mm) = ((m / 60).rem_euclid(24), m.rem_euclid(60));
    if twelve_hour {
        let suffix = if h < 12 { "AM" } else { "PM" };
        let h12 = if h % 12 == 0 { 12 } else { h % 12 };
        format!("{h12}:{mm:02} {suffix}")
    } else {
        format!("{h:02}:{mm:02}")
    }
}
