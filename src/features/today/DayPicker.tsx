import { useMemo, useRef, useState } from "react";
import { useDismiss } from "@/lib/useDismiss";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import { daysBetween, startOfDay } from "@/lib/time";
import { IconButton } from "@/components/IconButton";

const offsetOf = (d: Date) => daysBetween(new Date(), d);
const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
/** How far back history can be viewed (read only). */
const HISTORY_DAYS = 60;

/** Calendar button + month popover. Days with things you added show their area colors as dots. */
export function DayPicker({ selected, onPick }: { selected: number; onPick: (offset: number) => void }) {
  const [open, setOpen] = useState(() => import.meta.env.DEV && new URLSearchParams(location.search).has("cal"));
  const root = useRef<HTMLDivElement>(null);

  // Close on outside click or Esc (Esc must not also leave the Today view).
  useDismiss(open, () => setOpen(false), [root]);

  return (
    <div ref={root} className="relative">
      <IconButton label="Pick a day" active={open} aria-expanded={open} onClick={() => setOpen(!open)} icon={<CalendarDays size={16} />} />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute top-10 left-0 z-40 w-[288px] rounded-2xl border border-border bg-surface p-3 shadow-soft"
          >
            <Month
              selected={selected}
              onPick={(o) => {
                onPick(o);
                setOpen(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Month({ selected, onPick }: { selected: number; onPick: (offset: number) => void }) {
  const today = startOfDay(new Date());
  const selectedDate = new Date(today);
  selectedDate.setDate(today.getDate() + selected);
  const [cursor, setCursor] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  const upcoming = useApp((s) => s.upcoming);
  const anytime = useApp((s) => s.anytime);
  const areas = useApp((s) => s.areas);

  /** Area colors of what you added, per day offset. */
  const marks = useMemo(() => {
    const map = new Map<number, string[]>();
    const add = (offset: number, areaId?: string) => {
      const color = areas.find((a) => a.id === areaId)?.color ?? "var(--accent)";
      const list = map.get(offset) ?? [];
      if (!list.includes(color)) list.push(color);
      map.set(offset, list);
    };
    for (const b of upcoming) add(b.dayOffset, b.areaId);
    for (const t of anytime) if (t.dayOffset) add(t.dayOffset, t.areaId);
    return map;
  }, [upcoming, anytime, areas]);

  // Monday-first grid for the cursor month.
  const first = new Date(cursor);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];
  const oldest = new Date(today);
  oldest.setDate(today.getDate() - HISTORY_DAYS);
  const atOldestMonth = cursor.getFullYear() * 12 + cursor.getMonth() <= oldest.getFullYear() * 12 + oldest.getMonth();
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <div>
      <div className="mb-2 flex items-center gap-1 px-1">
        <span className="flex-1 text-[13.5px] font-semibold">
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <IconButton
          label="Previous month"
          className="size-7"
          disabled={atOldestMonth}
          onClick={() => shift(-1)}
          icon={<ChevronLeft size={15} />}
        />
        <IconButton label="Next month" className="size-7" onClick={() => shift(1)} icon={<ChevronRight size={15} />} />
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEK.map((d) => (
          <div key={d} className="py-1 text-[10.5px] font-medium text-muted">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          // biome-ignore lint/suspicious/noArrayIndexKey: empty leading cells; their position is their identity
          if (!date) return <div key={`e${i}`} />;
          const offset = offsetOf(date);
          const past = offset < 0;
          const outOfRange = offset < -HISTORY_DAYS;
          const dots = marks.get(offset) ?? [];
          return (
            <button
              type="button"
              key={offset}
              disabled={outOfRange}
              onClick={() => onPick(offset)}
              title={past ? (outOfRange ? undefined : "View this day") : dots.length ? "You added something here" : undefined}
              className={cn(
                "tabular relative flex h-9 flex-col items-center justify-center rounded-lg text-[12.5px] transition-colors",
                outOfRange && "text-muted/30",
                past && !outOfRange && offset !== selected && "text-muted hover:bg-surface-2 hover:text-text",
                !past && offset !== selected && "hover:bg-surface-2",
                offset === selected && "bg-accent font-semibold text-accent-fg",
                offset === 0 && offset !== selected && "font-semibold text-accent",
              )}
            >
              {date.getDate()}
              {dots.length > 0 && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {dots.slice(0, 3).map((c) => (
                    <span key={c} className="size-1 rounded-full" style={{ background: offset === selected ? "var(--accent-fg)" : c }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border px-1 pt-2 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-accent" /> = you added something
        </span>
        <button type="button" onClick={() => onPick(0)} className="font-medium text-accent hover:underline">
          Today
        </button>
      </div>
    </div>
  );
}
