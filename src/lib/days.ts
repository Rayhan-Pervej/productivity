// Blocks for any day: today's live blocks, or a future day's plan + repeats + what was added to it.
import type { Block, DatedBlock, Routine, Template } from "@/domain/types";
import { blocksFromTemplate, templateForWeekday } from "@/data/seed";
import { blocksFromRoutines } from "@/lib/repeat";
import { dateOf, weekdayOf } from "@/lib/time";

export function blocksForDay(
  offset: number,
  today: Block[],
  templates: Template[],
  upcoming: DatedBlock[],
  routines: Routine[],
): Block[] {
  if (offset === 0) return today;
  const added = upcoming.filter((b) => b.dayOffset === offset);
  const linked = new Set(added.map((b) => b.routineId).filter(Boolean));
  return [
    ...blocksFromTemplate(templateForWeekday(templates, weekdayOf(offset))),
    ...blocksFromRoutines(routines, dateOf(offset)).filter((b) => !linked.has(b.routineId)),
    ...added,
  ];
}
