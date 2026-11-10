// Natural-language quick-add parser (v0.1 subset, docs/04-v0.1-spec.md §4).
// Lives in TS for the UI prototype; moves to the Rust core so all surfaces share it.
import type { Area, TaskType } from "@/domain/types";
import { dayLabel } from "@/lib/time";

export interface Parsed {
  title: string;
  areaId?: string;
  /** Days from today: 0 = today, 1 = tomorrow, 2 = day after tomorrow… */
  day: number;
  dayLabel: string;
  start?: number;
  duration: number;
  durationExplicit: boolean;
  type: TaskType;
  due?: string;
  tonight: boolean;
}

const DEFAULT_DURATION = 30;
const DUE_DAYS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday", today: "Today", tomorrow: "Tomorrow",
};

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_RE =
  /\s(?:on\s+|next\s+|this\s+)?(monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)\b/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
const DAY_MONTH_RE = new RegExp(String.raw`\s(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH}\b`, "i");
const MONTH_DAY_RE = new RegExp(String.raw`\s(?:on\s+)?${MONTH}\s+(\d{1,2})(?:st|nd|rd|th)?\b`, "i");

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);

export function parseQuickAdd(input: string, areas: Area[], today: Date = new Date()): Parsed {
  let text = ` ${input} `;
  const take = (re: RegExp) => {
    const m = text.match(re);
    if (m) text = text.replace(m[0], " ");
    return m;
  };

  // #area
  let areaId: string | undefined;
  const tag = take(/\s#(\w+)/);
  if (tag) {
    const key = tag[1].toLowerCase();
    areaId = areas.find((a) => a.id.startsWith(key) || a.name.toLowerCase().startsWith(key))?.id;
  }

  // deadline: "by fri", "by tomorrow"
  let due: string | undefined;
  const by = take(/\sby\s+(mon|tue|wed|thu|fri|sat|sun|today|tomorrow)\w*/i);
  if (by) due = DUE_DAYS[by[1].toLowerCase()];

  // habit
  const habit = !!take(/\s(every\s*day|daily)\b/i);

  // day: most specific first, so "day after tomorrow" isn't read as "tomorrow"
  let day = 0;
  let m: RegExpMatchArray | null;
  if (take(/\s(?:the\s+)?(day after tomorrow|overmorrow)\b/i)) day = 2;
  else if (take(/\s(tomorrow|tmrw|tmr)\b/i)) day = 1;
  else if ((m = take(/\sin\s+(\d{1,2}|a|one|two|three)\s+(days?|weeks?)\b/i))) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3 };
    const n = words[m[1].toLowerCase()] ?? parseInt(m[1]);
    day = m[2].toLowerCase().startsWith("week") ? n * 7 : n;
  } else if ((m = take(DAY_MONTH_RE) ?? take(MONTH_DAY_RE))) {
    const [num, mon] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    const date = new Date(today.getFullYear(), MONTHS.indexOf(mon.slice(0, 3).toLowerCase()), parseInt(num));
    if (date < startOfDay(today)) date.setFullYear(date.getFullYear() + 1);
    day = daysBetween(today, date);
  } else if ((m = take(WEEKDAY_RE))) {
    const target = WEEKDAYS.indexOf(m[1].slice(0, 3).toLowerCase());
    day = (target - today.getDay() + 7) % 7 || 7; // "fri" on a Friday means next Friday
  }
  const tonight = !!take(/\stonight\b/i);
  take(/\stoday\b/i);

  // duration: "1h", "1.5h", "1h 30m", "45m", "45 min"
  let duration = DEFAULT_DURATION;
  let durationExplicit = false;
  const hours = take(/\s(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?(?:\s*(\d+)\s*m(?:in)?)?\b/i);
  const mins = hours ? null : take(/\s(\d+)\s*m(?:in|ins|inutes?)?\b/i);
  if (hours) {
    duration = Math.round(parseFloat(hours[1]) * 60) + (hours[2] ? parseInt(hours[2]) : 0);
    durationExplicit = true;
  } else if (mins) {
    duration = parseInt(mins[1]);
    durationExplicit = true;
  }

  // time: "9pm", "9:30 pm", "at 21:00"
  let start: number | undefined;
  const ampm = take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampm) {
    let hh = parseInt(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === "pm") hh += 12;
    start = hh * 60 + (ampm[2] ? parseInt(ampm[2]) : 0);
  } else {
    const clock = take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (clock) start = parseInt(clock[1]) * 60 + parseInt(clock[2]);
  }

  let type: TaskType;
  if (due) type = "deadline";
  else if (habit) type = "habit";
  else if (start !== undefined) type = "fixed";
  else if (tonight || durationExplicit || day > 0) type = "flexible";
  else type = "backlog";

  const cleaned = text.replace(/\s+/g, " ").trim();

  // No #tag: infer the area from a word in the title ("study dsa" → Study, "read" → Reading).
  if (!areaId) {
    const words = cleaned.toLowerCase().split(" ");
    areaId = areas.find((a) => {
      const name = a.name.toLowerCase();
      return words.some((w) => w.length >= 4 && (name.startsWith(w) || w.startsWith(name)));
    })?.id;
  }
  const title = cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : "";

  return { title, areaId, day, dayLabel: dayLabel(day, today), start, duration, durationExplicit, type, due, tonight };
}

export const TYPE_LABEL: Record<TaskType, string> = {
  fixed: "Fixed time",
  flexible: "Flexible",
  deadline: "Deadline",
  habit: "Daily habit",
  backlog: "Inbox",
};
