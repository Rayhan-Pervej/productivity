import { describe, expect, it } from "vitest";
import { dayProgress, freeStarts, missedBlocks, suggest, suggestStart } from "./day";
import type { Block, Task } from "@/domain/types";

const block = (over: Partial<Block>): Block => ({
  id: Math.random().toString(36),
  title: "x",
  areaId: "office",
  kind: "commitment",
  start: 0,
  end: 60,
  status: "planned",
  subtasks: [],
  ...over,
});

describe("day logic", () => {
  it("counts steps in progress, and a done block completes its steps", () => {
    const blocks = [
      block({
        subtasks: [
          { id: "a", title: "a", done: true },
          { id: "b", title: "b", done: false },
        ],
      }),
      block({ status: "done", subtasks: [{ id: "c", title: "c", done: false }] }),
      block({}),
      block({ kind: "context" }), // background blocks never count
    ];
    const p = dayProgress(blocks);
    expect(p).toMatchObject({ done: 1, total: 3, steps: 3, stepsDone: 2 });
    expect(p.ratio).toBeCloseTo(2 / 4); // units: 2 steps + 1 step + 1 block
  });

  it("never reports background blocks as missed", () => {
    const blocks = [block({ kind: "context", end: 60 }), block({ end: 60 })];
    expect(missedBlocks(blocks, 120)).toHaveLength(1);
  });

  it("finds free slots that fit, starting from now", () => {
    const blocks = [block({ start: 600, end: 660 })]; // 10:00 – 11:00 is taken
    // At 9:50 a 30-min task doesn't fit before 10:00, so the first free start is 11:00.
    expect(freeStarts(blocks, 590, 30, 2)).toEqual([660]);
    // At 9:00 there is room right away.
    expect(freeStarts(blocks, 540, 30, 2)).toEqual([540, 660]);
  });

  it("suggests what is due today first", () => {
    const tasks: Task[] = [
      { id: "1", title: "long", type: "flexible", duration: 120, done: false },
      { id: "2", title: "due", type: "deadline", due: "Today", duration: 10, done: false },
    ];
    expect(suggest(tasks, 30)[0].id).toBe("2");
  });
});

describe("suggestStart (Plan my day)", () => {
  const office = block({ kind: "context", areaId: "office", start: 480, end: 1050 });
  const standup = block({ start: 510, end: 540 });

  it("puts an Office task inside Office, after what's already there", () => {
    expect(suggestStart([office, standup], 510, 60, "office")).toBe(540);
  });

  it("keeps a personal task out of Office", () => {
    expect(suggestStart([office, standup], 510, 60, "personal")).toBe(1050);
  });

  it("starts on the 15-minute grid and gives up when the day is full", () => {
    expect(suggestStart([], 1081, 30)).toBe(1095);
    expect(suggestStart([], 1430, 30)).toBeNull();
  });
});
