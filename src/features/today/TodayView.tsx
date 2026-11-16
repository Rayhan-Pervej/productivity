import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Eye, Plus } from "lucide-react";
import { useApp } from "@/store/app";
import { dayLabel, dayPhrase, fmtDuration, isoDay, todayLabel } from "@/lib/time";
import { loadPastDay } from "@/platform/desktop";
import { LAYOUT, useMediaQuery } from "@/lib/useMediaQuery";
import { blocksForDay } from "@/lib/days";
import { Button, Kbd } from "@/components/ui";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Timeline } from "./Timeline";
import { ContextPanel } from "./ContextPanel";
import { DayPicker } from "./DayPicker";
import { NowStrip } from "./NowStrip";
import type { Block } from "@/domain/types";

export function TodayView() {
  const initial = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("day") ?? 0) : 0;
  const [day, setDay] = useState(initial);
  /** A day picked from the calendar, shown as its own tab beside Tomorrow. */
  const [picked, setPicked] = useState<number | null>(initial > 1 || initial < 0 ? initial : null);
  // A new day started (midnight): show today, close any picked date.
  const dayKey = useApp((s) => s.dayKey);
  const seenDay = useRef(dayKey);
  useEffect(() => {
    if (seenDay.current === dayKey) return;
    seenDay.current = dayKey;
    setDay(0);
    setPicked(null);
  }, [dayKey]);

  const pick = (offset: number) => {
    if (offset > 1 || offset < 0) setPicked(offset);
    setDay(offset);
  };
  const closePicked = () => {
    if (day === picked) setDay(0);
    setPicked(null);
  };
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const templates = useApp((s) => s.templates);
  const upcoming = useApp((s) => s.upcoming);
  const routines = useApp((s) => s.routines);
  const anytime = useApp((s) => s.anytime);
  const open = useApp((s) => s.open);

  // Future days follow their weekday's plan, plus anything you added for that day.
  const futureBlocks = useMemo<Block[]>(
    () => (day === 0 ? [] : blocksForDay(day, [], templates, upcoming, routines)),
    [day, templates, upcoming, routines],
  );
  const futureTasks = anytime.filter((t) => t.dayOffset === day && day > 0);

  // A past day comes from the database as it was left (view only).
  const history = day < 0;
  const pastBlocks = usePastDay(history ? day : null);

  // Wide window: the Now panel sits beside the timeline. Narrower: it folds into the Now strip.
  const wide = useMediaQuery(LAYOUT.wide);
  const addedCount = (d: number) =>
    upcoming.filter((b) => b.dayOffset === d).length + anytime.filter((t) => t.dayOffset === d).length;

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The toolbar folds by its own width: the date, then details, give way before the controls. */}
        <div className="@container">
        <div className="flex items-center gap-2 px-6 pt-4">
          <SegmentedControl
            label="Day"
            value={day}
            onChange={setDay}
            options={[
              { value: 0, label: "Today" },
              { value: 1, label: "Tomorrow", dot: addedCount(1) > 0 },
              ...(picked !== null
                ? [{ value: picked, label: dayLabel(picked), dot: addedCount(picked) > 0, onClose: closePicked }]
                : []),
            ]}
          />
          <DayPicker selected={day} onPick={pick} />
          {(day === 0 || day === 1) && <span className="@max-[720px]:hidden shrink-0 text-[12.5px] whitespace-nowrap text-muted">{todayLabel(day)}</span>}
          <DaySummary blocks={day === 0 ? blocks : history ? pastBlocks : futureBlocks} showDone={day <= 0} />
          {history ? (
            <span
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-[12px] text-muted"
              title="Past days are kept as they were. You can look, not change."
            >
              <Eye size={13} /> View only
            </span>
          ) : (
            <Button size="sm" variant="ghost" className="ml-auto shrink-0" onClick={() => open("quickAdd", dayPhrase(day))}>
              <Plus size={14} /> Add <Kbd>N</Kbd>
            </Button>
          )}
        </div>
        </div>

        {day === 0 && !wide && <NowStrip />}
        {futureTasks.length > 0 && (
          <div className="mx-6 mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <span className="text-muted">Anytime this day:</span>
            {futureTasks.map((t) => (
              <span key={t.id} className="rounded-md bg-surface px-2 py-0.5">
                {t.title}
              </span>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1">
          {day === 0 ? (
            <Timeline key="today" blocks={blocks} now={now} />
          ) : history ? (
            pastBlocks.length ? (
              <Timeline key={`day-${day}`} blocks={pastBlocks} now={now} readOnly history dayOffset={day} />
            ) : (
              <p className="px-6 pt-10 text-center text-[13px] text-muted">Nothing was planned on this day.</p>
            )
          ) : (
            <Timeline key={`day-${day}`} blocks={futureBlocks} now={now} readOnly dayOffset={day} />
          )}
        </div>
      </div>
      {wide && <ContextPanel />}
    </>
  );
}

/** "4h 30m planned · 1h done · Office 9h": how much of the day is spoken for. */
function DaySummary({ blocks, showDone }: { blocks: Block[]; showDone: boolean }) {
  const areas = useApp((s) => s.areas);
  const tracked = blocks.filter((b) => b.kind === "commitment" && b.status !== "skipped");
  const planned = tracked.reduce((sum, b) => sum + (b.end - b.start), 0);
  const done = tracked.filter((b) => b.status === "done").reduce((sum, b) => sum + (b.end - b.start), 0);
  const background = blocks.filter((b) => b.kind === "context");
  // Everything, for the tooltip, since narrower toolbars show less (see the @max-[...] classes).
  const full = [
    planned ? `${fmtDuration(planned)} planned · ${tracked.length} ${tracked.length === 1 ? "block" : "blocks"}` : "Nothing planned",
    showDone && done > 0 ? `${fmtDuration(done)} done` : "",
    ...background.map((b) => `${b.title} ${fmtDuration(b.end - b.start)} (background)`),
  ].filter(Boolean).join("\n");

  return (
    <div
      className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[12px] whitespace-nowrap @max-[540px]:hidden"
      title={full}
    >
      <span className="text-border">|</span>
      <span
        className="tabular flex shrink-0 items-center gap-1.5 rounded-md bg-surface px-2 py-0.5 font-medium"
      >
        <Clock size={12} className="text-accent" />
        {planned ? `${fmtDuration(planned)} planned` : "Nothing planned"}
        {planned > 0 && <span className="font-normal text-muted @max-[860px]:hidden">· {tracked.length} {tracked.length === 1 ? "block" : "blocks"}</span>}
      </span>
      {showDone && done > 0 && (
        <span className="tabular shrink-0 rounded-md bg-surface px-2 py-0.5 text-success @max-[640px]:hidden">{fmtDuration(done)} done</span>
      )}
      {background.map((b) => (
        <span
          key={b.id}
          className="tabular flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-muted @max-[980px]:hidden"
        >
          <span className="size-1.5 rounded-full" style={{ background: areas.find((a) => a.id === b.areaId)?.color }} />
          {b.title} {fmtDuration(b.end - b.start)}
        </span>
      ))}
    </div>
  );
}

/** A past day's blocks, loaded when `offset` (negative) is set. */
function usePastDay(offset: number | null) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  useEffect(() => {
    if (offset === null) return;
    let live = true;
    const d = new Date();
    d.setDate(d.getDate() + offset);
    setBlocks([]);
    loadPastDay(isoDay(d)).then((b) => live && setBlocks(b));
    return () => {
      live = false;
    };
  }, [offset]);
  return blocks;
}
