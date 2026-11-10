import { useEffect } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useApp, useHydrated } from "@/store/app";
import { SAVE_ERROR_EVENT } from "@/platform/storage";
import { isTyping } from "@/lib/utils";
import { setTimeFormat } from "@/lib/time";
import { isDesktop } from "@/platform/desktop";
import { ContextMenuHost, showMenu, wantsNativeMenu } from "@/components/ContextMenu";
import { DragBar } from "@/components/WindowChrome";
import { appMenu } from "@/features/menus";
import { currentCommitment } from "@/lib/day";
import { NavRail, TitleBar } from "@/components/layout";
import { TodayView } from "@/features/today/TodayView";
import { FocusView } from "@/features/focus/FocusView";
import { InboxView, PlansView, SettingsView } from "@/features/other/OtherViews";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { QuickAdd } from "@/features/overlays/QuickAdd";
import { BlockDetails } from "@/features/overlays/BlockDetails";
import { CommandPalette } from "@/features/overlays/CommandPalette";
import { CatchUp, EveningReview, MorningBriefing } from "@/features/overlays/Rituals";
import { DevPanel, NotificationPreview, Toaster, TrayPopover } from "@/features/overlays/DesktopSurfaces";

export default function App() {
  const view = useApp((s) => s.view);
  const onboarded = useApp((s) => s.onboarded);
  const hydrated = useHydrated();
  // Re-render everything when the clock format changes (formatters read it at render time).
  const timeFormat = useApp((s) => s.settings.timeFormat);
  setTimeFormat(timeFormat);
  useClock();
  useTheme();
  useShortcuts();
  useAppMenu();
  useSaveErrors();

  // Loading the saved state (a few ms from the database): show nothing rather than a wrong screen.
  if (!hydrated) return null;

  // First run: show only the setup, never the dashboard behind it.
  if (!onboarded) {
    return (
      <MotionConfig reducedMotion="user">
        <Onboarding />
        <DragBar />
        <Toaster />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <motion.div className="flex h-full flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <NavRail />
          <main className="relative min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                className="absolute inset-0 flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {view === "today" && <TodayView />}
                {view === "focus" && <div className="flex-1"><FocusView /></div>}
                {view === "inbox" && <div className="flex-1"><InboxView /></div>}
                {view === "plans" && <div className="flex-1"><PlansView /></div>}
                {view === "settings" && <div className="flex-1"><SettingsView /></div>}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </motion.div>

      <QuickAdd />
      <BlockDetails />
      <CommandPalette />
      <MorningBriefing />
      <EveningReview />
      <CatchUp />
      {!isDesktop && <TrayPopover />}
      {!isDesktop && <NotificationPreview />}
      <Toaster />
      <ContextMenuHost />
      {import.meta.env.DEV && <DevPanel />}
    </MotionConfig>
  );
}

/** If saving ever fails, say so (never fail silently with someone's data). */
function useSaveErrors() {
  useEffect(() => {
    const onError = () => useApp.getState().say("Couldn't save your last change. Retrying on the next one.");
    window.addEventListener(SAVE_ERROR_EVENT, onError);
    return () => window.removeEventListener(SAVE_ERROR_EVENT, onError);
  }, []);
}

/** Right-click anywhere not handled by a component: the app menu instead of the browser's. */
function useAppMenu() {
  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      if (e.defaultPrevented || wantsNativeMenu(e)) return;
      if (!useApp.getState().onboarded) return e.preventDefault();
      showMenu(e, appMenu());
    };
    window.addEventListener("contextmenu", onMenu);
    return () => window.removeEventListener("contextmenu", onMenu);
  }, []);
}

/** Advance the clock once a second while the window is visible. */
function useClock() {
  const tick = useApp((s) => s.tick);
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && tick(), 1000);
    return () => clearInterval(id);
  }, [tick]);
}

/** Apply light/dark, following Windows when set to "system". */
function useTheme() {
  const theme = useApp((s) => s.theme);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

/** Keyboard map: docs/07-ui-ux-design.md §14. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      if (!s.onboarded) return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.altKey && e.code === "Space") {
        e.preventDefault();
        return s.open("quickAdd");
      }
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        return s.overlay === "palette" ? s.close() : s.open("palette");
      }
      if (e.key === "Escape") {
        if (s.overlay) return s.close();
        if (s.view !== "today") return s.setView("today");
        return;
      }
      if (s.overlay || isTyping(e)) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        return s.undo();
      }
      if (mod || e.altKey) return;

      const views = { "1": "today", "2": "focus", "3": "inbox", "4": "plans", ",": "settings" } as const;
      if (e.key in views) return s.setView(views[e.key as keyof typeof views]);
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        return s.open("quickAdd");
      }
      if (e.key === " " && s.view === "today") {
        const current = currentCommitment(s.blocks, s.now);
        if (current) {
          e.preventDefault();
          s.completeBlock(current.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
