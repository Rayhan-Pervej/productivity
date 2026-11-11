// Details of a tracked block: rename it and manage its steps (subtasks).
import { useState } from "react";
import { Check, Play, Plus, Repeat, RotateCcw, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";
import { dayLabel, fmtDuration } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button, Kbd, Modal, TimeSelect } from "@/components/ui";
import { AreaSelect } from "@/components/AreaSelect";
import { WeekdayPicker } from "@/components/WeekdayPicker";
import { repeatLabel, repeatPhrase, untilPhrase } from "@/lib/repeat";
import { DateInput } from "@/components/DateInput";
import { SegmentedControl } from "@/components/SegmentedControl";
import { isoDay } from "@/lib/time";
import type { Block, DatedBlock } from "@/domain/types";

export function BlockDetails() {
  const isOpen = useApp((s) => s.overlay === "block");
  const close = useApp((s) => s.close);
  // The block may be today's or one planned on a future day.
  const block = useApp(
    (s) => s.blocks.find((b) => b.id === s.selectedBlockId) ?? s.upcoming.find((b) => b.id === s.selectedBlockId),
  );
  return (
    <Modal open={isOpen && !!block} onClose={close} width={500}>
      {block && <Body block={block} />}
    </Modal>
  );
}

function Body({ block }: { block: Block | DatedBlock }) {
  const now = useApp((s) => s.now);
  const { updateBlock, completeBlock, reopenBlock, deleteBlock, setRepeat, updateRoutine, setView, close } = useApp.getState();
  const routine = useApp((s) => (block.routineId ? s.routines.find((r) => r.id === block.routineId) : undefined));
  const dayOffset = "dayOffset" in block ? block.dayOffset : 0;
  const isToday = dayOffset === 0;
  const active = isToday && block.status === "planned" && block.start <= now && now < block.end;
  const doneSteps = block.subtasks.filter((t) => t.done).length;
  const duration = block.end - block.start;

  // Editing a repeat's copy: "Only this day" (default once you edit) or "Every time" (the repeat changes too).
  const [scope, setScope] = useState<"day" | "all" | null>(block.detached ? "day" : null);
  type Edit = Partial<Pick<Block, "title" | "start" | "end" | "areaId">>;
  const edit = (patch: Edit) => {
    if (!routine) return updateBlock(block.id, patch);
    if (scope === "all") {
      updateRoutine(routine.id, patch);
      updateBlock(block.id, { ...patch, detached: false });
    } else {
      updateBlock(block.id, { ...patch, detached: true });
      if (!scope) setScope("day");
    }
  };
  const chooseScope = (next: "day" | "all") => {
    if (!routine) return;
    if (next === "all") {
      // Make the repeat match this copy; every other copy follows.
      updateRoutine(routine.id, { title: block.title, start: block.start, end: block.end, areaId: block.areaId });
      updateBlock(block.id, { detached: false });
    } else {
      updateBlock(block.id, { detached: true });
    }
    setScope(next);
  };

  const deleteNote = !isToday
    ? routine
      ? `Delete removes it from ${dayLabel(dayOffset)} only. It still repeats on its other days.`
      : `Delete removes it from ${dayLabel(dayOffset)}.`
    : routine
      ? "Delete removes it from today only. It still repeats on its other days."
      : block.fromPlan
      ? "Delete removes it from today only. To change every day, edit Plans."
      : null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-[12px] font-medium text-muted">
        <span className="rounded-md bg-surface-2 px-2 py-0.5">{dayLabel(dayOffset)}</span>
        {routine ? (
          <span className="flex items-center gap-1 text-accent">
            <Repeat size={12} /> Repeats {repeatPhrase(routine.days)} {untilPhrase(routine.until)}
          </span>
        ) : (
          block.fromPlan && <span>From your plan</span>
        )}
      </div>
      <input
        value={block.title}
        onChange={(e) => edit({ title: e.target.value })}
        aria-label="Title"
        className="-mx-1 mt-2 w-full rounded-lg border border-transparent bg-transparent px-1 text-[20px] font-semibold tracking-tight outline-none hover:border-border focus:border-accent"
      />

      {/* When and what */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
        <TimeSelect
          label="Start"
          value={block.start}
          step={15}
          onChange={(start) => edit({ start, end: start + duration })}
        />
        <span className="text-muted">–</span>
        <TimeSelect
          label="End"
          value={block.end}
          from={block.start + 15}
          step={15}
          onChange={(end) => edit({ end })}
        />
        <span className="tabular text-muted">{fmtDuration(duration)}</span>
        <AreaSelect className="ml-auto" value={block.areaId} onChange={(areaId) => edit({ areaId })} />
      </div>

      {routine && scope && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5">
          <span className="text-[12.5px] text-muted">Apply this change to</span>
          <SegmentedControl
            label="Apply change to"
            size="sm"
            value={scope}
            onChange={chooseScope}
            options={[
              { value: "day", label: "Only this day" },
              { value: "all", label: "Every time" },
            ]}
          />
          <span className="w-full text-[11.5px] text-muted">
            {scope === "day"
              ? "Other days keep the repeat's title and time."
              : "The repeat changes, and every day that wasn't changed on its own follows."}
          </span>
        </div>
      )}

      {/* Repeat on weekdays (tracked blocks only) */}
      {block.kind === "commitment" && (
        <div className="mt-5">
          <div className="mb-2 flex items-center text-[12px] text-muted">
            <span className="font-semibold tracking-wider uppercase">Repeat</span>
            <span className="ml-auto">
              {routine ? `${repeatLabel(routine.days)} ${untilPhrase(routine.until)}` : "Doesn't repeat"}
            </span>
          </div>
          <WeekdayPicker value={routine?.days ?? []} onChange={(days) => setRepeat(block.id, days.length ? days : null)} />
          {routine && (
            <div className="mt-3 flex items-center gap-2 text-[13px]">
              <span className="text-muted">Until</span>
              <DateInput
                label="Repeat until"
                value={routine.until}
                min={isoDay()}
                onChange={(until) => updateRoutine(routine.id, { until })}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-6 mb-2 flex items-center text-[12px] text-muted">
        <span className="font-semibold tracking-wider uppercase">Steps</span>
        {block.subtasks.length > 0 && (
          <span className="tabular ml-auto">
            {doneSteps} / {block.subtasks.length}
          </span>
        )}
      </div>
      <Steps block={block} />

      <div className="mt-6 flex items-center gap-2">
        {isToday && block.status === "planned" && (
          <Button variant="success" onClick={() => { completeBlock(block.id); close(); }}>
            <Check size={15} /> Done
          </Button>
        )}
        {isToday && block.status !== "planned" && (
          <Button onClick={() => reopenBlock(block.id)}>
            <RotateCcw size={14} /> {block.status === "done" ? "Mark not done" : "Restore"}
          </Button>
        )}
        {active && (
          <Button onClick={() => setView("focus")}>
            <Play size={14} /> Focus
          </Button>
        )}
        <Button
          variant="ghost"
          className="ml-auto hover:bg-danger/10 hover:text-danger"
          onClick={() => {
            deleteBlock(block.id);
            close();
          }}
        >
          <Trash2 size={14} /> Delete
        </Button>
        <Button variant="ghost" onClick={close}>
          Close <Kbd>Esc</Kbd>
        </Button>
      </div>
      {deleteNote && <p className="mt-3 text-[11.5px] text-muted">{deleteNote}</p>}
    </div>
  );
}

/** Checklist with an inline "Add a step" field. Shared by details and Focus mode. */
export function Steps({ block, autoFocus = false, compact = false }: { block: Block; autoFocus?: boolean; compact?: boolean }) {
  const { toggleSubtask, addSubtask, removeSubtask } = useApp.getState();
  const [draft, setDraft] = useState("");

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    addSubtask(block.id, title);
    setDraft("");
  };

  return (
    <div className={cn("space-y-0.5", compact && "w-full max-w-sm")}>
      <AnimatePresence initial={false}>
        {block.subtasks.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-surface-2"
          >
            <button
              onClick={() => toggleSubtask(block.id, t.id)}
              aria-label={t.done ? "Mark step not done" : "Mark step done"}
              className={cn(
                "grid size-[18px] shrink-0 place-items-center rounded-full border transition-all",
                t.done ? "border-success bg-success text-white" : "border-border hover:border-success",
              )}
            >
              {t.done && <Check size={11} strokeWidth={3} />}
            </button>
            <span className={cn("flex-1 text-[14px]", t.done && "text-muted line-through")}>{t.title}</span>
            <button
              onClick={() => removeSubtask(block.id, t.id)}
              aria-label="Remove step"
              className="grid size-6 place-items-center rounded-md text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text"
            >
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
        <Plus size={16} className="shrink-0 text-muted" />
        <input
          autoFocus={autoFocus}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder={block.subtasks.length ? "Add another step…" : "Break it into small steps: type one, press Enter"}
          className="h-7 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted/70"
        />
      </div>
    </div>
  );
}
