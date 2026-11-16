// How the timeline turns minutes into height. Pure functions, so the rules can be tested.

/** Tracked time: 72 px for the first hour. */
const PX_PER_MIN = 72 / 60;

/**
 * Height for tracked time: the first hour at full scale (72 px), longer stretches grow more slowly,
 * so a 4-hour block doesn't become a tall empty card. Steps still get their room (see neededHeight).
 */
export function trackedHeight(minutes: number) {
  const full = Math.min(minutes, 60) * PX_PER_MIN;
  return full + Math.max(0, minutes - 60) * 0.45;
}

/** Empty-time rates, px per minute. */
const GAP_RATE = { first15: 1.5, toTwoHours: 0.6, beyond: 0.225 } as const;

/**
 * Height for empty time (gaps between tasks, free time, bands on their own), by its length.
 * Every 10 minutes always adds space, so longer is always taller, but long stretches grow slowly:
 *   first 15 min: 15 px per 10 min → 15 min = 22.5 px
 *   15 min to 2 h: 6 px per 10 min → 1 h = 49.5 px, 2 h = 85.5 px
 *   beyond 2 h:   2.25 px per 10 min → 8 h = 166.5 px (still grows, never flat)
 * Always below tracked time of the same length (trackedHeight, min 30 px), so your work stays
 * the focus. That's why the first 15 minutes can't go faster than 1.5 px/min.
 */
export function gapHeight(minutes: number) {
  const m = Math.max(0, minutes);
  const at15 = 15 * GAP_RATE.first15;
  const at120 = at15 + 105 * GAP_RATE.toTwoHours;
  if (m <= 15) return m * GAP_RATE.first15;
  if (m <= 120) return at15 + (m - 15) * GAP_RATE.toTwoHours;
  return at120 + (m - 120) * GAP_RATE.beyond;
}

/**
 * Your waking day, from quiet hours: it starts when quiet hours end and ends when they begin.
 * 00:00–07:00 → 07:00 to midnight. 23:00–07:00 → 07:00 to 23:00.
 * Quiet hours in the middle of the day (e.g. a 13:00–14:00 nap) don't define the day: whole day.
 */
export function dayWindow(quietFrom: number, quietTo: number) {
  const DAY = 24 * 60;
  if (quietFrom > quietTo) return { start: quietTo, end: quietFrom }; // crosses midnight
  if (quietTo <= 12 * 60) return { start: quietTo, end: DAY }; // after midnight until morning
  return { start: 0, end: DAY };
}

/** Minutes at each end of a gap that keep readable room (next to the blocks around it). */
const GAP_EDGE_MIN = 15;

/**
 * Where a minute sits inside a stretch of empty time that is `total` minutes long and `height` px tall.
 * The first and last 15 minutes keep their own room (up to 22.5 px each, a 15 min gap), and only
 * the middle is compressed. So "20 min before 9:00 PM" reads clearly apart from 9:00 PM, while the
 * stretch's height (from gapHeight) stays the same. Short stretches (< 1 h) are simply linear.
 */
export function gapPosition(minute: number, total: number, height: number) {
  const d = Math.min(Math.max(minute, 0), total);
  if (total < 4 * GAP_EDGE_MIN) return (d / total) * height;
  const edge = Math.min(gapHeight(GAP_EDGE_MIN), height * 0.3); // px for each end
  const middle = (height - 2 * edge) / (total - 2 * GAP_EDGE_MIN); // px per minute in the middle
  if (d <= GAP_EDGE_MIN) return (d / GAP_EDGE_MIN) * edge;
  if (d >= total - GAP_EDGE_MIN) return height - ((total - d) / GAP_EDGE_MIN) * edge;
  return edge + (d - GAP_EDGE_MIN) * middle;
}
