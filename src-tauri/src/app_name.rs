//! The app's visible name, from `productName` in tauri.conf.json (the one place to rename the app).

pub fn get(app: &tauri::AppHandle) -> String {
    app.config().product_name.clone().unwrap_or_else(|| "Wholeday".into())
}
