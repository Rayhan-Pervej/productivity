//! Small shared helpers: time and day keys, ids, the `meta` table and the activity log.

use chrono::{Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};

// ───────────────────────── helpers ─────────────────────────

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn day_key(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

pub(super) fn parse_day(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

pub(super) fn add_days(day: &str, n: i64) -> String {
    parse_day(day)
        .and_then(|d| d.checked_add_signed(chrono::Duration::days(n)))
        .map(day_key)
        .unwrap_or_else(|| day.to_string())
}

pub(super) fn days_between(from: &str, to: &str) -> i64 {
    match (parse_day(from), parse_day(to)) {
        (Some(a), Some(b)) => (b - a).num_days(),
        _ => 0,
    }
}

pub(super) fn meta_get(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0))
        .optional()
}

pub(super) fn meta_set(tx: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO meta(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub(super) fn log(
    tx: &Connection,
    at: i64,
    action: &str,
    entity: &str,
    id: &str,
    data: Option<&str>,
) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO activity(at, action, entity, entity_id, data) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![at, action, entity, id, data],
    )?;
    Ok(())
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Local "today" and minute-of-day, from the system clock.
pub fn local_today() -> NaiveDate {
    Local::now().date_naive()
}
