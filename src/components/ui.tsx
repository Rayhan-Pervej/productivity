import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/time";
import { Select } from "./Select";

type Variant = "primary" | "secondary" | "ghost" | "success";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110",
  secondary: "bg-surface-2 text-text hover:bg-border/70",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
  success: "bg-success text-white hover:brightness-110 dark:text-[#0f1a14]",
};
const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12.5px] gap-1.5 rounded-md",
  md: "h-8 px-3 text-[13px] gap-2 rounded-lg",
  lg: "h-10 px-4 text-sm gap-2 rounded-lg",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ variant = "secondary", size = "md", className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
      VARIANTS[variant],
      SIZES[size],
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface px-1 font-sans text-[11px] text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function AreaDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export function useArea(id?: string) {
  return useApp((s) => s.areas.find((a) => a.id === id));
}

/** Calm circular progress. `value` 0..1 = how much is filled. */
export function ProgressRing({
  value,
  size = 120,
  stroke = 8,
  color = "var(--accent)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/** Centered modal window used by briefing, review, quick add. */
export function Modal({
  open,
  onClose,
  children,
  width = 480,
  align = "center",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  align?: "center" | "top";
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(
            "fixed inset-0 z-40 flex justify-center bg-black/25 px-4 backdrop-blur-[2px] dark:bg-black/45",
            align === "center" ? "items-center" : "items-start pt-[14vh]",
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            className="w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-soft"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, scale: 0.98, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-semibold tracking-[0.08em] text-muted uppercase", className)}>{children}</div>
  );
}

/** Time picker as a calm select, in `step`-minute increments. */
export function TimeSelect({
  value,
  onChange,
  from = 0,
  to = 24 * 60,
  step = 30,
  className,
  label,
}: {
  value: number;
  onChange: (m: number) => void;
  from?: number;
  to?: number;
  step?: number;
  className?: string;
  label?: string;
}) {
  const options: number[] = [];
  for (let m = from; m <= to; m += step) options.push(m);
  if (!options.includes(value)) options.push(value);
  options.sort((a, b) => a - b);
  return (
    <Select
      label={label ?? "Time"}
      value={value}
      onChange={onChange}
      className={className}
      options={options.map((m) => ({ value: m, label: fmtTime(m) }))}
    />
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-border")}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}
