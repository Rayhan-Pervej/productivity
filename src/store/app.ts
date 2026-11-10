// App state. In the prototype this holds sample data in memory;
// later each action becomes a typed command to the Rust core.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Area, Block, DatedBlock, InboxItem, Settings, Task, Template, TemplateBlock } from "@/domain/types";
import { AREAS, TEMPLATES, blocksFromTemplate, h, templateForWeekday } from "@/data/seed";
import type { Parsed } from "@/lib/parse";
import { fmtTime, nowMinutes, roundTo, systemTimeFormat } from "@/lib/time";
import { uid } from "@/lib/utils";
import { currentCommitment, currentContext, missedBlocks, nextCommitment } from "@/lib/day";

export type View = "today" | "focus" | "inbox" | "plans" | "settings";
export type Overlay = null | "quickAdd" | "palette" | "briefing" | "review" | "tray" | "notification" | "catchup" | "block";
export type NotificationKind = "upcoming" | "starting" | "ending" | "missed";
export type Theme = "system" | "light" | "dark";
export type Triage = "now" | "tomorrow" | "backlog" | "letGo";

interface Snapshot {
  blocks: Block[];
  anytime: Task[];
  inbox: InboxItem[];
  backlog: Task[];
  /** Blocks planned on future days. */
  upcoming: DatedBlock[];
  templates: Template[];
}

interface Toast {
  id: number;
  message: string;
  canUndo: boolean;
}

interface State extends Snapshot {
  /** Which calendar day `blocks` belongs to; used to roll over at midnight. */
  dayKey: string;
  areas: Area[];
  activeTemplateId: string;
  settings: Settings;
  onboarded: boolean;

  /** Minutes from midnight. When `simulated`, the prototype controls set it. */
  now: number;
  simulated: boolean;

  theme: Theme;
  view: View;
  overlay: Overlay;
  notificationKind: NotificationKind;
  quickAddSeed: string;
  toast: Toast | null;
  history: Snapshot[];

  tick: () => void;
  simulate: (minutes: number | null) => void;
  setTheme: (t: Theme) => void;
  setView: (v: View) => void;
  open: (o: Overlay, seed?: string) => void;
  notify: (kind: NotificationKind) => void;
  close: () => void;
  say: (message: string) => void;
  dismissToast: () => void;
  undo: () => void;

  completeBlock: (id: string) => void;
  skipBlock: (id: string) => void;
  extendBlock: (id: string, minutes: number) => void;
  toggleSubtask: (blockId: string, subId: string) => void;
  addSubtask: (blockId: string, title: string) => void;
  removeSubtask: (blockId: string, subId: string) => void;
  renameBlock: (blockId: string, title: string) => void;
  updateBlock: (blockId: string, patch: Partial<Pick<Block, "start" | "end" | "areaId">>) => void;
  /** Block shown in the details window. */
  selectedBlockId: string | null;
  openBlock: (id: string) => void;
  triage: (id: string, action: Triage) => void;
  triageAllMissed: () => void;
  toggleTask: (id: string) => void;
  startTask: (id: string) => void;
  scheduleTask: (id: string, start: number) => void;
  addParsed: (p: Parsed) => void;
  inboxToToday: (id: string) => void;
  letGoInbox: (id: string) => void;
  /** Remove a block from today or from a future day. Plans are untouched. */
  deleteBlock: (id: string) => void;
  /** Remove an anytime or backlog task. */
  deleteTask: (id: string) => void;
  backlogToToday: (id: string) => void;

  applyTemplate: (id: string) => void;
  updateTemplateBlock: (templateId: string, blockId: string, patch: Partial<TemplateBlock>) => void;
  addTemplateBlock: (templateId: string) => void;
  removeTemplateBlock: (templateId: string, blockId: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  completeOnboarding: (settings: Settings, workday: TemplateBlock[]) => void;
  restartOnboarding: () => void;
}

let toastSeq = 0;

const DEFAULT_SETTINGS: Settings = {
  name: "",
  leadMinutes: 5,
  reviewAt: h(23, 30),
  quietFrom: h(0, 30),
  quietTo: h(7),
  timeFormat: systemTimeFormat(),
};

const blocksFor = (templates: Template[], id: string) =>
  blocksFromTemplate(templates.find((t) => t.id === id) ?? templates[0]);

/** Local calendar day, e.g. "2026-11-10". */
const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysSince = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  return Math.round((today - then) / 86_400_000);
};

/**
 * Move the day forward: today's plan loads, items planned for later days move closer
 * (and arrive when their day comes), finished anytime tasks are cleared.
 * Used both when the app opens on a new day and when midnight passes while it's open.
 */
function rolloverDay(
  s: Pick<State, "dayKey" | "templates" | "upcoming" | "anytime" | "blocks" | "backlog">,
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
    blocks: [...blocksFor(s.templates, templateId), ...arriving],
    upcoming: upcoming.filter((b) => b.dayOffset > 0),
    backlog: [...(s.backlog ?? []), ...unfinished],
    anytime: (s.anytime ?? [])
      .filter((t) => !t.done)
      .map((t) => (t.dayOffset ? { ...t, dayOffset: t.dayOffset - gap > 0 ? t.dayOffset - gap : undefined } : t)),
  };
}

export const useApp = create<State>()(
  persist(
    (set, get) => {
      /** Apply a data change with undo support and an optional toast. */
      const change = (fn: (s: State) => Partial<Snapshot>, message?: string) => {
        const s = get();
        const snap: Snapshot = {
          blocks: s.blocks, anytime: s.anytime, inbox: s.inbox, backlog: s.backlog, upcoming: s.upcoming, templates: s.templates,
        };
        set({
          ...fn(s),
          history: [...s.history.slice(-29), snap],
          ...(message ? { toast: { id: ++toastSeq, message, canUndo: true } } : {}),
        });
      };
      const mapBlock = (id: string, fn: (b: Block) => Block) => (s: State) => ({
        blocks: s.blocks.map((b) => (b.id === id ? fn(b) : b)),
        upcoming: s.upcoming.map((b) => (b.id === id ? { ...fn(b), dayOffset: b.dayOffset } : b)),
      });
      const mapTemplate = (id: string, fn: (t: Template) => Template) => (s: State) => ({
        templates: s.templates.map((t) => (t.id === id ? fn(t) : t)),
      });
      const titleOf = (id: string) =>
        (get().blocks.find((b) => b.id === id) ?? get().upcoming.find((b) => b.id === id))?.title ?? "";

      return {
        dayKey: dayKey(),
        areas: AREAS,
        templates: TEMPLATES,
        activeTemplateId: "workday",
        settings: DEFAULT_SETTINGS,
        onboarded: false,
        blocks: blocksFor(TEMPLATES, "workday"),
        anytime: [],
        inbox: [],
        backlog: [],
        upcoming: [],

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
          const today = dayKey();
          if (s.onboarded && s.dayKey !== today) {
            // Midnight passed while the app was open: start the new day in place.
            set({
              ...rolloverDay(s, today),
              now: nowMinutes(),
              history: [],
              toast: { id: ++toastSeq, message: "Good morning. A new day started", canUndo: false },
            });
            return;
          }
          set({ now: nowMinutes() });
        },
        simulate: (minutes) =>
          set(minutes === null ? { simulated: false, now: nowMinutes() } : { simulated: true, now: minutes }),
        setTheme: (theme) => set({ theme }),
        setView: (view) => set({ view, overlay: null }),
        open: (overlay, seed = "") => set({ overlay, quickAddSeed: seed }),
        notify: (notificationKind) => set({ overlay: "notification", notificationKind }),
        close: () => set({ overlay: null }),
        say: (message) => set({ toast: { id: ++toastSeq, message, canUndo: false } }),
        dismissToast: () => set({ toast: null }),
        undo: () => {
          const { history } = get();
          const prev = history[history.length - 1];
          if (!prev) return;
          set({ ...prev, history: history.slice(0, -1), toast: { id: ++toastSeq, message: "Undone", canUndo: false } });
        },

        completeBlock: (id) => change(mapBlock(id, (b) => ({ ...b, status: "done" })), `Done · ${titleOf(id)}`),
        skipBlock: (id) => change(mapBlock(id, (b) => ({ ...b, status: "skipped" })), `Skipped · ${titleOf(id)}`),
        extendBlock: (id, minutes) =>
          change(mapBlock(id, (b) => ({ ...b, end: b.end + minutes })), `+${minutes} min · ${titleOf(id)}`),
        toggleSubtask: (blockId, subId) =>
          change(
            mapBlock(blockId, (b) => ({
              ...b,
              subtasks: b.subtasks.map((t) => (t.id === subId ? { ...t, done: !t.done } : t)),
            })),
          ),

        addSubtask: (blockId, title) =>
          change(mapBlock(blockId, (b) => ({ ...b, subtasks: [...b.subtasks, { id: uid(), title, done: false }] }))),
        removeSubtask: (blockId, subId) =>
          change(mapBlock(blockId, (b) => ({ ...b, subtasks: b.subtasks.filter((t) => t.id !== subId) })), "Step removed"),
        renameBlock: (blockId, title) => change(mapBlock(blockId, (b) => ({ ...b, title }))),
        updateBlock: (blockId, patch) => change(mapBlock(blockId, (b) => ({ ...b, ...patch }))),
        selectedBlockId: null,
        openBlock: (id) => set({ selectedBlockId: id, overlay: "block" }),

        triage: (id, action) => {
          const title = titleOf(id);
          if (action === "now") {
            const start = roundTo(get().now, 5);
            return change(
              mapBlock(id, (b) => ({ ...b, start, end: start + (b.end - b.start) })),
              `Moved to ${fmtTime(start)} · ${title}`,
            );
          }
          if (action === "letGo") return change(mapBlock(id, (b) => ({ ...b, status: "skipped" })), `Let go · ${title}`);
          change(
            (s) => {
              const block = s.blocks.find((b) => b.id === id)!;
              const blocks = s.blocks.filter((b) => b.id !== id);
              if (action === "tomorrow") return { blocks, upcoming: [...s.upcoming, { ...block, status: "planned", dayOffset: 1 }] };
              const task: Task = { id: block.id, title: block.title, areaId: block.areaId, type: "backlog", done: false };
              return { blocks, backlog: [...s.backlog, task] };
            },
            action === "tomorrow" ? `Moved to tomorrow · ${title}` : `Moved to backlog · ${title}`,
          );
        },

        triageAllMissed: () =>
          change((s) => {
            const missed = new Set(missedBlocks(s.blocks, s.now).map((b) => b.id));
            const moved = s.blocks.filter((b) => missed.has(b.id));
            return {
              blocks: s.blocks.filter((b) => !missed.has(b.id)),
              backlog: [
                ...s.backlog,
                ...moved.map((b) => ({ id: b.id, title: b.title, areaId: b.areaId, type: "backlog" as const, done: false })),
              ],
            };
          }, "Moved everything to backlog"),

        toggleTask: (id) =>
          change((s) => ({ anytime: s.anytime.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),

        /** Turn a suggestion into a commitment that starts right now (trimmed to fit before the next one). */
        startTask: (id) => {
          const s = get();
          const task = s.anytime.find((t) => t.id === id);
          if (!task) return;
          const start = Math.floor(s.now);
          const next = nextCommitment(s.blocks, s.now);
          const end = Math.min(start + (task.duration ?? 30), next?.start ?? 24 * 60);
          const block: Block = {
            id: task.id, title: task.title, areaId: task.areaId ?? "personal", kind: "commitment",
            start, end, status: "planned", subtasks: [],
          };
          change(
            (st) => ({ blocks: [...st.blocks, block], anytime: st.anytime.filter((t) => t.id !== id) }),
            `Started · ${task.title}`,
          );
        },

        /** Move an anytime task onto today's timeline at a given time. */
        scheduleTask: (id, start) => {
          const task = get().anytime.find((t) => t.id === id);
          if (!task) return;
          const end = Math.min(start + (task.duration ?? 30), 24 * 60);
          const block: Block = {
            id: task.id, title: task.title, areaId: task.areaId ?? "personal", kind: "commitment",
            start, end, status: "planned", subtasks: [],
          };
          change(
            (st) => ({ blocks: [...st.blocks, block], anytime: st.anytime.filter((t) => t.id !== id) }),
            `Scheduled · ${task.title} · ${fmtTime(start)}`,
          );
        },

        addParsed: (p) => {
          const areaId = p.areaId ?? "personal";
          if (p.type === "fixed" && p.start !== undefined) {
            const block: Block = {
              id: uid(), title: p.title, areaId, kind: "commitment", start: p.start, end: p.start + p.duration,
              status: "planned", subtasks: [],
            };
            return change(
              (s) => (p.day === 0 ? { blocks: [...s.blocks, block] } : { upcoming: [...s.upcoming, { ...block, dayOffset: p.day }] }),
              `Added · ${p.dayLabel} · ${fmtTime(p.start)}`,
            );
          }
          if (p.type === "backlog" && !p.areaId) {
            return change((s) => ({ inbox: [...s.inbox, { id: uid(), title: p.title }] }), "Added to Inbox");
          }
          const task: Task = {
            id: uid(), title: p.title, areaId, type: p.type, done: false,
            duration: p.durationExplicit ? p.duration : undefined, due: p.due,
            dayOffset: p.day || undefined,
          };
          change((s) => ({ anytime: [...s.anytime, task] }), p.day ? `Added · ${p.dayLabel}` : "Added to Anytime today");
        },

        inboxToToday: (id) =>
          change((s) => {
            const item = s.inbox.find((i) => i.id === id)!;
            return {
              inbox: s.inbox.filter((i) => i.id !== id),
              anytime: [...s.anytime, { id: item.id, title: item.title, type: "flexible", done: false }],
            };
          }, "Moved to Anytime today"),
        letGoInbox: (id) => change((s) => ({ inbox: s.inbox.filter((i) => i.id !== id) }), "Let go"),
        deleteBlock: (id) => {
          const s = get();
          const title = (s.blocks.find((b) => b.id === id) ?? s.upcoming.find((b) => b.id === id))?.title ?? "";
          change(
            (st) => ({ blocks: st.blocks.filter((b) => b.id !== id), upcoming: st.upcoming.filter((b) => b.id !== id) }),
            `Deleted · ${title}`,
          );
        },
        deleteTask: (id) => {
          const s = get();
          const title = (s.anytime.find((t) => t.id === id) ?? s.backlog.find((t) => t.id === id))?.title ?? "";
          change(
            (st) => ({ anytime: st.anytime.filter((t) => t.id !== id), backlog: st.backlog.filter((t) => t.id !== id) }),
            `Deleted · ${title}`,
          );
        },
        backlogToToday: (id) =>
          change((s) => {
            const task = s.backlog.find((t) => t.id === id)!;
            return { backlog: s.backlog.filter((t) => t.id !== id), anytime: [...s.anytime, { ...task, type: "flexible" }] };
          }, "Moved to Anytime today"),

        applyTemplate: (id) => {
          const template = get().templates.find((t) => t.id === id);
          if (!template) return;
          change(() => ({ blocks: blocksFromTemplate(template) }), `Using ${template.name} plan today`);
          set({ activeTemplateId: id });
        },
        updateTemplateBlock: (templateId, blockId, patch) =>
          change(
            mapTemplate(templateId, (t) => ({
              ...t,
              blocks: t.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
            })),
          ),
        addTemplateBlock: (templateId) =>
          change(
            mapTemplate(templateId, (t) => {
              const last = Math.max(h(20), ...t.blocks.map((b) => b.end));
              const start = Math.min(last, h(23));
              const block: TemplateBlock = {
                id: uid(), title: "New block", areaId: "personal", kind: "commitment", start, end: Math.min(start + 60, h(24)),
              };
              return { ...t, blocks: [...t.blocks, block] };
            }),
          ),
        removeTemplateBlock: (templateId, blockId) =>
          change(mapTemplate(templateId, (t) => ({ ...t, blocks: t.blocks.filter((b) => b.id !== blockId) })), "Block removed"),

        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        completeOnboarding: (settings, workday) => {
          const s = get();
          const templates = s.templates.map((t) => (t.id === "workday" ? { ...t, blocks: workday } : t));
          const todayPlan = templateForWeekday(templates, new Date().getDay());
          // Setup (first time or re-run) only changes your plan and settings.
          // Everything you added yourself is kept: tasks, inbox, future days, and today's own blocks.
          const planBlocks = blocksFor(templates, todayPlan.id);
          const yourBlocks = s.blocks.filter((b) => !b.fromPlan);
          set({
            settings,
            templates,
            onboarded: true,
            activeTemplateId: todayPlan.id,
            blocks: [...planBlocks, ...yourBlocks],
            dayKey: dayKey(),
            history: [],
            toast: { id: ++toastSeq, message: "Your plan is ready", canUndo: false },
          });
        },
        restartOnboarding: () => set({ onboarded: false, overlay: null }),
      };
    },
    {
      name: "productivity-prototype",
      version: 3,
      // v3 removed the sample data: drop any saved day (it may contain samples) but keep your setup.
      migrate: (persisted, version) => {
        const p = { ...(persisted as Record<string, unknown>) };
        if (version < 3) {
          for (const key of ["blocks", "anytime", "inbox", "backlog", "upcoming", "dayKey"]) delete p[key];
        }
        return p as unknown as State;
      },
      // The window is destroyed on close, so the day must survive reopening.
      // (Moves to SQLite in the Rust core; localStorage is the bridge until then.)
      partialize: (s) => ({
        settings: s.settings, onboarded: s.onboarded, theme: s.theme, templates: s.templates,
        activeTemplateId: s.activeTemplateId, dayKey: s.dayKey,
        blocks: s.blocks, anytime: s.anytime, inbox: s.inbox, backlog: s.backlog, upcoming: s.upcoming,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const merged = { ...current, ...p };
        // Settings saved by older versions may miss newer fields.
        merged.settings = { ...DEFAULT_SETTINGS, ...merged.settings };
        const today = dayKey();
        if (p.dayKey === today && p.blocks) return merged;
        return { ...merged, ...rolloverDay({ ...merged, dayKey: p.dayKey ?? "" }, today) };
      },
    },
  ),
);

export const useCurrent = () => {
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  return { commitment: currentCommitment(blocks, now), context: currentContext(blocks, now) };
};
