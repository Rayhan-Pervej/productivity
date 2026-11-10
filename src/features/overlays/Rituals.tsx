// Morning briefing, evening review and wake-up catch-up: docs/07-ui-ux-design.md §9–10, spec §6.2.
import { useMemo, useState } from "react";
import { Check, Coffee, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";
import { blocksFromTemplate, templateForWeekday } from "@/data/seed";
import { dayProgress, missedBlocks, sortByStart, unresolvedBlocks } from "@/lib/day";
import { fmtTime, todayLabel, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button, Modal, ProgressRing, SectionLabel } from "@/components/ui";
import { Select } from "@/components/Select";
import { TriageCard } from "@/features/today/ContextPanel";
import type { Block } from "@/domain/types";

function CommitmentList({ blocks }: { blocks: Block[] }) {
  const areas = useApp((s) => s.areas);
  return (
    <div className="space-y-0.5">
      {blocks.map((b) => {
        const area = areas.find((a) => a.id === b.areaId);
        return (
          <div key={b.id} className="flex items-center gap-3 rounded-lg px-1 py-1 text-[13.5px]">
            <span className="tabular w-11 text-[12px] text-muted">{fmtTime(b.start)}</span>
            <span className="h-4 w-[3px] rounded-full" style={{ background: area?.color }} />
            <span className="truncate font-medium">{b.title}</span>
            <span className="ml-auto text-[12px] text-muted">{area?.name}</span>
          </div>
        );
      })}
    </div>
  );
}

function ContextLine({ blocks }: { blocks: Block[] }) {
  const ctx = sortByStart(blocks.filter((b) => b.kind === "context"));
  if (!ctx.length) return null;
  return (
    <p className="tabular text-[12.5px] text-muted">
      Around: {ctx.map((b) => `${b.title} ${fmtTime(b.start)}–${fmtTime(b.end)}`).join(" · ")}
    </p>
  );
}

export function MorningBriefing() {
  const isOpen = useApp((s) => s.overlay === "briefing");
  const close = useApp((s) => s.close);
  const blocks = useApp((s) => s.blocks);
  const anytime = useApp((s) => s.anytime);
  const templates = useApp((s) => s.templates);
  const activeId = useApp((s) => s.activeTemplateId);
  const name = useApp((s) => s.settings.name);
  const { applyTemplate, setView } = useApp.getState();
  const due = anytime.filter((t) => t.due && !t.done);
  const commitments = sortByStart(blocks.filter((b) => b.kind === "commitment"));

  return (
    <Modal open={isOpen} onClose={close} width={460}>
      <div className="p-7">
        <Sun size={20} className="text-attention" />
        <h2 className="mt-2 text-[24px] font-semibold tracking-tight">Good morning{name && `, ${name}`}</h2>
        <p className="text-[13.5px] text-muted">{todayLabel()}</p>

        <SectionLabel className="mt-6 mb-2">Today you're making time for</SectionLabel>
        {commitments.length ? (
          <CommitmentList blocks={commitments} />
        ) : (
          <p className="text-[13.5px] text-muted">Nothing planned. A free day.</p>
        )}
        <div className="mt-2">
          <ContextLine blocks={blocks} />
        </div>

        {due.length > 0 && (
          <div className="mt-4 space-y-1 rounded-xl bg-bg px-3 py-2.5 text-[13px]">
            {due.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-attention" /> Due {t.due?.toLowerCase()}: {t.title}
              </div>
            ))}
          </div>
        )}

        <div className="mt-7 flex items-center gap-2">
          <Button size="lg" variant="primary" className="flex-1" onClick={close}>
            Looks good
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setView("today")}>
            Adjust
          </Button>
          <Select
            label="Use a different plan for today"
            value={activeId}
            onChange={applyTemplate}
            size="lg"
            variant="filled"
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
          />
        </div>
      </div>
    </Modal>
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

  const tomorrowPlan = useMemo(
    () =>
      sortByStart([
        ...blocksFromTemplate(templateForWeekday(templates, weekdayOf(1))),
        ...upcoming.filter((b) => b.dayOffset === 1),
      ]),
    [templates, upcoming],
  );

  const steps = [
    <div key="wins">
      <h2 className="text-[22px] font-semibold tracking-tight">
        {wins ? `Nice work today${name ? `, ${name}` : ""}` : "A lighter day"}
      </h2>
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
      <div className="mb-5 flex justify-center gap-1.5">
        {steps.map((_, i) => (
          <span key={i} className={cn("h-1.5 rounded-full transition-all duration-300", i === step ? "w-6 bg-accent" : "w-1.5 bg-border")} />
        ))}
      </div>

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
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
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
            <Button variant="ghost" onClick={triageAll}>
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
