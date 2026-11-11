// Domain model for v0.1: see docs/04-v0.1-spec.md §2.
// Times inside a day are minutes from midnight (e.g. 21:30 → 1290).

export type AreaId = string;

export interface Area {
  id: AreaId;
  name: string;
  color: string;
}

export type TaskType = "fixed" | "flexible" | "deadline" | "habit" | "backlog" | "routine";

/**
 * `context`   : background of the day (office, time out). Completes on its own; never nags.
 * `commitment`: something you chose to do (client work, study). Tracked, reminded, reviewed.
 */
export type BlockKind = "context" | "commitment";

/** Stored status. "active" and "didn't happen" are derived from the clock, never stored. */
export type BlockStatus = "planned" | "done" | "skipped";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** A scheduled time slot on a day. */
export interface Block {
  id: string;
  title: string;
  areaId: AreaId;
  kind: BlockKind;
  start: number;
  end: number;
  status: BlockStatus;
  subtasks: Subtask[];
  /** Generated from a plan (template) or a repeat rather than added by you. */
  fromPlan?: boolean;
  /** Set when this block is a day's copy of a repeating routine. */
  routineId?: string;
  /** A repeat copy changed for this day only: edits to the repeat no longer touch it. */
  detached?: boolean;
}

/** Weekday, as in JS `Date.getDay()`: 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Something that repeats on chosen weekdays at a fixed time (e.g. Standup, weekdays 8:30). */
export interface Routine {
  id: string;
  title: string;
  areaId: AreaId;
  start: number;
  end: number;
  /** Which weekdays it happens on (sorted, unique). */
  days: Weekday[];
  /** Last day it happens, inclusive ("2026-11-30"). No end when unset. */
  until?: string;
  /** Days it was removed from ("2026-11-19"), like a calendar's exceptions. */
  skipDays?: string[];
}

/** A block on a future day (prototype: days are offsets from today). */
export type DatedBlock = Block & { dayOffset: number };

/** A task without a fixed slot: flexible, deadline, habit or backlog. */
export interface Task {
  id: string;
  title: string;
  areaId?: AreaId;
  type: TaskType;
  duration?: number;
  due?: string;
  /** For tasks planned on a future day without a time. */
  dayOffset?: number;
  done: boolean;
}

export interface InboxItem {
  id: string;
  title: string;
}

export interface TemplateBlock {
  id: string;
  title: string;
  areaId: AreaId;
  kind: BlockKind;
  start: number;
  end: number;
}

export interface Template {
  id: string;
  name: string;
  days: string;
  blocks: TemplateBlock[];
}

export interface Settings {
  name: string;
  /** Minutes before a commitment to remind. */
  leadMinutes: number;
  reviewAt: number;
  quietFrom: number;
  quietTo: number;
  timeFormat: "12h" | "24h";
}
