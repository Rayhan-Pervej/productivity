// Blocks slice: today's and future days' blocks: status, steps, edits, triage, delete and repeat links.
import type { Block, DatedBlock, Routine, Task } from "@/domain/types";
import { TEMPLATES } from "@/data/seed";
import { dateOf, dayLabel, fmtTime, isoDay, roundTo } from "@/lib/time";
import { uid } from "@/lib/utils";
import { normalizeDays, repeatPhrase } from "@/lib/repeat";
import { missedBlocks } from "@/lib/day";
import { blocksFor, dateOffsetOf } from "../day";
import type { Slice } from "../helpers";

export const blocksSlice: Slice<
  | "dayKey"
  | "blocks"
  | "upcoming"
  | "selectedBlockId"
  | "completeBlock"
  | "reopenBlock"
  | "skipBlock"
  | "extendBlock"
  | "toggleSubtask"
  | "addSubtask"
  | "removeSubtask"
  | "renameBlock"
  | "updateBlock"
  | "openBlock"
  | "triage"
  | "triageAllMissed"
  | "setRepeat"
  | "deleteBlock"
  | "ensureRoutineCopy"
> = (set, get, { change, mapBlock, titleOf, doneSound }) => ({
  dayKey: isoDay(),
  blocks: blocksFor(TEMPLATES, "workday"),
  upcoming: [],

  completeBlock: (id) => {
    change(
      mapBlock(id, (b) => ({ ...b, status: "done" })),
      `Done · ${titleOf(id)}`,
    );
    doneSound();
  },
  reopenBlock: (id) =>
    change(
      mapBlock(id, (b) => ({ ...b, status: "planned" })),
      `Marked not done · ${titleOf(id)}`,
    ),
  skipBlock: (id) =>
    change(
      mapBlock(id, (b) => ({ ...b, status: "skipped" })),
      `Skipped · ${titleOf(id)}`,
    ),
  extendBlock: (id, minutes) =>
    change(
      mapBlock(id, (b) => ({ ...b, end: b.end + minutes })),
      `+${minutes} min · ${titleOf(id)}`,
    ),
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
    change(
      mapBlock(blockId, (b) => ({ ...b, subtasks: b.subtasks.filter((t) => t.id !== subId) })),
      "Step removed",
    ),
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
    if (action === "letGo")
      return change(
        mapBlock(id, (b) => ({ ...b, status: "skipped" })),
        `Let go · ${title}`,
      );
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

  setRepeat: (blockId, days) => {
    const s = get();
    const block = s.blocks.find((b) => b.id === blockId) ?? s.upcoming.find((b) => b.id === blockId);
    if (!block) return;
    const wanted = days ? normalizeDays(days) : [];
    if (block.routineId) {
      if (!wanted.length) return s.stopRoutine(block.routineId);
      return s.updateRoutine(block.routineId, { days: wanted });
    }
    if (!wanted.length) return;
    // Turn this block into a routine; it becomes that routine's copy for its own day.
    const routine: Routine = { id: uid(), title: block.title, areaId: block.areaId, start: block.start, end: block.end, days: wanted };
    const link = <T extends Block>(b: T): T => (b.id === blockId ? { ...b, routineId: routine.id, fromPlan: true } : b);
    change(
      (st) => ({ routines: [...st.routines, routine], blocks: st.blocks.map(link), upcoming: st.upcoming.map(link) }),
      `Repeats ${repeatPhrase(wanted)} · ${fmtTime(block.start)}`,
    );
  },

  deleteBlock: (id) => {
    const s = get();
    const block = s.blocks.find((b) => b.id === id) ?? s.upcoming.find((b) => b.id === id);
    const title = block?.title ?? "";
    // A repeat's copy: remember the day as skipped, so the copy doesn't come back.
    const day = block?.routineId ? isoDay(dateOf("dayOffset" in block ? (block as DatedBlock).dayOffset : 0)) : undefined;
    change(
      (st) => ({
        blocks: st.blocks.filter((b) => b.id !== id),
        upcoming: st.upcoming.filter((b) => b.id !== id),
        routines: day
          ? st.routines.map((r) => (r.id === block!.routineId ? { ...r, skipDays: [...(r.skipDays ?? []), day] } : r))
          : st.routines,
      }),
      day ? `Removed for ${dayLabel(dateOffsetOf(day))} · ${title}` : `Deleted · ${title}`,
    );
  },
  ensureRoutineCopy: (routineId, dayOffset) => {
    const s = get();
    const existing = s.upcoming.find((b) => b.routineId === routineId && b.dayOffset === dayOffset);
    if (existing) return existing;
    const r = s.routines.find((x) => x.id === routineId);
    if (!r) return undefined;
    const copy: DatedBlock = {
      id: uid(),
      title: r.title,
      areaId: r.areaId,
      kind: "commitment",
      start: r.start,
      end: r.end,
      status: "planned",
      subtasks: [],
      fromPlan: true,
      routineId,
      dayOffset,
    };
    // Not an undoable action: an untouched copy looks exactly like the preview it replaces.
    set({ upcoming: [...s.upcoming, copy] });
    return copy;
  },
});
