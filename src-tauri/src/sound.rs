//! Notification sounds.
//!
//! Windows only lets packaged (Store) apps attach their own sound file to a toast, so for
//! Wholeday's own sounds the toast is shown silently and we play the sound ourselves, at the
//! same moment. The sound files live in `public/sounds/` (shared with the UI's preview) and
//! are embedded in the app.
//!
//! Uses the Win32 `PlaySound` API (async, from memory): no audio library, nothing to load.

/// The built-in sounds, by id (same ids as the UI's sound list).
fn bytes(name: &str) -> Option<&'static [u8]> {
    Some(match name {
        "marimba" => include_bytes!("../../public/sounds/marimba.wav"),
        "done" => include_bytes!("../../public/sounds/done.wav"),
        _ => return None,
    })
}

/// Is this one of our own sounds (played by us), rather than "default" or "none"?
pub fn is_custom(name: &str) -> bool {
    bytes(name).is_some()
}

#[cfg(windows)]
pub fn play(name: &str) {
    use windows_sys::Win32::Media::Audio::{PlaySoundW, SND_ALIAS, SND_ASYNC, SND_MEMORY, SND_NODEFAULT};

    match name {
        "none" => {}
        // The sound Windows uses for notifications (what users set in Sound settings).
        "default" => {
            let alias: Vec<u16> = "Notification.Default\0".encode_utf16().collect();
            unsafe { PlaySoundW(alias.as_ptr(), std::ptr::null_mut(), SND_ALIAS | SND_ASYNC | SND_NODEFAULT) };
        }
        other => {
            if let Some(wav) = bytes(other) {
                // SND_MEMORY reads the WAV straight from the embedded bytes (they live for the whole program).
                unsafe {
                    PlaySoundW(wav.as_ptr().cast(), std::ptr::null_mut(), SND_MEMORY | SND_ASYNC | SND_NODEFAULT)
                };
            }
        }
    }
}

#[cfg(not(windows))]
pub fn play(_name: &str) {}

/// True when Windows says now isn't a good time for sounds: a full-screen app or game,
/// presentation mode, or the quiet period after setup. (Toasts are hushed then too.)
#[cfg(windows)]
pub fn user_is_busy() -> bool {
    use windows_sys::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_ACCEPTS_NOTIFICATIONS};
    let mut state = 0;
    let ok = unsafe { SHQueryUserNotificationState(&mut state) } >= 0;
    ok && state != QUNS_ACCEPTS_NOTIFICATIONS
}

#[cfg(not(windows))]
pub fn user_is_busy() -> bool {
    false
}

/// Play a sound now (Settings preview and the "done" sound).
#[tauri::command]
pub fn play_sound(name: String) {
    play(&name);
}
