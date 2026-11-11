// Bridge between the UI and the Rust core (only active inside the Tauri desktop app).
// The data lives in SQLite (see platform/storage.ts) and Rust computes reminders from it.
// This bridge only:
//  - applies notification actions (Done / Skip / +10 min…), including ones taken while the window was closed
//  - reloads when Rust starts a new day while the window is open
//  - opens quick add from the global shortcut
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useApp, whenHydrated } from "@/store/app";
import { fmtTime } from "@/lib/time";
import { isDesktop } from "./env";

export { isDesktop };

interface Action {
  blockId: string;
  action: "done" | "skip" | "extend" | "tomorrow" | "backlog" | "focus" | "catchup";
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
    case "tomorrow":
    case "backlog":
      if (exists) s.triage(a.blockId, a.action);
      break;
    case "catchup":
      s.open("catchup");
      break;
  }
}

export async function startDesktopBridge() {
  // Actions must apply to the real (loaded) state, never to the empty startup state.
  await whenHydrated();

  // 1. Notification actions taken while the window was closed, then live ones.
  const pending = await invoke<Action[]>("take_pending_actions").catch(() => [] as Action[]);
  pending.forEach(apply);
  await listen<Action>("reminder-action", (e) => apply(e.payload));

  // 2. Rust started a new day while the window was open: reload to show it.
  await listen("refresh-day", () => location.reload());

  // 3. Global quick-add shortcut.
  await listen("open-quick-add", () => useApp.getState().open("quickAdd"));
  if (location.hash === "#quick-add") {
    useApp.getState().open("quickAdd");
    history.replaceState(null, "", location.pathname);
  }
}

/**
 * Dev tool: send a real Windows notification now, for the block the UI would use
 * (using the simulated clock), so notification buttons can be tested end to end.
 */
export async function previewNotification(kind: "upcoming" | "starting" | "ending" | "missed") {
  const s = useApp.getState();
  const tracked = s.blocks.filter((b) => b.kind === "commitment" && b.status === "planned");
  const current = tracked.find((b) => b.start <= s.now && s.now < b.end);
  const target =
    kind === "upcoming" ? tracked.filter((b) => b.start > s.now).sort((a, b) => a.start - b.start)[0]
    : kind === "missed" ? tracked.filter((b) => b.end <= s.now).sort((a, b) => a.start - b.start)[0]
    : current;
  if (!target) {
    s.say(`No block fits a "${kind}" notification at ${fmtTime(s.now)}. Move the prototype clock.`);
    return;
  }
  const area = s.areas.find((a) => a.id === target.areaId)?.name ?? "";
  const span = `${fmtTime(target.start)} – ${fmtTime(target.end)}`;
  const text: Record<typeof kind, [string, string]> = {
    upcoming: [target.title, `Starts in ${s.settings.leadMinutes} min · ${span}`],
    starting: [`Time for ${area || target.title}`, target.title],
    ending: [`${area || "Your"} block is ending`, `Is ${target.title} done?`],
    missed: [`${target.title} didn't happen`, "Want to find it a new spot?"],
  };
  const [title, body] = text[kind];
  await invoke("preview_notification", {
    reminder: { id: `preview:${kind}:${Date.now()}`, blockId: target.id, kind, title, body, at: Date.now() },
  });
}

export const setAutostart = (enabled: boolean) => invoke("set_autostart", { enabled });
export const getAutostart = () => invoke<boolean>("get_autostart");
/** Only the installed app can start with Windows (not dev builds). */
export const canAutostart = () => invoke<boolean>("can_autostart");

export interface DataInfo {
  dbPath: string;
  backupsDir: string;
}
export const exportData = () => invoke<string>("export_data");
export const dataInfo = () => invoke<DataInfo>("data_info");
