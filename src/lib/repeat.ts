// Weekday sets for repeating routines: names, presets and human labels, in one place.
import type { Block, Routine, Weekday } from "@/domain/types";
import { uid } from "@/lib/utils";
import { isoDay, shortDate } from "@/lib/time";

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Single-letter chips, Monday first (S M T W T F S reads oddly to many; we show Mon-first). */
export const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
export const WEEKENDS: Weekday[] = [0, 6];

export const normalizeDays = (days: number[]): Weekday[] =>
  [...new Set(days)].filter((d): d is Weekday => d >= 0 && d <= 6).sort((a, b) => a - b);

const same = (a: Weekday[], b: Weekday[]) => a.length === b.length && a.every((d, i) => d === b[i]);

/** "Every day", "Weekdays", "Weekends", "Every Tuesday", "Sun, Tue, Thu". */
export function repeatLabel(days: Weekday[]) {
  const d = normalizeDays(days);
  if (same(d, EVERY_DAY)) return "Every day";
  if (same(d, WEEKDAYS)) return "Weekdays";
  if (same(d, WEEKENDS)) return "Weekends";
  if (d.length === 1) return `Every ${WEEKDAY_LONG[d[0]]}`;
  return WEEK_ORDER.filter((x) => d.includes(x)).map((x) => WEEKDAY_SHORT[x]).join(", ");
}

export const isSameDays = (a: Weekday[], b: Weekday[]) => same(normalizeDays(a), normalizeDays(b));

/** Does this routine happen on that date (right weekday, not past its end)? */
export function routineOn(r: Routine, date: Date) {
  const day = isoDay(date);
  return r.days.includes(date.getDay() as Weekday) && (!r.until || day <= r.until) && !r.skipDays?.includes(day);
}

/** True once a routine's last day has passed. */
export const routineEnded = (r: Routine, today: Date = new Date()) => !!r.until && r.until < isoDay(today);

/** "until Nov 30", or "" when it never ends. */
export const untilPhrase = (until?: string) => (until ? `until ${shortDate(until)}` : "");

/** Copies of the routines that happen on `date`. */
export function blocksFromRoutines(routines: Routine[], date: Date): Block[] {
  return routines
    .filter((r) => routineOn(r, date))
    .map((r) => ({
      id: uid(),
      title: r.title,
      areaId: r.areaId,
      kind: "commitment" as const,
      start: r.start,
      end: r.end,
      status: "planned" as const,
      subtasks: [],
      fromPlan: true,
      routineId: r.id,
    }));
}

/** For sentences: "every day", "on weekdays", "on weekends", "every Tuesday", "on Tue, Thu, Sun". */
export function repeatPhrase(days: Weekday[]) {
  const d = normalizeDays(days);
  if (same(d, EVERY_DAY)) return "every day";
  if (same(d, WEEKDAYS)) return "on weekdays";
  if (same(d, WEEKENDS)) return "on weekends";
  if (d.length === 1) return `every ${WEEKDAY_LONG[d[0]]}`;
  return `on ${repeatLabel(d)}`;
}
