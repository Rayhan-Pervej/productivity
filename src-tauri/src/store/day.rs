//! The day rollover (`ensure_today`), run at startup and at midnight.

use chrono::{Datelike, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};

use super::load::load_routines;
use super::util::{day_key, log, meta_get, meta_set, new_id, now_ms};

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
        tx.execute(
            "UPDATE blocks SET carried = 1, updated_at = ?2 WHERE id = ?1",
            params![id, now],
        )?;
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
