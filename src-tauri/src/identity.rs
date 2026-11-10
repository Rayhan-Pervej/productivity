//! Registers the app's notification identity with Windows (per user, no admin needed),
//! so toasts show the app's name and icon instead of a borrowed sender like PowerShell.
//! Works for both the dev build and the installed app.

#[cfg(windows)]
pub fn register(app: &tauri::AppHandle) -> Option<String> {
    use tauri::Manager;
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let aumid = app.config().identifier.clone();
    let name = crate::app_name::get(app);

    // Windows needs the icon as a file on disk.
    let dir = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    let icon = dir.join("notification-icon.png");
    std::fs::write(&icon, include_bytes!("../icons/128x128.png")).ok()?;

    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(format!(r"Software\Classes\AppUserModelId\{aumid}"))
        .ok()?;
    key.set_value("DisplayName", &name).ok()?;
    key.set_value("IconUri", &icon.to_string_lossy().to_string()).ok()?;
    key.set_value("IconBackgroundColor", &"FF5B5BD6".to_string()).ok()?;
    Some(aumid)
}

#[cfg(not(windows))]
pub fn register(_app: &tauri::AppHandle) -> Option<String> {
    None
}
