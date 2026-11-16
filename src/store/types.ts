// Store types: the public names (View, Overlay, ...) and the full State shape.
import type { Area, Block, DatedBlock, InboxItem, Settings, Task, Template, TemplateBlock, Routine, Weekday } from "@/domain/types";
import type { Parsed } from "@/lib/parse";

export type View = "today" | "focus" | "inbox" | "plans" | "settings";
export type Overlay = null | "quickAdd" | "palette" | "briefing" | "review" | "tray" | "notification" | "catchup" | "block";
export type NotificationKind = "upcoming" | "starting" | "ending" | "missed";
export type Theme = "system" | "light" | "dark";
export type Triage = "now" | "tomorrow" | "backlog" | "letGo";

export interface Snapshot {
  blocks: Block[];
  anytime: Task[];
  inbox: InboxItem[];
  backlog: Task[];
  /** Blocks planned on future days. */
  upcoming: DatedBlock[];
  templates: Template[];
  /** Things that repeat on chosen weekdays (Standup on weekdays, IELTS Sun/Tue/Thu...). */
  routines: Routine[];
}

export interface Toast {
  id: number;
  message: string;
  canUndo: boolean;
}

export interface State extends Snapshot {
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
  /** Undo "done" or "skip" at any time: the block is planned again. */
  reopenBlock: (id: string) => void;
  skipBlock: (id: string) => void;
  extendBlock: (id: string, minutes: number) => void;
  toggleSubtask: (blockId: string, subId: string) => void;
  addSubtask: (blockId: string, title: string) => void;
  removeSubtask: (blockId: string, subId: string) => void;
  renameBlock: (blockId: string, title: string) => void;
  updateBlock: (blockId: string, patch: Partial<Pick<Block, "title" | "start" | "end" | "areaId" | "detached">>) => void;
  /** A future day's copy of a repeat as a real block (created on first use), so it can hold steps and edits. */
  ensureRoutineCopy: (routineId: string, dayOffset: number) => DatedBlock | undefined;
  /** Block shown in the details window. */
  selectedBlockId: string | null;
  openBlock: (id: string) => void;
  triage: (id: string, action: Triage) => void;
  triageAllMissed: () => void;
  toggleTask: (id: string) => void;
  startTask: (id: string) => void;
  scheduleTask: (id: string, start: number) => void;
  /** Plan my day: give each picked item (from Anytime, Inbox or Backlog) its time. One undo. */
  planDay: (picks: { id: string; start: number; duration: number }[]) => void;
  addParsed: (p: Parsed) => void;
  inboxToToday: (id: string) => void;
  letGoInbox: (id: string) => void;
  /** Remove a block from today or from a future day. Plans are untouched. */
  deleteBlock: (id: string) => void;
  /** Remove an anytime or backlog task. */
  deleteTask: (id: string) => void;
  addRoutine: (r: Omit<Routine, "id">) => void;
  updateRoutine: (id: string, patch: Partial<Omit<Routine, "id">>) => void;
  /** Stop repeating: today's copy stays as a normal block. */
  stopRoutine: (id: string) => void;
  /** Make a block repeat on these weekdays (empty or null: stop repeating). */
  setRepeat: (blockId: string, days: Weekday[] | null) => void;
  backlogToToday: (id: string) => void;

  applyTemplate: (id: string) => void;
  updateTemplateBlock: (templateId: string, blockId: string, patch: Partial<TemplateBlock>) => void;
  addTemplateBlock: (templateId: string) => void;
  removeTemplateBlock: (templateId: string, blockId: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  completeOnboarding: (settings: Settings, workday: TemplateBlock[]) => void;
  restartOnboarding: () => void;
}
