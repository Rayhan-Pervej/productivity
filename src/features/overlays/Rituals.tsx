// Evening review (Close my day) and wake-up catch-up: docs/07-ui-ux-design.md §9–10, spec §6.2.
// The morning moment is PlanMyDay.tsx.
import { StepDots } from "@/components/StepDots";
import { useMemo, useState } from "react";
import { Check, Coffee, Moon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";
import { blocksForDay } from "@/lib/days";
import { dayProgress, missedBlocks, sortByStart, unresolvedBlocks } from "@/lib/day";
import { fmtTime, todayLabel } from "@/lib/time";
import { Button, Modal, ProgressRing } from "@/components/ui";
import { TriageCard } from "@/features/today/ContextPanel";
import type { Block } from "@/domain/types";

export function CommitmentList({ blocks }: { blocks: Block[] }) {
  const areas = useApp((s) => s.areas);
  return (
    <div className="space-y-0.5">
      {blocks.map((b) => {
        const area = areas.find((a) => a.id === b.areaId);
        return (
          <div key={b.id} className="flex items-center gap-3 rounded-lg px-1 py-1 text-[13.5px]">
            <span className="tabular w-16 shrink-0 text-[12px] whitespace-nowrap text-muted">{fmtTime(b.start)}</span>
            <span className="h-4 w-[3px] rounded-full" style={{ background: area?.color }} />
            <span className="truncate font-medium">{b.title}</span>
            <span className="ml-auto text-[12px] text-muted">{area?.name}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ContextLine({ blocks }: { blocks: Block[] }) {
  const ctx = sortByStart(blocks.filter((b) => b.kind === "context"));
  if (!ctx.length) return null;
  return (
    <p className="tabular text-[12.5px] text-muted">
      Around: {ctx.map((b) => `${b.title} ${fmtTime(b.start)}–${fmtTime(b.end)}`).join(" · ")}
    </p>
  );
}

export function EveningReview() {
  const isOpen = useApp((s) => s.overlay === "review");
  const close = useApp((s) => s.close);
  return (
    <Modal open={isOpen} onClose={close} width={520}>
      {isOpen && <ReviewBody onDone={close} />}
    </Modal>
  );
}

function ReviewBody({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const blocks = useApp((s) => s.blocks);
  const anytime = useApp((s) => s.anytime);
  const upcoming = useApp((s) => s.upcoming);
  const templates = useApp((s) => s.templates);
  const name = useApp((s) => s.settings.name);
  const open = useApp((s) => s.open);

  const doneBlocks = useMemo(() => sortByStart(blocks.filter((b) => b.kind === "commitment" && b.status === "done")), [blocks]);
  const doneTasks = anytime.filter((t) => t.done && !t.dayOffset);
  const lived = blocks.filter((b) => b.kind === "context");
  const left = useMemo(() => unresolvedBlocks(blocks), [blocks]);
  const { ratio, done, total } = dayProgress(blocks);
  const wins = doneBlocks.length + doneTasks.length;

  const routines = useApp((s) => s.routines);
  const tomorrowPlan = useMemo(() => sortByStart(blocksForDay(1, [], templates, upcoming, routines)), [templates, upcoming, routines]);

  const steps = [
    <div key="wins">
      <h2 className="text-[22px] font-semibold tracking-tight">{wins ? `Nice work today${name ? `, ${name}` : ""}` : "A lighter day"}</h2>
      <p className="text-[13.5px] text-muted">
        {wins ? "Here's what you showed up for." : "That's okay. Some days are for living. Tomorrow is fresh."}
      </p>
      <div className="my-6 flex justify-center">
        <ProgressRing value={ratio} size={132} stroke={8} color="var(--success)">
          <div className="text-center">
            <div className="tabular text-[26px] font-light">
              {done}
              <span className="text-muted">/{total}</span>
            </div>
            <div className="text-[11px] text-muted">planned</div>
          </div>
        </ProgressRing>
      </div>
      <div className="space-y-1">
        {[...doneBlocks.map((b) => b.title), ...doneTasks.map((t) => t.title)].map((title) => (
          <div key={title} className="flex items-center gap-2 text-[13.5px]">
            <Check size={14} className="text-success" /> {title}
          </div>
        ))}
        {lived.length > 0 && (
          <div className="pt-2 text-[12.5px] text-muted">Also part of your day: {lived.map((b) => b.title).join(" · ")}</div>
        )}
      </div>
    </div>,

    <div key="left">
      <h2 className="text-[22px] font-semibold tracking-tight">
        {left.length ? `${left.length} ${left.length === 1 ? "thing needs" : "things need"} a new spot` : "Nothing left over"}
      </h2>
      <p className="text-[13.5px] text-muted">
        {left.length ? "Move it, park it, or let it go. All three are fine." : "Every plan has a home. Lovely."}
      </p>
      <div className="mt-5 space-y-2">
        <AnimatePresence initial={false}>
          {left.map((b) => (
            <TriageCard
              key={b.id}
              block={b}
              actions={[
                { key: "tomorrow", label: "Tomorrow" },
                { key: "backlog", label: "Backlog" },
                { key: "letGo", label: "Let go" },
              ]}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>,

    <div key="tomorrow">
      <h2 className="text-[22px] font-semibold tracking-tight">Tomorrow</h2>
      <p className="mb-5 text-[13.5px] text-muted">{todayLabel(1)}</p>
      <CommitmentList blocks={tomorrowPlan.filter((b) => b.kind === "commitment")} />
      <div className="mt-2">
        <ContextLine blocks={tomorrowPlan} />
      </div>

      <Button variant="ghost" className="mt-3" onClick={() => open("quickAdd", "tomorrow ")}>
        + Add something
      </Button>
    </div>,
  ];

  return (
    <div className="p-7">
      <StepDots count={steps.length} current={step} className="mb-5 justify-center" />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.18 }}
          className="min-h-[300px]"
        >
          {steps[step]}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex justify-end gap-2">
        {step > 0 && (
          <Button variant="ghost" size="lg" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < steps.length - 1 ? (
          <Button variant="primary" size="lg" onClick={() => setStep(step + 1)}>
            Next
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={onDone}>
            Good night <Moon size={15} />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Shown once after the PC wakes up / starts, instead of a burst of stale notifications. */
export function CatchUp() {
  const isOpen = useApp((s) => s.overlay === "catchup");
  const close = useApp((s) => s.close);
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const triageAll = useApp((s) => s.triageAllMissed);
  const missed = useMemo(() => missedBlocks(blocks, now), [blocks, now]);

  return (
    <Modal open={isOpen} onClose={close} width={460}>
      <div className="p-7">
        <Coffee size={20} className="text-accent" />
        <h2 className="mt-2 text-[22px] font-semibold tracking-tight">Welcome back</h2>
        <p className="text-[13.5px] text-muted">
          {missed.length
            ? `While you were away, ${missed.length} ${missed.length === 1 ? "thing" : "things"} passed by.`
            : "Nothing was missed while you were away."}
        </p>
        <div className="mt-5 max-h-[340px] space-y-2 overflow-y-auto">
          <AnimatePresence initial={false}>
            {missed.map((b) => (
              <TriageCard key={b.id} block={b} />
            ))}
          </AnimatePresence>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          {missed.length >= 2 && (
            <Button variant="ghost" size="lg" onClick={triageAll}>
              Move all to backlog
            </Button>
          )}
          <Button variant="primary" size="lg" onClick={close}>
            {missed.length ? "Later" : "Continue"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
