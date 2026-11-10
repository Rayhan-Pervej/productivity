//! Desktop core: SQLite storage, the day, reminders, tray, autostart and the global quick-add shortcut.
//!
//! Lightness rules (docs/05-architecture-principles.md §6–7):
//! - Closing the window *destroys* the WebView; only this small Rust process stays in the tray.
//! - The scheduler sleeps until the next reminder instead of polling every second.
//! - Rust owns the day: it rolls over and computes reminders from the database, with no window needed.

mod app_name;
mod commands;
mod db;
mod identity;
mod reminders;
mod store;
mod tray;
mod window;

use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_global_shortcut::ShortcutState;

/// Passed by autostart so a login launch goes straight to the tray without opening a window.
pub const HIDDEN_ARG: &str = "--hidden";
pub const DB_FILE: &str = "productivity.db";
pub const BACKUP_DIR: &str = "backups";
const BACKUPS_KEPT: usize = 14;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // A second launch (e.g. clicking the shortcut again) just brings up the existing app.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_main(app, None);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["ctrl+alt+space"])
                .expect("valid shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        window::show_main(app, Some(window::Intent::QuickAdd));
                    }
                })
                .build(),
        )
        .manage(reminders::Scheduler::default())
        .invoke_handler(tauri::generate_handler![
            commands::load_state,
            commands::save_state,
            commands::export_data,
            commands::data_info,
            reminders::take_pending_actions,
            reminders::preview_notification,
            set_autostart,
            get_autostart,
        ])
        .setup(|app| {
            // 1. Database: open (migrating if needed), roll the day over, back up once a day.
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let mut conn = db::open(&dir.join(DB_FILE))?;
            if let Err(err) = store::ensure_today(&mut conn, store::local_today()) {
                eprintln!("day rollover failed: {err}");
            }
            backup_today(app.handle(), &conn);
            app.manage(db::Db(Mutex::new(conn)));

            // 2. Our own name and icon on notifications (falls back to PowerShell's id if this fails).
            if let Some(aumid) = identity::register(app.handle()) {
                reminders::set_app_id(aumid);
            }

            // 3. Reminders come straight from the database, so they work even if no window ever opens.
            reminders::refresh(app.handle());
            reminders::start(app.handle().clone());
            tray::create(app.handle())?;

            // Start with Windows by default: only for the installed app, never for dev builds.
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_autostart::ManagerExt;
                let launcher = app.autolaunch();
                if !launcher.is_enabled().unwrap_or(false) {
                    let _ = launcher.enable();
                }
            }

            // Started with Windows: stay quietly in the tray. Otherwise show the window.
            if !std::env::args().any(|a| a == HIDDEN_ARG) {
                window::show_main(app.handle(), None);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the app");

    app.run(|_app, event| {
        // Closing the last window must not quit: the app lives on in the tray.
        // An explicit "Quit" from the tray calls `exit(0)`, which carries a code and is allowed.
        if let RunEvent::ExitRequested { api, code: None, .. } = event {
            api.prevent_exit();
        }
    });
}

/// One backup per day, keeping the last two weeks.
pub fn backup_today(app: &tauri::AppHandle, conn: &rusqlite::Connection) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let day = store::day_key(store::local_today());
    if let Err(err) = db::backup(conn, &dir.join(BACKUP_DIR), &day, BACKUPS_KEPT) {
        eprintln!("backup failed: {err}");
    }
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let launcher = app.autolaunch();
    let result = if enabled { launcher.enable() } else { launcher.disable() };
    result.map_err(|e| e.to_string())
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}
