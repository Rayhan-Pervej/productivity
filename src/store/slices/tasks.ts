// Tasks slice: anytime tasks, inbox and backlog, quick-add (addParsed), and moving tasks onto the timeline.
import type { Block, Task } from "@/domain/types";
import { fmtTime } from "@/lib/time";
import { uid } from "@/lib/utils";
import { nextCommitment } from "@/lib/day";
import type { Slice } from "../helpers";

export const tasksSlice: Slice<
  | "anytime"
  | "inbox"
  | "backlog"
  | "toggleTask"
  | "startTask"
  | "scheduleTask"
  | "planDay"
  | "addParsed"
  | "inboxToToday"
  | "letGoInbox"
  | "deleteTask"
  | "backlogToToday"
> = (_set, get, { change, doneSound }) => ({
  anytime: [],
  inbox: [],
  backlog: [],

  toggleTask: (id) => {
    const finishing = get().anytime.some((t) => t.id === id && !t.done);
    change((s) => ({ anytime: s.anytime.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
    if (finishing) doneSound();
  },

  /** Turn a suggestion into a commitment that starts right now (trimmed to fit before the next one). */
  startTask: (id) => {
    const s = get();
    const task = s.anytime.find((t) => t.id === id);
    if (!task) return;
    const start = Math.floor(s.now);
    const next = nextCommitment(s.blocks, s.now);
    const end = Math.min(start + (task.duration ?? 30), next?.start ?? 24 * 60);
    const block: Block = {
      id: task.id,
      title: task.title,
      areaId: task.areaId ?? "personal",
      kind: "commitment",
      start,
      end,
      status: "planned",
      subtasks: [],
    };
    change((st) => ({ blocks: [...st.blocks, block], anytime: st.anytime.filter((t) => t.id !== id) }), `Started · ${task.title}`);
  },

  planDay: (picks) => {
    if (!picks.length) return;
    const s = get();
    // Inbox items have no area yet; they land in Personal.
    const findTask = (id: string): { id: string; title: string; areaId?: string } | undefined =>
      s.anytime.find((t) => t.id === id) ?? s.backlog.find((t) => t.id === id) ?? s.inbox.find((t) => t.id === id);
    const blocks: Block[] = [];
    for (const p of picks) {
      const task = findTask(p.id);
      if (!task) continue;
      blocks.push({
        id: task.id,
        title: task.title,
        areaId: task.areaId ?? "personal",
        kind: "commitment",
        start: p.start,
        end: Math.min(p.start + p.duration, 24 * 60),
        status: "planned",
        subtasks: [],
      });
    }
    const ids = new Set(blocks.map((b) => b.id));
    change(
      (st) => ({
        blocks: [...st.blocks, ...blocks],
        anytime: st.anytime.filter((t) => !ids.has(t.id)),
        backlog: st.backlog.filter((t) => !ids.has(t.id)),
        inbox: st.inbox.filter((t) => !ids.has(t.id)),
      }),
      `Planned ${blocks.length} ${blocks.length === 1 ? "thing" : "things"} for today`,
    );
  },

  /** Move an anytime task onto today's timeline at a given time. */
  scheduleTask: (id, start) => {
    const task = get().anytime.find((t) => t.id === id);
    if (!task) return;
    const end = Math.min(start + (task.duration ?? 30), 24 * 60);
    const block: Block = {
      id: task.id,
      title: task.title,
      areaId: task.areaId ?? "personal",
      kind: "commitment",
      start,
      end,
      status: "planned",
      subtasks: [],
    };
    change(
      (st) => ({ blocks: [...st.blocks, block], anytime: st.anytime.filter((t) => t.id !== id) }),
      `Scheduled · ${task.title} · ${fmtTime(start)}`,
    );
  },

  addParsed: (p) => {
    const areaId = p.areaId ?? "personal";
    if (p.type === "routine" && p.start !== undefined && p.repeat) {
      return get().addRoutine({
        title: p.title,
        areaId,
        start: p.start,
        end: p.start + p.duration,
        days: p.repeat,
        until: p.until,
      });
    }
    if (p.type === "fixed" && p.start !== undefined) {
      const block: Block = {
        id: uid(),
        title: p.title,
        areaId,
        kind: "commitment",
        start: p.start,
        end: p.start + p.duration,
        status: "planned",
        subtasks: [],
      };
      return change(
        (s) => (p.day === 0 ? { blocks: [...s.blocks, block] } : { upcoming: [...s.upcoming, { ...block, dayOffset: p.day }] }),
        `Added · ${p.dayLabel} · ${fmtTime(p.start)}`,
      );
    }
    if (p.type === "backlog" && !p.areaId) {
      return change((s) => ({ inbox: [...s.inbox, { id: uid(), title: p.title }] }), "Added to Inbox");
    }
    const task: Task = {
      id: uid(),
      title: p.title,
      areaId,
      type: p.type,
      done: false,
      duration: p.durationExplicit ? p.duration : undefined,
      due: p.due,
      dayOffset: p.day || undefined,
    };
    change((s) => ({ anytime: [...s.anytime, task] }), p.day ? `Added · ${p.dayLabel}` : "Added to Anytime today");
  },

  inboxToToday: (id) =>
    change((s) => {
      const item = s.inbox.find((i) => i.id === id)!;
      return {
        inbox: s.inbox.filter((i) => i.id !== id),
        anytime: [...s.anytime, { id: item.id, title: item.title, type: "flexible", done: false }],
      };
    }, "Moved to Anytime today"),
  letGoInbox: (id) => change((s) => ({ inbox: s.inbox.filter((i) => i.id !== id) }), "Let go"),

  deleteTask: (id) => {
    const s = get();
    const title = (s.anytime.find((t) => t.id === id) ?? s.backlog.find((t) => t.id === id))?.title ?? "";
    change(
      (st) => ({ anytime: st.anytime.filter((t) => t.id !== id), backlog: st.backlog.filter((t) => t.id !== id) }),
      `Deleted · ${title}`,
    );
  },
  backlogToToday: (id) =>
    change((s) => {
      const task = s.backlog.find((t) => t.id === id)!;
      return { backlog: s.backlog.filter((t) => t.id !== id), anytime: [...s.anytime, { ...task, type: "flexible" }] };
    }, "Moved to Anytime today"),
});
