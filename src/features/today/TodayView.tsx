import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, Plus } from "lucide-react";
import { useApp, useCurrent } from "@/store/app";
import { dayLabel, dayPhrase, fmtCountdown, fmtDuration, todayLabel } from "@/lib/time";
import { blocksForDay } from "@/lib/days";
import { Button, Kbd } from "@/components/ui";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Timeline } from "./Timeline";
import { ContextPanel } from "./ContextPanel";
import { DayPicker } from "./DayPicker";
import type { Block } from "@/domain/types";

export function TodayView() {
  const initial = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("day") ?? 0) : 0;
  const [day, setDay] = useState(initial);
  /** A day picked from the calendar, shown as its own tab beside Tomorrow. */
  const [picked, setPicked] = useState<number | null>(initial > 1 ? initial : null);
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
    if (offset > 1) setPicked(offset);
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
  const anytime = useApp((s) => s.anytime);
  const open = useApp((s) => s.open);

  // Future days follow their weekday's plan, plus anything you added for that day.
  const futureBlocks = useMemo<Block[]>(
    () => (day === 0 ? [] : blocksForDay(day, [], templates, upcoming)),
    [day, templates, upcoming],
  );
  const futureTasks = anytime.filter((t) => t.dayOffset === day && day > 0);
  const addedCount = (d: number) =>
    upcoming.filter((b) => b.dayOffset === d).length + anytime.filter((t) => t.dayOffset === d).length;

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
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
          {day <= 1 && <span className="shrink-0 text-[12.5px] whitespace-nowrap text-muted">{todayLabel(day)}</span>}
          <DaySummary blocks={day === 0 ? blocks : futureBlocks} isToday={day === 0} />
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => open("quickAdd", dayPhrase(day))}>
            <Plus size={14} /> Add <Kbd>N</Kbd>
          </Button>
        </div>

        {day === 0 && <CompactNow />}
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
          ) : (
            <Timeline key={`day-${day}`} blocks={futureBlocks} now={now} readOnly dayOffset={day} />
          )}
        </div>
      </div>
      <ContextPanel />
    </>
  );
}

/** "4h 30m planned · 1h done · Office 9h": how much of the day is spoken for. */
function DaySummary({ blocks, isToday }: { blocks: Block[]; isToday: boolean }) {
  const areas = useApp((s) => s.areas);
  const tracked = blocks.filter((b) => b.kind === "commitment" && b.status !== "skipped");
  const planned = tracked.reduce((sum, b) => sum + (b.end - b.start), 0);
  const done = tracked.filter((b) => b.status === "done").reduce((sum, b) => sum + (b.end - b.start), 0);
  const background = blocks.filter((b) => b.kind === "context");

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[12px] whitespace-nowrap max-[1100px]:hidden">
      <span className="text-border">|</span>
      <span
        className="tabular flex shrink-0 items-center gap-1.5 rounded-md bg-surface px-2 py-0.5 font-medium"
        title="Time in tracked blocks (the things you chose to do)"
      >
        <Clock size={12} className="text-accent" />
        {planned ? `${fmtDuration(planned)} planned` : "Nothing planned"}
        {planned > 0 && <span className="font-normal text-muted">· {tracked.length} {tracked.length === 1 ? "block" : "blocks"}</span>}
      </span>
      {isToday && done > 0 && (
        <span className="tabular rounded-md bg-surface px-2 py-0.5 text-success">{fmtDuration(done)} done</span>
      )}
      {background.map((b) => (
        <span
          key={b.id}
          className="tabular flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-muted"
          title="Background time, not counted as planned"
        >
          <span className="size-1.5 rounded-full" style={{ background: areas.find((a) => a.id === b.areaId)?.color }} />
          {b.title} {fmtDuration(b.end - b.start)}
        </span>
      ))}
    </div>
  );
}

/** Shown instead of the side panel on narrow windows. */
function CompactNow() {
  const { commitment } = useCurrent();
  const now = useApp((s) => s.now);
  const completeBlock = useApp((s) => s.completeBlock);
  if (!commitment) return null;
  return (
    <div className="mx-6 mt-3 hidden items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 max-[1000px]:flex">
      <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">Now</span>
      <span className="truncate text-[13.5px] font-medium">{commitment.title}</span>
      <span className="tabular ml-auto text-[12.5px] text-muted">{fmtCountdown(commitment.end - now)}</span>
      <Button size="sm" variant="success" onClick={() => completeBlock(commitment.id)}>
        <Check size={13} /> Done
      </Button>
    </div>
  );
}
