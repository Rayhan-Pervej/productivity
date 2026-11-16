// A block's steps on the timeline: the "1/3" progress chip, and the checklist inside the block.
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { useApp } from "@/store/app";
import { STEP_HEADER, STEP_ROW } from "@/lib/timelineLayout";
import { cn, ink, tint } from "@/lib/utils";
import type { Block } from "@/domain/types";

/** "1/3" with a tiny bar, beside the block title. */
export function StepProgress({ done, total, color }: { done: number; total: number; color: string }) {
  const complete = done === total;
  return (
    <span
      className="tabular flex shrink-0 items-center gap-1.5 rounded-full px-2 py-px text-[10.5px] font-semibold"
      style={{ background: tint(color, complete ? 28 : 14), color: complete ? undefined : ink(color) }}
      title={`${done} of ${total} steps done`}
    >
      {complete ? (
        <Check size={10} strokeWidth={3} />
      ) : (
        <span className="h-1 w-6 overflow-hidden rounded-full" style={{ background: tint(color, 25) }}>
          <span
            className="block h-full rounded-full transition-[width] duration-300"
            style={{ width: `${(done / total) * 100}%`, background: color }}
          />
        </span>
      )}
      {done}/{total}
    </span>
  );
}

/** Steps as a real checklist inside the block; tick them right here. Shows what fits, then "+N more". */
export function StepList({ block, color, height, editable }: { block: Block; color: string; height: number; editable: boolean }) {
  const toggle = useApp((s) => s.toggleSubtask);
  const openBlock = useApp((s) => s.openBlock);
  const room = Math.max(0, Math.floor((height - STEP_HEADER) / STEP_ROW));
  if (room === 0) return null;
  const overflow = block.subtasks.length > room;
  const shown = block.subtasks.slice(0, overflow ? room - 1 : room);
  const hidden = block.subtasks.length - shown.length;

  return (
    <ul className="mt-0.5 flex flex-col">
      {shown.map((t) => (
        <li key={t.id} className="flex h-6 min-w-0 items-center gap-2.5">
          <button
            type="button"
            disabled={!editable}
            onClick={(e) => {
              e.stopPropagation();
              toggle(block.id, t.id);
            }}
            aria-label={t.done ? "Mark step not done" : "Mark step done"}
            className="grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] transition-all duration-200 hover:scale-110 disabled:hover:scale-100"
            style={t.done ? { background: color, borderColor: color } : { borderColor: tint(color, 60) }}
          >
            {t.done && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 20 }}>
                <Check size={10} strokeWidth={3.5} className="text-white" />
              </motion.span>
            )}
          </button>
          <span
            className={cn(
              "truncate text-[12.5px] transition-colors",
              t.done ? "text-muted line-through decoration-1 opacity-70" : "text-text/85",
            )}
          >
            {t.title}
          </span>
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openBlock(block.id);
            }}
            className="h-6 pl-[26px] text-[12px] font-medium hover:underline"
            style={{ color: ink(color) }}
          >
            +{hidden} more
          </button>
        </li>
      )}
    </ul>
  );
}
