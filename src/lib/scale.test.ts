import { describe, expect, it } from "vitest";
import { dayWindow, gapHeight, gapPosition, trackedHeight } from "./scale";

describe("timeline scale", () => {
  it("gives empty time a height for every 10 minutes: longer is always taller", () => {
    for (let m = 10; m <= 24 * 60; m += 10) expect(gapHeight(m)).toBeGreaterThan(gapHeight(m - 10));
  });

  it("keeps empty time shorter than tracked time of the same length", () => {
    for (let m = 1; m <= 24 * 60; m++) expect(gapHeight(m)).toBeLessThan(Math.max(30, trackedHeight(m)));
  });

  it("matches the documented curve", () => {
    expect(gapHeight(15)).toBeCloseTo(22.5);
    expect(gapHeight(60)).toBeCloseTo(49.5);
    expect(gapHeight(120)).toBeCloseTo(85.5);
    expect(gapHeight(480)).toBeCloseTo(166.5);
  });
});

describe("day window from quiet hours", () => {
  const h = (hh: number, mm = 0) => hh * 60 + mm;
  it("quiet after midnight until morning: day runs from wake-up to midnight", () => {
    expect(dayWindow(h(0), h(7))).toEqual({ start: h(7), end: h(24) });
    expect(dayWindow(h(0, 30), h(7))).toEqual({ start: h(7), end: h(24) });
  });
  it("quiet from late evening: day ends when quiet hours begin", () => {
    expect(dayWindow(h(23), h(7))).toEqual({ start: h(7), end: h(23) });
  });
  it("a daytime quiet window doesn't define the day", () => {
    expect(dayWindow(h(13), h(14))).toEqual({ start: 0, end: h(24) });
  });
});

describe("position inside a gap", () => {
  it("starts at 0, ends at the full height, and only moves forward", () => {
    for (const total of [20, 60, 90, 210, 480]) {
      const h = gapHeight(total);
      expect(gapPosition(0, total, h)).toBe(0);
      expect(gapPosition(total, total, h)).toBeCloseTo(h);
      for (let m = 1; m <= total; m++) expect(gapPosition(m, total, h)).toBeGreaterThan(gapPosition(m - 1, total, h));
    }
  });
  it("keeps 20 minutes before a block clearly apart from it (5:30 to 9:00 PM, at 8:40 PM)", () => {
    const total = 210;
    const h = gapHeight(total);
    expect(h - gapPosition(190, total, h)).toBeGreaterThanOrEqual(18);
  });
});
