import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, Plus, Repeat, Timer, Tag } from "lucide-react";
import { useApp } from "@/store/app";
import { parseQuickAdd, TYPE_LABEL } from "@/lib/parse";
import { overlapping } from "@/lib/day";
import { repeatLabel, repeatPhrase, untilPhrase } from "@/lib/repeat";
import { blocksForDay } from "@/lib/days";
import { fmtDuration, fmtTime } from "@/lib/time";
import { AreaDot, Kbd, Modal } from "@/components/ui";

const EXAMPLES = ["client call 9pm 45m", "study dsa 1h tonight", "standup weekdays 8:30am #office", "ielts every sun tue thu 9pm", "submit invoice by fri"];

export function QuickAdd() {
  const isOpen = useApp((s) => s.overlay === "quickAdd");
  const close = useApp((s) => s.close);
  return (
    <Modal open={isOpen} onClose={close} width={640} align="top">
      {isOpen && <QuickAddBody />}
    </Modal>
  );
}

function QuickAddBody() {
  const seed = useApp((s) => s.quickAddSeed);
  const areas = useApp((s) => s.areas);
  const blocks = useApp((s) => s.blocks);
  const templates = useApp((s) => s.templates);
  const upcoming = useApp((s) => s.upcoming);
  const routines = useApp((s) => s.routines);
  const anytime = useApp((s) => s.anytime);
  const { addParsed, scheduleTask, close } = useApp.getState();
  const [text, setText] = useState(seed);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const parsed = useMemo(() => parseQuickAdd(text, areas), [text, areas]);
  const area = areas.find((a) => a.id === parsed.areaId);
  const clash =
    parsed.type === "fixed" && parsed.start !== undefined
      ? overlapping(blocksForDay(parsed.day, blocks, templates, upcoming, routines), parsed.start, parsed.start + parsed.duration)
      : undefined;

  // Where will this land? Said plainly, so nothing "disappears" into a list.
  const destination =
    parsed.type === "routine" && parsed.start !== undefined && parsed.repeat
      ? `Repeats ${repeatPhrase(parsed.repeat)} at ${fmtTime(parsed.start)}${parsed.until ? `, ${untilPhrase(parsed.until)}` : ""}, on the timeline`
      : parsed.type === "fixed" && parsed.start !== undefined
      ? `On the timeline · ${parsed.dayLabel} ${fmtTime(parsed.start)}`
      : parsed.type === "backlog" && !parsed.areaId
        ? "Inbox, to sort later"
        : parsed.day > 0
          ? `Anytime on ${parsed.dayLabel}, no fixed time`
          : "Anytime today, no fixed time";
  const needsTimeHint = parsed.start === undefined && parsed.type !== "deadline" && parsed.type !== "habit";

  // Typed only a time (e.g. clicked a free slot)? Offer to put an existing task there.
  const slotOnly = !parsed.title && parsed.start !== undefined && parsed.day === 0;
  const placeable = slotOnly ? anytime.filter((t) => !t.done && !t.dayOffset).slice(0, 5) : [];

  const save = () => {
    if (!parsed.title) return;
    addParsed(parsed);
    close();
  };

  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-4">
        <Plus size={20} className="text-accent" />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") close();
          }}
          placeholder="What's next? e.g. “client call 9pm 45m #client”"
          className="flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted/70"
        />
      </div>

      <div className="min-h-[52px] border-t border-border bg-bg/60 px-5 py-3">
        {parsed.title || parsed.start !== undefined ? (
          <div className="flex flex-wrap items-center gap-2">
            <Chip>
              {area ? <AreaDot color={area.color} /> : <Tag size={12} />}
              {area?.name ?? (parsed.type === "backlog" ? "Inbox" : "Personal")}
            </Chip>
            {parsed.repeat && (
              <Chip className="text-accent">
                <Repeat size={12} /> {repeatLabel(parsed.repeat)} {untilPhrase(parsed.until)}
              </Chip>
            )}
            {parsed.start !== undefined && (
              <Chip>
                <CalendarClock size={12} />
                {!parsed.repeat && `${parsed.dayLabel} `}
                {fmtTime(parsed.start)} – {fmtTime(parsed.start + parsed.duration)}
              </Chip>
            )}
            {parsed.start === undefined && parsed.day > 0 && (
              <Chip>
                <CalendarClock size={12} /> {parsed.dayLabel}
              </Chip>
            )}
            {parsed.tonight && parsed.start === undefined && (
              <Chip>
                <CalendarClock size={12} /> Tonight
              </Chip>
            )}
            {parsed.due && <Chip className="text-attention">Due {parsed.due}</Chip>}
            {(parsed.durationExplicit || parsed.start !== undefined) && (
              <Chip>
                <Timer size={12} /> {fmtDuration(parsed.duration)}
              </Chip>
            )}
            {parsed.type !== "backlog" && <Chip className="text-muted">{TYPE_LABEL[parsed.type]}</Chip>}
            <div className="flex w-full items-center gap-1.5 pt-1 text-[12px] text-muted">
              <ArrowRight size={12} />
              {parsed.title ? (
                <>
                  {destination}
                  {needsTimeHint && <span className="opacity-80">· add a time like “7pm” to put it on the timeline</span>}
                </>
              ) : (
                "Now type what you'll do, then press Enter"
              )}
            </div>
            {placeable.length > 0 && (
              <div className="w-full pt-1">
                <div className="mb-1.5 text-[12px] text-muted">Or put one of these here:</div>
                <div className="flex flex-wrap gap-1.5">
                  {placeable.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        scheduleTask(t.id, parsed.start!);
                        close();
                      }}
                      className="rounded-md bg-surface px-2 py-1 text-[12.5px] transition-colors hover:text-accent"
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {clash && (
              <span className="flex w-full items-center gap-1.5 pt-1 text-[12px] text-attention">
                <AlertTriangle size={13} /> Overlaps with “{clash.title}” {fmtTime(clash.start)}–{fmtTime(clash.end)}. Both will show side by side.
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setText(ex);
                  input.current?.focus();
                }}
                className="rounded-md bg-surface px-2 py-1 text-[12px] text-muted transition-colors hover:text-text"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-border px-5 py-2 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <Kbd>Enter</Kbd> save
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd> close
        </span>
        <span className="ml-auto">#client · 9pm · 45m · tomorrow · fri · every day · weekdays</span>
      </div>
    </div>
  );
}

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-[12.5px] font-medium ${className}`}>
      {children}
    </span>
  );
}
