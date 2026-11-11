// Pick the weekdays something repeats on: seven round chips, Monday first, plus quick presets.
import type { Weekday } from "@/domain/types";
import { EVERY_DAY, WEEKDAYS, WEEKDAY_LONG, WEEKDAY_SHORT, WEEKENDS, WEEK_ORDER, isSameDays, normalizeDays } from "@/lib/repeat";
import { cn } from "@/lib/utils";

export function WeekdayPicker({
  value,
  onChange,
  presets = true,
  className,
}: {
  value: Weekday[];
  onChange: (days: Weekday[]) => void;
  /** Show "Every day / Weekdays / Weekends" shortcuts. */
  presets?: boolean;
  className?: string;
}) {
  const toggle = (d: Weekday) =>
    onChange(normalizeDays(value.includes(d) ? value.filter((x) => x !== d) : [...value, d]));

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <div role="group" aria-label="Repeat on" className="flex gap-1">
        {WEEK_ORDER.map((d) => {
          const on = value.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              title={WEEKDAY_LONG[d]}
              onClick={() => toggle(d)}
              className={cn(
                "grid size-8 place-items-center rounded-full text-[12px] font-semibold transition-colors",
                on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-text",
              )}
            >
              {WEEKDAY_SHORT[d].slice(0, 2)}
            </button>
          );
        })}
      </div>
      {presets && (
        <div className="flex gap-1">
          {([
            ["Every day", EVERY_DAY],
            ["Weekdays", WEEKDAYS],
            ["Weekends", WEEKENDS],
          ] as const).map(([label, days]) => (
            <button
              key={label}
              type="button"
              onClick={() => onChange([...days])}
              className={cn(
                "h-7 rounded-md px-2 text-[11.5px] font-medium transition-colors",
                isSameDays(value, [...days]) ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
