// What the right-click menu offers, by what was clicked. One place for all menu wording and actions.
import {
  ArrowRight, CalendarClock, CalendarDays, Check, Clock, Inbox, LayoutTemplate, ListChecks, Moon, Play, Plus,
  Repeat, RotateCcw, Settings, SkipForward, Sparkles, Sunrise, Trash2, Undo2, X,
} from "lucide-react";
import type { MenuItem } from "@/components/ContextMenu";
import type { Block, Task, Weekday } from "@/domain/types";
import { EVERY_DAY, WEEKDAYS, WEEKDAY_LONG, WEEKENDS, isSameDays } from "@/lib/repeat";
import { weekdayOf } from "@/lib/time";
import { useApp } from "@/store/app";
import { freeStarts } from "@/lib/day";
import { fmtTime } from "@/lib/time";

const I = 15; // icon size

/**
 * "Repeat ▸" submenu: presets with a check on the current choice, custom days, or stop.
 * `weekday` is the day the block is on, for "Every Tuesday".
 */
function repeatSubmenu(current: Weekday[] | undefined, weekday: Weekday, apply: (days: Weekday[] | null) => void, custom: () => void): MenuItem {
  const option = (label: string, days: Weekday[]): MenuItem => ({
    label,
    checked: !!current && isSameDays(current, days),
    onSelect: () => apply(days),
  });
  const presetChosen = !!current && [EVERY_DAY, WEEKDAYS, WEEKENDS, [weekday]].some((d) => isSameDays(current, d as Weekday[]));
  return {
    label: current ? "Repeats" : "Repeat",
    icon: <Repeat size={I} />,
    submenu: [
      option("Every day", EVERY_DAY),
      option("Weekdays (Mon – Fri)", WEEKDAYS),
      option("Weekends", WEEKENDS),
      option(`Every ${WEEKDAY_LONG[weekday]}`, [weekday]),
      "separator",
      { label: "Custom days…", checked: !!current && !presetChosen, onSelect: custom },
      ...(current ? ["separator" as const, { label: "Don't repeat", icon: <X size={I} />, onSelect: () => apply(null) }] : []),
    ],
  };
}

/** A tracked block on the timeline (today or a future day). */
export function blockMenu(block: Block, opts: { isToday: boolean; editable: boolean; dayOffset?: number }): MenuItem[] {
  const s = useApp.getState();
  const routine = block.routineId ? s.routines.find((r) => r.id === block.routineId) : undefined;
  const offset = opts.dayOffset ?? ("dayOffset" in block ? (block as { dayOffset: number }).dayOffset : 0);
  const weekday = weekdayOf(offset) as Weekday;

  if (!opts.editable) {
    // A future copy of a repeat: change the repeat itself. A plan block: edit the plan.
    if (routine) {
      return [
        repeatSubmenu(routine.days, weekday, (days) => (days ? s.updateRoutine(routine.id, { days }) : s.stopRoutine(routine.id)), () => s.setView("plans")),
        { label: "Edit repeats in Plans", icon: <LayoutTemplate size={I} />, onSelect: () => s.setView("plans") },
      ];
    }
    return [{ label: "Edit in Plans", icon: <LayoutTemplate size={I} />, onSelect: () => s.setView("plans") }];
  }
  const planned = block.status === "planned";
  const active = opts.isToday && planned && block.start <= s.now && s.now < block.end;
  const past = opts.isToday && block.end <= s.now;

  return [
    ...(opts.isToday && planned
      ? [
          { label: "Done", icon: <Check size={I} />, hint: active ? "Space" : undefined, onSelect: () => s.completeBlock(block.id) },
          ...(active ? [{ label: "Start focus", icon: <Play size={I} />, onSelect: () => s.setView("focus") }] : []),
          ...(!past ? [{ label: "+10 min", icon: <Clock size={I} />, onSelect: () => s.extendBlock(block.id, 10) }] : []),
        ]
      : []),
    ...(opts.isToday && !planned
      ? [{
          label: block.status === "done" ? "Mark not done" : "Restore",
          icon: <RotateCcw size={I} />,
          onSelect: () => s.reopenBlock(block.id),
        }]
      : []),
    "separator",
    { label: "Open details", icon: <ListChecks size={I} />, onSelect: () => s.openBlock(block.id) },
    ...(block.kind === "commitment"
      ? [repeatSubmenu(routine?.days, weekday, (days) => s.setRepeat(block.id, days), () => s.openBlock(block.id))]
      : []),
    ...(opts.isToday && planned
      ? [
          { label: "Move to tomorrow", icon: <ArrowRight size={I} />, onSelect: () => s.triage(block.id, "tomorrow") },
          { label: "Skip", icon: <SkipForward size={I} />, onSelect: () => s.skipBlock(block.id) },
        ]
      : []),
    "separator",
    { label: "Delete", icon: <Trash2 size={I} />, danger: true, onSelect: () => s.deleteBlock(block.id) },
  ];
}

/** A background band (office, time out), at the time under the cursor. */
export function bandMenu(block: Block, minute: number | null, onAddAt: () => void): MenuItem[] {
  const s = useApp.getState();
  const plan = s.templates.find((t) => t.id === s.activeTemplateId);
  return [
    ...(minute !== null
      ? [{ label: `Add to ${block.title} at ${fmtTime(minute)}`, icon: <Plus size={I} />, onSelect: onAddAt }]
      : []),
    "separator",
    { label: `Edit ${plan?.name ?? "your"} plan`, icon: <LayoutTemplate size={I} />, onSelect: () => s.setView("plans") },
  ];
}

/** A task in Anytime today. */
export function taskMenu(task: Task): MenuItem[] {
  const s = useApp.getState();
  const next = freeStarts(s.blocks, s.now, task.duration ?? 30, 1)[0];
  return [
    ...(!task.done
      ? [
          { label: "Start now", icon: <Play size={I} />, onSelect: () => s.startTask(task.id) },
          ...(next !== undefined
            ? [{ label: `Put at ${fmtTime(next)}`, icon: <CalendarClock size={I} />, onSelect: () => s.scheduleTask(task.id, next) }]
            : []),
        ]
      : []),
    { label: task.done ? "Mark not done" : "Mark done", icon: task.done ? <Undo2 size={I} /> : <Check size={I} />, onSelect: () => s.toggleTask(task.id) },
    "separator",
    { label: "Delete", icon: <Trash2 size={I} />, danger: true, onSelect: () => s.deleteTask(task.id) },
  ];
}

/** Right-click anywhere else. */
export function appMenu(): MenuItem[] {
  const s = useApp.getState();
  return [
    { label: "Quick add", icon: <Plus size={I} />, hint: "N", onSelect: () => s.open("quickAdd") },
    { label: "What should I do now?", icon: <Sparkles size={I} />, onSelect: () => s.setView("focus") },
    "separator",
    { label: "Morning briefing", icon: <Sunrise size={I} />, onSelect: () => s.open("briefing") },
    { label: "Close my day", icon: <Moon size={I} />, onSelect: () => s.open("review") },
    "separator",
    { label: "Today", icon: <CalendarDays size={I} />, hint: "1", onSelect: () => s.setView("today") },
    { label: "Inbox", icon: <Inbox size={I} />, hint: "3", onSelect: () => s.setView("inbox") },
    { label: "Plans", icon: <LayoutTemplate size={I} />, hint: "4", onSelect: () => s.setView("plans") },
    { label: "Settings", icon: <Settings size={I} />, hint: ",", onSelect: () => s.setView("settings") },
    ...(s.history.length ? ["separator" as const, { label: "Undo", icon: <Undo2 size={I} />, hint: "Ctrl Z", onSelect: s.undo }] : []),
  ];
}
