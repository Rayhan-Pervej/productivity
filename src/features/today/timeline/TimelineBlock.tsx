// One block on the timeline: a tracked block (card with steps and hover actions),
// or a background band (handed to BackgroundBand).
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Clock, Play, Repeat, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { useApp } from "@/store/app";
import { fmtTime } from "@/lib/time";
import { cn, tint } from "@/lib/utils";
import type { Lane } from "@/lib/timelineLayout";
import { useArea } from "@/components/ui";
import { IconButton } from "@/components/IconButton";
import { showMenu, wantsNativeMenu } from "@/components/ContextMenu";
import { blockMenu } from "@/features/menus";
import type { Block } from "@/domain/types";
import { BackgroundBand } from "./BackgroundBand";
import { StepList, StepProgress } from "./Steps";
import type { PlaceProps } from "./geometry";

export function TimelineBlock({
  block,
  now,
  top,
  height: rawHeight,
  lane,
  nested = false,
  hosting = false,
  readOnly,
  dayOffset = 0,
  onAddAt,
  unmap,
  map,
}: PlaceProps & {
  block: Block;
  /** Minute of the day; -1 for a future day (nothing is past), 24 h for a past day (everything is). */
  now: number;
  top: number;
  height: number;
  lane?: Lane;
  /** A tracked block sitting on a background band. */
  nested?: boolean;
  /** A background band with tracked blocks on it. */
  hosting?: boolean;
  readOnly: boolean;
  dayOffset?: number;
}) {
  const area = useArea(block.areaId);
  const { completeBlock, reopenBlock, skipBlock, extendBlock, setView, openBlock, deleteBlock } = useApp.getState();
  // Future days are read-only, except for things you added to them yourself.
  const deletable = !readOnly || "dayOffset" in block;
  // A future day's preview of a repeat: becomes a real copy for that day on first click.
  const repeatPreview = readOnly && !!block.routineId && !("dayOffset" in block);
  const editable = deletable || repeatPreview;
  /** The real block to act on (creating that day's repeat copy if needed); undefined for plan blocks. */
  const target = (): Block | undefined =>
    deletable ? block : repeatPreview ? useApp.getState().ensureRoutineCopy(block.routineId!, dayOffset) : undefined;
  const color = area?.color ?? "#888";
  // Sits exactly between its time lines: from just below its start line to its end line,
  // so two touching blocks share one line (block top = map(start) + 1, see `top` below).
  const height = Math.max(24, rawHeight - 1);
  const compact = height < 48;

  const active = now >= 0 && block.start <= now && now < block.end;
  const past = now >= 0 && block.end <= now;

  // A short "pop" when a block becomes done (not on every render or reload).
  const prevStatus = useRef(block.status);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (prevStatus.current !== "done" && block.status === "done") {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 650);
      prevStatus.current = block.status;
      return () => clearTimeout(t);
    }
    prevStatus.current = block.status;
  }, [block.status]);

  // Tracked blocks inside a background band float on top of it, leaving the band's label visible.
  // --nest (set on the timeline) adapts to its width.
  const base = nested ? "(8px + var(--nest))" : "8px";
  const rightGap = nested ? 6 : 0;
  const cols = lane?.cols ?? 1;
  const col = lane?.col ?? 0;
  const laneStyle =
    block.kind === "context"
      ? { left: 8, width: "calc(100% - 8px)" }
      : {
          left: `calc(${base} + (100% - ${base} - ${rightGap}px) * ${col / cols})`,
          width: `calc((100% - ${base} - ${rightGap}px) / ${cols} - ${cols > 1 ? 4 : 0}px)`,
        };

  if (block.kind === "context") {
    return (
      <BackgroundBand
        block={block}
        color={color}
        top={top + 1}
        height={height}
        hosting={hosting}
        active={active}
        past={past}
        now={now}
        onAddAt={onAddAt}
        unmap={unmap}
        map={map}
      />
    );
  }

  const missed = block.status === "planned" && past;
  const done = block.status === "done";
  const skipped = block.status === "skipped";
  // Finished, skipped or missed blocks fade their content, not the card: the card's background stays
  // solid, so lines behind it (row lines, the now line) never show through.
  const fade = cn("transition-opacity group-hover:opacity-100", (done || skipped) && "opacity-55", missed && "opacity-80");

  const openDetails = () => {
    const real = target();
    if (real) openBlock(real.id);
    else useApp.getState().say("This comes from your plan. Change it in Plans.");
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: the block holds its own buttons (steps, actions), and buttons can't nest
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Keyboard: Enter or Space opens the details, like a click (keys on inner buttons are theirs).
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        openDetails();
      }}
      onContextMenu={(e) => {
        if (wantsNativeMenu(e.nativeEvent)) return;
        const real = target();
        showMenu(e, blockMenu(real ?? block, { isToday: !readOnly, editable: !!real, dayOffset }));
      }}
      onClick={openDetails}
      title={editable ? "Open details · edit, add steps" : "From your plan. Edit it in Plans."}
      className={cn(
        "@container group absolute z-[2] overflow-hidden rounded-xl transition-all duration-200",
        editable ? "cursor-pointer hover:-translate-y-px hover:shadow-soft" : "cursor-default",
        celebrate && "animate-[done-pop_650ms_ease-out]",
        active && "z-10 shadow-soft ring-2",
        (missed || skipped) && "border border-dashed border-border",
      )}
      style={{
        top: top + 1,
        height,
        ...laneStyle,
        background:
          missed || skipped
            ? "var(--bg)"
            : `linear-gradient(${tint(color, active ? 16 : 10)}, ${tint(color, active ? 16 : 10)}), var(--bg)`,
        ["--tw-ring-color" as string]: tint(color, 55),
      }}
    >
      <div className={cn("absolute top-0 bottom-0 left-0 w-1 rounded-l-xl", fade)} style={{ background: color }} />

      <div className={cn("flex h-full gap-1.5 pr-2 pl-4", compact ? "items-center" : "flex-col justify-start pt-2.5", fade)}>
        <div className="flex w-full min-w-0 items-center gap-2">
          {done && (
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
            >
              <Check size={14} className="shrink-0 text-success" />
            </motion.span>
          )}
          <span className="shrink-0 text-[11.5px] font-medium @max-[400px]:hidden" style={{ color }}>
            {area?.name}
          </span>
          <span
            className={cn("min-w-14 truncate text-[13.5px] font-medium", (missed || skipped) && "text-muted", skipped && "line-through")}
          >
            {block.title}
          </span>
          {active && (
            // On a narrow block the ring and the now line already say it; the title needs the room.
            <span className="shrink-0 rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-accent-fg @max-[360px]:hidden">
              now
            </span>
          )}
          {block.routineId && (
            <span title="Repeats" className="shrink-0 text-muted @max-[280px]:hidden">
              <Repeat size={12} />
            </span>
          )}
          {block.subtasks.length > 0 && (
            <StepProgress done={block.subtasks.filter((t) => t.done).length} total={block.subtasks.length} color={color} />
          )}
          {missed && <span className="shrink-0 text-[11px] text-attention @max-[320px]:hidden">didn't happen</span>}
          {/* Narrow block: just the start time, so the title keeps its room. */}
          <span
            className="tabular ml-auto shrink-0 pl-2 text-[11.5px] text-muted @max-[240px]:hidden"
            title={`${fmtTime(block.start)} – ${fmtTime(block.end)}`}
          >
            <span className="@max-[360px]:hidden">
              {fmtTime(block.start)} – {fmtTime(block.end)}
            </span>
            <span className="hidden @max-[360px]:inline">{fmtTime(block.start)}</span>
          </span>
        </div>

        {!compact && block.subtasks.length > 0 && <StepList block={block} color={color} height={height} editable={deletable} />}
      </div>

      {deletable && (
        <div
          className={cn(
            "absolute right-1.5 flex gap-1 rounded-lg bg-surface p-0.5 opacity-0 shadow-soft transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
            compact ? "top-1/2 -translate-y-1/2" : "top-1.5",
          )}
        >
          {!readOnly && block.status === "planned" && (
            <>
              <IconButton size="sm" isolate label="Done" onClick={() => completeBlock(block.id)} icon={<Check size={14} />} />
              {active && <IconButton size="sm" isolate label="Focus" onClick={() => setView("focus")} icon={<Play size={14} />} />}
              {!past && (
                <IconButton size="sm" isolate label="+10 min" onClick={() => extendBlock(block.id, 10)} icon={<Clock size={14} />} />
              )}
              <IconButton size="sm" isolate label="Skip" onClick={() => skipBlock(block.id)} icon={<SkipForward size={14} />} />
            </>
          )}
          {!readOnly && block.status !== "planned" && (
            <IconButton
              size="sm"
              isolate
              label={block.status === "done" ? "Mark not done" : "Restore"}
              onClick={() => reopenBlock(block.id)}
              icon={<RotateCcw size={14} />}
            />
          )}
          <IconButton size="sm" isolate tone="danger" label="Delete" onClick={() => deleteBlock(block.id)} icon={<Trash2 size={14} />} />
        </div>
      )}
    </div>
  );
}
