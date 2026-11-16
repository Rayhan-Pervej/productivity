//! Snapshot types: the same shape as the UI's saved state (`{ state, version }`).

use serde::{Deserialize, Serialize};
use serde_json::Value;

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

pub(super) fn default_theme() -> String {
    "system".into()
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Persisted {
    pub state: State,
    pub version: i64,
}
