const pad = (n: number) => String(n).padStart(2, "0");

export type TimeFormat = "12h" | "24h";

/** The format your system uses (e.g. US/BD English → 12h, most of Europe → 24h). */
export const systemTimeFormat = (): TimeFormat =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ? "12h" : "24h";

// Set once from settings (see App); every formatter reads it, so all surfaces stay consistent.
let timeFormat: TimeFormat = systemTimeFormat();
export const setTimeFormat = (f: TimeFormat) => {
  timeFormat = f;
};

/** 1290 → "21:30" (24h) or "9:30 PM" (12h) */
export function fmtTime(min: number) {
  const m = Math.round(min);
  const h = Math.floor(m / 60) % 24;
  if (timeFormat === "24h") return `${pad(h)}:${pad(m % 60)}`;
  return `${h % 12 || 12}:${pad(m % 60)} ${h < 12 ? "AM" : "PM"}`;
}

/** 90 → "1h 30m", 45 → "45 min" */
export function fmtDuration(min: number) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)}h ${rest}m` : `${m / 60}h`;
}

/** Remaining minutes (fractional) → "32:14" or "1:05:00" */
export function fmtCountdown(min: number) {
  const total = Math.max(0, Math.floor(min * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export function greeting(min: number) {
  if (min < 5 * 60) return "Good night";
  if (min < 12 * 60) return "Good morning";
  if (min < 17 * 60) return "Good afternoon";
  return "Good evening";
}

export function todayLabel(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

export function roundTo(min: number, step: number) {
  return Math.ceil(min / step) * step;
}

/** 0 → "Today", 1 → "Tomorrow", otherwise "Thu 12 Nov". */
export function dayLabel(offset: number, from: Date = new Date()) {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Weekday (0 = Sunday) of a day `offset` days from today. */
export function weekdayOf(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getDay();
}

/** Phrase the quick-add parser understands for a given day offset. */
export function dayPhrase(offset: number) {
  return offset === 0 ? "" : offset === 1 ? "tomorrow " : `in ${offset} days `;
}

/** Is a minute of the day inside quiet hours? Handles ranges that cross midnight (e.g. 00:30–07:00 or 23:00–07:00). */
export function inQuietHours(minute: number, from: number, to: number) {
  const m = ((minute % 1440) + 1440) % 1440;
  return from <= to ? m >= from && m < to : m >= from || m < to;
}
