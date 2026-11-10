// The one dropdown used across the app. Keeps the native <select> (keyboard, accessibility,
// OS picker list) but replaces the browser's arrow with our own, evenly padded chevron.
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

type Size = "sm" | "md" | "lg";
type Variant = "outline" | "filled";

const SIZES: Record<Size, { box: string; text: string; chevron: number; pad: string }> = {
  sm: { box: "h-7", text: "text-[12.5px]", chevron: 13, pad: "pl-2.5 pr-7" },
  md: { box: "h-8", text: "text-[13px]", chevron: 14, pad: "pl-3 pr-8" },
  lg: { box: "h-10", text: "text-[13px]", chevron: 15, pad: "pl-3 pr-9" },
};

const VARIANTS: Record<Variant, string> = {
  outline: "border border-border bg-surface hover:border-muted focus-visible:border-accent",
  filled: "border border-transparent bg-surface-2 hover:bg-border/60",
};

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  label,
  size = "md",
  variant = "outline",
  leading,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  /** Accessible name. */
  label: string;
  size?: Size;
  variant?: Variant;
  /** Optional element inside the box on the left, e.g. a color dot. */
  leading?: ReactNode;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={cn("relative inline-flex shrink-0 items-center", className)}>
      {leading && <span className="pointer-events-none absolute left-2.5 flex items-center">{leading}</span>}
      <select
        aria-label={label}
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value);
          if (picked) onChange(picked.value);
        }}
        className={cn(
          "tabular w-full cursor-pointer appearance-none rounded-lg font-medium outline-none transition-colors",
          s.box,
          s.text,
          s.pad,
          leading && "pl-7",
          VARIANTS[variant],
        )}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={s.chevron} className="pointer-events-none absolute right-2.5 text-muted" aria-hidden />
    </span>
  );
}
