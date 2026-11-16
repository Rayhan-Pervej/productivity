// Prototype controls (dev builds only): simulate the clock, fire real toasts, play sounds,
// open the daily moments. Never shipped: App renders it only when import.meta.env.DEV.
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  FlaskConical,
  Moon,
  MousePointer2,
  RotateCcw,
  Sun,
  Sunrise,
  Volume2,
  X,
} from "lucide-react";
import { useApp, type NotificationKind } from "@/store/app";
import { isDesktop, previewNotification } from "@/platform/desktop";
import { fmtTime } from "@/lib/time";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { panel, pop } from "@/components/surface";

/** Prototype controls: in dev builds (browser and `pnpm tauri dev`), never in the installed app. */
export function DevPanel() {
  const [open, setOpen] = useState(false);
  const now = useApp((s) => s.now);
  const simulated = useApp((s) => s.simulated);
  const theme = useApp((s) => s.theme);
  const blocks = useApp((s) => s.blocks);
  const settings = useApp((s) => s.settings);
  const s = useApp.getState();

  // Jump through your real day: every start and end of today's blocks.
  const stops = useMemo(() => [...new Set(blocks.flatMap((b) => [b.start, b.end]))].sort((a, b) => a - b), [blocks]);
  const minute = Math.floor(now);
  const prev = [...stops].reverse().find((m) => m < minute);
  const next = stops.find((m) => m > minute);
  const at = blocks
    .filter((b) => b.start <= now && now < b.end)
    .sort((a, b) => (a.kind === "commitment" ? -1 : 1) - (b.kind === "commitment" ? -1 : 1))[0];
  const chip = "rounded bg-surface-2 px-1.5 py-0.5 text-[11px] hover:text-accent disabled:opacity-40 disabled:hover:text-inherit";

  return (
    <div className="fixed bottom-4 left-[88px] z-[55] max-[900px]:left-[68px]">
      <AnimatePresence>
        {open && (
          <motion.div {...pop} className={cn(panel, "relative bottom-2 w-[300px] p-4")}>
            <div className="text-[12px] font-semibold">Prototype controls</div>
            <div className="mt-3 block text-[12px] text-muted">
              Clock · <span className="tabular text-text">{fmtTime(now)}</span> {simulated ? "(simulated)" : "(live)"}
              <span className="block truncate">{at ? `In: ${at.title}` : "Between blocks"}</span>
            </div>
            <input
              type="range"
              aria-label="Simulated clock"
              min={0}
              max={24 * 60}
              step={5}
              value={Math.floor(now)}
              onChange={(e) => s.simulate(Number(e.target.value))}
              className="mt-1 w-full accent-[var(--accent)]"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              <button
                type="button"
                disabled={prev === undefined}
                onClick={() => prev !== undefined && s.simulate(prev)}
                className={cn(chip, "flex items-center")}
                title="Previous start or end of a block"
              >
                <ChevronLeft size={12} /> {prev !== undefined ? fmtTime(prev) : "Prev"}
              </button>
              <button
                type="button"
                disabled={next === undefined}
                onClick={() => next !== undefined && s.simulate(next)}
                className={cn(chip, "flex items-center")}
                title="Next start or end of a block"
              >
                {next !== undefined ? fmtTime(next) : "Next"} <ChevronRight size={12} />
              </button>
              <button
                type="button"
                onClick={() => s.simulate((settings.quietFrom + 60) % (24 * 60))}
                className={chip}
                title="One hour into your quiet hours"
              >
                Quiet hours
              </button>
              <button type="button" onClick={() => s.simulate(null)} className={chip}>
                Live
              </button>
            </div>
            <p className="mt-1.5 text-[10.5px] text-muted">Changes what the app shows. Real reminders still follow the real clock.</p>

            <div className="mt-4 text-[11px] font-semibold tracking-wider text-muted uppercase">
              Windows notification {isDesktop && <span className="font-normal tracking-normal normal-case">· real toast</span>}
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-1">
              {(["upcoming", "starting", "ending", "missed"] as NotificationKind[]).map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => (isDesktop ? void previewNotification(k) : s.notify(k))}
                  className="rounded-md bg-surface-2 py-1 text-[11px] capitalize hover:text-accent"
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="mt-4 text-[11px] font-semibold tracking-wider text-muted uppercase">Sounds</div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <Button size="sm" onClick={() => playSound(settings.notificationSound)}>
                <Volume2 size={13} /> Reminder
              </Button>
              <Button size="sm" onClick={() => playSound("done")}>
                <Check size={13} /> Done
              </Button>
            </div>

            <div className="mt-4 text-[11px] font-semibold tracking-wider text-muted uppercase">Moments</div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <Button size="sm" onClick={() => s.open("briefing")}>
                <Sunrise size={13} /> Morning
              </Button>
              <Button size="sm" onClick={() => s.open("review")}>
                <Moon size={13} /> Evening review
              </Button>
              <Button size="sm" onClick={() => s.open("catchup")}>
                <Coffee size={13} /> Wake from sleep
              </Button>
              {!isDesktop && (
                <Button size="sm" onClick={() => s.open("tray")}>
                  <MousePointer2 size={13} /> Tray
                </Button>
              )}
              <Button size="sm" onClick={s.restartOnboarding} title="Runs setup again. Keeps your data.">
                <RotateCcw size={13} /> Setup again
              </Button>
              <Button size="sm" onClick={() => s.setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />} Theme
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Prototype controls"
        className={cn(
          "grid size-9 place-items-center rounded-full border border-border bg-surface shadow-soft transition-colors hover:text-accent",
          open ? "text-accent" : "text-muted",
        )}
      >
        {open ? <X size={16} /> : <FlaskConical size={16} />}
      </button>
    </div>
  );
}
