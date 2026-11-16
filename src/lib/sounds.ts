// Wholeday's sounds. The same files are embedded in the Rust core (src-tauri/src/sound.rs),
// which plays them for reminders, even with the window closed.
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "@/platform/env";

export interface SoundOption {
  id: string;
  label: string;
}

/** Reminder sounds, in the order shown in Settings. */
export const REMINDER_SOUNDS: SoundOption[] = [
  { id: "marimba", label: "Marimba" },
  { id: "default", label: "Windows default" },
  { id: "none", label: "No sound" },
];

export const DEFAULT_REMINDER_SOUND = "marimba";

/** Play a sound now (preview, or the "done" sound). Never throws. */
export function playSound(id: string) {
  if (id === "none") return;
  if (isDesktop) {
    invoke("play_sound", { name: id }).catch(() => {});
    return;
  }
  if (id === "default") return; // the browser can't play the Windows sound
  try {
    const audio = new Audio(`/sounds/${id}.wav`);
    audio.volume = 0.8;
    void audio.play().catch(() => {});
  } catch {
    /* no audio available */
  }
}
