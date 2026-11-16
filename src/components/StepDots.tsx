// Progress through a short flow (setup, the evening ritual): one dot per step,
// the current one stretched, finished ones tinted.
import { cn } from "@/lib/utils";

export function StepDots({ count, current, className }: { count: number; current: number; className?: string }) {
  return (
    <div className={cn("flex gap-1.5", className)} role="img" aria-label={`Step ${current + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a dot's position is its identity
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === current ? "w-6 bg-accent" : i < current ? "w-1.5 bg-accent/50" : "w-1.5 bg-border",
          )}
        />
      ))}
    </div>
  );
}
