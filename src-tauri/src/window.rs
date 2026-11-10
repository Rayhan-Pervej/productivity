//! The main window is created on demand and destroyed on close, so the WebView
//! only uses memory while you're actually looking at it.

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const MAIN: &str = "main";

/// Why the window is being opened.
#[derive(Clone, Copy, Debug)]
pub enum Intent {
    QuickAdd,
}

pub fn show_main(app: &AppHandle, intent: Option<Intent>) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(Intent::QuickAdd) = intent {
            let _ = app.emit_to(MAIN, "open-quick-add", ());
        }
        return;
    }

    // A freshly created page can't receive events yet, so the intent rides along in the URL.
    let path = match intent {
        Some(Intent::QuickAdd) => "index.html#quick-add",
        None => "index.html",
    };
    let built = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App(path.into()))
        .title("Productivity")
        // The app header is the title bar (logo, drag area, caption buttons).
        .decorations(false)
        .shadow(true)
        .inner_size(1120.0, 720.0)
        .min_inner_size(820.0, 560.0)
        .center()
        .build();

    match built {
        Ok(window) => {
            let _ = window.set_focus();
        }
        Err(err) => eprintln!("could not open the main window: {err}"),
    }
}

pub fn is_open(app: &AppHandle) -> bool {
    app.get_webview_window(MAIN).is_some()
}
