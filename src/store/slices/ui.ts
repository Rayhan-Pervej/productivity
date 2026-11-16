// UI slice: clock (tick and simulation), theme, view, overlays, toasts and undo.
import { isoDay, nowMinutes } from "@/lib/time";
import { rolloverDay } from "../day";
import { nextToastId, type Slice } from "../helpers";

export const uiSlice: Slice<
  | "now"
  | "simulated"
  | "theme"
  | "view"
  | "overlay"
  | "notificationKind"
  | "quickAddSeed"
  | "toast"
  | "history"
  | "tick"
  | "simulate"
  | "setTheme"
  | "setView"
  | "open"
  | "notify"
  | "close"
  | "say"
  | "dismissToast"
  | "undo"
> = (set, get) => ({
  now: nowMinutes(),
  simulated: false,

  theme: "system",
  view: "today",
  overlay: null,
  notificationKind: "upcoming",
  quickAddSeed: "",
  toast: null,
  history: [],

  tick: () => {
    const s = get();
    if (s.simulated) return;
    const today = isoDay();
    if (s.onboarded && s.dayKey !== today) {
      // Midnight passed while the app was open: start the new day in place.
      set({
        ...rolloverDay(s, today),
        now: nowMinutes(),
        history: [],
        toast: { id: nextToastId(), message: "Good morning. A new day started", canUndo: false },
      });
      return;
    }
    set({ now: nowMinutes() });
  },
  simulate: (minutes) => set(minutes === null ? { simulated: false, now: nowMinutes() } : { simulated: true, now: minutes }),
  setTheme: (theme) => set({ theme }),
  setView: (view) => set({ view, overlay: null }),
  open: (overlay, seed = "") => set({ overlay, quickAddSeed: seed }),
  notify: (notificationKind) => set({ overlay: "notification", notificationKind }),
  close: () => set({ overlay: null }),
  say: (message) => set({ toast: { id: nextToastId(), message, canUndo: false } }),
  dismissToast: () => set({ toast: null }),
  undo: () => {
    const { history } = get();
    const prev = history[history.length - 1];
    if (!prev) return;
    set({ ...prev, history: history.slice(0, -1), toast: { id: nextToastId(), message: "Undone", canUndo: false } });
  },
});
