// One switcher for every "pick one of a few" choice: theme, clock format, reminder lead,
// day tabs. Same height, padding and selected style everywhere; the highlight slides.
import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Small accent dot after the label, e.g. "something was added here". */
  dot?: boolean;
  /** Makes the segment closable (shows an ×). */
  onClose?: () => void;
  title?: string;
}

type Size = "sm" | "md";

const SIZES: Record<Size, { item: string; text: string }> = {
  sm: { item: "h-6 px-2.5", text: "text-[12px]" },
  md: { item: "h-7 px-3", text: "text-[12.5px]" },
};

export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  /** Accessible name for the group. */
  label: string;
  size?: Size;
  className?: string;
}) {
  const highlightId = useId();
  const s = SIZES[size];

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <div key={String(o.value)} className="relative flex items-center">
            {active && (
              <motion.span
                layoutId={highlightId}
                className="absolute inset-0 rounded-md bg-surface shadow-soft"
                transition={{ type: "spring", duration: 0.3, bounce: 0.12 }}
              />
            )}
            <button
              type="button"
              role="radio"
              aria-checked={active}
              title={o.title}
              onClick={() => onChange(o.value)}
              className={cn(
                "relative flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors",
                s.item,
                s.text,
                o.onClose && "pr-1",
                active ? "text-text" : "text-muted hover:text-text",
              )}
            >
              {o.icon}
              {o.label}
              {o.dot && <span className="size-1.5 rounded-full bg-accent" aria-label="has items" />}
            </button>
            {o.onClose && (
              <button
                type="button"
                onClick={o.onClose}
                aria-label="Close"
                className="relative mr-1 grid size-5 place-items-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
