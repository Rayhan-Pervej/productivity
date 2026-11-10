/** True inside the Tauri desktop app (false in a plain browser during development). */
export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
