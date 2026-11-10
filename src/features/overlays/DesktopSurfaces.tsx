// Previews of surfaces that live outside the main window in the real app
// (system tray popover, Windows toast). In Tauri they become a tray window and
// native toasts; here they let us design and review them in the browser.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Check, Coffee, FlaskConical, Moon, MousePointer2, Plus, RotateCcw, Sun, Sunrise, X } from "lucide-react";
import { useApp, useCurrent, type NotificationKind } from "@/store/app";
import { isDesktop, previewNotification } from "@/platform/desktop";
import { dayProgress, missedBlocks, nextCommitment } from "@/lib/day";
import { fmtTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { AreaDot, Button, Kbd, ProgressRing, useArea } from "@/components/ui";
import type { Block } from "@/domain/types";

const panel = "fixed z-50 rounded-2xl border border-border bg-surface shadow-soft";
const pop = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.98 },
  transition: { duration: 0.16 },
};

export function TrayPopover() {
  const isOpen = useApp((s) => s.overlay === "tray");
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const { commitment, context } = useCurrent();
  const area = useArea(commitment?.areaId);
  const next = useMemo(() => nextCommitment(blocks, now), [blocks, now]);
  const { completeBlock, setView, open, close } = useApp.getState();
  const { ratio, done, total } = dayProgress(blocks);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div {...pop} className={cn(panel, "right-4 bottom-4 w-[300px] p-3")}>
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="tabular text-[11px] font-semibold tracking-wider text-muted uppercase">Now · {fmtTime(now)}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              {done}/{total}
              <ProgressRing value={ratio} size={18} stroke={3} />
            </span>
          </div>
          {commitment ? (
            <div className="rounded-xl bg-bg p-3">
              <div className="flex items-center gap-2 text-[13.5px] font-medium">
                <AreaDot color={area?.color ?? "#888"} /> <span className="truncate">{commitment.title}</span>
                <span className="tabular ml-auto shrink-0 text-[12px] text-muted">{Math.ceil(commitment.end - now)} min</span>
              </div>
              <div className="mt-2.5 flex gap-1.5">
                <Button size="sm" variant="success" className="flex-1" onClick={() => completeBlock(commitment.id)}>
                  <Check size={13} /> Done
                </Button>
                <Button size="sm" onClick={() => setView("focus")}>
                  Focus
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-bg p-3 text-[13px] text-muted">
              {context ? `${context.title} until ${fmtTime(context.end)}` : `Free time${next ? ` until ${fmtTime(next.start)}` : ""}`}
              {!context && (
                <button onClick={() => setView("focus")} className="mt-1 block font-medium text-accent">
                  What should I do? →
                </button>
              )}
            </div>
          )}
          {next && (
            <div className="mt-2 flex items-center gap-2 px-1 py-1.5 text-[12.5px]">
              <span className="text-muted">Next</span>
              <span className="tabular text-muted">{fmtTime(next.start)}</span>
              <span className="truncate">{next.title}</span>
            </div>
          )}
          <div className="mt-1 border-t border-border pt-1.5">
            <TrayItem icon={<Plus size={14} />} label="Quick add" hint="Ctrl Alt Space" onClick={() => open("quickAdd")} />
            <TrayItem icon={<CalendarDays size={14} />} label="Open Today" onClick={() => { setView("today"); close(); }} />
            <TrayItem icon={<Moon size={14} />} label="Close my day" onClick={() => open("review")} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TrayItem({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2">
      <span className="text-muted">{icon}</span>
      {label}
      {hint && <Kbd className="ml-auto">{hint}</Kbd>}
    </button>
  );
}

/** Mimics a Windows 11 toast. Copy follows docs/07-ui-ux-design.md §8. */
export function NotificationPreview() {
  const isOpen = useApp((s) => s.overlay === "notification");
  const kind = useApp((s) => s.notificationKind);
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  const lead = useApp((s) => s.settings.leadMinutes);
  const { commitment } = useCurrent();

  const target: Block | undefined = useMemo(() => {
    if (kind === "upcoming") return nextCommitment(blocks, now);
    if (kind === "missed") return missedBlocks(blocks, now)[0];
    return commitment;
  }, [kind, blocks, now, commitment]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="fixed right-4 bottom-4 z-50 w-[364px] rounded-lg border border-border bg-surface-2 p-3.5 shadow-soft"
        >
          {target ? <Toast kind={kind} block={target} now={now} lead={lead} /> : <NoTarget kind={kind} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ToastHeader() {
  const close = useApp((s) => s.close);
  return (
    <div className="flex items-center gap-2 text-[11.5px] text-muted">
      <span className="grid size-4 place-items-center rounded bg-accent text-[9px] font-bold text-accent-fg">P</span>
      Productivity
      <button onClick={close} className="ml-auto hover:text-text" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

function NoTarget({ kind }: { kind: NotificationKind }) {
  return (
    <>
      <ToastHeader />
      <p className="mt-2 text-[12.5px] text-muted">
        No block fits a “{kind}” notification at this time. Move the prototype clock to try it.
      </p>
    </>
  );
}

function Toast({ kind, block, now, lead }: { kind: NotificationKind; block: Block; now: number; lead: number }) {
  const area = useArea(block.areaId);
  const { completeBlock, skipBlock, extendBlock, setView, triage, close, say } = useApp.getState();
  const act = (fn: () => void) => () => {
    fn();
    close();
  };
  const snooze = act(() => say(`Snoozed · ${block.title} · 10 min`));

  const content: Record<NotificationKind, { title: string; body: string; buttons: [string, () => void][] }> = {
    upcoming: {
      title: block.title,
      body: `Starts in ${Math.max(1, Math.min(lead, Math.round(block.start - now)))} min · ${fmtTime(block.start)} – ${fmtTime(block.end)}`,
      buttons: [["Start", act(() => setView("today"))], ["Snooze", snooze], ["Skip", act(() => skipBlock(block.id))]],
    },
    starting: {
      title: `Time for ${area?.name ?? block.title}`,
      body: block.title,
      buttons: [["Start focus", act(() => setView("focus"))], ["Snooze", snooze], ["Skip", act(() => skipBlock(block.id))]],
    },
    ending: {
      title: `${area?.name ?? "Your"} block is ending`,
      body: `Is ${block.title} done?`,
      buttons: [["Done", act(() => completeBlock(block.id))], ["+10 min", act(() => extendBlock(block.id, 10))], ["Not yet", close]],
    },
    missed: {
      title: `${block.title} didn't happen`,
      body: "Want to find it a new spot?",
      buttons: [["Tomorrow", act(() => triage(block.id, "tomorrow"))], ["Backlog", act(() => triage(block.id, "backlog"))], ["Open", act(() => setView("today"))]],
    },
  };
  const c = content[kind];

  return (
    <>
      <ToastHeader />
      <div className="mt-2.5 flex gap-2.5">
        <span className="mt-1 h-9 w-1 shrink-0 rounded-full" style={{ background: area?.color }} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold">{c.title}</div>
          <div className="tabular truncate text-[13px] text-muted">{c.body}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {c.buttons.map(([label, fn]) => (
          <button key={label} onClick={fn} className="h-8 rounded-md bg-surface text-[12.5px] font-medium transition-colors hover:bg-border">
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

/** "Added · Undo" feedback toast, bottom center. */
export function Toaster() {
  const toast = useApp((s) => s.toast);
  const { undo, dismissToast } = useApp.getState();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 4000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[80] -translate-x-1/2">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex items-center gap-3 rounded-xl bg-text py-2 pr-2 pl-4 text-[13px] text-bg shadow-soft"
          >
            <span className="max-w-[340px] truncate">{toast.message}</span>
            {toast.canUndo ? (
              <button onClick={undo} className="rounded-md px-2 py-1 font-semibold text-accent hover:bg-white/10">
                Undo
              </button>
            ) : (
              <span className="w-1" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Prototype-only controls: simulate the clock and open desktop surfaces. Removed in the Tauri build. */
export function DevPanel() {
  const [open, setOpen] = useState(false);
  const now = useApp((s) => s.now);
  const simulated = useApp((s) => s.simulated);
  const theme = useApp((s) => s.theme);
  const s = useApp.getState();
  const presets: [string, number][] = [
    ["Morning", 7 * 60 + 30],
    ["At office", 11 * 60],
    ["Free", 20 * 60 + 40],
    ["Client", 21 * 60 + 25],
    ["Late", 23 * 60 + 50],
  ];

  return (
    <div className="fixed bottom-4 left-[88px] z-[55] max-[820px]:left-4">
      <AnimatePresence>
        {open && (
          <motion.div {...pop} className={cn(panel, "relative bottom-2 w-[300px] p-4")}>
            <div className="text-[12px] font-semibold">Prototype controls</div>
            <label className="mt-3 block text-[12px] text-muted">
              Clock · <span className="tabular text-text">{fmtTime(now)}</span> {simulated ? "(simulated)" : "(live)"}
            </label>
            <input
              type="range"
              min={6 * 60}
              max={24 * 60 - 1}
              step={5}
              value={Math.floor(now)}
              onChange={(e) => s.simulate(Number(e.target.value))}
              className="mt-1 w-full accent-[var(--accent)]"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {presets.map(([label, m]) => (
                <button key={label} onClick={() => s.simulate(m)} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] hover:text-accent">
                  {label}
                </button>
              ))}
              <button onClick={() => s.simulate(null)} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] hover:text-accent">
                Live
              </button>
            </div>

            <div className="mt-4 text-[11px] font-semibold tracking-wider text-muted uppercase">
              Windows notification {isDesktop && <span className="font-normal tracking-normal normal-case">· real toast</span>}
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-1">
              {(["upcoming", "starting", "ending", "missed"] as NotificationKind[]).map((k) => (
                <button key={k} onClick={() => (isDesktop ? void previewNotification(k) : s.notify(k))} className="rounded-md bg-surface-2 py-1 text-[11px] capitalize hover:text-accent">
                  {k}
                </button>
              ))}
            </div>

            <div className="mt-4 text-[11px] font-semibold tracking-wider text-muted uppercase">Moments</div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <Button size="sm" onClick={() => s.open("briefing")}><Sunrise size={13} /> Morning</Button>
              <Button size="sm" onClick={() => s.open("review")}><Moon size={13} /> Evening review</Button>
              <Button size="sm" onClick={() => s.open("catchup")}><Coffee size={13} /> Wake from sleep</Button>
              {!isDesktop && <Button size="sm" onClick={() => s.open("tray")}><MousePointer2 size={13} /> Tray</Button>}
              <Button size="sm" onClick={s.restartOnboarding}><RotateCcw size={13} /> First run</Button>
              <Button size="sm" onClick={() => s.setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />} Theme
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
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
