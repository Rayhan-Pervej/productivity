// Plan my day: the morning moment (spec §7.1, plus the "what do I add?" problem).
// 1. Your day: what's already planned and what's due. (Which plan a day uses is changed in Plans.)
// 2. What matters: pick up to 3 from what's waiting (Anytime, Inbox, Backlog), or add what's on your mind.
// 3. Give them time: each pick gets a suggested free slot you can change, then all go on the timeline at once.
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Plus, Sun } from "lucide-react";
import { useApp } from "@/store/app";
import { parseQuickAdd } from "@/lib/parse";
import { sortByStart, suggestStart } from "@/lib/day";
import { dueLabel, fmtDuration, fmtTime, todayLabel } from "@/lib/time";
import { dayWindow } from "@/lib/scale";
import { cn } from "@/lib/utils";
import { AreaDot, Button, Modal, SectionLabel, TimeSelect } from "@/components/ui";
import { Select } from "@/components/Select";
import { StepDots } from "@/components/StepDots";
import type { Block } from "@/domain/types";
import { CommitmentList, ContextLine } from "./Rituals";

/** How many things Plan my day asks you to pick: few enough that they all happen. */
const MAX_PICKS = 3;
const DURATIONS = [15, 30, 45, 60, 90, 120].map((m) => ({ value: m, label: fmtDuration(m) }));

interface Candidate {
  id: string;
  title: string;
  areaId?: string;
  duration: number;
  due?: string;
  from: "Anytime" | "Inbox" | "Backlog";
}

export function PlanMyDay() {
  const isOpen = useApp((s) => s.overlay === "briefing");
  const close = useApp((s) => s.close);
  return (
    <Modal open={isOpen} onClose={close} width={540}>
      {isOpen && <PlanBody onDone={close} />}
    </Modal>
  );
}

function PlanBody({ onDone }: { onDone: () => void }) {
  // Dev-only review links: ?planstep=2 opens a step, ?planpick=2 picks the first items.
  const dev = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
  const [step, setStep] = useState(() => Number(dev?.get("planstep") ?? 0));
  const [picks, setPicks] = useState<string[]>([]);
  const [times, setTimes] = useState<Record<string, { start: number; duration: number }>>({});

  const anytime = useApp((s) => s.anytime);
  const inbox = useApp((s) => s.inbox);
  const backlog = useApp((s) => s.backlog);

  // Everything waiting to be done, most likely first: today's anytime, then inbox, then backlog.
  const candidates = useMemo<Candidate[]>(
    () => [
      ...anytime
        .filter((t) => !t.done && !t.dayOffset)
        .map((t) => ({ id: t.id, title: t.title, areaId: t.areaId, duration: t.duration ?? 30, due: t.due, from: "Anytime" as const })),
      ...inbox.map((i) => ({ id: i.id, title: i.title, duration: 30, from: "Inbox" as const })),
      ...backlog.map((t) => ({
        id: t.id,
        title: t.title,
        areaId: t.areaId,
        duration: t.duration ?? 30,
        due: t.due,
        from: "Backlog" as const,
      })),
    ],
    [anytime, inbox, backlog],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on open (dev review only)
  useEffect(() => {
    const n = Number(dev?.get("planpick") ?? 0);
    if (n) setPicks(candidates.slice(0, Math.min(n, MAX_PICKS)).map((c) => c.id));
  }, []);
  const picked = picks.map((id) => candidates.find((c) => c.id === id)).filter((c): c is Candidate => !!c);

  const toggle = (id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX_PICKS ? [...p, id] : p));

  const steps = [
    <YourDay key="day" />,
    <WhatMatters key="matters" candidates={candidates} picks={picks} onToggle={toggle} onAdded={(id) => toggle(id)} />,
    <GiveThemTime key="time" picked={picked} times={times} setTimes={setTimes} />,
  ];

  const finish = () => {
    useApp.getState().planDay(picked.map((c) => ({ id: c.id, ...(times[c.id] ?? { start: 0, duration: c.duration }) })));
    onDone();
  };

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
          className="min-h-[320px]"
        >
          {steps[step]}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex items-center justify-end gap-2">
        {step > 0 && (
          <Button variant="ghost" size="lg" className="mr-auto" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step === 0 && (
          <>
            <Button variant="ghost" size="lg" onClick={onDone}>
              Looks good
            </Button>
            <Button variant="primary" size="lg" onClick={() => setStep(1)}>
              Plan my day <ArrowRight size={15} />
            </Button>
          </>
        )}
        {step === 1 &&
          (picked.length ? (
            <Button variant="primary" size="lg" onClick={() => setStep(2)}>
              Give them time <ArrowRight size={15} />
            </Button>
          ) : (
            <Button variant="ghost" size="lg" onClick={onDone}>
              Nothing to add today
            </Button>
          ))}
        {step === 2 && (
          <Button variant="primary" size="lg" disabled={!picked.every((c) => times[c.id])} onClick={finish}>
            <Check size={15} /> Put {picked.length === 1 ? "it" : "them"} on my day
          </Button>
        )}
      </div>
    </div>
  );
}

/** Step 1: what today already holds. */
function YourDay() {
  const blocks = useApp((s) => s.blocks);
  const anytime = useApp((s) => s.anytime);
  const name = useApp((s) => s.settings.name);
  const plan = useApp((s) => s.templates.find((t) => t.id === s.activeTemplateId)?.name);
  const due = anytime.filter((t) => t.due && !t.done);
  const commitments = sortByStart(blocks.filter((b) => b.kind === "commitment"));

  return (
    <div>
      <Sun size={20} className="text-attention" />
      <h2 className="mt-2 text-[24px] font-semibold tracking-tight">Good morning{name && `, ${name}`}</h2>
      <p className="text-[13.5px] text-muted">{todayLabel()}</p>

      <div className="mt-6 mb-2 flex items-center justify-between gap-3">
        <SectionLabel>Already on your day</SectionLabel>
        {/* Just for context: which plan today follows. It's changed in Plans, not here. */}
        {plan && (
          <span
            className="rounded-md bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-muted"
            title={`Today follows your ${plan} plan. Change plans in Plans.`}
          >
            {plan}
          </span>
        )}
      </div>
      {commitments.length ? <CommitmentList blocks={commitments} /> : <p className="text-[13.5px] text-muted">Nothing yet. A free day.</p>}
      <div className="mt-2">
        <ContextLine blocks={blocks} />
      </div>

      {due.length > 0 && (
        <div className="mt-4 space-y-1 rounded-xl bg-bg px-3 py-2.5 text-[13px]">
          {due.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full bg-attention" />
              <span className="text-attention">Due {t.due && dueLabel(t.due)}:</span> {t.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Step 2: pick up to 3, or add what's on your mind (it's picked right away). */
function WhatMatters({
  candidates,
  picks,
  onToggle,
  onAdded,
}: {
  candidates: Candidate[];
  picks: string[];
  onToggle: (id: string) => void;
  onAdded: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const areas = useApp((s) => s.areas);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const s = useApp.getState();
    const before = new Set([...s.anytime, ...s.inbox].map((t) => t.id));
    s.addParsed(parseQuickAdd(text, areas));
    const after = useApp.getState();
    const added = [...after.anytime, ...after.inbox].find((t) => !before.has(t.id));
    if (added) onAdded(added.id); // with a time, it went straight onto the timeline instead
    setText("");
  };

  return (
    <div>
      <h2 className="text-[22px] font-semibold tracking-tight">What matters today?</h2>
      <p className="text-[13.5px] text-muted">Pick up to {MAX_PICKS}. If only these get done, it was a good day.</p>

      <form onSubmit={add} className="mt-5 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Something on your mind? Type it, press Enter"
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent"
        />
        <Button type="submit" size="lg" disabled={!text.trim()}>
          <Plus size={15} /> Add
        </Button>
      </form>

      <div className="mt-3 max-h-[260px] space-y-1 overflow-y-auto pr-1">
        {candidates.length === 0 && (
          <p className="px-1 py-6 text-center text-[13px] text-muted">Nothing waiting. Add what's on your mind above.</p>
        )}
        {candidates.map((c) => {
          const n = picks.indexOf(c.id);
          const full = n < 0 && picks.length >= MAX_PICKS;
          return (
            <button
              key={c.id}
              type="button"
              disabled={full}
              onClick={() => onToggle(c.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-[13.5px] transition-colors disabled:opacity-45",
                n >= 0 ? "border-accent bg-accent/8" : "border-transparent hover:bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                  n >= 0 ? "bg-accent text-accent-fg" : "border-[1.5px] border-border",
                )}
              >
                {n >= 0 && n + 1}
              </span>
              {c.areaId && <AreaDot color={areas.find((a) => a.id === c.areaId)?.color ?? "var(--muted)"} />}
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              {c.due && <span className="shrink-0 text-[12px] text-attention">due {dueLabel(c.due)}</span>}
              <span className="shrink-0 text-[12px] text-muted">{c.from}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Step 3: a suggested free slot for each pick, one after another, all adjustable. */
function GiveThemTime({
  picked,
  times,
  setTimes,
}: {
  picked: Candidate[];
  times: Record<string, { start: number; duration: number }>;
  setTimes: (fn: (t: Record<string, { start: number; duration: number }>) => Record<string, { start: number; duration: number }>) => void;
}) {
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const areas = useApp((s) => s.areas);
  const { quietFrom, quietTo } = useApp((s) => s.settings);
  const day = dayWindow(quietFrom, quietTo);

  // Suggest once, in pick order, each one avoiding the ones before it. Your changes are kept.
  useEffect(() => {
    if (picked.every((c) => times[c.id])) return;
    const taken: Block[] = [];
    const next: Record<string, { start: number; duration: number }> = { ...times };
    for (const c of picked) {
      const slot = next[c.id] ?? {
        start: suggestStart([...blocks, ...taken], Math.max(now, day.start), c.duration, c.areaId, day.end) ?? Math.ceil(now / 15) * 15,
        duration: c.duration,
      };
      next[c.id] = slot;
      taken.push({
        id: c.id,
        title: c.title,
        areaId: c.areaId ?? "personal",
        kind: "commitment",
        start: slot.start,
        end: slot.start + slot.duration,
        status: "planned",
        subtasks: [],
      });
    }
    setTimes(() => next);
  }, [picked, times, blocks, now, day.start, day.end, setTimes]);

  return (
    <div>
      <h2 className="text-[22px] font-semibold tracking-tight">Give them time</h2>
      <p className="text-[13.5px] text-muted">Free slots, suggested in order. Change anything.</p>
      <div className="mt-5 space-y-2">
        {picked.map((c, i) => {
          const t = times[c.id];
          if (!t) return null;
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg">
                {i + 1}
              </span>
              {c.areaId && <AreaDot color={areas.find((a) => a.id === c.areaId)?.color ?? "var(--muted)"} />}
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{c.title}</span>
              <TimeSelect
                label={`Start of ${c.title}`}
                value={t.start}
                step={15}
                from={Math.ceil(now / 15) * 15}
                to={24 * 60 - 15}
                onChange={(start) => setTimes((all) => ({ ...all, [c.id]: { ...t, start } }))}
              />
              <Select
                label={`Length of ${c.title}`}
                value={t.duration}
                onChange={(duration) => setTimes((all) => ({ ...all, [c.id]: { ...t, duration } }))}
                options={DURATIONS}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12.5px] text-muted">
        Ends by {fmtTime(Math.max(...picked.map((c) => (times[c.id] ? times[c.id].start + times[c.id].duration : 0))))}.
      </p>
    </div>
  );
}
