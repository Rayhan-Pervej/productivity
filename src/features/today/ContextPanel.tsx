import { useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Check, ChevronDown, Moon, Play, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp, useCurrent, type Triage } from "@/store/app";
import { freeStarts, freeWindow, missedBlocks, nextCommitment, suggest } from "@/lib/day";
import { fmtCountdown, fmtDuration, fmtTime, inQuietHours } from "@/lib/time";
import { cn, tint } from "@/lib/utils";
import { AreaDot, Button, ProgressRing, SectionLabel, TimeSelect, useArea } from "@/components/ui";
import { showMenu, wantsNativeMenu } from "@/components/ContextMenu";
import { taskMenu } from "@/features/menus";
import type { Block, Task } from "@/domain/types";

export function ContextPanel() {
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const allTasks = useApp((s) => s.anytime);
  const anytime = useMemo(() => allTasks.filter((t) => !t.dayOffset), [allTasks]);
  const next = useMemo(() => nextCommitment(blocks, now), [blocks, now]);
  const missed = useMemo(() => missedBlocks(blocks, now), [blocks, now]);
  const pending = anytime.filter((t) => !t.done);
  const finished = anytime.filter((t) => t.done);

  return (
    <aside className="flex w-[324px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-border p-5 max-[1000px]:hidden">
      <section className="space-y-2.5">
        <SectionLabel>Now</SectionLabel>
        <NowCard />
      </section>

      {next && (
        <section className="space-y-2">
          <SectionLabel>Next · {fmtTime(next.start)}</SectionLabel>
          <BlockLine block={next} />
        </section>
      )}

      <section className="space-y-1">
        <SectionLabel className="mb-1.5">Anytime today</SectionLabel>
        {pending.length === 0 && <p className="px-1.5 text-[13px] text-muted">All clear. Nice.</p>}
        {pending.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        {finished.length > 0 && (
          <div className="pt-1 opacity-70">
            {finished.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>

      {missed.length > 0 && <Missed blocks={missed} />}
    </aside>
  );
}

/** The single most important card: what to do right now. */
export function NowCard() {
  const { commitment, context } = useCurrent();
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const settings = useApp((s) => s.settings);
  const reviewAt = settings.reviewAt;
  const free = freeWindow(blocks, now);

  if (commitment) return <CommitmentCard block={commitment} />;
  if (context) return <ContextCard block={context} />;
  // Night: don't suggest work during quiet hours. Rest is the plan.
  if (inQuietHours(now, settings.quietFrom, settings.quietTo)) return <NightCard quietTo={settings.quietTo} next={free.nextAny} />;
  if (!free.next && now >= reviewAt - 90) return <DayDoneCard />;
  return <SuggestionCard minutes={free.minutes} until={free.nextAny ? free.until : undefined} />;
}

function CommitmentCard({ block }: { block: Block }) {
  const now = useApp((s) => s.now);
  const { completeBlock, setView } = useApp.getState();
  const area = useArea(block.areaId);
  const color = area?.color ?? "var(--accent)";
  const left = block.end - now;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border p-4"
      style={{ background: `linear-gradient(180deg, ${tint(color, 12)}, var(--surface) 70%)` }}
    >
      <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color }}>
        <AreaDot color={color} /> {area?.name}
      </div>
      <div className="mt-1 text-[16px] leading-snug font-semibold">{block.title}</div>

      <div className="my-4 flex justify-center">
        <ProgressRing value={left / (block.end - block.start)} size={128} stroke={7} color={color}>
          <div className="text-center">
            <div className="tabular text-[22px] font-light tracking-tight">{fmtCountdown(left)}</div>
            <div className="text-[11px] text-muted">left</div>
          </div>
        </ProgressRing>
      </div>

      <div className="flex gap-2">
        <Button variant="success" className="flex-1" onClick={() => completeBlock(block.id)}>
          <Check size={15} /> Done
        </Button>
        <Button onClick={() => setView("focus")} title="Focus mode (2)">
          <Play size={14} /> Focus
        </Button>
      </div>
    </motion.div>
  );
}

function ContextCard({ block }: { block: Block }) {
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const lead = useApp((s) => s.settings.leadMinutes);
  const area = useArea(block.areaId);
  const next = nextCommitment(blocks, now);
  const color = area?.color ?? "#888";

  return (
    <div className="rounded-2xl border border-border p-4" style={{ background: tint(color, 8) }}>
      <div className="flex items-center gap-2 text-[12px] font-medium text-muted">
        <AreaDot color={color} /> Background
      </div>
      <div className="mt-1 text-[16px] font-semibold">{block.title}</div>
      <div className="tabular text-[12.5px] text-muted">until {fmtTime(block.end)}</div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        Nothing to tick here. Just be present.
        {next && (
          <>
            {" "}I'll remind you {lead} min before <span className="text-text">{next.title}</span> at{" "}
            <span className="tabular text-text">{fmtTime(next.start)}</span>.
          </>
        )}
      </p>
    </div>
  );
}

/** Answers "what should I do?" when time is free. */
export function SuggestionCard({ minutes, until, large = false }: { minutes: number; until?: number; large?: boolean }) {
  const anytime = useApp((s) => s.anytime);
  const startTask = useApp((s) => s.startTask);
  const setView = useApp((s) => s.setView);
  const [offset, setOffset] = useState(0);
  const ranked = useMemo(() => suggest(anytime.filter((t) => !t.dayOffset), minutes), [anytime, minutes]);
  const pick = ranked.length ? ranked[offset % ranked.length] : undefined;
  const others = ranked.filter((t) => t !== pick).slice(0, 2);
  const area = useArea(pick?.areaId);

  const windowLabel = until !== undefined ? `Free for ${fmtDuration(minutes)} · until ${fmtTime(until)}` : "Free for the rest of the evening";

  return (
    <div className={cn("rounded-2xl border border-border bg-surface", large ? "p-6" : "p-4")}>
      <div className="flex items-center gap-2 text-[12px] font-medium text-muted">
        <Sparkles size={14} className="text-accent" /> <span className="tabular">{windowLabel}</span>
      </div>

      {pick ? (
        <>
          <div className={cn("mt-3 text-muted", large ? "text-[14px]" : "text-[12.5px]")}>Suggestion</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={pick.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <div className={cn("leading-snug font-semibold", large ? "text-[24px]" : "text-[16px]")}>{pick.title}</div>
              <div className="mt-1 flex items-center gap-2 text-[12.5px] text-muted">
                {area && <AreaDot color={area.color} />}
                {area?.name}
                {pick.duration && <span>· {fmtDuration(pick.duration)}</span>}
                {pick.due && <span className="text-attention">· due {pick.due.toLowerCase()}</span>}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className={cn("flex gap-2", large ? "mt-6" : "mt-4")}>
            <Button
              variant="primary"
              size={large ? "lg" : "md"}
              className="flex-1"
              onClick={() => {
                startTask(pick.id);
                if (large) setView("focus");
              }}
            >
              <Play size={14} /> Start now
            </Button>
            {ranked.length > 1 && (
              <Button size={large ? "lg" : "md"} onClick={() => setOffset(offset + 1)} title="Show another suggestion">
                <RefreshCw size={14} /> Another
              </Button>
            )}
          </div>

          {large && others.length > 0 && (
            <div className="mt-5 space-y-1 border-t border-border pt-4">
              <div className="text-[12px] text-muted">Or</div>
              {others.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOffset(ranked.indexOf(t))}
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-[13.5px] hover:bg-surface-2"
                >
                  {t.title}
                  {t.duration && <span className="ml-auto text-[12px] text-muted">{fmtDuration(t.duration)}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">Nothing pending. Rest is productive too.</p>
      )}
    </div>
  );
}

export function NightCard({ quietTo, next }: { quietTo: number; next?: Block }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <Moon size={16} className="text-accent" /> Quiet hours
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Nothing to do now. Get some rest, your day is already planned.
      </p>
      <p className="tabular mt-3 text-[12.5px] text-muted">
        Reminders resume at <span className="text-text">{fmtTime(quietTo)}</span>
        {next && (
          <>
            {" "}· First up: <span className="text-text">{next.title}</span> at <span className="text-text">{fmtTime(next.start)}</span>
          </>
        )}
      </p>
    </div>
  );
}

function DayDoneCard() {
  const open = useApp((s) => s.open);
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <Moon size={16} className="text-accent" /> That's the day
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">Take a minute to close it, so tomorrow starts clear.</p>
      <Button variant="primary" className="mt-3 w-full" onClick={() => open("review")}>
        Close my day <ArrowRight size={14} />
      </Button>
    </div>
  );
}

function BlockLine({ block }: { block: Block }) {
  const area = useArea(block.areaId);
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5">
      <AreaDot color={area?.color ?? "#888"} />
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium">{block.title}</div>
        <div className="text-[12px] text-muted">
          {area?.name} · {fmtDuration(block.end - block.start)}
        </div>
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const area = useArea(task.areaId);
  const toggle = useApp((s) => s.toggleTask);
  const deleteTask = useApp((s) => s.deleteTask);
  const [menu, setMenu] = useState(false);
  const meta = task.due ? `Due ${task.due.toLowerCase()}` : task.type === "habit" ? "Daily" : task.duration ? fmtDuration(task.duration) : "";

  return (
    <div className="relative">
      <div
        className="group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-surface"
        onContextMenu={(e) => !wantsNativeMenu(e.nativeEvent) && showMenu(e, taskMenu(task))}
      >
        <button
          onClick={() => toggle(task.id)}
          aria-label={task.done ? "Mark not done" : "Mark done"}
          className={cn(
            "grid size-[18px] shrink-0 place-items-center rounded-full border transition-all",
            task.done ? "border-success bg-success text-white" : "border-border hover:border-success",
          )}
        >
          {task.done && <Check size={11} strokeWidth={3} />}
        </button>
        <span className={cn("flex-1 truncate text-[13.5px]", task.done && "text-muted line-through")}>{task.title}</span>
        {area && <AreaDot color={area.color} className="opacity-70" />}
        {meta && !task.done && (
          <span className={cn("text-[11.5px] group-hover:hidden", task.due ? "text-attention" : "text-muted")}>{meta}</span>
        )}
        {!task.done && (
          <button
            onClick={() => setMenu(!menu)}
            title="Put it on the timeline"
            className={cn(
              "items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-accent hover:bg-surface-2",
              menu ? "flex" : "hidden group-hover:flex",
            )}
          >
            <CalendarClock size={13} /> Schedule
          </button>
        )}
        <button
          onClick={() => deleteTask(task.id)}
          aria-label="Delete"
          title="Delete"
          className="hidden size-6 place-items-center rounded-md text-muted transition-colors group-hover:grid hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <AnimatePresence>{menu && <ScheduleMenu task={task} onClose={() => setMenu(false)} />}</AnimatePresence>
    </div>
  );
}

/** "When should this happen?": now, the next free slots, or a picked time. */
function ScheduleMenu({ task, onClose }: { task: Task; onClose: () => void }) {
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const schedule = useApp((s) => s.scheduleTask);
  const duration = task.duration ?? 30;
  const slots = freeStarts(blocks, now, duration, 3);
  const nowSlot = Math.floor(now / 5) * 5;
  const go = (start: number) => {
    schedule(task.id, start);
    onClose();
  };
  const pickFrom = Math.ceil(now / 15) * 15;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.12 }}
      className="mx-1.5 mb-2 rounded-xl border border-border bg-surface p-2 shadow-soft"
    >
      <div className="px-1.5 pb-1.5 text-[11.5px] text-muted">Put on today's timeline · {fmtDuration(duration)}</div>
      <MenuItem label="Now" time={nowSlot} onClick={() => go(nowSlot)} />
      {slots
        .filter((t) => t !== nowSlot && t !== Math.ceil(now / 5) * 5)
        .map((t) => (
          <MenuItem key={t} label="Next free slot" time={t} onClick={() => go(t)} />
        ))}
      {pickFrom < 24 * 60 && (
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-border px-1.5 pt-2 text-[12.5px]">
          Pick a time
          <TimeSelect label="Pick a time" value={pickFrom} from={pickFrom} to={23 * 60 + 45} step={15} onChange={go} />
        </div>
      )}
    </motion.div>
  );
}

function MenuItem({ label, time, onClick }: { label: string; time: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center rounded-lg px-1.5 py-1.5 text-left text-[13px] hover:bg-surface-2">
      {label}
      <span className="tabular ml-auto text-muted">{fmtTime(time)}</span>
    </button>
  );
}

const TRIAGE: { key: Triage; label: string }[] = [
  { key: "now", label: "Do now" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "backlog", label: "Backlog" },
  { key: "letGo", label: "Let go" },
];

export function TriageCard({ block, actions = TRIAGE }: { block: Block; actions?: typeof TRIAGE }) {
  const triage = useApp((s) => s.triage);
  const now = useApp((s) => s.now);
  const area = useArea(block.areaId);
  const fitsToday = Math.ceil(now / 5) * 5 + (block.end - block.start) <= 24 * 60;
  const shown = actions.filter((a) => a.key !== "now" || fitsToday);
  return (
    <motion.div layout exit={{ opacity: 0, x: 24 }} className="rounded-xl border border-dashed border-border p-3">
      <div className="flex items-center gap-2 text-[13.5px] font-medium">
        <AreaDot color={area?.color ?? "#888"} /> {block.title}
      </div>
      <div className="tabular mb-2.5 pl-4 text-[11.5px] text-muted">
        {fmtTime(block.start)} – {fmtTime(block.end)}
      </div>
      <div className="flex flex-wrap gap-1">
        {shown.map((a, i) => (
          <Button key={a.key} size="sm" variant={i === 0 ? "primary" : "secondary"} onClick={() => triage(block.id, a.key)}>
            {a.label}
          </Button>
        ))}
      </div>
    </motion.div>
  );
}

function Missed({ blocks }: { blocks: Block[] }) {
  const [open, setOpen] = useState(blocks.length <= 2);
  return (
    <section className="space-y-2">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        <span className="size-1.5 rounded-full bg-attention" />
        <span className="text-[13px] font-medium">
          {blocks.length} {blocks.length === 1 ? "thing needs" : "things need"} a new spot
        </span>
        <ChevronDown size={15} className={cn("ml-auto text-muted transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-2 overflow-hidden"
          >
            <AnimatePresence initial={false}>
              {blocks.map((b) => (
                <TriageCard key={b.id} block={b} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
