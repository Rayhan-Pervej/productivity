import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/types";
import { BAND_ROW, LABEL_GAP, MIN_TRACKED, assignLanes, buildScale, nesting, timeLabels } from "./timelineLayout";
import { gapHeight } from "./scale";

const h = (hh: number, mm = 0) => hh * 60 + mm;
const block = (id: string, kind: Block["kind"], start: number, end: number, steps = 0): Block => ({
  id,
  title: id,
  areaId: "office",
  kind,
  start,
  end,
  status: "planned",
  subtasks: Array.from({ length: steps }, (_, i) => ({ id: `${id}${i}`, title: "step", done: false })),
});
const DAY = { start: h(7), end: h(24) };

// A day like the real one: Office with tasks on it, free evening, a task at night.
const office = block("office", "context", h(8), h(17, 30));
const scrum = block("scrum", "commitment", h(8), h(8, 15));
const standup = block("standup", "commitment", h(8, 30), h(9), 2);
const ielts = block("ielts", "commitment", h(21), h(22, 30), 3);
const day = [office, scrum, standup, ielts];

describe("buildScale", () => {
  const scale = buildScale(day, DAY);

  it("covers your waking day from quiet hours", () => {
    expect(scale.start).toBe(h(7));
    expect(scale.end).toBe(h(24));
  });

  it("widens only for blocks outside the waking day", () => {
    const late = buildScale([block("x", "commitment", h(5), h(6))], DAY);
    expect(late.start).toBe(h(5));
  });

  it("maps minutes to positions that only move forward, and back again", () => {
    let last = -1;
    for (let m = scale.start; m <= scale.end; m += 5) {
      const y = scale.map(m);
      expect(y).toBeGreaterThanOrEqual(last);
      last = y;
      expect(scale.unmap(y)).toBeCloseTo(m, 0);
    }
  });

  it("gives a free stretch the gap curve's height (5:30 to 9:00 PM)", () => {
    expect(scale.map(h(21)) - scale.map(h(17, 30))).toBeCloseTo(gapHeight(h(21) - h(17, 30)));
  });

  it("never makes a tracked block shorter than its title row", () => {
    expect(scale.map(scrum.end) - scale.map(scrum.start)).toBeGreaterThanOrEqual(MIN_TRACKED);
  });

  it("gives a band on its own at least one row", () => {
    const alone = buildScale([block("p", "context", h(18), h(18, 30))], DAY);
    expect(alone.map(h(18, 30)) - alone.map(h(18))).toBeGreaterThanOrEqual(BAND_ROW);
  });
});

describe("assignLanes", () => {
  it("puts overlapping tracked blocks side by side", () => {
    const a = block("a", "commitment", h(9), h(13));
    const b = block("b", "commitment", h(12, 30), h(12, 45));
    const c = block("c", "commitment", h(14), h(15));
    const lanes = assignLanes([a, b, c]);
    expect(lanes.get("a")).toEqual({ col: 0, cols: 2 });
    expect(lanes.get("b")).toEqual({ col: 1, cols: 2 });
    expect(lanes.get("c")).toEqual({ col: 0, cols: 1 });
  });
});

describe("nesting", () => {
  it("knows which tasks sit on a band and which bands hold them", () => {
    const { nested, hosts } = nesting(day);
    expect([...nested].sort()).toEqual(["scrum", "standup"]);
    expect([...hosts]).toEqual(["office"]);
  });
});

describe("timeLabels", () => {
  const labels = timeLabels(buildScale(day, DAY), day);

  it("keeps labels apart", () => {
    for (let i = 1; i < labels.length; i++) expect(labels[i].y - labels[i - 1].y).toBeGreaterThanOrEqual(LABEL_GAP);
  });

  it("prefers the time where a task starts over the one where the previous ends", () => {
    const shown = labels.map((l) => l.m);
    expect(shown).toContain(standup.start);
  });
});
