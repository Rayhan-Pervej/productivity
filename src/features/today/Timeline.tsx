import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Clock, Play, Plus, Repeat, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { useApp } from "@/store/app";
import { dayWindow, gapHeight, gapPosition, trackedHeight } from "@/lib/scale";
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
type SegKind = "commitment" | "context" | "free";
interface Seg {
  from: number;
  to: number;
  y: number;
  /** Offset (px) of a minute inside this segment, when not linear (empty time, see gapPosition). */
  place?: (minute: number) => number;
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
/** On a narrow timeline the band's label column shrinks, so tasks keep their width. */
const NEST_INSET_NARROW = 116;
/** Timeline width (px) below which it counts as narrow. Matches the `@max-[560px]` query below. */
const NARROW_TIMELINE = 560;

/** Minimum vertical space between two time labels. */
const LABEL_GAP = 18;
/** A background band with no tasks on it is one row: room for its name and time. */
const BAND_ROW = 44;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The scale for one day. Its range is your waking day (from quiet hours), widened only for blocks
 * outside it. It never depends on the clock, so nothing moves or resizes as time passes.
 */
function buildScale(blocks: Block[], day: { start: number; end: number }) {
  const firstStart = Math.min(day.start, ...blocks.map((b) => b.start));
  const lastEnd = Math.max(day.end, ...blocks.map((b) => b.end));
  const start = Math.max(0, Math.floor(firstStart / 60) * 60);
  const end = Math.min(24 * 60, Math.ceil(lastEnd / 60) * 60);

  const points = new Set([start, end]);
  for (const b of blocks) {
    points.add(clamp(b.start, start, end));
    points.add(clamp(b.end, start, end));
  }
  // The layout never depends on the clock: time passing must not move or resize anything.
  const sorted = [...points].sort((a, b) => a - b);

  // Background bands with tasks on them (e.g. Office): their empty stretches are just gaps between tasks.
  const hosts = new Set(
    blocks
      .filter((c) => c.kind === "context" && blocks.some((b) => b.kind === "commitment" && b.start < c.end && c.start < b.end))
      .map((c) => c.id),
  );

  // 1. Cut the day into segments and classify them.
  type Raw = { from: number; to: number; kind: SegKind; covering: Block[]; key: string };
  const raw: Raw[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (to <= from) continue;
    const covering = blocks.filter((b) => b.start < to && b.end > from);
    const kind: SegKind = covering.some((b) => b.kind === "commitment") ? "commitment" : covering.length ? "context" : "free";
    raw.push({ from, to, kind, covering, key: `${kind}:${covering.map((b) => b.id).join(",")}` });
  }

  // 2. Height of each segment.
  const place: (((m: number) => number) | undefined)[] = raw.map(() => undefined);
  const px: number[] = raw.map((s) => {
    if (s.kind !== "commitment") return 0; // empty time: by stretch, below
    const dur = s.to - s.from;
    return Math.max(
      30,
      trackedHeight(dur),
      // A block with steps gets room to show them, however short it is.
      // Its extra height is shared across its segments in proportion to time.
      ...s.covering.map((b) => (neededHeight(b) * dur) / (b.end - b.start)),
    );
  });

  // Empty time goes by whole stretches (consecutive segments of the same kind under the same bands):
  // the curve gives the stretch its height, shared by its segments in proportion to their minutes.
  // That way a stretch cut into pieces (by a band's edge, say) keeps the height its whole length deserves.
  for (let i = 0; i < raw.length; ) {
    if (raw[i].kind === "commitment") {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < raw.length && raw[j + 1].key === raw[i].key) j++;
    const total = raw[j].to - raw[i].from;
    const standaloneBand = raw[i].kind === "context" && !raw[i].covering.some((b) => hosts.has(b.id));
    // A band on its own is one row with its label, so it never gets shorter than the label needs.
    const height = standaloneBand ? Math.max(BAND_ROW, gapHeight(total)) : gapHeight(total);
    // Within the stretch, its ends keep readable room and the middle is compressed (gapPosition).
    const origin = raw[i].from;
    const at = (m: number) => gapPosition(m - origin, total, height);
    for (let k = i; k <= j; k++) {
      const top = at(raw[k].from);
      px[k] = at(raw[k].to) - top;
      place[k] = (m) => at(m) - top;
    }
    i = j + 1;
  }

  const segs: Seg[] = [];
  let y = 0;
  raw.forEach((s, i) => {
    segs.push({ from: s.from, to: s.to, y, px: px[i], kind: s.kind, place: place[i] });
    y += px[i];
  });

  const map = (m: number) => {
    if (!segs.length || m <= segs[0].from) return 0;
    for (const s of segs) {
      if (m > s.to) continue;
      return s.y + (s.place ? s.place(m) : ((m - s.from) / (s.to - s.from)) * s.px);
    }
    return y;
  };
  const unmap = (py: number) => {
    for (const s of segs) {
      if (py > s.y + s.px) continue;
      if (!s.place) return s.from + ((py - s.y) / s.px) * (s.to - s.from);
      // Not linear: find the minute by bisection (positions only move forward).
      let lo = s.from;
      let hi = s.to;
      for (let n = 0; n < 24; n++) {
        const mid = (lo + hi) / 2;
        if (s.y + s.place(mid) < py) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    return end;
  };
  return { segs, map, unmap, height: y, start, end };
}

export function Timeline({
  blocks, now, readOnly = false, history = false, dayOffset = 0,
}: {
  blocks: Block[]; now: number; readOnly?: boolean; dayOffset?: number;
  /** A past day: shown as it was left, nothing can be changed or added. */
  history?: boolean;
}) {
  const open = useApp((s) => s.open);
  const scroller = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => sortByStart(blocks), [blocks]);
  // Rebuild the scale each minute (not each second) so the layout stays still.
  const quietFrom = useApp((s) => s.settings.quietFrom);
  const quietTo = useApp((s) => s.settings.quietTo);
  const scale = useMemo(() => buildScale(sorted, dayWindow(quietFrom, quietTo)), [sorted, quietFrom, quietTo]);
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

  // When the timeline gets shorter (e.g. the Now strip unfolds), keep "now" in view.
  const nowAt = useRef(0);
  nowAt.current = scale.map(now);
  useEffect(() => {
    const el = scroller.current;
    if (!el || readOnly) return;
    let lastHeight = el.clientHeight;
    const observer = new ResizeObserver(() => {
      if (el.clientHeight === lastHeight) return;
      lastHeight = el.clientHeight;
      const y = nowAt.current;
      const visible = y >= el.scrollTop + 16 && y <= el.scrollTop + el.clientHeight - 40;
      if (!visible) el.scrollTo({ top: Math.max(0, y - el.clientHeight / 3), behavior: "smooth" });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [readOnly]);

  // Time labels at segment boundaries. When two would collide, the one where a tracked block
  // starts wins (you read a block by its start), then a band's start, then anything else.
  const priority = (m: number) =>
    sorted.some((b) => b.kind === "commitment" && b.start === m) ? 2 : sorted.some((b) => b.start === m) ? 1 : 0;
  const labels: { m: number; y: number }[] = [];
  for (const s of scale.segs) {
    const last = labels[labels.length - 1];
    if (!last || s.y - last.y >= LABEL_GAP) labels.push({ m: s.from, y: s.y });
    else if (priority(s.from) > priority(last.m) && s.y - (labels[labels.length - 2]?.y ?? -Infinity) >= LABEL_GAP) {
      labels[labels.length - 1] = { m: s.from, y: s.y };
    }
  }
  if (scale.height - (labels[labels.length - 1]?.y ?? 0) >= LABEL_GAP) labels.push({ m: scale.end, y: scale.height });

  /** Where bands with tasks on them sit, to draw row lines across them. */
  const bandRanges = sorted
    .filter((b) => nesting.hosts.has(b.id))
    .map((b) => ({ top: scale.map(b.start), bottom: scale.map(b.end) }));

  const showNow = !readOnly && now >= scale.start && now <= scale.end;
  const nowY = scale.map(now);
  const visibleLabels = showNow ? labels.filter((l) => Math.abs(l.y - nowY) >= 22) : labels;

  return (
    <div ref={scroller} className="relative h-full overflow-y-auto px-6 pt-5 pb-28">
      <div className="relative" style={{ height: scale.height + 8 }}>
        {visibleLabels.map((l) => (
          <div key={l.m} className="pointer-events-none absolute right-0 left-0 flex items-start" style={{ top: l.y }}>
            <span className="tabular w-14 -translate-y-2 text-[11px] text-muted">{fmtTime(l.m)}</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>
        ))}

        <div className="@container absolute top-0 right-0 bottom-0 left-14 z-10" inert={history}>
          {/* --nest: width of a background band's label column (tasks float to its right). */}
          <div className="absolute inset-0 [--nest:148px] @max-[560px]:[--nest:116px]">
            {/* Row lines across the task area of bands that hold tasks (the band would hide them),
                between the band (z-0) and its tasks (z-2). Not over the band's own label column. */}
            {visibleLabels
              .filter((l) => bandRanges.some((r) => l.y > r.top && l.y < r.bottom))
              .map((l) => (
                <div
                  key={`band-line-${l.m}`}
                  className="pointer-events-none absolute right-0 z-[1] h-px bg-border/70"
                  style={{ top: l.y, left: "calc(8px + var(--nest))" }}
                />
              ))}
          {scale.segs
            .filter((s) => !history && s.kind === "free" && (readOnly || s.to > now) && !(s.to === scale.end && s.to - s.from <= 60))
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
                  <span>Free · {fmtDuration(s.to - from)}</span>
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
              now={history ? 24 * 60 : readOnly ? -1 : now}
              top={scale.map(b.start)}
              height={scale.map(b.end) - scale.map(b.start)}
              lane={lanes.get(b.id)}
              nested={nesting.nested.has(b.id)}
              hosting={nesting.hosts.has(b.id)}
              readOnly={readOnly}
              dayOffset={dayOffset}
              onAddAt={(minute, areaId) =>
                open("quickAdd", `${dayPhrase(dayOffset)}at ${fmtTime(minute)} ${areaId ? `#${areaId} ` : ""}`)
              }
              unmap={scale.unmap}
              map={scale.map}
            />
          ))}
          </div>
        </div>

        {showNow && (
          // Centered on nowY: the line (in the middle of the pill's row) sits exactly at the current time.
          <div className="pointer-events-none absolute right-0 left-0 flex -translate-y-1/2 items-center" style={{ top: nowY }}>
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
  block, now, top, height: rawHeight, lane, nested = false, hosting = false, readOnly, dayOffset = 0, onAddAt, unmap, map,
}: {
  block: Block; now: number; top: number; height: number; lane?: Lane; nested?: boolean; hosting?: boolean; readOnly: boolean;
  dayOffset?: number;
  onAddAt: (minute: number, areaId?: string) => void; unmap: (y: number) => number; map: (minute: number) => number;
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

  return (
    <div
      onContextMenu={(e) => {
        if (wantsNativeMenu(e.nativeEvent)) return;
        const real = target();
        showMenu(e, blockMenu(real ?? block, { isToday: !readOnly, editable: !!real, dayOffset }));
      }}
      onClick={() => {
        const real = target();
        if (real) openBlock(real.id);
        else useApp.getState().say("This comes from your plan. Change it in Plans.");
      }}
      title={editable ? "Open details · edit, add steps" : "From your plan. Edit it in Plans."}
      className={cn(
        "@container group absolute z-[2] overflow-hidden rounded-xl transition-all duration-200",
        editable ? "cursor-pointer hover:-translate-y-px hover:shadow-soft" : "cursor-default",
        celebrate && "animate-[done-pop_650ms_ease-out]",
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
          {done && (
            <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
              <Check size={14} className="shrink-0 text-success" />
            </motion.span>
          )}
          <span className="shrink-0 text-[11.5px] font-medium @max-[400px]:hidden" style={{ color }}>
            {area?.name}
          </span>
          <span className={cn("truncate text-[13.5px] font-medium", (missed || skipped) && "text-muted", skipped && "line-through")}>
            {block.title}
          </span>
          {active && <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-accent-fg">now</span>}
          {block.routineId && (
            <span title="Repeats" className="shrink-0 text-muted @max-[280px]:hidden">
              <Repeat size={12} />
            </span>
          )}
          {block.subtasks.length > 0 && <StepProgress done={block.subtasks.filter((t) => t.done).length} total={block.subtasks.length} color={color} />}
          {missed && <span className="shrink-0 text-[11px] text-attention @max-[320px]:hidden">didn't happen</span>}
          {/* Narrow block: just the start time, so the title keeps its room. */}
          <span
            className="tabular ml-auto shrink-0 pl-2 text-[11.5px] text-muted"
            title={`${fmtTime(block.start)} – ${fmtTime(block.end)}`}
          >
            <span className="@max-[360px]:hidden">{fmtTime(block.start)} – {fmtTime(block.end)}</span>
            <span className="hidden @max-[360px]:inline">{fmtTime(block.start)}</span>
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
          {!readOnly && block.status !== "planned" && (
            <IconAction
              label={block.status === "done" ? "Mark not done" : "Restore"}
              onClick={() => reopenBlock(block.id)}
              icon={<RotateCcw size={14} />}
            />
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
          <span className="flex max-w-[calc(var(--nest)-16px)] items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate text-[13px] font-medium">{block.title}</span>
            {past && <Check size={13} className="shrink-0 text-muted" />}
          </span>
          <span className="tabular max-w-[calc(var(--nest)-16px)] pl-3.5 text-[11px] text-muted">
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

      {hover && <HoverGuide hover={hover} lineY={map(hover.minute) - top} bandHeight={height} color={color} hosting={hosting} />}
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
  hover, lineY, bandHeight, color, hosting,
}: { hover: { minute: number; x: number; width: number }; lineY: number; bandHeight: number; color: string; hosting: boolean }) {
  const pillTop = clampTo(lineY - PILL_H / 2, 2, bandHeight - PILL_H - 2);
  // Tasks float on top of a hosting band, so keep the pill in the band's free label column there.
  const pillLeft = hosting
    ? clampTo(hover.x - PILL_W / 2, 4, (hover.width + 8 <= NARROW_TIMELINE ? NEST_INSET_NARROW : NEST_INSET) - PILL_W - 4)
    : clampTo(hover.x + 14, 4, hover.width - PILL_W - 4);
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
