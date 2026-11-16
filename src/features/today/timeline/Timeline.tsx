// The day's timeline: time labels, row lines, free gaps, blocks and the "now" line.
// Layout rules live in lib/timelineLayout.ts (pure, tested); this file only renders them.
import { useEffect, useMemo, useRef } from "react";
import { Plus } from "lucide-react";
import { useApp } from "@/store/app";
import { dayWindow } from "@/lib/scale";
import { assignLanes, buildScale, nesting as findNesting, timeLabels } from "@/lib/timelineLayout";
import { sortByStart } from "@/lib/day";
import { dayPhrase, fmtDuration, fmtTime } from "@/lib/time";
import type { Block } from "@/domain/types";
import { TimelineBlock } from "./TimelineBlock";

export function Timeline({
  blocks,
  now,
  readOnly = false,
  history = false,
  dayOffset = 0,
}: {
  blocks: Block[];
  now: number;
  readOnly?: boolean;
  dayOffset?: number;
  /** A past day: shown as it was left, nothing can be changed or added. */
  history?: boolean;
}) {
  const open = useApp((s) => s.open);
  const scroller = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => sortByStart(blocks), [blocks]);
  const quietFrom = useApp((s) => s.settings.quietFrom);
  const quietTo = useApp((s) => s.settings.quietTo);
  // The layout depends on the blocks and your waking day only, never on the clock.
  const scale = useMemo(() => buildScale(sorted, dayWindow(quietFrom, quietTo)), [sorted, quietFrom, quietTo]);
  const lanes = useMemo(() => assignLanes(sorted), [sorted]);
  const nesting = useMemo(() => findNesting(sorted), [sorted]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to "now" only when the view opens or switches day
  useEffect(() => {
    const el = scroller.current;
    if (el && !readOnly) el.scrollTop = Math.max(0, scale.map(useApp.getState().now) - el.clientHeight / 3);
  }, [readOnly]);

  // When the timeline gets shorter (e.g. the window is resized), keep "now" in view.
  const nowAt = useRef(0);
  nowAt.current = scale.map(now);
  useEffect(() => {
    const el = scroller.current;
    if (!el || readOnly) return;
    let lastHeight = el.clientHeight;
    const observer = new ResizeObserver(() => {
      if (el.clientHeight === lastHeight) return;
      lastHeight = el.clientHeight;
      const y = nowAt.current;
      const visible = y >= el.scrollTop + 16 && y <= el.scrollTop + el.clientHeight - 40;
      if (!visible) el.scrollTo({ top: Math.max(0, y - el.clientHeight / 3), behavior: "smooth" });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [readOnly]);

  const labels = timeLabels(scale, sorted);

  const showNow = !readOnly && now >= scale.start && now <= scale.end;
  const nowY = scale.map(now);
  const visibleLabels = showNow ? labels.filter((l) => Math.abs(l.y - nowY) >= 22) : labels;
  const addAt = (minute: number, areaId?: string) =>
    open("quickAdd", `${dayPhrase(dayOffset)}at ${fmtTime(minute)} ${areaId ? `#${areaId} ` : ""}`);

  return (
    <div ref={scroller} className="relative h-full overflow-y-auto px-6 pt-5 pb-28">
      <div className="relative" style={{ height: scale.height + 8 }}>
        {visibleLabels.map((l) => (
          <div key={l.m} className="pointer-events-none absolute right-0 left-0 flex items-start" style={{ top: l.y }}>
            <span className="tabular w-14 -translate-y-2 text-[11px] text-muted">{fmtTime(l.m)}</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>
        ))}

        <div className="@container absolute top-0 right-0 bottom-0 left-14 z-10" inert={history}>
          {/* --nest: width of a background band's label column (tasks float to its right). See geometry.ts. */}
          <div className="absolute inset-0 [--nest:148px] @max-[560px]:[--nest:116px]">
            {/* No row lines inside bands: a band's task cards mark their own times, and the hover
                guide shows any exact time. Lines in free time come from the time labels above. */}
            {/* The "now" line: above the bands (so it's solid over their stripes) but under task cards.
                On a whole pixel and 2 px tall, so it never blends into the stripes and looks dashed. */}
            {showNow && (
              <div className="pointer-events-none absolute right-0 left-0 z-[1] h-0.5 bg-accent" style={{ top: Math.round(nowY) - 1 }} />
            )}

            {scale.segs
              .filter((s) => !history && s.kind === "free" && (readOnly || s.to > now) && !(s.to === scale.end && s.to - s.from <= 60))
              .map((s) => {
                const from = readOnly ? s.from : Math.max(s.from, Math.ceil(now / 5) * 5);
                const top = scale.map(from) + 3;
                const height = scale.map(s.to) - top - 3;
                if (height < 24 || s.to - from < 10) return null;
                return (
                  <button
                    type="button"
                    key={s.from}
                    onClick={() => open("quickAdd", `${dayPhrase(dayOffset)}at ${fmtTime(from)} `)}
                    className="group absolute right-0 left-2 flex items-center gap-2 rounded-xl border border-dashed border-transparent px-4 text-[12px] text-muted transition-colors hover:border-border hover:bg-surface/60"
                    style={{ top, height }}
                  >
                    <span>Free · {fmtDuration(s.to - from)}</span>
                    <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Plus size={13} /> Plan something
                    </span>
                  </button>
                );
              })}

            {sorted.map((b) => (
              <TimelineBlock
                key={b.id}
                block={b}
                now={history ? 24 * 60 : readOnly ? -1 : now}
                top={scale.map(b.start)}
                height={scale.map(b.end) - scale.map(b.start)}
                lane={lanes.get(b.id)}
                nested={nesting.nested.has(b.id)}
                hosting={nesting.hosts.has(b.id)}
                readOnly={readOnly}
                dayOffset={dayOffset}
                onAddAt={addAt}
                unmap={scale.unmap}
                map={scale.map}
              />
            ))}
          </div>
        </div>

        {showNow && (
          // The time pill in the time column (the line itself is drawn with the blocks, under tasks).
          // A short stub joins the pill to where the line starts.
          <div className="pointer-events-none absolute left-0 z-20 w-14" style={{ top: Math.round(nowY) }}>
            <div className="absolute right-0 left-0 -top-px h-0.5 bg-accent" />
            <span className="tabular absolute -left-1 top-0 w-[60px] -translate-y-1/2 rounded-md bg-accent py-0.5 text-center text-[10.5px] font-semibold text-accent-fg">
              {fmtTime(now)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
