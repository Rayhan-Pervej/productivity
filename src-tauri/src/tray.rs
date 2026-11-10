use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle,
};

use crate::window::{show_main, Intent};

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Today", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick", "Quick add\tCtrl+Alt+Space", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let name = crate::app_name::get(app);
    let quit = MenuItem::with_id(app, "quit", format!("Quit {name}"), true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quick, &separator, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip(&name)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app, None),
            "quick" => show_main(app, Some(Intent::QuickAdd)),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle(), None);
            }
        });

    // The tray uses a simple glyph (ring on transparent), like other tray icons; the taskbar keeps the full tile.
    match tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png")) {
        Ok(glyph) => tray = tray.icon(glyph),
        Err(_) => {
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
        }
    }
    tray.build(app)?;
    Ok(())
}
