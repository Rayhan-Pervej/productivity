//! Desktop core: tray, autostart, global quick-add shortcut, and the reminder scheduler.
//!
//! Lightness rules (docs/05-architecture-principles.md §6–7):
//! - Closing the window *destroys* the WebView; only this small Rust process stays in the tray.
//! - The scheduler sleeps until the next reminder instead of polling every second.

mod reminders;
mod tray;
mod window;

use tauri::RunEvent;
use tauri_plugin_global_shortcut::ShortcutState;

/// Passed by autostart so a login launch goes straight to the tray without opening a window.
pub const HIDDEN_ARG: &str = "--hidden";

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
            reminders::set_reminders,
            reminders::take_pending_actions,
            window::background_sync_done,
            set_autostart,
            get_autostart,
        ])
        .setup(|app| {
            tray::create(app.handle())?;
            reminders::start(app.handle().clone());

            // Start with Windows by default: only for the installed app, never for dev builds.
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_autostart::ManagerExt;
                let launcher = app.autolaunch();
                if !launcher.is_enabled().unwrap_or(false) {
                    let _ = launcher.enable();
                }
            }

            let hidden = std::env::args().any(|a| a == HIDDEN_ARG);
            if hidden {
                // Started with Windows: stay in the tray, but load today's reminders.
                window::background_sync(app.handle());
            } else {
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
