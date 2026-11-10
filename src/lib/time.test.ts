import { describe, expect, it } from "vitest";
import { fmtDuration, fmtTime, inQuietHours, setTimeFormat } from "./time";

describe("time helpers", () => {
  it("formats 12h and 24h clocks", () => {
    setTimeFormat("24h");
    expect(fmtTime(21 * 60 + 30)).toBe("21:30");
    setTimeFormat("12h");
    expect(fmtTime(21 * 60 + 30)).toBe("9:30 PM");
    expect(fmtTime(0)).toBe("12:00 AM");
  });

  it("formats durations", () => {
    expect(fmtDuration(45)).toBe("45 min");
    expect(fmtDuration(90)).toBe("1h 30m");
    expect(fmtDuration(120)).toBe("2h");
  });

  it("handles quiet hours across midnight", () => {
    expect(inQuietHours(60, 30, 420)).toBe(true);
    expect(inQuietHours(600, 30, 420)).toBe(false);
    expect(inQuietHours(23 * 60 + 30, 23 * 60, 7 * 60)).toBe(true);
    expect(inQuietHours(12 * 60, 23 * 60, 7 * 60)).toBe(false);
  });
});
