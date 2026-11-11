// A date field that matches the app's dropdowns, with an optional ✕ to clear it.
// Empty, it reads as a friendly placeholder ("No end date") instead of "mm/dd/yyyy";
// clicking it opens the native calendar.
import { useRef } from "react";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function DateInput({
  value,
  onChange,
  label,
  min,
  placeholder = "No end date",
  className,
}: {
  /** "2026-11-30", or undefined for empty. */
  value?: string;
  onChange: (value: string | undefined) => void;
  label: string;
  min?: string;
  placeholder?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const box = "h-8 rounded-lg border border-border bg-surface text-[13px] font-medium transition-colors hover:border-muted";

  return (
    <span className={cn("relative inline-flex h-8 items-center", className)}>
      <input
        ref={input}
        type="date"
        aria-label={label}
        value={value ?? ""}
        min={min}
        onChange={(e) => onChange(e.target.value || undefined)}
        // Empty: stays in the DOM (so its calendar can open) but hidden behind the placeholder button.
        tabIndex={value ? 0 : -1}
        className={cn(
          "tabular cursor-pointer pr-8 pl-3 outline-none focus-visible:border-accent",
          box,
          !value && "pointer-events-none absolute inset-0 opacity-0",
        )}
      />
      {!value && (
        <button
          type="button"
          aria-label={`${label}: ${placeholder}`}
          onClick={() => input.current?.showPicker?.()}
          className={cn("flex items-center gap-2 px-3 text-muted hover:text-text", box)}
        >
          <CalendarDays size={14} /> {placeholder}
        </button>
      )}
      {value && (
        <button
          type="button"
          aria-label="Remove end date"
          title={placeholder}
          onClick={() => onChange(undefined)}
          className="absolute right-1.5 grid size-5 place-items-center rounded text-muted hover:bg-surface-2 hover:text-text"
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
