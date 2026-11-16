// The one icon-only button used across the app (block actions, calendar, play, panel toggles).
// Always has an accessible label, which is also its tooltip.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";
type Tone = "default" | "danger";
type Variant = "ghost" | "outline";

const SIZES: Record<Size, string> = {
  sm: "size-6 rounded-md", // inside dense rows (block hover actions)
  md: "size-8 rounded-lg", // toolbars and settings
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible name and tooltip. */
  label: string;
  icon: ReactNode;
  size?: Size;
  tone?: Tone;
  variant?: Variant;
  /** Pressed or open state (e.g. its popover is showing). */
  active?: boolean;
  /** Keep the click from reaching a clickable parent (e.g. a block that opens its details). */
  isolate?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { label, icon, size = "md", tone = "default", variant = "ghost", active = false, isolate = false, className, onClick, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        if (isolate) e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        "grid shrink-0 cursor-pointer place-items-center transition-colors disabled:cursor-default disabled:opacity-40",
        SIZES[size],
        variant === "outline" && "border border-border bg-surface hover:border-muted",
        active
          ? "bg-surface-2 text-accent"
          : tone === "danger"
            ? "text-muted hover:bg-danger/10 hover:text-danger"
            : cn("text-muted hover:text-text", variant === "ghost" && "hover:bg-surface-2"),
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  ),
);
IconButton.displayName = "IconButton";
