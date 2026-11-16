// App state: one zustand store composed from slices (see ./slices), saved with `persist`.
// In the prototype this holds sample data in memory; later each action becomes a typed command to the Rust core.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useEffect, useState } from "react";
import { appStorage, markStorageReady } from "@/platform/storage";
import { isoDay } from "@/lib/time";
import { DEFAULT_REMINDER_SOUND, REMINDER_SOUNDS } from "@/lib/sounds";
import { currentCommitment, currentContext } from "@/lib/day";
import { DEFAULT_SETTINGS, rolloverDay } from "./day";
import { makeHelpers } from "./helpers";
import type { State } from "./types";
import { uiSlice } from "./slices/ui";
import { blocksSlice } from "./slices/blocks";
import { tasksSlice } from "./slices/tasks";
import { routinesSlice } from "./slices/routines";
import { plansSlice } from "./slices/plans";

export type { View, Overlay, NotificationKind, Theme, Triage } from "./types";

export const useApp = create<State>()(
  persist(
    (set, get) => {
      const helpers = makeHelpers(set, get);
      return {
        ...uiSlice(set, get, helpers),
        ...blocksSlice(set, get, helpers),
        ...tasksSlice(set, get, helpers),
        ...routinesSlice(set, get, helpers),
        ...plansSlice(set, get, helpers),
      };
    },
    {
      name: "productivity-prototype",
      // Desktop: the SQLite database in the Rust core. Browser (dev): localStorage.
      storage: createJSONStorage(() => appStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (!error) markStorageReady();
      },
      version: 3,
      // v3 removed the sample data: drop any saved day (it may contain samples) but keep your setup.
      migrate: (persisted, version) => {
        const p = { ...(persisted as Record<string, unknown>) };
        if (version < 3) {
          for (const key of ["blocks", "anytime", "inbox", "backlog", "upcoming", "dayKey"]) delete p[key];
        }
        return p as unknown as State;
      },
      // The window is destroyed on close, so the day must survive reopening.
      // (Moves to SQLite in the Rust core; localStorage is the bridge until then.)
      partialize: (s) => ({
        settings: s.settings,
        onboarded: s.onboarded,
        theme: s.theme,
        templates: s.templates,
        activeTemplateId: s.activeTemplateId,
        dayKey: s.dayKey,
        areas: s.areas,
        routines: s.routines,
        blocks: s.blocks,
        anytime: s.anytime,
        inbox: s.inbox,
        backlog: s.backlog,
        upcoming: s.upcoming,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const merged = { ...current, ...p };
        // Settings saved by older versions may miss newer fields.
        merged.settings = { ...DEFAULT_SETTINGS, ...merged.settings };
        // A sound removed in an update falls back to the default.
        if (!REMINDER_SOUNDS.some((s) => s.id === merged.settings.notificationSound))
          merged.settings.notificationSound = DEFAULT_REMINDER_SOUND;
        const today = isoDay();
        if (p.dayKey === today && p.blocks) return merged;
        return { ...merged, ...rolloverDay({ ...merged, dayKey: p.dayKey ?? "" }, today) };
      },
    },
  ),
);

/** True once the saved state has been loaded (from the database on desktop). */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(() => useApp.persist.hasHydrated());
  useEffect(() => {
    const unsubscribe = useApp.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useApp.persist.hasHydrated());
    return unsubscribe;
  }, []);
  return hydrated;
}

/** Resolves once the saved state has been loaded. */
export function whenHydrated() {
  return new Promise<void>((resolve) => {
    if (useApp.persist.hasHydrated()) return resolve();
    const unsubscribe = useApp.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

export const useCurrent = () => {
  const blocks = useApp((s) => s.blocks);
  const now = useApp((s) => s.now);
  return { commitment: currentCommitment(blocks, now), context: currentContext(blocks, now) };
};
