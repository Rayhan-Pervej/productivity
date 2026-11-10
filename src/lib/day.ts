// Pure selectors that derive "now / next / missed / suggestions" from blocks and the clock.
// These move to the Rust core later; the UI will receive the same shapes.
import type { Block, Task } from "@/domain/types";

export const sortByStart = <T extends { start: number }>(items: T[]) => [...items].sort((a, b) => a.start - b.start);

const isCommitment = (b: Block) => b.kind === "commitment";
const activeAt = (b: Block, now: number) => b.start <= now && now < b.end;

/** The commitment happening now (the thing to focus on). */
export function currentCommitment(blocks: Block[], now: number) {
  return blocks.find((b) => isCommitment(b) && b.status === "planned" && activeAt(b, now));
}

/** The background block happening now (office, time out). */
export function currentContext(blocks: Block[], now: number) {
  return blocks.find((b) => b.kind === "context" && activeAt(b, now));
}

export function nextCommitment(blocks: Block[], now: number) {
  return sortByStart(blocks).find((b) => isCommitment(b) && b.status === "planned" && b.start > now);
}

/** Commitments whose time passed with no response: "didn't happen". Context blocks never appear here. */
export function missedBlocks(blocks: Block[], now: number) {
  return sortByStart(blocks).filter((b) => isCommitment(b) && b.status === "planned" && b.end <= now);
}

/** Commitments not yet resolved (for the evening review). */
export function unresolvedBlocks(blocks: Block[]) {
  return sortByStart(blocks).filter((b) => isCommitment(b) && b.status === "planned");
}

/** Progress counts only commitments: the things you chose to do. */
export function dayProgress(blocks: Block[]) {
  const counted = blocks.filter((b) => isCommitment(b) && b.status !== "skipped");
  const done = counted.filter((b) => b.status === "done").length;
  return { done, total: counted.length, ratio: counted.length ? done / counted.length : 0 };
}

export function overlapping(blocks: Block[], start: number, end: number) {
  return blocks.find((b) => isCommitment(b) && b.status !== "skipped" && start < b.end && b.start < end);
}

/** Free minutes from now until the next block of any kind (office counts: you're not free then). */
export function freeWindow(blocks: Block[], now: number) {
  const next = nextCommitment(blocks, now);
  const nextAny = sortByStart(blocks).find((b) => b.status !== "skipped" && b.start > now);
  const until = nextAny?.start ?? 24 * 60;
  return { until, minutes: Math.max(0, until - now), next, nextAny };
}

/**
 * "What should I do?": v0.1 rules: due today first, then habits, then things that fit the free window.
 * The real engine (energy, history, priorities) arrives in v0.2.
 */
export function suggest(tasks: Task[], freeMinutes: number) {
  const score = (t: Task) => {
    const d = t.duration ?? 30;
    let s = 0;
    if (t.due === "Today") s += 100;
    if (t.type === "habit") s += 40;
    s += d <= freeMinutes ? 30 : -60;
    return s - d / 10;
  };
  return tasks.filter((t) => !t.done).sort((a, b) => score(b) - score(a));
}

/** Start times today where `duration` fits without touching any other block (for "Schedule" menus). */
export function freeStarts(blocks: Block[], now: number, duration: number, limit = 2) {
  const live = blocks.filter((b) => b.status !== "skipped");
  const candidates = [Math.ceil(now / 5) * 5, ...live.map((b) => b.end)]
    .filter((t) => t >= now && t + duration <= 24 * 60)
    .sort((a, b) => a - b);
  const result: number[] = [];
  for (const t of candidates) {
    if (result.includes(t)) continue;
    if (live.some((b) => t < b.end && b.start < t + duration)) continue;
    result.push(t);
    if (result.length === limit) break;
  }
  return result;
}
