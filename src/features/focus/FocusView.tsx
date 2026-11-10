import { useEffect, useMemo } from "react";
import { ArrowRight, Check, Moon, Pause, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useApp, useCurrent } from "@/store/app";
import { freeWindow, nextCommitment } from "@/lib/day";
import { fmtCountdown, fmtTime, inQuietHours } from "@/lib/time";
import { isTyping, tint } from "@/lib/utils";
import { Button, Kbd, ProgressRing, useArea } from "@/components/ui";
import { NightCard, SuggestionCard } from "@/features/today/ContextPanel";
import { Steps } from "@/features/overlays/BlockDetails";
import type { Block } from "@/domain/types";

export function FocusView() {
  const { commitment, context } = useCurrent();
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const settings = useApp((s) => s.settings);
  const reviewAt = settings.reviewAt;
  const night = inQuietHours(now, settings.quietFrom, settings.quietTo);
  const next = useMemo(() => nextCommitment(blocks, now), [blocks, now]);

  return (
    <div className="relative h-full">
      {commitment ? (
        <FocusSession block={commitment} />
      ) : (
        <Centered>
          {night && !context ? (
            <NightCard quietTo={settings.quietTo} next={freeWindow(blocks, now).nextAny} />
          ) : context ? (
            <ContextCalm block={context} />
          ) : !next && now >= reviewAt - 90 ? (
            <DayDone />
          ) : (
            <FreeTime />
          )}
        </Centered>
      )}
      {next && !commitment && <NextLine block={next} />}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        {children}
      </motion.div>
    </div>
  );
}

function FreeTime() {
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const free = freeWindow(blocks, now);
  return (
    <>
      <h1 className="mb-1 text-center text-[28px] font-semibold tracking-tight">What now?</h1>
      <p className="mb-6 text-center text-[14px] text-muted">One small thing, chosen for the time you have.</p>
      <SuggestionCard large minutes={free.minutes} until={free.nextAny ? free.until : undefined} />
    </>
  );
}

function ContextCalm({ block }: { block: Block }) {
  const area = useArea(block.areaId);
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 size-3 rounded-full" style={{ background: area?.color }} />
      <h1 className="text-[28px] font-semibold tracking-tight">{block.title}</h1>
      <p className="tabular mt-1 text-[14px] text-muted">until {fmtTime(block.end)}</p>
      <p className="mx-auto mt-6 max-w-xs text-[14px] leading-relaxed text-muted">
        This is background time. Nothing to track. I'll call you when something you planned is about to start.
      </p>
    </div>
  );
}

function DayDone() {
  const open = useApp((s) => s.open);
  return (
    <div className="text-center">
      <Moon size={28} className="mx-auto text-accent" />
      <h1 className="mt-4 text-[28px] font-semibold tracking-tight">That's the day</h1>
      <p className="mt-2 text-[14px] text-muted">Close it in a minute, and tomorrow starts clear.</p>
      <Button size="lg" variant="primary" className="mt-6" onClick={() => open("review")}>
        Close my day <ArrowRight size={15} />
      </Button>
    </div>
  );
}

function NextLine({ block }: { block: Block }) {
  const area = useArea(block.areaId);
  return (
    <div className="absolute bottom-8 left-0 flex w-full items-center justify-center gap-2 text-[13px] text-muted">
      Next · <span className="tabular">{fmtTime(block.start)}</span> ·
      <span className="size-1.5 rounded-full" style={{ background: area?.color }} />
      {block.title}
    </div>
  );
}

function FocusSession({ block }: { block: Block }) {
  const now = useApp((s) => s.now);
  const blocks = useApp((s) => s.blocks);
  const { completeBlock, extendBlock, setView } = useApp.getState();
  const area = useArea(block.areaId);
  const next = useMemo(() => nextCommitment(blocks, now), [blocks, now]);
  const color = area?.color ?? "var(--accent)";
  const left = block.end - now;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || useApp.getState().overlay) return;
      if (e.key === " ") {
        e.preventDefault();
        completeBlock(block.id);
      } else if (e.key === "+" || e.key === "=") extendBlock(block.id, 10);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [block.id, completeBlock, extendBlock]);

  return (
    <div
      className="relative flex h-full flex-col items-center justify-center px-8 transition-colors duration-700"
      style={{ background: `radial-gradient(ellipse at 50% 35%, ${tint(color, 14)}, transparent 65%)` }}
    >
      <motion.div
        key={block.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center"
      >
        <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.12em] uppercase" style={{ color }}>
          <span className="size-2 rounded-full" style={{ background: color }} />
          {area?.name}
        </div>
        <h1 className="mt-3 max-w-xl text-center text-[34px] leading-tight font-semibold tracking-tight">{block.title}</h1>

        <div className="my-10">
          <ProgressRing value={left / (block.end - block.start)} size={240} stroke={6} color={color}>
            <div className="text-center">
              <div className="tabular text-[52px] leading-none font-extralight tracking-tight">{fmtCountdown(left)}</div>
              <div className="mt-2 text-[12px] text-muted">until {fmtTime(block.end)}</div>
            </div>
          </ProgressRing>
        </div>

        <div className="mb-8 flex w-full justify-center">
          <Steps block={block} compact />
        </div>

        <div className="flex items-center gap-2">
          <Button size="lg" variant="success" onClick={() => completeBlock(block.id)} className="min-w-32">
            <Check size={16} /> Done <Kbd className="border-white/30 bg-transparent text-current opacity-80">Space</Kbd>
          </Button>
          <Button size="lg" onClick={() => extendBlock(block.id, 10)}>
            <Plus size={15} /> 10 min
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setView("today")} title="Leave focus (Esc)">
            <Pause size={15} />
          </Button>
        </div>
      </motion.div>

      {next && <NextLine block={next} />}
    </div>
  );
}
