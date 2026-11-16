// Pure day helpers: default settings, today's plan and routine copies, and the day rollover.
import type { Block, Routine, Settings, Task, Template } from "@/domain/types";
import { blocksFromTemplate, h, templateForWeekday } from "@/data/seed";
import { systemTimeFormat } from "@/lib/time";
import { DEFAULT_REMINDER_SOUND } from "@/lib/sounds";
import { blocksFromRoutines } from "@/lib/repeat";
import type { State } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  name: "",
  leadMinutes: 5,
  reviewAt: h(23, 30),
  quietFrom: h(0, 30),
  quietTo: h(7),
  timeFormat: systemTimeFormat(),
  notificationSound: DEFAULT_REMINDER_SOUND,
  completionSound: true,
};

export const blocksFor = (templates: Template[], id: string) => blocksFromTemplate(templates.find((t) => t.id === id) ?? templates[0]);

/** Whole days from the local day `key` (e.g. "2026-11-10") until today. */
export const daysSince = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  return Math.round((today - then) / 86_400_000);
};

/** "2026-11-19" → days from today. */
export const dateOffsetOf = (iso: string) => daysSince(iso) * -1;

/** Today's copies of routines, skipping any routine that already has a block today. */
export function todaysRoutineCopies(routines: Routine[], existing: Block[]) {
  const have = new Set(existing.map((b) => b.routineId).filter(Boolean));
  return blocksFromRoutines(routines, new Date()).filter((b) => !have.has(b.routineId));
}

/**
 * Move the day forward: today's plan loads, items planned for later days move closer
 * (and arrive when their day comes), finished anytime tasks are cleared.
 * Used both when the app opens on a new day and when midnight passes while it's open.
 */
export function rolloverDay(
  s: Pick<State, "dayKey" | "templates" | "upcoming" | "anytime" | "blocks" | "backlog" | "routines">,
  today: string,
): Pick<State, "dayKey" | "activeTemplateId" | "blocks" | "upcoming" | "anytime" | "backlog"> {
  const gap = s.dayKey ? Math.max(1, daysSince(s.dayKey)) : 0;
  // Things you added yourself and didn't finish are never silently lost: they go to the backlog.
  // (Plan blocks simply come back with the plan.)
  const unfinished: Task[] = s.dayKey
    ? (s.blocks ?? [])
        .filter((b) => b.kind === "commitment" && b.status === "planned" && !b.fromPlan)
        .map((b) => ({ id: b.id, title: b.title, areaId: b.areaId, type: "backlog" as const, done: false }))
    : [];
  const upcoming = (s.upcoming ?? []).map((b) => ({ ...b, dayOffset: b.dayOffset - gap }));
  const arriving: Block[] = upcoming.filter((b) => b.dayOffset === 0).map(({ dayOffset: _, ...b }) => b);
  const templateId = templateForWeekday(s.templates, new Date().getDay()).id;
  return {
    dayKey: today,
    activeTemplateId: templateId,
    blocks: [...blocksFor(s.templates, templateId), ...todaysRoutineCopies(s.routines ?? [], arriving), ...arriving],
    upcoming: upcoming.filter((b) => b.dayOffset > 0),
    backlog: [...(s.backlog ?? []), ...unfinished],
    anytime: (s.anytime ?? [])
      .filter((t) => !t.done)
      .map((t) => (t.dayOffset ? { ...t, dayOffset: t.dayOffset - gap > 0 ? t.dayOffset - gap : undefined } : t)),
  };
}
