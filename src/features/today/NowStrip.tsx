// Narrower windows: the Now panel folded into one strip above the timeline.
// Folded, it's the summary (now · next · what's waiting). Click to unfold the detail in place,
// built from the same sections as the wide side panel, so nothing is shown twice or differently.
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { useApp, useCurrent } from "@/store/app";
import { freeWindow } from "@/lib/day";
import { fmtDuration, fmtTime } from "@/lib/time";
import { useDismiss } from "@/lib/useDismiss";
import { cn } from "@/lib/utils";
import { Button, SectionLabel } from "@/components/ui";
import { AnytimeSection, Missed, NowSection, useTodayLists } from "./ContextPanel";

export function NowStrip() {
  const [open, setOpen] = useState(() => import.meta.env.DEV && new URLSearchParams(location.search).has("strip"));
  const root = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), [root]);

  const { missed } = useTodayLists();
  const toggle = () => setOpen((o) => !o);
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return; // keys inside the Done button are its own
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    // The detail drops down *over* the timeline (like a menu), so the timeline never resizes or scrolls.
    <div ref={root} className="@container relative z-30 mx-6 mt-3">
      {/* biome-ignore lint/a11y/useSemanticElements: it holds a Done button, and buttons can't nest */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? "Fold the Now panel" : "Unfold the Now panel"}
        onClick={toggle}
        onKeyDown={onKey}
        className={cn(
          "flex min-h-11 cursor-pointer items-center gap-4 border border-border bg-surface px-4 py-1.5 text-[13px] transition-colors hover:bg-surface-2",
          open ? "rounded-t-xl" : "rounded-xl",
        )}
      >
        <Summary folded={!open} />
        <Counts />
        <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform duration-200", open && "rotate-180")} />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute inset-x-0 top-full overflow-hidden rounded-b-xl border border-t-0 border-border bg-surface shadow-soft"
          >
            {/* overscroll-contain: scrolling inside stops at the edges instead of moving the timeline behind. */}
            <div className="grid max-h-[min(440px,60vh)] grid-cols-2 gap-6 overflow-y-auto overscroll-contain border-t border-border p-4 @max-[620px]:grid-cols-1">
              {/* The header already says "Now", so the card goes without its label here. */}
              <NowSection label={false} />
              <div className="flex min-w-0 flex-col gap-6">
                <AnytimeSection />
                {missed.length > 0 && <Missed blocks={missed} />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Now (with a Done button while folded) and Next. Next gives way first on a narrow strip. */
function Summary({ folded }: { folded: boolean }) {
  const { commitment, context } = useCurrent();
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const completeBlock = useApp((s) => s.completeBlock);
  const { next } = useTodayLists();
  const free = freeWindow(blocks, now);

  let current: ReactNode;
  if (commitment) {
    current = (
      <>
        <span className="truncate font-medium">{commitment.title}</span>
        <span className="tabular shrink-0 text-[12.5px] text-muted">{fmtDuration(Math.max(1, Math.ceil(commitment.end - now)))} left</span>
      </>
    );
  } else if (context) {
    current = (
      <span className="truncate text-muted">
        <span className="font-medium text-text">{context.title}</span> until {fmtTime(context.end)}
      </span>
    );
  } else {
    current = (
      <span className="truncate text-muted">{free.nextAny ? `Free until ${fmtTime(free.until)}` : "Free for the rest of the day"}</span>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <span className="flex min-w-0 items-center gap-2">
        <Label>Now</Label>
        {current}
        {commitment && folded && (
          <Button
            size="sm"
            variant="success"
            className="ml-1 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              completeBlock(commitment.id);
            }}
          >
            <Check size={13} /> Done
          </Button>
        )}
      </span>
      {next && next.id !== commitment?.id && (
        <span className="flex min-w-0 items-center gap-2 @max-[560px]:hidden">
          <Label>Next · {fmtTime(next.start)}</Label>
          <span className="truncate font-medium">{next.title}</span>
          <span className="tabular shrink-0 text-[12.5px] text-muted">in {fmtDuration(next.start - now)}</span>
        </span>
      )}
    </div>
  );
}

/** What's waiting inside, so you know before unfolding. */
function Counts() {
  const { pending, missed } = useTodayLists();
  if (!pending.length && !missed.length) return null;
  return (
    <span className="tabular flex shrink-0 items-center gap-1.5 text-[12px] text-muted @max-[440px]:hidden">
      {pending.length > 0 && <span title="Anytime tasks for today">{pending.length} anytime</span>}
      {pending.length > 0 && missed.length > 0 && <span>·</span>}
      {missed.length > 0 && (
        <span className="flex items-center gap-1 text-attention" title="Things that need a new spot">
          <span className="size-1.5 rounded-full bg-attention" /> {missed.length} missed
        </span>
      )}
    </span>
  );
}

/** The shared section label, kept on one line inside the strip. */
function Label({ children }: { children: ReactNode }) {
  return <SectionLabel className="shrink-0 whitespace-nowrap">{children}</SectionLabel>;
}
