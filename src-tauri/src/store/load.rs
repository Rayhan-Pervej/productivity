//! Reading the stored data back: the UI's full state (`load`), a past day's blocks (`blocks_on`)
//! and the shared loaders for blocks, routines and plans.

use std::collections::HashMap;

use rusqlite::Connection;
use serde_json::{json, Value};

use super::types::{default_theme, Area, Block, InboxItem, Routine, Subtask, Task, Template, TemplateBlock};
use super::util::{days_between, meta_get};

fn parse_days(text: &str) -> Vec<u8> {
    text.split(',')
        .filter_map(|d| d.trim().parse().ok())
        .filter(|d| *d <= 6)
        .collect()
}

pub(super) fn load_routines(conn: &Connection) -> rusqlite::Result<Vec<Routine>> {
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
        let rows = st.query_map([], |r| {
            Ok(Area {
                id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
            })
        })?;
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
                _ => inbox.push(InboxItem {
                    id: t.id,
                    title: t.title,
                }),
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
        .query_map([], |r| {
            Ok(Template {
                id: r.get(0)?,
                name: r.get(1)?,
                days: r.get(2)?,
                blocks: vec![],
            })
        })?
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
/// A past day's blocks (e.g. "2026-11-10"), as they were left. History is view only.
pub fn blocks_on(conn: &Connection, day: &str) -> rusqlite::Result<Vec<Block>> {
    let mut blocks = load_blocks(conn, "day = ?1", day)?;
    for b in &mut blocks {
        b.day_offset = None;
    }
    Ok(blocks)
}

pub(super) fn load_blocks(conn: &Connection, where_day: &str, today: &str) -> rusqlite::Result<Vec<Block>> {
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

    let mut st =
        conn.prepare("SELECT id, title, done FROM subtasks WHERE deleted_at IS NULL AND block_id = ?1 ORDER BY sort")?;
    for b in &mut blocks {
        b.subtasks = st
            .query_map([&b.id], |r| {
                Ok(Subtask {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    done: r.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
    }
    Ok(blocks)
}
