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
});
