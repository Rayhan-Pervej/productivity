//! Whether Windows will show Wholeday's notifications, and a shortcut to the settings that control it.
//!
//! Windows keeps two switches per user: notifications for everything, and for each app. If either is
//! off, reminders silently never appear, so the UI shows a banner explaining how to turn them on.
//! (Do not disturb / Focus is different: it only holds toasts for later, so it isn't reported here.)

/// "on", "app-off" (Wholeday is switched off) or "all-off" (all notifications are off).
#[tauri::command]
pub fn notifications_status(app: tauri::AppHandle) -> &'static str {
    status(&app.config().identifier)
}

#[cfg(windows)]
fn status(app_id: &str) -> &'static str {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    // A missing value means "never changed", which is on.
    let off = |path: &str, value: &str| {
        hkcu.open_subkey(path)
            .and_then(|k| k.get_value::<u32, _>(value))
            .is_ok_and(|v| v == 0)
    };
    if off(
        r"Software\Microsoft\Windows\CurrentVersion\PushNotifications",
        "ToastEnabled",
    ) {
        "all-off"
    } else if off(
        &format!(r"Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\{app_id}"),
        "Enabled",
    ) {
        "app-off"
    } else {
        "on"
    }
}

#[cfg(not(windows))]
fn status(_app_id: &str) -> &'static str {
    "on"
}

/// Open Settings → System → Notifications.
#[tauri::command]
pub fn open_notification_settings() -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg("ms-settings:notifications")
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}
