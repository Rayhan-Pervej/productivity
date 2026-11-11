import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./parse";
import type { Area } from "@/domain/types";

const areas: Area[] = [
  { id: "office", name: "Office", color: "" },
  { id: "client", name: "Client", color: "" },
  { id: "study", name: "Study", color: "" },
  { id: "reading", name: "Reading", color: "" },
  { id: "personal", name: "Personal", color: "" },
];
const tue = new Date(2026, 10, 10); // Tuesday 10 Nov 2026
const parse = (s: string) => parseQuickAdd(s, areas, tue);

describe("quick add parser", () => {
  it("reads time, duration and area", () => {
    const p = parse("client call 9pm 45m");
    expect(p).toMatchObject({ title: "Client call", areaId: "client", start: 21 * 60, duration: 45, type: "fixed", day: 0 });
  });

  it("understands 24h times and #tags", () => {
    expect(parse("#office review at 10:15").start).toBe(10 * 60 + 15);
    expect(parse("#office review at 10:15").areaId).toBe("office");
  });

  it("understands days", () => {
    expect(parse("meeting day after tomorrow 9pm").day).toBe(2);
    expect(parse("meeting tomorrow 9pm").day).toBe(1);
    expect(parse("gym fri 7am").day).toBe(3);
    expect(parse("pay rent 15 nov").day).toBe(5);
    expect(parse("study in 3 days 1h").day).toBe(3);
  });

  it("does not mistake words for days", () => {
    const p = parse("monitor setup tomorrow");
    expect(p.title).toBe("Monitor setup");
    expect(p.day).toBe(1);
  });

  it("sends untimed items without an area to the inbox", () => {
    expect(parse("buy cable").type).toBe("backlog");
    expect(parse("buy cable").areaId).toBeUndefined();
  });

  it("reads deadlines and habits", () => {
    expect(parse("submit invoice by fri")).toMatchObject({ type: "deadline", due: "Friday" });
    expect(parse("read every day 30m")).toMatchObject({ type: "habit", duration: 30 });
  });

  it("turns repeats with a time into routines", () => {
    expect(parse("standup meeting everyday 8:30am")).toMatchObject({
      title: "Standup meeting", type: "routine", start: 8 * 60 + 30, repeat: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(parse("ielts class every sun tue thu 9pm")).toMatchObject({
      title: "Ielts class", type: "routine", start: 21 * 60, repeat: [0, 2, 4],
    });
    expect(parse("gym every mon, wed and fri 7am").repeat).toEqual([1, 3, 5]);
    expect(parse("standup every weekday 9am #office")).toMatchObject({ repeat: [1, 2, 3, 4, 5], areaId: "office" });
    expect(parse("long walk weekends 5pm").repeat).toEqual([0, 6]);
  });

  it("keeps repeats without a time as habits", () => {
    expect(parse("read every day 30m")).toMatchObject({ type: "habit", repeat: [0, 1, 2, 3, 4, 5, 6] });
  });

  it("reads an end date for repeats", () => {
    expect(parse("standup everyday 8:30am till 30 nov")).toMatchObject({ type: "routine", until: "2026-11-30", title: "Standup" });
    expect(parse("ielts every sun tue thu 9pm until dec 20").until).toBe("2026-12-20");
    expect(parse("gym weekdays 7am till nov 15th").until).toBe("2026-11-15");
    expect(parse("gym weekdays 7am for 2 weeks").until).toBe("2026-11-23"); // Tue 10 → Mon 23 (14 days incl. today)
    expect(parse("read every day till tomorrow").until).toBe("2026-11-11");
    // a date in the past wraps to next year
    expect(parse("class every mon 6pm till 1 nov").until).toBe("2027-11-01");
    // no repeat: no end date, and "30 nov" is just the day
    expect(parse("pay rent 30 nov").until).toBeUndefined();
  });
});
