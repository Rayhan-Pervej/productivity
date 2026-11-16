// The timeline's layout as pure functions: how a day turns into heights, columns and labels.
// No React here, so every rule can be unit-tested (see timelineLayout.test.ts).
//
// Space follows importance, not clock time:
//  - tracked blocks (commitments) use the tracked scale (72 px for the first hour, see scale.ts)
//  - empty time (gaps, free time, bands on their own) follows the gap curve, always shorter
//  - the layout never depends on the clock: time passing must not move or resize anything
import type { Block } from "@/domain/types";
import { clamp } from "./utils";
import { gapHeight, gapPosition, trackedHeight } from "./scale";

export type SegKind = "commitment" | "context" | "free";

export interface Seg {
  from: number;
  to: number;
  y: number;
  px: number;
  kind: SegKind;
  /** Offset (px) of a minute inside this segment, when not linear (empty time, see gapPosition). */
  place?: (minute: number) => number;
}

export interface Scale {
  segs: Seg[];
  /** Minute of the day → y (px). */
  map: (minute: number) => number;
  /** y (px) → minute of the day. */
  unmap: (y: number) => number;
  height: number;
  start: number;
  end: number;
}

/** Step list geometry, shared by the scale (how tall a block must be) and the step list (how many rows fit). */
export const STEP_ROW = 24;
export const STEP_HEADER = 44; // title row + padding above the list
export const MAX_VISIBLE_STEPS = 5;

/** Minimum vertical space between two time labels. */
export const LABEL_GAP = 18;
/** A background band with no tasks on it is one row: room for its name and time. */
export const BAND_ROW = 44;
/** A tracked block is never shorter than its title row. */
export const MIN_TRACKED = 30;

/** Minimum height for a tracked block so its steps are visible (0 when it has none). */
export function neededHeight(b: Block) {
  if (b.kind !== "commitment" || b.subtasks.length === 0) return 0;
  const rows = Math.min(b.subtasks.length, MAX_VISIBLE_STEPS) + (b.subtasks.length > MAX_VISIBLE_STEPS ? 1 : 0);
  return STEP_HEADER + rows * STEP_ROW + 6;
}

/**
 * Which tracked blocks sit on a background band (`nested`), and which bands hold them (`hosts`).
 * A band with tasks on it (e.g. Office) shows its label in a side column and gaps between tasks.
 */
export function nesting(blocks: Block[]) {
  const contexts = blocks.filter((b) => b.kind === "context");
  const nested = new Set<string>();
  const hosts = new Set<string>();
  for (const b of blocks) {
    if (b.kind !== "commitment") continue;
    const host = contexts.find((c) => c.start < b.end && b.start < c.end);
    if (host) {
      nested.add(b.id);
      hosts.add(host.id);
    }
  }
  return { nested, hosts };
}

/**
 * The scale for one day. Its range is your waking day (from quiet hours), widened only for blocks
 * outside it. It never depends on the clock, so nothing moves or resizes as time passes.
 */
export function buildScale(blocks: Block[], day: { start: number; end: number }): Scale {
  const firstStart = Math.min(day.start, ...blocks.map((b) => b.start));
  const lastEnd = Math.max(day.end, ...blocks.map((b) => b.end));
  const start = Math.max(0, Math.floor(firstStart / 60) * 60);
  const end = Math.min(24 * 60, Math.ceil(lastEnd / 60) * 60);

  const points = new Set([start, end]);
  for (const b of blocks) {
    points.add(clamp(b.start, start, end));
    points.add(clamp(b.end, start, end));
  }
  const sorted = [...points].sort((a, b) => a - b);
  // Bands with any tracked block on them: their empty stretches are gaps between tasks.
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

  // 2. Tracked time.
  const place: (((m: number) => number) | undefined)[] = raw.map(() => undefined);
  const px: number[] = raw.map((s) => {
    if (s.kind !== "commitment") return 0; // empty time: by stretch, below
    const dur = s.to - s.from;
    return Math.max(
      MIN_TRACKED,
      trackedHeight(dur),
      // A block with steps gets room to show them, however short it is.
      // Its extra height is shared across its segments in proportion to time.
      ...s.covering.map((b) => (neededHeight(b) * dur) / (b.end - b.start)),
    );
  });

  // 3. Empty time, by whole stretches (consecutive segments of the same kind under the same bands):
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

export interface Lane {
  col: number;
  cols: number;
}

/** Overlapping tracked blocks get side-by-side columns, like a calendar. `sorted` by start. */
export function assignLanes(sorted: Block[]) {
  const lanes = new Map<string, Lane>();
  let cluster: string[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];
  const flush = () => {
    for (const id of cluster) lanes.get(id)!.cols = Math.max(1, columnEnds.length);
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

export interface TimeLabel {
  m: number;
  y: number;
}

/**
 * Time labels at segment boundaries. When two would collide, the one where a tracked block
 * starts wins (you read a block by its start), then a band's start, then anything else.
 */
export function timeLabels(scale: Scale, sorted: Block[]): TimeLabel[] {
  const priority = (m: number) =>
    sorted.some((b) => b.kind === "commitment" && b.start === m) ? 2 : sorted.some((b) => b.start === m) ? 1 : 0;
  const labels: TimeLabel[] = [];
  for (const s of scale.segs) {
    const last = labels[labels.length - 1];
    if (!last || s.y - last.y >= LABEL_GAP) labels.push({ m: s.from, y: s.y });
    else if (priority(s.from) > priority(last.m) && s.y - (labels[labels.length - 2]?.y ?? -Infinity) >= LABEL_GAP) {
      labels[labels.length - 1] = { m: s.from, y: s.y };
    }
  }
  if (scale.height - (labels[labels.length - 1]?.y ?? 0) >= LABEL_GAP) labels.push({ m: scale.end, y: scale.height });
  return labels;
}
