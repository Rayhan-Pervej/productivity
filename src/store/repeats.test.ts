// @vitest-environment happy-dom
// Repeats behave like calendar events: per-day copies, "only this day" vs "every time", skipped days.
import { beforeEach, describe, expect, it } from "vitest";
import { useApp } from "./app";
import { blocksForDay } from "@/lib/days";
import { EVERY_DAY } from "@/lib/repeat";
import { dateOf, isoDay } from "@/lib/time";

const s = () => useApp.getState();

beforeEach(() => {
  useApp.setState({ blocks: [], upcoming: [], routines: [], history: [], onboarded: true });
  s().addRoutine({ title: "IELTS", areaId: "reading", start: 21 * 60, end: 22 * 60, days: EVERY_DAY });
});

const routine = () => s().routines[0];
const dayBlocks = (offset: number) => blocksForDay(offset, s().blocks, s().templates, s().upcoming, s().routines);

describe("repeats", () => {
  it("creates today's copy right away", () => {
    expect(s().blocks.filter((b) => b.routineId === routine().id)).toHaveLength(1);
  });

  it("opening a future copy makes one real block for that day (not two)", () => {
    const copy = s().ensureRoutineCopy(routine().id, 2)!;
    expect(s().ensureRoutineCopy(routine().id, 2)!.id).toBe(copy.id);
    expect(dayBlocks(2).filter((b) => b.routineId === routine().id)).toHaveLength(1);
  });

  it("edits to the repeat reach every copy except days changed 'only this day'", () => {
    const changed = s().ensureRoutineCopy(routine().id, 2)!;
    const following = s().ensureRoutineCopy(routine().id, 3)!;
    s().updateBlock(changed.id, { start: 20 * 60, end: 21 * 60, detached: true });

    s().updateRoutine(routine().id, { title: "IELTS speaking", start: 21 * 60 + 30, end: 22 * 60 + 30 });

    const get = (id: string) => s().upcoming.find((b) => b.id === id)!;
    expect(get(changed.id)).toMatchObject({ title: "IELTS", start: 20 * 60 }); // kept its own change
    expect(get(following.id)).toMatchObject({ title: "IELTS speaking", start: 21 * 60 + 30 });
    expect(s().blocks.find((b) => b.routineId)!.title).toBe("IELTS speaking"); // today's copy too
  });

  it("deleting one day's copy skips that day, and it doesn't come back", () => {
    const copy = s().ensureRoutineCopy(routine().id, 3)!;
    s().deleteBlock(copy.id);
    expect(routine().skipDays).toContain(isoDay(dateOf(3)));
    expect(dayBlocks(3).some((b) => b.routineId === routine().id)).toBe(false);
    expect(dayBlocks(4).some((b) => b.routineId === routine().id)).toBe(true); // other days unaffected
  });

  it("stopping the repeat removes future copies and keeps today's as a normal block", () => {
    s().ensureRoutineCopy(routine().id, 2);
    s().stopRoutine(routine().id);
    expect(s().routines).toHaveLength(0);
    expect(s().upcoming).toHaveLength(0);
    const today = s().blocks.find((b) => b.title === "IELTS")!;
    expect(today.routineId).toBeUndefined();
    expect(today.fromPlan).toBe(false);
  });
});
