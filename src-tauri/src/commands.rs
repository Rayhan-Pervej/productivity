//! Commands the UI calls for its data.

use tauri::{AppHandle, Manager, State};

use crate::db::Db;
use crate::{reminders, store};

/// The saved state as `{ state, version }` JSON, or `None` on a brand-new install.
/// Rolls the day over first, so the UI always receives today.
#[tauri::command]
pub fn load_state(app: AppHandle, db: State<'_, Db>) -> Result<Option<String>, String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let changed = store::ensure_today(&mut conn, store::local_today()).map_err(|e| e.to_string())?;
    let state = store::load(&conn, &store::day_key(store::local_today())).map_err(|e| e.to_string())?;
    drop(conn);
    if changed {
        reminders::refresh(&app);
    }
    Ok(state.map(|v| v.to_string()))
}

/// Save the UI's state (called after every change) and recompute reminders.
#[tauri::command]
pub fn save_state(app: AppHandle, db: State<'_, Db>, snapshot: String) -> Result<(), String> {
    let parsed: store::Persisted = serde_json::from_str(&snapshot).map_err(|e| format!("bad snapshot: {e}"))?;
    {
        let mut conn = db.0.lock().map_err(|e| e.to_string())?;
        store::save(&mut conn, &parsed).map_err(|e| e.to_string())?;
    }
    reminders::refresh(&app);
    Ok(())
}

/// Write everything (state + activity history) to a JSON file in Downloads. Returns the file path.
#[tauri::command]
pub fn export_data(app: AppHandle, db: State<'_, Db>) -> Result<String, String> {
    let today = store::day_key(store::local_today());
    let value = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        store::export(&conn, &today).map_err(|e| e.to_string())?
    };
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .map_err(|e| e.to_string())?;
    let slug = crate::app_name::get(&app).to_lowercase().replace(' ', "-");
    let path = dir.join(format!("{slug}-export-{today}.json"));
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataInfo {
    db_path: String,
    backups_dir: String,
}

#[tauri::command]
pub fn data_info(app: AppHandle) -> Result<DataInfo, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(DataInfo {
        db_path: dir.join(crate::DB_FILE).to_string_lossy().into_owned(),
        backups_dir: dir.join(crate::BACKUP_DIR).to_string_lossy().into_owned(),
    })
}
