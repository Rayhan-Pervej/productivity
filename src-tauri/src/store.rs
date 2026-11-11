//! The app's data in SQLite.
//!
//! The UI keeps its in-memory state and sends a snapshot of it after every change (`save`).
//! Here it's written into normalized tables in one transaction; only rows that actually changed
//! get a new `updated_at`, and status changes are appended to the activity log.
//! Rust also owns the day: `ensure_today` rolls over at startup and midnight, and
//! `reminders_for_today` derives reminders from the stored plan.

use std::collections::HashMap;

use chrono::{Datelike, Local, NaiveDate, TimeZone};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::reminders::Reminder;

// ───────────────────────── Snapshot (same shape as the UI's saved state) ─────────────────────────

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Subtask {
    pub id: String,
    pub title: String,
    pub done: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: String,
    pub title: String,
    pub area_id: String,
    pub kind: String,
    pub start: f64,
    pub end: f64,
    pub status: String,
    #[serde(default)]
    pub subtasks: Vec<Subtask>,
    #[serde(default)]
    pub from_plan: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub routine_id: Option<String>,
    /// A repeat copy changed "only this day": edits to the repeat don't touch it.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub detached: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub day_offset: Option<i64>,
}

/// Repeats on chosen weekdays (0 = Sunday … 6 = Saturday) at a fixed time.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Routine {
    pub id: String,
    pub title: String,
    pub area_id: String,
    pub start: f64,
    pub end: f64,
    pub days: Vec<u8>,
    /// Last day it happens, inclusive ("2026-11-30"); none = no end.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub until: Option<String>,
    /// Days it was removed from (calendar-style exceptions).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skip_days: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub area_id: Option<String>,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub day_offset: Option<i64>,
    pub done: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct InboxItem {
    pub id: String,
    pub title: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateBlock {
    pub id: String,
    pub title: String,
    pub area_id: String,
    pub kind: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub days: String,
    pub blocks: Vec<TemplateBlock>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Area {
    pub id: String,
    pub name: String,
    pub color: String,
}

/// What the UI persists (zustand `partialize`), wrapped as `{ state, version }`.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub settings: Value,
    pub onboarded: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub areas: Vec<Area>,
    pub templates: Vec<Template>,
    pub active_template_id: String,
    pub day_key: String,
    pub blocks: Vec<Block>,
    pub anytime: Vec<Task>,
    pub inbox: Vec<InboxItem>,
    pub backlog: Vec<Task>,
    pub upcoming: Vec<Block>,
    #[serde(default)]
    pub routines: Vec<Routine>,
}

fn default_theme() -> String {
    "system".into()
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Persisted {
    pub state: State,
    pub version: i64,
}

// ───────────────────────── helpers ─────────────────────────

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn day_key(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

fn parse_day(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

fn add_days(day: &str, n: i64) -> String {
    parse_day(day)
        .and_then(|d| d.checked_add_signed(chrono::Duration::days(n)))
        .map(day_key)
        .unwrap_or_else(|| day.to_string())
}

fn days_between(from: &str, to: &str) -> i64 {
    match (parse_day(from), parse_day(to)) {
        (Some(a), Some(b)) => (b - a).num_days(),
        _ => 0,
    }
}

fn meta_get(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0)).optional()
}

fn meta_set(tx: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO meta(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

fn log(tx: &Connection, at: i64, action: &str, entity: &str, id: &str, data: Option<&str>) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO activity(at, action, entity, entity_id, data) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![at, action, entity, id, data],
    )?;
    Ok(())
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

// ───────────────────────── save ─────────────────────────

pub fn save(conn: &mut Connection, snapshot: &Persisted) -> rusqlite::Result<()> {
    let s = &snapshot.state;
    let now = now_ms();
    let tx = conn.transaction()?;

    meta_set(&tx, "settings", &s.settings.to_string())?;
    meta_set(&tx, "onboarded", if s.onboarded { "1" } else { "0" })?;
    meta_set(&tx, "theme", &s.theme)?;
    meta_set(&tx, "active_template_id", &s.active_template_id)?;
    meta_set(&tx, "version", &snapshot.version.to_string())?;
    if !s.day_key.is_empty() {
        meta_set(&tx, "last_day", &s.day_key)?;
    }

    save_areas(&tx, &s.areas, now)?;
    save_templates(&tx, &s.templates, now)?;
    save_routines(&tx, &s.routines, now)?;
    save_blocks(&tx, s, now)?;
    save_tasks(&tx, s, now)?;

    tx.commit()
}

fn save_areas(tx: &Transaction, areas: &[Area], now: i64) -> rusqlite::Result<()> {
    if areas.is_empty() {
        return Ok(()); // older UI versions didn't send areas; keep what's stored
    }
    for (i, a) in areas.iter().enumerate() {
        tx.execute(
            "INSERT INTO areas(id, name, color, sort, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, sort = excluded.sort,
               updated_at = excluded.updated_at, deleted_at = NULL
             WHERE areas.name IS NOT excluded.name OR areas.color IS NOT excluded.color
               OR areas.sort IS NOT excluded.sort OR areas.deleted_at IS NOT NULL",
            params![a.id, a.name, a.color, i as i64, now],
        )?;
    }
    soft_delete_missing(tx, "areas", "1 = 1", &areas.iter().map(|a| a.id.clone()).collect::<Vec<_>>(), now)
}

fn days_text(days: &[u8]) -> String {
    days.iter().map(|d| d.to_string()).collect::<Vec<_>>().join(",")
}

fn parse_days(text: &str) -> Vec<u8> {
    text.split(',').filter_map(|d| d.trim().parse().ok()).filter(|d| *d <= 6).collect()
}

fn save_routines(tx: &Transaction, routines: &[Routine], now: i64) -> rusqlite::Result<()> {
    for (i, r) in routines.iter().enumerate() {
        tx.execute(
            "INSERT INTO routines(id, title, area_id, start_min, end_min, days, until_day, skip_days, sort, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET title = excluded.title, area_id = excluded.area_id,
               start_min = excluded.start_min, end_min = excluded.end_min, days = excluded.days,
               until_day = excluded.until_day, skip_days = excluded.skip_days, sort = excluded.sort,
               updated_at = excluded.updated_at, deleted_at = NULL
             WHERE routines.title IS NOT excluded.title OR routines.area_id IS NOT excluded.area_id
               OR routines.start_min IS NOT excluded.start_min OR routines.end_min IS NOT excluded.end_min
               OR routines.days IS NOT excluded.days OR routines.until_day IS NOT excluded.until_day
               OR routines.skip_days IS NOT excluded.skip_days
               OR routines.sort IS NOT excluded.sort OR routines.deleted_at IS NOT NULL",
            params![r.id, r.title, r.area_id, r.start, r.end, days_text(&r.days), r.until, r.skip_days.join(","), i as i64, now],
        )?;
    }
    soft_delete_missing(tx, "routines", "1 = 1", &routines.iter().map(|r| r.id.clone()).collect::<Vec<_>>(), now)
}

fn load_routines(conn: &Connection) -> rusqlite::Result<Vec<Routine>> {
    let mut st = conn.prepare(
        "SELECT id, title, area_id, start_min, end_min, days, until_day, skip_days FROM routines WHERE deleted_at IS NULL ORDER BY sort",
    )?;
    let rows = st.query_map([], |r| {
        Ok(Routine {
            id: r.get(0)?,
            title: r.get(1)?,
            area_id: r.get(2)?,
            start: r.get(3)?,
            end: r.get(4)?,
            days: parse_days(&r.get::<_, String>(5)?),
            until: r.get(6)?,
            skip_days: r
                .get::<_, Option<String>>(7)?
                .map(|s| s.split(',').filter(|d| !d.is_empty()).map(String::from).collect())
                .unwrap_or_default(),
        })
    })?;
    rows.collect()
}

fn save_templates(tx: &Transaction, templates: &[Template], now: i64) -> rusqlite::Result<()> {
    let mut block_ids = Vec::new();
    for (i, t) in templates.iter().enumerate() {
        tx.execute(
            "INSERT INTO templates(id, name, days, sort, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, days = excluded.days, sort = excluded.sort,
               updated_at = excluded.updated_at, deleted_at = NULL
             WHERE templates.name IS NOT excluded.name OR templates.days IS NOT excluded.days
               OR templates.sort IS NOT excluded.sort OR templates.deleted_at IS NOT NULL",
            params![t.id, t.name, t.days, i as i64, now],
        )?;
        for (j, b) in t.blocks.iter().enumerate() {
            block_ids.push(b.id.clone());
            tx.execute(
                "INSERT INTO template_blocks(id, template_id, title, area_id, kind, start_min, end_min, sort, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET template_id = excluded.template_id, title = excluded.title,
                   area_id = excluded.area_id, kind = excluded.kind, start_min = excluded.start_min,
                   end_min = excluded.end_min, sort = excluded.sort, updated_at = excluded.updated_at, deleted_at = NULL
                 WHERE template_blocks.title IS NOT excluded.title OR template_blocks.area_id IS NOT excluded.area_id
                   OR template_blocks.kind IS NOT excluded.kind OR template_blocks.start_min IS NOT excluded.start_min
                   OR template_blocks.end_min IS NOT excluded.end_min OR template_blocks.sort IS NOT excluded.sort
                   OR template_blocks.template_id IS NOT excluded.template_id OR template_blocks.deleted_at IS NOT NULL",
                params![b.id, t.id, b.title, b.area_id, b.kind, b.start, b.end, j as i64, now],
            )?;
        }
    }
    soft_delete_missing(tx, "templates", "1 = 1", &templates.iter().map(|t| t.id.clone()).collect::<Vec<_>>(), now)?;
    soft_delete_missing(tx, "template_blocks", "1 = 1", &block_ids, now)
}

fn save_blocks(tx: &Transaction, s: &State, now: i64) -> rusqlite::Result<()> {
    let today = s.day_key.as_str();
    if today.is_empty() {
        return Ok(());
    }
    let dated = s
        .blocks
        .iter()
        .map(|b| (today.to_string(), b))
        .chain(s.upcoming.iter().map(|b| (add_days(today, b.day_offset.unwrap_or(1)), b)));

    let mut ids = Vec::new();
    for (day, b) in dated {
        ids.push(b.id.clone());
        let previous: Option<String> = tx
            .query_row("SELECT status FROM blocks WHERE id = ?1 AND deleted_at IS NULL", [&b.id], |r| r.get(0))
            .optional()?;
        match previous.as_deref() {
            None => log(tx, now, "created", "block", &b.id, Some(&b.title))?,
            Some(prev) if prev != b.status => {
                let action = match b.status.as_str() {
                    "done" => "done",
                    "skipped" => "skipped",
                    _ => "reopened",
                };
                log(tx, now, action, "block", &b.id, Some(&b.title))?
            }
            _ => {}
        }
        tx.execute(
            "INSERT INTO blocks(id, day, title, area_id, kind, start_min, end_min, status, from_plan, routine_id, detached, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(id) DO UPDATE SET day = excluded.day, title = excluded.title, area_id = excluded.area_id,
               kind = excluded.kind, start_min = excluded.start_min, end_min = excluded.end_min,
               status = excluded.status, from_plan = excluded.from_plan, routine_id = excluded.routine_id,
               detached = excluded.detached, updated_at = excluded.updated_at, deleted_at = NULL
             WHERE blocks.day IS NOT excluded.day OR blocks.title IS NOT excluded.title
               OR blocks.area_id IS NOT excluded.area_id OR blocks.kind IS NOT excluded.kind
               OR blocks.start_min IS NOT excluded.start_min OR blocks.end_min IS NOT excluded.end_min
               OR blocks.status IS NOT excluded.status OR blocks.from_plan IS NOT excluded.from_plan
               OR blocks.routine_id IS NOT excluded.routine_id OR blocks.detached IS NOT excluded.detached
               OR blocks.deleted_at IS NOT NULL",
            params![b.id, day, b.title, b.area_id, b.kind, b.start, b.end, b.status, b.from_plan, b.routine_id, b.detached, now],
        )?;
        save_subtasks(tx, b, now)?;
    }

    // Blocks for today and later that the UI no longer has were deleted there. Past days are history.
    soft_delete_missing(tx, "blocks", &format!("day >= '{today}'"), &ids, now)
}

fn save_subtasks(tx: &Transaction, b: &Block, now: i64) -> rusqlite::Result<()> {
    for (i, t) in b.subtasks.iter().enumerate() {
        let previous: Option<bool> = tx
            .query_row("SELECT done FROM subtasks WHERE id = ?1 AND deleted_at IS NULL", [&t.id], |r| r.get(0))
            .optional()?;
        if previous == Some(false) && t.done {
            log(tx, now, "step_done", "subtask", &t.id, Some(&t.title))?;
        }
        tx.execute(
            "INSERT INTO subtasks(id, block_id, title, done, sort, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET block_id = excluded.block_id, title = excluded.title, done = excluded.done,
               sort = excluded.sort, updated_at = excluded.updated_at, deleted_at = NULL
             WHERE subtasks.title IS NOT excluded.title OR subtasks.done IS NOT excluded.done
               OR subtasks.sort IS NOT excluded.sort OR subtasks.block_id IS NOT excluded.block_id
               OR subtasks.deleted_at IS NOT NULL",
            params![t.id, b.id, t.title, t.done, i as i64, now],
        )?;
    }
    let ids: Vec<String> = b.subtasks.iter().map(|t| t.id.clone()).collect();
    let escaped = b.id.replace('\'', "''");
    soft_delete_missing(tx, "subtasks", &format!("block_id = '{escaped}'"), &ids, now)
}

fn save_tasks(tx: &Transaction, s: &State, now: i64) -> rusqlite::Result<()> {
    let today = s.day_key.as_str();
    let mut rows: Vec<(&str, Task)> = Vec::new();
    rows.extend(s.anytime.iter().map(|t| ("anytime", t.clone())));
    rows.extend(s.backlog.iter().map(|t| ("backlog", t.clone())));
    rows.extend(s.inbox.iter().map(|i| {
        ("inbox", Task { id: i.id.clone(), title: i.title.clone(), kind: "backlog".into(), ..Default::default() })
    }));

    let mut ids = Vec::new();
    for (i, (list, t)) in rows.iter().enumerate() {
        ids.push(t.id.clone());
        let day = t.day_offset.filter(|d| *d > 0).map(|d| add_days(today, d));
        let previous: Option<bool> = tx
            .query_row("SELECT done FROM tasks WHERE id = ?1 AND deleted_at IS NULL", [&t.id], |r| r.get(0))
            .optional()?;
        if previous == Some(false) && t.done {
            log(tx, now, "done", "task", &t.id, Some(&t.title))?;
        }
        tx.execute(
            "INSERT INTO tasks(id, list, title, area_id, type, duration, due, day, done, sort, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
             ON CONFLICT(id) DO UPDATE SET list = excluded.list, title = excluded.title, area_id = excluded.area_id,
               type = excluded.type, duration = excluded.duration, due = excluded.due, day = excluded.day,
               done = excluded.done, sort = excluded.sort, updated_at = excluded.updated_at, deleted_at = NULL
             WHERE tasks.list IS NOT excluded.list OR tasks.title IS NOT excluded.title
               OR tasks.area_id IS NOT excluded.area_id OR tasks.type IS NOT excluded.type
               OR tasks.duration IS NOT excluded.duration OR tasks.due IS NOT excluded.due
               OR tasks.day IS NOT excluded.day OR tasks.done IS NOT excluded.done
               OR tasks.sort IS NOT excluded.sort OR tasks.deleted_at IS NOT NULL",
            params![t.id, list, t.title, t.area_id, t.kind, t.duration, t.due, day, t.done, i as i64, now],
        )?;
    }

    // Missing from the UI: finished ones are archived (kept as history), the rest were deleted.
    let placeholders = ids_list(&ids);
    tx.execute(
        &format!(
            "UPDATE tasks SET list = 'archived', updated_at = ?1
             WHERE deleted_at IS NULL AND list != 'archived' AND done = 1 AND id NOT IN ({placeholders})"
        ),
        [now],
    )?;
    tx.execute(
        &format!(
            "UPDATE tasks SET deleted_at = ?1, updated_at = ?1
             WHERE deleted_at IS NULL AND list != 'archived' AND id NOT IN ({placeholders})"
        ),
        [now],
    )?;
    Ok(())
}

/// Quote ids for an `IN (...)` list (ids are UUIDs or simple slugs; quotes are escaped anyway).
fn ids_list(ids: &[String]) -> String {
    if ids.is_empty() {
        return "''".into();
    }
    ids.iter().map(|id| format!("'{}'", id.replace('\'', "''"))).collect::<Vec<_>>().join(",")
}

fn soft_delete_missing(tx: &Connection, table: &str, scope: &str, keep: &[String], now: i64) -> rusqlite::Result<()> {
    tx.execute(
        &format!(
            "UPDATE {table} SET deleted_at = ?1, updated_at = ?1
             WHERE deleted_at IS NULL AND {scope} AND id NOT IN ({})",
            ids_list(keep)
        ),
        [now],
    )?;
    Ok(())
}

// ───────────────────────── load ─────────────────────────

/// Everything the UI needs, as `{ state, version }` JSON. `None` until the first save (new install).
pub fn load(conn: &Connection, today: &str) -> rusqlite::Result<Option<Value>> {
    let Some(settings) = meta_get(conn, "settings")? else {
        return Ok(None);
    };
    let settings: Value = serde_json::from_str(&settings).unwrap_or(Value::Null);
    let onboarded = meta_get(conn, "onboarded")?.as_deref() == Some("1");
    let theme = meta_get(conn, "theme")?.unwrap_or_else(default_theme);
    let active_template_id = meta_get(conn, "active_template_id")?.unwrap_or_else(|| "workday".into());
    let version: i64 = meta_get(conn, "version")?.and_then(|v| v.parse().ok()).unwrap_or(3);

    let areas = {
        let mut st = conn.prepare("SELECT id, name, color FROM areas WHERE deleted_at IS NULL ORDER BY sort")?;
        let rows = st.query_map([], |r| Ok(Area { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? }))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    let templates = load_templates(conn)?;
    let routines = load_routines(conn)?;

    let mut blocks = Vec::new();
    let mut upcoming = Vec::new();
    for mut b in load_blocks(conn, "day >= ?1", today)? {
        let offset = b.day_offset.take().unwrap_or(0);
        if offset == 0 {
            blocks.push(b);
        } else {
            b.day_offset = Some(offset);
            upcoming.push(b);
        }
    }

    let mut anytime = Vec::new();
    let mut backlog = Vec::new();
    let mut inbox = Vec::new();
    {
        let mut st = conn.prepare(
            "SELECT id, list, title, area_id, type, duration, due, day, done FROM tasks
             WHERE deleted_at IS NULL AND list IN ('anytime', 'backlog', 'inbox') ORDER BY sort",
        )?;
        let rows = st.query_map([], |r| {
            let day: Option<String> = r.get(7)?;
            Ok((
                r.get::<_, String>(1)?,
                Task {
                    id: r.get(0)?,
                    title: r.get(2)?,
                    area_id: r.get(3)?,
                    kind: r.get(4)?,
                    duration: r.get(5)?,
                    due: r.get(6)?,
                    // A planned day that has arrived becomes plain "anytime today".
                    day_offset: day.map(|d| days_between(today, &d)).filter(|d| *d > 0),
                    done: r.get(8)?,
                },
            ))
        })?;
        for row in rows {
            let (list, t) = row?;
            match list.as_str() {
                "anytime" => anytime.push(t),
                "backlog" => backlog.push(t),
                _ => inbox.push(InboxItem { id: t.id, title: t.title }),
            }
        }
    }

    Ok(Some(json!({
        "state": {
            "settings": settings,
            "onboarded": onboarded,
            "theme": theme,
            "areas": areas,
            "templates": templates,
            "activeTemplateId": active_template_id,
            "dayKey": today,
            "blocks": blocks,
            "upcoming": upcoming,
            "routines": routines,
            "anytime": anytime,
            "backlog": backlog,
            "inbox": inbox,
        },
        "version": version,
    })))
}

fn load_templates(conn: &Connection) -> rusqlite::Result<Vec<Template>> {
    let mut st = conn.prepare("SELECT id, name, days FROM templates WHERE deleted_at IS NULL ORDER BY sort")?;
    let mut templates = st
        .query_map([], |r| Ok(Template { id: r.get(0)?, name: r.get(1)?, days: r.get(2)?, blocks: vec![] }))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut st = conn.prepare(
        "SELECT template_id, id, title, area_id, kind, start_min, end_min FROM template_blocks
         WHERE deleted_at IS NULL ORDER BY sort",
    )?;
    let rows = st.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            TemplateBlock {
                id: r.get(1)?,
                title: r.get(2)?,
                area_id: r.get(3)?,
                kind: r.get(4)?,
                start: r.get(5)?,
                end: r.get(6)?,
            },
        ))
    })?;
    let mut by_template: HashMap<String, Vec<TemplateBlock>> = HashMap::new();
    for row in rows {
        let (tid, b) = row?;
        by_template.entry(tid).or_default().push(b);
    }
    for t in &mut templates {
        t.blocks = by_template.remove(&t.id).unwrap_or_default();
    }
    Ok(templates)
}

/// Blocks matching `where_day` (one `?1` day parameter), with steps; `day_offset` is days from `today`.
fn load_blocks(conn: &Connection, where_day: &str, today: &str) -> rusqlite::Result<Vec<Block>> {
    let mut st = conn.prepare(&format!(
        "SELECT id, day, title, area_id, kind, start_min, end_min, status, from_plan, routine_id, detached FROM blocks
         WHERE deleted_at IS NULL AND {where_day} ORDER BY day, start_min"
    ))?;
    let mut blocks = st
        .query_map([today], |r| {
            let day: String = r.get(1)?;
            Ok(Block {
                id: r.get(0)?,
                title: r.get(2)?,
                area_id: r.get(3)?,
                kind: r.get(4)?,
                start: r.get(5)?,
                end: r.get(6)?,
                status: r.get(7)?,
                from_plan: r.get(8)?,
                routine_id: r.get(9)?,
                detached: r.get(10)?,
                day_offset: Some(days_between(today, &day)),
                subtasks: vec![],
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut st = conn.prepare(
        "SELECT id, title, done FROM subtasks WHERE deleted_at IS NULL AND block_id = ?1 ORDER BY sort",
    )?;
    for b in &mut blocks {
        b.subtasks = st
            .query_map([&b.id], |r| Ok(Subtask { id: r.get(0)?, title: r.get(1)?, done: r.get(2)? }))?
            .collect::<Result<Vec<_>, _>>()?;
    }
    Ok(blocks)
}

// ───────────────────────── the day ─────────────────────────

/// Roll the stored day forward to `today` if needed. Returns true when it changed anything.
/// Mirrors the UI's `rolloverDay`, so whichever runs first, the result is the same.
pub fn ensure_today(conn: &mut Connection, today: NaiveDate) -> rusqlite::Result<bool> {
    let today_key = day_key(today);
    let Some(last) = meta_get(conn, "last_day")? else {
        return Ok(false); // nothing saved yet (first run, before onboarding)
    };
    if last == today_key || meta_get(conn, "onboarded")?.as_deref() != Some("1") {
        return Ok(false);
    }
    let now = now_ms();
    let tx = conn.transaction()?;

    // 1. Things you added yourself and didn't finish go to the backlog (plan blocks just come back).
    let unfinished: Vec<(String, String, String)> = {
        let mut st = tx.prepare(
            "SELECT id, title, area_id FROM blocks
             WHERE deleted_at IS NULL AND kind = 'commitment' AND status = 'planned'
               AND from_plan = 0 AND carried = 0 AND day >= ?1 AND day < ?2",
        )?;
        let rows = st.query_map(params![last, today_key], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    for (id, title, area) in &unfinished {
        tx.execute(
            "INSERT OR IGNORE INTO tasks(id, list, title, area_id, type, done, sort, created_at, updated_at)
             VALUES (?1, 'backlog', ?2, ?3, 'backlog', 0, 9999, ?4, ?4)",
            params![id, title, area, now],
        )?;
        tx.execute("UPDATE blocks SET carried = 1, updated_at = ?2 WHERE id = ?1", params![id, now])?;
        log(&tx, now, "carried_to_backlog", "block", id, Some(title))?;
    }

    // 2. Finished anytime tasks are archived (kept as history).
    tx.execute(
        "UPDATE tasks SET list = 'archived', updated_at = ?1 WHERE deleted_at IS NULL AND list = 'anytime' AND done = 1",
        [now],
    )?;

    // 3. Today's plan: Sat/Sun → Weekend, otherwise Workday (fallback: the first plan).
    let has_plan_blocks: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM blocks WHERE deleted_at IS NULL AND from_plan = 1 AND routine_id IS NULL AND day = ?1)",
        [&today_key],
        |r| r.get(0),
    )?;
    if !has_plan_blocks {
        let weekend = matches!(today.weekday().num_days_from_sunday(), 0 | 6);
        let wanted = if weekend { "weekend" } else { "workday" };
        let template_id: Option<String> = tx
            .query_row(
                "SELECT id FROM templates WHERE deleted_at IS NULL ORDER BY (id = ?1) DESC, sort LIMIT 1",
                [wanted],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(tid) = template_id {
            let plan: Vec<(String, String, String, f64, f64)> = {
                let mut st = tx.prepare(
                    "SELECT title, area_id, kind, start_min, end_min FROM template_blocks
                     WHERE deleted_at IS NULL AND template_id = ?1 ORDER BY sort",
                )?;
                let rows = st.query_map([&tid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?;
                rows.collect::<Result<Vec<_>, _>>()?
            };
            for (title, area, kind, start, end) in plan {
                tx.execute(
                    "INSERT INTO blocks(id, day, title, area_id, kind, start_min, end_min, status, from_plan, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'planned', 1, ?8)",
                    params![new_id(), today_key, title, area, kind, start, end, now],
                )?;
            }
            meta_set(&tx, "active_template_id", &tid)?;
        }
    }

    // 4. Today's copies of repeating routines (skipping any already there, e.g. planned for today in advance).
    let weekday = today.weekday().num_days_from_sunday() as u8;
    for r in load_routines(&tx)? {
        let ended = r.until.as_deref().is_some_and(|u| u < today_key.as_str());
        let skipped = r.skip_days.iter().any(|d| d == &today_key);
        if !r.days.contains(&weekday) || ended || skipped {
            continue;
        }
        let exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM blocks WHERE deleted_at IS NULL AND routine_id = ?1 AND day = ?2)",
            params![r.id, today_key],
            |row| row.get(0),
        )?;
        if !exists {
            tx.execute(
                "INSERT INTO blocks(id, day, title, area_id, kind, start_min, end_min, status, from_plan, routine_id, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 'commitment', ?5, ?6, 'planned', 1, ?7, ?8)",
                params![new_id(), today_key, r.title, r.area_id, r.start, r.end, r.id, now],
            )?;
        }
    }

    meta_set(&tx, "last_day", &today_key)?;
    tx.commit()?;
    Ok(true)
}

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
            add("upcoming", b.start - lead, b.title.clone(), format!("Starts in {lead} min · {span}"));
        }
        let who = if area.is_empty() { b.title.clone() } else { area.clone() };
        add("starting", b.start, format!("Time for {who}"), b.title.clone());
        let owner = if area.is_empty() { "Your".to_string() } else { area.clone() };
        add("ending", b.end, format!("{owner} block is ending"), format!("Is {} done?", b.title));
    }
    Ok(out)
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

/// Local "today" and minute-of-day, from the system clock.
pub fn local_today() -> NaiveDate {
    Local::now().date_naive()
}

/// Full export: the current state plus the activity history.
pub fn export(conn: &Connection, today: &str) -> rusqlite::Result<Value> {
    let state = load(conn, today)?.unwrap_or(Value::Null);
    let mut st = conn.prepare("SELECT at, action, entity, entity_id, data FROM activity ORDER BY at")?;
    let activity = st
        .query_map([], |r| {
            Ok(json!({
                "at": r.get::<_, i64>(0)?, "action": r.get::<_, String>(1)?, "entity": r.get::<_, String>(2)?,
                "id": r.get::<_, String>(3)?, "data": r.get::<_, Option<String>>(4)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(json!({ "exportedAt": now_ms(), "data": state, "activity": activity }))
}

// ───────────────────────── tests ─────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn d(s: &str) -> NaiveDate {
        parse_day(s).unwrap()
    }

    fn block(id: &str, kind: &str, start: f64, end: f64, from_plan: bool) -> Block {
        Block {
            id: id.into(),
            title: format!("Block {id}"),
            area_id: "office".into(),
            kind: kind.into(),
            start,
            end,
            status: "planned".into(),
            from_plan,
            ..Default::default()
        }
    }

    fn snapshot(day: &str) -> Persisted {
        Persisted {
            version: 3,
            state: State {
                settings: json!({ "name": "Test", "leadMinutes": 5, "reviewAt": 1410, "quietFrom": 30, "quietTo": 420, "timeFormat": "24h" }),
                onboarded: true,
                theme: "dark".into(),
                areas: vec![Area { id: "office".into(), name: "Office".into(), color: "#5B7BB5".into() }],
                templates: vec![Template {
                    id: "workday".into(),
                    name: "Workday".into(),
                    days: "Mon – Fri".into(),
                    blocks: vec![TemplateBlock {
                        id: "tb1".into(),
                        title: "Study".into(),
                        area_id: "office".into(),
                        kind: "commitment".into(),
                        start: 1320.0,
                        end: 1380.0,
                    }],
                }],
                active_template_id: "workday".into(),
                day_key: day.into(),
                blocks: vec![
                    Block {
                        subtasks: vec![Subtask { id: "s1".into(), title: "Step".into(), done: false }],
                        ..block("b1", "commitment", 1260.0, 1320.0, true)
                    },
                    block("mine", "commitment", 600.0, 630.0, false),
                ],
                upcoming: vec![Block { day_offset: Some(1), ..block("later", "commitment", 540.0, 570.0, false) }],
                routines: vec![],
                anytime: vec![Task { id: "t1".into(), title: "Read".into(), kind: "flexible".into(), ..Default::default() }],
                inbox: vec![InboxItem { id: "i1".into(), title: "Idea".into() }],
                backlog: vec![],
            },
        }
    }

    #[test]
    fn save_then_load_round_trips() {
        let mut conn = open_in_memory();
        save(&mut conn, &snapshot("2026-11-11")).unwrap();
        let v = load(&conn, "2026-11-11").unwrap().unwrap();
        let st = &v["state"];
        assert_eq!(st["blocks"].as_array().unwrap().len(), 2);
        // Blocks come back sorted by time; find ours by id.
        let b1 = st["blocks"].as_array().unwrap().iter().find(|b| b["id"] == "b1").unwrap();
        assert_eq!(b1["subtasks"][0]["title"], "Step");
        assert_eq!(st["blocks"][0]["id"], "mine", "earlier block first");
        assert_eq!(st["upcoming"][0]["id"], "later");
        assert_eq!(st["upcoming"][0]["dayOffset"], 1);
        assert_eq!(st["anytime"][0]["title"], "Read");
        assert_eq!(st["inbox"][0]["title"], "Idea");
        assert_eq!(st["templates"][0]["blocks"][0]["title"], "Study");
        assert_eq!(st["settings"]["name"], "Test");
    }

    #[test]
    fn deleting_in_ui_soft_deletes_and_status_changes_are_logged() {
        let mut conn = open_in_memory();
        let mut snap = snapshot("2026-11-11");
        save(&mut conn, &snap).unwrap();

        snap.state.blocks[0].status = "done".into();
        snap.state.blocks.retain(|b| b.id != "mine");
        save(&mut conn, &snap).unwrap();

        let deleted: bool = conn
            .query_row("SELECT deleted_at IS NOT NULL FROM blocks WHERE id = 'mine'", [], |r| r.get(0))
            .unwrap();
        assert!(deleted, "removed block is soft-deleted, not erased");
        let done_logged: i64 = conn
            .query_row("SELECT COUNT(*) FROM activity WHERE action = 'done' AND entity_id = 'b1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(done_logged, 1);
    }

    #[test]
    fn unchanged_rows_keep_their_timestamp() {
        let mut conn = open_in_memory();
        let snap = snapshot("2026-11-11");
        save(&mut conn, &snap).unwrap();
        let before: i64 = conn.query_row("SELECT updated_at FROM blocks WHERE id = 'b1'", [], |r| r.get(0)).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        save(&mut conn, &snap).unwrap();
        let after: i64 = conn.query_row("SELECT updated_at FROM blocks WHERE id = 'b1'", [], |r| r.get(0)).unwrap();
        assert_eq!(before, after);
    }

    #[test]
    fn new_day_carries_unfinished_and_loads_the_plan() {
        let mut conn = open_in_memory();
        save(&mut conn, &snapshot("2026-11-11")).unwrap(); // a Wednesday

        assert!(ensure_today(&mut conn, d("2026-11-12")).unwrap());
        let v = load(&conn, "2026-11-12").unwrap().unwrap();
        let st = &v["state"];

        // My unfinished block from yesterday went to the backlog; the plan block did not.
        let backlog: Vec<&str> = st["backlog"].as_array().unwrap().iter().map(|t| t["id"].as_str().unwrap()).collect();
        assert_eq!(backlog, vec!["mine"]);
        // Today: the Workday plan, plus what I had planned for this day.
        let titles: Vec<&str> = st["blocks"].as_array().unwrap().iter().map(|b| b["title"].as_str().unwrap()).collect();
        assert!(titles.contains(&"Study"));
        assert!(titles.contains(&"Block later"));
        // Running it again changes nothing.
        assert!(!ensure_today(&mut conn, d("2026-11-12")).unwrap());
    }

    #[test]
    fn routines_round_trip_and_appear_on_their_weekdays() {
        let mut conn = open_in_memory();
        let mut snap = snapshot("2026-11-11"); // Wednesday
        snap.state.routines = vec![Routine {
            id: "ielts".into(),
            title: "IELTS class".into(),
            area_id: "office".into(),
            start: 1260.0,
            end: 1320.0,
            days: vec![0, 2, 4], // Sun, Tue, Thu
            until: Some("2026-11-17".into()),
            skip_days: vec!["2026-11-15".into()], // removed on Sunday the 15th
        }];
        save(&mut conn, &snap).unwrap();
        let v = load(&conn, "2026-11-11").unwrap().unwrap();
        assert_eq!(v["state"]["routines"][0]["days"], json!([0, 2, 4]));

        // Thursday: the class appears, linked to its routine.
        ensure_today(&mut conn, d("2026-11-12")).unwrap();
        let thu = load(&conn, "2026-11-12").unwrap().unwrap();
        let copies: Vec<&Value> = thu["state"]["blocks"].as_array().unwrap().iter().filter(|b| b["routineId"] == "ielts").collect();
        assert_eq!(copies.len(), 1);
        assert_eq!(copies[0]["title"], "IELTS class");

        // Friday: no class.
        ensure_today(&mut conn, d("2026-11-13")).unwrap();
        let fri = load(&conn, "2026-11-13").unwrap().unwrap();
        assert!(fri["state"]["blocks"].as_array().unwrap().iter().all(|b| b["routineId"] != "ielts"));

        // Sunday 15: a class day, but removed for that day only.
        ensure_today(&mut conn, d("2026-11-15")).unwrap();
        let sun = load(&conn, "2026-11-15").unwrap().unwrap();
        assert!(sun["state"]["blocks"].as_array().unwrap().iter().all(|b| b["routineId"] != "ielts"));
        assert_eq!(sun["state"]["routines"][0]["skipDays"], json!(["2026-11-15"]));

        // Tuesday 17: the last day, still on. Thursday 19: past the end date, gone.
        ensure_today(&mut conn, d("2026-11-17")).unwrap();
        let last = load(&conn, "2026-11-17").unwrap().unwrap();
        assert!(last["state"]["blocks"].as_array().unwrap().iter().any(|b| b["routineId"] == "ielts"));
        ensure_today(&mut conn, d("2026-11-19")).unwrap();
        let after = load(&conn, "2026-11-19").unwrap().unwrap();
        assert!(after["state"]["blocks"].as_array().unwrap().iter().all(|b| b["routineId"] != "ielts"));
        assert_eq!(after["state"]["routines"][0]["until"], "2026-11-17", "ended repeats are kept, not deleted");
    }

    #[test]
    fn copies_changed_only_this_day_keep_that_flag() {
        let mut conn = open_in_memory();
        let mut snap = snapshot("2026-11-11");
        snap.state.blocks[1].routine_id = Some("r1".into());
        snap.state.blocks[1].detached = true;
        save(&mut conn, &snap).unwrap();
        let v = load(&conn, "2026-11-11").unwrap().unwrap();
        let mine = v["state"]["blocks"].as_array().unwrap().iter().find(|b| b["id"] == "mine").unwrap();
        assert_eq!(mine["detached"], true);
        assert_eq!(mine["routineId"], "r1");
    }

    #[test]
    fn reminders_respect_quiet_hours() {
        assert!(in_quiet_hours(60.0, 30.0, 420.0));
        assert!(!in_quiet_hours(600.0, 30.0, 420.0));
        assert!(in_quiet_hours(1400.0, 1380.0, 420.0)); // crossing midnight
        assert!(in_quiet_hours(100.0, 1380.0, 420.0));
        assert!(!in_quiet_hours(800.0, 1380.0, 420.0));
    }

    #[test]
    fn time_formats() {
        assert_eq!(fmt_time(1290.0, false), "21:30");
        assert_eq!(fmt_time(1290.0, true), "9:30 PM");
        assert_eq!(fmt_time(0.0, true), "12:00 AM");
        assert_eq!(fmt_time(720.0, true), "12:00 PM");
    }

    #[test]
    fn reminders_come_from_stored_tracked_blocks() {
        let mut conn = open_in_memory();
        let far_future = "2099-01-01";
        let mut snap = snapshot(far_future);
        snap.state.blocks.push(block("ctx", "context", 540.0, 1020.0, true));
        save(&mut conn, &snap).unwrap();
        let r = reminders_for_today(&conn, d(far_future)).unwrap();
        // Two tracked blocks × (upcoming, starting, ending); background blocks never remind.
        assert_eq!(r.len(), 6);
        assert!(r.iter().all(|x| x.block_id != "ctx"));
        assert!(r.iter().any(|x| x.title == "Time for Office"));
    }
}
