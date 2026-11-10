import { useMemo, useRef, useState } from "react";
import { useDismiss } from "@/lib/useDismiss";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const offsetOf = (d: Date) => Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Calendar button + month popover. Days with things you added show their area colors as dots. */
export function DayPicker({ selected, onPick }: { selected: number; onPick: (offset: number) => void }) {
  const [open, setOpen] = useState(() => import.meta.env.DEV && new URLSearchParams(location.search).has("cal"));
  const root = useRef<HTMLDivElement>(null);

  // Close on outside click or Esc (Esc must not also leave the Today view).
  useDismiss(open, () => setOpen(false), [root]);

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Pick a day"
        aria-expanded={open}
        title="Pick a day"
        className={cn(
          "grid size-8 place-items-center rounded-lg transition-colors",
          open ? "bg-surface-2 text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
        )}
      >
        <CalendarDays size={16} />
      </button>
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
    upcoming.forEach((b) => add(b.dayOffset, b.areaId));
    anytime.forEach((t) => t.dayOffset && add(t.dayOffset, t.areaId));
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
  const isCurrentMonth = cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth();
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <div>
      <div className="mb-2 flex items-center gap-1 px-1">
        <span className="flex-1 text-[13.5px] font-semibold">
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => shift(-1)}
          disabled={isCurrentMonth}
          aria-label="Previous month"
          className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={() => shift(1)}
          aria-label="Next month"
          className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEK.map((d) => (
          <div key={d} className="py-1 text-[10.5px] font-medium text-muted">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />;
          const offset = offsetOf(date);
          const past = offset < 0;
          const dots = marks.get(offset) ?? [];
          return (
            <button
              key={offset}
              disabled={past}
              onClick={() => onPick(offset)}
              title={dots.length ? "You added something here" : undefined}
              className={cn(
                "tabular relative flex h-9 flex-col items-center justify-center rounded-lg text-[12.5px] transition-colors",
                past && "text-muted/40",
                !past && offset !== selected && "hover:bg-surface-2",
                offset === selected && "bg-accent font-semibold text-accent-fg",
                offset === 0 && offset !== selected && "font-semibold text-accent",
              )}
            >
              {date.getDate()}
              {dots.length > 0 && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {dots.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className="size-1 rounded-full"
                      style={{ background: offset === selected ? "var(--accent-fg)" : c }}
                    />
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
        <button onClick={() => onPick(0)} className="font-medium text-accent hover:underline">
          Today
        </button>
      </div>
    </div>
  );
}
