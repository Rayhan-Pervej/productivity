//! SQLite database: opening, schema migrations, backups.
//!
//! Design (docs/05-architecture-principles.md):
//! - local-first, one file in the app-data folder
//! - every row has a stable text id, `updated_at` (epoch ms) and soft delete (`deleted_at`) → sync-ready
//! - an append-only `activity` log records what happened (done, skipped, reopened…) for future insights
//! - forward-only migrations tracked with `PRAGMA user_version`

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;

pub struct Db(pub Mutex<Connection>);

/// Each entry upgrades the schema by one version. Never edit a shipped migration; add a new one.
const MIGRATIONS: &[&str] = &[
    // v1: initial schema
    r#"
    CREATE TABLE meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    CREATE TABLE areas (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort INTEGER NOT NULL,
        updated_at INTEGER NOT NULL, deleted_at INTEGER
    );
    CREATE TABLE templates (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, days TEXT NOT NULL, sort INTEGER NOT NULL,
        updated_at INTEGER NOT NULL, deleted_at INTEGER
    );
    CREATE TABLE template_blocks (
        id TEXT PRIMARY KEY, template_id TEXT NOT NULL, title TEXT NOT NULL, area_id TEXT NOT NULL,
        kind TEXT NOT NULL, start_min REAL NOT NULL, end_min REAL NOT NULL, sort INTEGER NOT NULL,
        updated_at INTEGER NOT NULL, deleted_at INTEGER
    );
    CREATE TABLE blocks (
        id TEXT PRIMARY KEY, day TEXT NOT NULL, title TEXT NOT NULL, area_id TEXT NOT NULL,
        kind TEXT NOT NULL, start_min REAL NOT NULL, end_min REAL NOT NULL, status TEXT NOT NULL,
        from_plan INTEGER NOT NULL DEFAULT 0, carried INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL, deleted_at INTEGER
    );
    CREATE INDEX blocks_by_day ON blocks(day);
    CREATE TABLE subtasks (
        id TEXT PRIMARY KEY, block_id TEXT NOT NULL, title TEXT NOT NULL, done INTEGER NOT NULL,
        sort INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
    );
    CREATE INDEX subtasks_by_block ON subtasks(block_id);
    CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        list TEXT NOT NULL,            -- anytime | inbox | backlog | archived
        title TEXT NOT NULL, area_id TEXT, type TEXT NOT NULL, duration REAL, due TEXT,
        day TEXT,                      -- planned for a specific future day (anytime list)
        done INTEGER NOT NULL, sort INTEGER NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
    );
    CREATE TABLE activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, data TEXT
    );
    CREATE INDEX activity_by_time ON activity(at);
    "#,
];

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let mut conn = Connection::open(path)?;
    configure(&conn)?;
    migrate(&mut conn)?;
    Ok(conn)
}

#[cfg(test)]
pub fn open_in_memory() -> Connection {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    configure(&conn).expect("configure");
    migrate(&mut conn).expect("migrate");
    conn
}

fn configure(conn: &Connection) -> rusqlite::Result<()> {
    // WAL: crash-safe and lets backups run while the app writes.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}

fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    let current: usize = conn.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))? as usize;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

/// Copy the whole database to `backups/<day>.db` (once per day) and keep the newest `keep`.
pub fn backup(conn: &Connection, dir: &Path, day: &str, keep: usize) -> std::io::Result<Option<PathBuf>> {
    std::fs::create_dir_all(dir)?;
    let target = dir.join(format!("{day}.db"));
    if target.exists() {
        return Ok(None);
    }
    // VACUUM INTO writes a clean, consistent copy even while the app is running.
    let escaped = target.to_string_lossy().replace('\'', "''");
    conn.execute_batch(&format!("VACUUM INTO '{escaped}'"))
        .map_err(|e| std::io::Error::other(e.to_string()))?;

    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "db"))
        .collect();
    files.sort();
    while files.len() > keep {
        let _ = std::fs::remove_file(files.remove(0));
    }
    Ok(Some(target))
}
