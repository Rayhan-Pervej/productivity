// Bridge between the UI and the Rust core (only active inside the Tauri desktop app).
//  - keeps the Rust scheduler's reminder list in sync with today's plan
//  - applies notification actions (Done / Skip / +10 min): including ones taken while the window was closed
//  - opens quick add when the global shortcut is pressed
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "@/store/app";
import { fmtTime, inQuietHours } from "@/lib/time";

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface Reminder {
  id: string;
  blockId: string;
  kind: "upcoming" | "starting" | "ending";
  title: string;
  body: string;
  at: number;
}

interface Action {
  blockId: string;
  action: "done" | "skip" | "extend" | "focus" | "catchup";
}

/** One minute after the next local midnight, epoch ms. */
const nextMidnight = () => {
  const d = new Date();
  d.setHours(24, 1, 0, 0);
  return d.getTime();
};

/** Minutes-from-midnight today → epoch ms. */
const atToday = (minute: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() + Math.round(minute * 60_000);
};


/** Reminders for today's tracked blocks (background blocks never remind). */
export function buildReminders(): Reminder[] {
  const { blocks, areas, settings } = useApp.getState();
  const now = Date.now();
  const out: Reminder[] = [];

  for (const b of blocks) {
    if (b.kind !== "commitment" || b.status !== "planned") continue;
    const area = areas.find((a) => a.id === b.areaId)?.name ?? "";
    const span = `${fmtTime(b.start)} – ${fmtTime(b.end)}`;
    const add = (kind: Reminder["kind"], minute: number, title: string, body: string) => {
      if (inQuietHours(minute, settings.quietFrom, settings.quietTo)) return;
      out.push({ id: `${b.id}:${kind}:${minute}`, blockId: b.id, kind, title, body, at: atToday(minute) });
    };
    if (settings.leadMinutes > 0) add("upcoming", b.start - settings.leadMinutes, b.title, `Starts in ${settings.leadMinutes} min · ${span}`);
    add("starting", b.start, `Time for ${area || b.title}`, b.title);
    add("ending", b.end, `${area || "Your"} block is ending`, `Is ${b.title} done?`);
  }
  return out.filter((r) => r.at > now);
}

function apply(a: Action) {
  const s = useApp.getState();
  const exists = s.blocks.some((b) => b.id === a.blockId);
  switch (a.action) {
    case "done":
      if (exists) s.completeBlock(a.blockId);
      break;
    case "skip":
      if (exists) s.skipBlock(a.blockId);
      break;
    case "extend":
      if (exists) s.extendBlock(a.blockId, 10);
      break;
    case "focus":
      s.setView("focus");
      break;
    case "catchup":
      s.open("catchup");
      break;
  }
}

export async function startDesktopBridge() {
  // 1. Notification actions taken while the window was closed (e.g. "Done"): apply them first,
  //    so they're saved even if this is only the hidden background load.
  const pending = await invoke<Action[]>("take_pending_actions").catch(() => [] as Action[]);
  pending.forEach(apply);
  await listen<Action>("reminder-action", (e) => apply(e.payload));

  // 2. Keep reminders in sync (debounced; only when the plan or settings change).
  let timer: ReturnType<typeof setTimeout> | undefined;
  const push = () => invoke("set_reminders", { reminders: buildReminders(), refreshAt: nextMidnight() });
  const sync = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void push().catch(console.error), 300);
  };

  // Hidden background load (login / midnight): hand over reminders, then let Rust close the window.
  if (location.hash === "#sync") {
    await push().catch(console.error);
    await invoke("background_sync_done").catch(console.error);
    return;
  }
  sync();
  useApp.subscribe((s, prev) => {
    if (s.blocks !== prev.blocks || s.settings !== prev.settings) sync();
  });

  // A new day started while the window was open: reload so the plan rolls over.
  await listen("refresh-day", () => location.reload());

  // 3. Global quick-add shortcut.
  await listen("open-quick-add", () => useApp.getState().open("quickAdd"));
  if (location.hash === "#quick-add") {
    useApp.getState().open("quickAdd");
    history.replaceState(null, "", location.pathname);
  }
}

export const setAutostart = (enabled: boolean) => invoke("set_autostart", { enabled });
export const getAutostart = () => invoke<boolean>("get_autostart");
