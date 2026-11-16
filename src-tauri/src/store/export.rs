//! Full export of the data plus the activity history.

use rusqlite::Connection;
use serde_json::{json, Value};

use super::load::load;
use super::util::now_ms;

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
