// Routines slice: things that repeat on chosen weekdays (add, edit with copies kept in sync, stop).
import type { Block, Routine } from "@/domain/types";
import { fmtTime } from "@/lib/time";
import { uid } from "@/lib/utils";
import { normalizeDays, repeatPhrase, untilPhrase } from "@/lib/repeat";
import { todaysRoutineCopies } from "../day";
import type { Slice } from "../helpers";

export const routinesSlice: Slice<"routines" | "addRoutine" | "updateRoutine" | "stopRoutine"> = (_set, _get, { change }) => ({
  routines: [],

  addRoutine: (r) => {
    const routine: Routine = { ...r, id: uid(), days: normalizeDays(r.days) };
    change(
      (s) => ({
        routines: [...s.routines, routine],
        // If it happens today, today's copy appears right away.
        blocks: [...s.blocks, ...todaysRoutineCopies([routine], s.blocks)],
      }),
      `Repeats ${repeatPhrase(routine.days)} ${untilPhrase(routine.until)} · ${fmtTime(routine.start)}`.replace("  ", " "),
    );
  },
  updateRoutine: (id, patch) =>
    change(
      (s) => {
        const routines = s.routines.map((r) => (r.id === id ? { ...r, ...patch, days: normalizeDays(patch.days ?? r.days) } : r));
        const r = routines.find((x) => x.id === id);
        // Every copy follows the repeat, except days you changed "only this day" or already finished.
        const sync = <T extends Block>(b: T): T =>
          r && b.routineId === id && b.status === "planned" && !b.detached
            ? { ...b, title: r.title, areaId: r.areaId, start: r.start, end: r.end }
            : b;
        return { routines, blocks: s.blocks.map(sync), upcoming: s.upcoming.map(sync) };
      },
      patch.days
        ? `Repeats ${repeatPhrase(normalizeDays(patch.days))}`
        : "until" in patch
          ? patch.until
            ? `Repeats ${untilPhrase(patch.until)}`
            : "Repeats with no end date"
          : undefined,
    ),
  stopRoutine: (id) =>
    change((s) => {
      // Today's copy stays (as a normal block); future copies are removed with the repeat.
      const detach = (b: Block): Block => (b.routineId === id ? { ...b, routineId: undefined, detached: undefined, fromPlan: false } : b);
      return {
        routines: s.routines.filter((r) => r.id !== id),
        blocks: s.blocks.map(detach),
        upcoming: s.upcoming.filter((b) => b.routineId !== id),
      };
    }, "Stopped repeating"),
});
