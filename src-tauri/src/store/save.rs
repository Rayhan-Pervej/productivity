//! `save`: writes a UI snapshot into the tables in one transaction (upserts that only touch
//! changed rows, soft deletes for what the UI dropped, and activity log entries).

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use super::types::{Area, Block, Persisted, Routine, State, Task, Template};
use super::util::{add_days, log, meta_set, now_ms};

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
    soft_delete_missing(
        tx,
        "areas",
        "1 = 1",
        &areas.iter().map(|a| a.id.clone()).collect::<Vec<_>>(),
        now,
    )
}

fn days_text(days: &[u8]) -> String {
    days.iter().map(|d| d.to_string()).collect::<Vec<_>>().join(",")
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
            params![
                r.id,
                r.title,
                r.area_id,
                r.start,
                r.end,
                days_text(&r.days),
                r.until,
                r.skip_days.join(","),
                i as i64,
                now
            ],
        )?;
    }
    soft_delete_missing(
        tx,
        "routines",
        "1 = 1",
        &routines.iter().map(|r| r.id.clone()).collect::<Vec<_>>(),
        now,
    )
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
    soft_delete_missing(
        tx,
        "templates",
        "1 = 1",
        &templates.iter().map(|t| t.id.clone()).collect::<Vec<_>>(),
        now,
    )?;
    soft_delete_missing(tx, "template_blocks", "1 = 1", &block_ids, now)
}

fn save_blocks(tx: &Transaction, s: &State, now: i64) -> rusqlite::Result<()> {
    let today = s.day_key.as_str();
    if today.is_empty() {
        return Ok(());
    }
    let dated = s.blocks.iter().map(|b| (today.to_string(), b)).chain(
        s.upcoming
            .iter()
            .map(|b| (add_days(today, b.day_offset.unwrap_or(1)), b)),
    );

    let mut ids = Vec::new();
    for (day, b) in dated {
        ids.push(b.id.clone());
        let previous: Option<String> = tx
            .query_row(
                "SELECT status FROM blocks WHERE id = ?1 AND deleted_at IS NULL",
                [&b.id],
                |r| r.get(0),
            )
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
            .query_row(
                "SELECT done FROM subtasks WHERE id = ?1 AND deleted_at IS NULL",
                [&t.id],
                |r| r.get(0),
            )
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
        (
            "inbox",
            Task {
                id: i.id.clone(),
                title: i.title.clone(),
                kind: "backlog".into(),
                ..Default::default()
            },
        )
    }));

    let mut ids = Vec::new();
    for (i, (list, t)) in rows.iter().enumerate() {
        ids.push(t.id.clone());
        let day = t.day_offset.filter(|d| *d > 0).map(|d| add_days(today, d));
        let previous: Option<bool> = tx
            .query_row(
                "SELECT done FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                [&t.id],
                |r| r.get(0),
            )
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
    ids.iter()
        .map(|id| format!("'{}'", id.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(",")
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
