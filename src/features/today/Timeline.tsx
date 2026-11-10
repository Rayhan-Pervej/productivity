import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, Play, Plus, SkipForward, Trash2 } from "lucide-react";
import { useApp } from "@/store/app";
import type { Block } from "@/domain/types";
import { dayPhrase, fmtDuration, fmtTime } from "@/lib/time";
import { cn, tint } from "@/lib/utils";
import { sortByStart } from "@/lib/day";
import { useArea } from "@/components/ui";
import { showMenu, wantsNativeMenu } from "@/components/ContextMenu";
import { bandMenu, blockMenu } from "@/features/menus";

/*
 * Adaptive timeline: space follows importance, not clock time.
 *  - commitments get full height (72 px / hour)
 *  - background (context) blocks are compressed to a calm band
 *  - upcoming free gaps stay visible and plannable; past gaps shrink away
 */
const PX_PER_MIN = 72 / 60;
type SegKind = "commitment" | "context" | "free";
interface Seg {
  from: number;
  to: number;
  y: number;
  px: number;
  kind: SegKind;
}

/** Step list geometry, shared by the scale (how tall a block must be) and StepList (how many rows fit). */
const STEP_ROW = 24;
const STEP_HEADER = 44; // title row + padding above the list
const MAX_VISIBLE_STEPS = 5;

/** Minimum height for a tracked block so its steps are visible (0 when it has none). */
function neededHeight(b: Block) {
  if (b.kind !== "commitment" || b.subtasks.length === 0) return 0;
  const rows = Math.min(b.subtasks.length, MAX_VISIBLE_STEPS) + (b.subtasks.length > MAX_VISIBLE_STEPS ? 1 : 0);
  return STEP_HEADER + rows * STEP_ROW + 6;
}

/** Width kept for a background band's label when tasks sit on top of it. */
const NEST_INSET = 148;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function buildScale(blocks: Block[], now: number, readOnly: boolean) {
  const firstStart = Math.min(...blocks.map((b) => b.start), readOnly ? 24 * 60 : now);
  const lastEnd = Math.max(...blocks.map((b) => b.end), readOnly ? 0 : now);
  const start = Math.max(0, Math.floor(firstStart / 60) * 60);
  const end = Math.min(24 * 60, Math.ceil((lastEnd + 30) / 60) * 60);

  const points = new Set([start, end]);
  for (const b of blocks) {
    points.add(clamp(b.start, start, end));
    points.add(clamp(b.end, start, end));
  }
  const sorted = [...points].sort((a, b) => a - b);

  const segs: Seg[] = [];
  let y = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (to <= from) continue;
    const covering = blocks.filter((b) => b.start < to && b.end > from);
    const kind: SegKind = covering.some((b) => b.kind === "commitment")
      ? "commitment"
      : covering.length
        ? "context"
        : "free";
    const dur = to - from;
    const past = !readOnly && to <= now;
    const px =
      kind === "commitment"
        ? Math.max(
            30,
            dur * PX_PER_MIN,
            // A block with steps gets room to show them, however short it is.
            // Its extra height is shared across its segments in proportion to time.
            ...covering.map((b) => (neededHeight(b) * dur) / (b.end - b.start)),
          )
        : kind === "context"
          ? clamp(dur * 0.12, 44, 64)
          : past
            ? clamp(dur * 0.2, 10, 24)
            : clamp(dur * 0.8, 30, 96);
    segs.push({ from, to, y, px, kind });
    y += px;
  }

  const map = (m: number) => {
    if (!segs.length || m <= segs[0].from) return 0;
    for (const s of segs) if (m <= s.to) return s.y + ((m - s.from) / (s.to - s.from)) * s.px;
    return y;
  };
  const unmap = (py: number) => {
    for (const s of segs) if (py <= s.y + s.px) return s.from + ((py - s.y) / s.px) * (s.to - s.from);
    return end;
  };
  return { segs, map, unmap, height: y, start, end };
}

export function Timeline({
  blocks, now, readOnly = false, dayOffset = 0,
}: { blocks: Block[]; now: number; readOnly?: boolean; dayOffset?: number }) {
  const open = useApp((s) => s.open);
  const scroller = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => sortByStart(blocks), [blocks]);
  // Rebuild the scale each minute (not each second) so the layout stays still.
  const minute = Math.floor(now);
  const scale = useMemo(() => buildScale(sorted, minute, readOnly), [sorted, minute, readOnly]);
  const lanes = useMemo(() => assignLanes(sorted), [sorted]);
  const nesting = useMemo(() => {
    const contexts = sorted.filter((b) => b.kind === "context");
    const nested = new Set<string>();
    const hosts = new Set<string>();
    for (const b of sorted) {
      if (b.kind !== "commitment") continue;
      const host = contexts.find((c) => c.start < b.end && b.start < c.end);
      if (host) {
        nested.add(b.id);
        hosts.add(host.id);
      }
    }
    return { nested, hosts };
  }, [sorted]);

  useEffect(() => {
    const el = scroller.current;
    if (el && !readOnly) el.scrollTop = Math.max(0, scale.map(useApp.getState().now) - el.clientHeight / 3);
    // Only when the view opens or switches day.
  }, [readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Time labels at segment boundaries, skipping ones that would collide.
  const labels: { m: number; y: number }[] = [];
  for (const s of scale.segs) {
    if (!labels.length || s.y - labels[labels.length - 1].y >= 18) labels.push({ m: s.from, y: s.y });
  }
  if (scale.height - (labels[labels.length - 1]?.y ?? 0) >= 18) labels.push({ m: scale.end, y: scale.height });

  const showNow = !readOnly && now >= scale.start && now <= scale.end;
  const nowY = scale.map(now);
  const visibleLabels = showNow ? labels.filter((l) => Math.abs(l.y - nowY) >= 16) : labels;

  return (
    <div ref={scroller} className="relative h-full overflow-y-auto px-6 pt-5 pb-28">
      <div className="relative" style={{ height: scale.height + 8 }}>
        {visibleLabels.map((l) => (
          <div key={l.m} className="pointer-events-none absolute right-0 left-0 flex items-start" style={{ top: l.y }}>
            <span className="tabular w-14 -translate-y-2 text-[11px] text-muted">{fmtTime(l.m)}</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>
        ))}

        <div className="absolute top-0 right-0 bottom-0 left-14 z-10">
          {scale.segs
            .filter((s) => s.kind === "free" && (readOnly || s.to > now) && !(s.to === scale.end && s.to - s.from <= 60))
            .map((s) => {
              const from = readOnly ? s.from : Math.max(s.from, Math.ceil(now / 5) * 5);
              const top = scale.map(from) + 3;
              const height = scale.map(s.to) - top - 3;
              if (height < 24 || s.to - from < 10) return null;
              return (
                <button
                  key={s.from}
                  onClick={() => open("quickAdd", `${dayPhrase(dayOffset)}at ${fmtTime(from)} `)}
                  className="group absolute right-0 left-2 flex items-center gap-2 rounded-xl border border-dashed border-transparent px-4 text-[12px] text-muted transition-colors hover:border-border hover:bg-surface/60"
                  style={{ top, height }}
                >
                  <span className="opacity-70">Free · {fmtDuration(s.to - from)}</span>
                  <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Plus size={13} /> Plan something
                  </span>
                </button>
              );
            })}

          {sorted.map((b) => (
            <TimelineBlock
              key={b.id}
              block={b}
              now={readOnly ? -1 : now}
              top={scale.map(b.start)}
              height={scale.map(b.end) - scale.map(b.start)}
              lane={lanes.get(b.id)}
              nested={nesting.nested.has(b.id)}
              hosting={nesting.hosts.has(b.id)}
              readOnly={readOnly}
              onAddAt={(minute, areaId) =>
                open("quickAdd", `${dayPhrase(dayOffset)}at ${fmtTime(minute)} ${areaId ? `#${areaId} ` : ""}`)
              }
              unmap={scale.unmap}
              map={scale.map}
            />
          ))}
        </div>

        {showNow && (
          <div className="pointer-events-none absolute right-0 left-0 flex items-center" style={{ top: nowY }}>
            <span className="tabular relative z-20 -ml-1 w-[60px] -translate-y-px rounded-md bg-accent py-0.5 text-center text-[10.5px] font-semibold text-accent-fg">
              {fmtTime(now)}
            </span>
            <div className="h-[1.5px] flex-1 bg-accent" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Overlapping commitments get side-by-side columns, like a calendar. */
function assignLanes(sorted: Block[]) {
  const lanes = new Map<string, Lane>();
  let cluster: string[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];
  const flush = () => {
    cluster.forEach((id) => (lanes.get(id)!.cols = Math.max(1, columnEnds.length)));
    cluster = [];
    columnEnds = [];
  };
  for (const b of sorted) {
    if (b.kind !== "commitment") continue;
    if (b.start >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    let col = columnEnds.findIndex((end) => end <= b.start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(b.end);
    } else columnEnds[col] = b.end;
    lanes.set(b.id, { col, cols: 1 });
    cluster.push(b.id);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return lanes;
}

interface Lane {
  col: number;
  cols: number;
}

function TimelineBlock({
  block, now, top, height: rawHeight, lane, nested = false, hosting = false, readOnly, onAddAt, unmap, map,
}: {
  block: Block; now: number; top: number; height: number; lane?: Lane; nested?: boolean; hosting?: boolean; readOnly: boolean;
  onAddAt: (minute: number, areaId?: string) => void; unmap: (y: number) => number; map: (minute: number) => number;
}) {
  const area = useArea(block.areaId);
  const { completeBlock, skipBlock, extendBlock, setView, openBlock, deleteBlock } = useApp.getState();
  // Future days are read-only, except for things you added to them yourself.
  const deletable = !readOnly || "dayOffset" in block;
  const color = area?.color ?? "#888";
  const height = Math.max(24, rawHeight - 3);
  const compact = height < 48;

  const active = now >= 0 && block.start <= now && now < block.end;
  const past = now >= 0 && block.end <= now;

  // Tracked blocks inside a background band float on top of it, leaving the band's label visible.
  const base = nested ? 8 + NEST_INSET : 8;
  const rightGap = nested ? 6 : 0;
  const cols = lane?.cols ?? 1;
  const col = lane?.col ?? 0;
  const laneStyle =
    block.kind === "context"
      ? { left: 8, width: "calc(100% - 8px)" }
      : {
          left: `calc(${base}px + (100% - ${base + rightGap}px) * ${col / cols})`,
          width: `calc((100% - ${base + rightGap}px) / ${cols} - ${cols > 1 ? 4 : 0}px)`,
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

  return (
    <div
      onContextMenu={(e) => {
        if (!wantsNativeMenu(e.nativeEvent)) showMenu(e, blockMenu(block, { isToday: !readOnly, editable: deletable }));
      }}
      onClick={() =>
        deletable
          ? openBlock(block.id)
          : useApp.getState().say("This comes from your plan. Change it in Plans.")
      }
      title={deletable ? "Open details · edit, add steps" : "From your plan. Edit it in Plans."}
     
      className={cn(
        "group absolute z-[1] overflow-hidden rounded-xl transition-all duration-200",
        deletable ? "cursor-pointer" : "cursor-help",
        active && "z-10 shadow-soft ring-2",
        (missed || skipped) && "border border-dashed border-border",
        (done || skipped) && "opacity-55 hover:opacity-100",
        missed && "opacity-80 hover:opacity-100",
      )}
      style={{
        top: top + 1,
        height,
        ...laneStyle,
        background: missed || skipped ? "var(--bg)" : `linear-gradient(${tint(color, active ? 16 : 10)}, ${tint(color, active ? 16 : 10)}), var(--bg)`,
        ["--tw-ring-color" as string]: tint(color, 55),
      }}
    >
      <div className="absolute top-0 bottom-0 left-0 w-1 rounded-l-xl" style={{ background: color }} />

      <div className={cn("flex h-full gap-1.5 pr-2 pl-4", compact ? "items-center" : "flex-col justify-start pt-2.5")}>
        <div className="flex w-full min-w-0 items-center gap-2">
          {done && <Check size={14} className="shrink-0 text-success" />}
          <span className="text-[11.5px] font-medium" style={{ color }}>
            {area?.name}
          </span>
          <span className={cn("truncate text-[13.5px] font-medium", (missed || skipped) && "text-muted", skipped && "line-through")}>
            {block.title}
          </span>
          {active && <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-accent-fg">now</span>}
          {block.subtasks.length > 0 && <StepProgress done={block.subtasks.filter((t) => t.done).length} total={block.subtasks.length} color={color} />}
          {missed && <span className="shrink-0 text-[11px] text-attention">didn't happen</span>}
          <span className="tabular ml-auto shrink-0 pl-2 text-[11.5px] text-muted">
            {fmtTime(block.start)} – {fmtTime(block.end)}
          </span>
        </div>

        {!compact && block.subtasks.length > 0 && (
          <StepList block={block} color={color} height={height} editable={deletable} />
        )}
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
              <IconAction label="Done" onClick={() => completeBlock(block.id)} icon={<Check size={14} />} />
              {active && <IconAction label="Focus" onClick={() => setView("focus")} icon={<Play size={14} />} />}
              {!past && <IconAction label="+10 min" onClick={() => extendBlock(block.id, 10)} icon={<Clock size={14} />} />}
              <IconAction label="Skip" onClick={() => skipBlock(block.id)} icon={<SkipForward size={14} />} />
            </>
          )}
          <IconAction label="Delete" danger onClick={() => deleteBlock(block.id)} icon={<Trash2 size={14} />} />
        </div>
      )}
    </div>
  );
}

/**
 * A background band (office, time out). Hovering shows the exact time under the cursor;
 * clicking adds something at that time, in the band's own area.
 */
function BackgroundBand({
  block, color, top, height, hosting, active, past, now, onAddAt, unmap, map,
}: {
  block: Block; color: string; top: number; height: number; hosting: boolean; active: boolean; past: boolean; now: number;
  onAddAt: (minute: number, areaId?: string) => void; unmap: (y: number) => number; map: (minute: number) => number;
}) {
  const [hover, setHover] = useState<{ minute: number; x: number; width: number } | null>(null);

  // Snap to 15 minutes, never before now, and leave room for at least 15 minutes inside the band.
  const earliest = Math.max(block.start, now >= 0 ? Math.ceil(now / 15) * 15 : 0);
  const minuteAt = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = Math.round(unmap(top + (e.clientY - rect.top)) / 15) * 15;
    return Math.min(Math.max(raw, earliest), block.end - 15);
  };
  const canAdd = !past && earliest <= block.end - 15;

  return (
    <button
      type="button"
      disabled={!canAdd}
      aria-label={`Add something during ${block.title}`}
      onMouseMove={(e) => {
        if (!canAdd) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setHover({ minute: minuteAt(e), x: e.clientX - rect.left, width: rect.width });
      }}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => onAddAt(minuteAt(e), block.areaId)}
      onContextMenu={(e) => {
        if (wantsNativeMenu(e.nativeEvent)) return;
        const minute = canAdd ? minuteAt(e) : null;
        showMenu(e, bandMenu(block, minute, () => minute !== null && onAddAt(minute, block.areaId)));
      }}
      className={cn(
        "absolute z-0 flex overflow-hidden rounded-xl px-4 text-left disabled:cursor-default",
        hosting ? "flex-col items-start gap-0.5 pt-2.5" : "items-center gap-2",
        past && "opacity-60",
      )}
      style={{
        left: 8,
        width: "calc(100% - 8px)",
        top,
        height,
        background: `repeating-linear-gradient(135deg, ${tint(color, 8)} 0 8px, ${tint(color, 4)} 8px 16px), var(--bg)`,
      }}
    >
      {hosting ? (
        <>
          <span className="flex max-w-[132px] items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate text-[13px] font-medium">{block.title}</span>
            {past && <Check size={13} className="shrink-0 text-muted" />}
          </span>
          <span className="tabular pl-3.5 text-[11px] text-muted">
            {fmtTime(block.start)} – {fmtTime(block.end)}
          </span>
          {active && <span className="pl-3.5 text-[11px] text-accent">now</span>}
        </>
      ) : (
        <>
          <span className="size-1.5 rounded-full" style={{ background: color }} />
          <span className="text-[13px] font-medium">{block.title}</span>
          {active && <span className="text-[11.5px] text-muted">· now</span>}
          {past && <Check size={13} className="text-muted" />}
          <span className="tabular ml-auto text-[11.5px] text-muted">
            {fmtTime(block.start)} – {fmtTime(block.end)}
          </span>
        </>
      )}

      {hover && <HoverGuide hover={hover} lineY={map(hover.minute) - top} bandHeight={height} color={color} />}
    </button>
  );
}

const PILL_H = 20;
const PILL_W = 92;
const clampTo = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Dashed line at the exact hovered time, plus a "＋ 8:15 AM" pill near the cursor.
 * The line is exact; the pill is kept fully inside the band so it never gets clipped at the edges.
 */
function HoverGuide({
  hover, lineY, bandHeight, color,
}: { hover: { minute: number; x: number; width: number }; lineY: number; bandHeight: number; color: string }) {
  const pillTop = clampTo(lineY - PILL_H / 2, 2, bandHeight - PILL_H - 2);
  const pillLeft = clampTo(hover.x + 14, 4, hover.width - PILL_W - 4);
  return (
    <>
      <span
        className="pointer-events-none absolute right-0 left-0 border-t border-dashed"
        style={{ top: lineY, borderColor: color }}
      />
      <span
        className="tabular pointer-events-none absolute flex items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-soft"
        style={{ top: pillTop, left: pillLeft, height: PILL_H, background: color }}
      >
        <Plus size={11} strokeWidth={3} /> {fmtTime(hover.minute)}
      </span>
    </>
  );
}

/** "1/3" with a tiny bar, beside the block title. */
function StepProgress({ done, total, color }: { done: number; total: number; color: string }) {
  const complete = done === total;
  return (
    <span
      className="tabular flex shrink-0 items-center gap-1.5 rounded-full px-2 py-px text-[10.5px] font-semibold"
      style={{ background: tint(color, complete ? 28 : 14), color: complete ? undefined : color }}
      title={`${done} of ${total} steps done`}
    >
      {complete ? <Check size={10} strokeWidth={3} /> : (
        <span className="h-1 w-6 overflow-hidden rounded-full" style={{ background: tint(color, 25) }}>
          <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${(done / total) * 100}%`, background: color }} />
        </span>
      )}
      {done}/{total}
    </span>
  );
}


/** Steps as a real checklist inside the block; tick them right here. Shows what fits, then "+N more". */
function StepList({ block, color, height, editable }: { block: Block; color: string; height: number; editable: boolean }) {
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
            disabled={!editable}
            onClick={(e) => {
              e.stopPropagation();
              toggle(block.id, t.id);
            }}
            aria-label={t.done ? "Mark step not done" : "Mark step done"}
            className="grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] transition-all duration-200 hover:scale-110 disabled:hover:scale-100"
            style={t.done ? { background: color, borderColor: color } : { borderColor: tint(color, 60) }}
          >
            {t.done && <Check size={10} strokeWidth={3.5} className="text-white" />}
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
            onClick={(e) => {
              e.stopPropagation();
              openBlock(block.id);
            }}
            className="h-6 pl-[26px] text-[12px] font-medium hover:underline"
            style={{ color }}
          >
            +{hidden} more
          </button>
        </li>
      )}
    </ul>
  );
}

function IconAction({
  label, icon, onClick, danger = false,
}: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid size-6 place-items-center rounded-md text-muted transition-colors",
        danger ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-surface-2 hover:text-text",
      )}
    >
      {icon}
    </button>
  );
}
