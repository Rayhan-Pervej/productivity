//! The app's data in SQLite.
//!
//! The UI keeps its in-memory state and sends a snapshot of it after every change (`save`).
//! Here it's written into normalized tables in one transaction; only rows that actually changed
//! get a new `updated_at`, and status changes are appended to the activity log.
//! Rust also owns the day: `ensure_today` rolls over at startup and midnight, and
//! `reminders_for_today` derives reminders from the stored plan.

mod day;
mod export;
mod load;
mod save;
mod schedule;
mod types;
mod util;

#[cfg(test)]
mod tests;

// Re-exported so every `store::X` path from before the split still works. Some are only used
// inside the store or by tests today, hence the allow.
#[allow(unused_imports)]
pub use self::{
    day::ensure_today,
    export::export,
    load::{blocks_on, load},
    save::save,
    schedule::{busy_until, fmt_time, in_quiet_hours, notification_sound, reminders_for_today, twelve_hour},
    types::{Area, Block, InboxItem, Persisted, Routine, State, Subtask, Task, Template, TemplateBlock},
    util::{day_key, local_today, new_id, now_ms},
};
