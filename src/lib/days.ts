// Blocks for any day: today's live blocks, or a future day's weekday plan plus what was added to it.
import type { Block, DatedBlock, Template } from "@/domain/types";
import { blocksFromTemplate, templateForWeekday } from "@/data/seed";
import { weekdayOf } from "@/lib/time";

export function blocksForDay(offset: number, today: Block[], templates: Template[], upcoming: DatedBlock[]): Block[] {
  if (offset === 0) return today;
  return [
    ...blocksFromTemplate(templateForWeekday(templates, weekdayOf(offset))),
    ...upcoming.filter((b) => b.dayOffset === offset),
  ];
}
