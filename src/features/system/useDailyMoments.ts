// Plan my day and Close my day: each opens by itself once a day, at its time, when the window is open.
// (With the window closed, a toast at the same time brings you here: see store/schedule.rs.)
// Closing one, however you close it, counts as done for today; the reminder side reads the same mark.
import { useEffect, useRef } from "react";
import { useApp } from "@/store/app";
import { isoDay } from "@/lib/time";
import { dayWindow } from "@/lib/scale";

export function useDailyMoments(hydrated: boolean) {
  const onboarded = useApp((s) => s.onboarded);
  const overlay = useApp((s) => s.overlay);
  const minute = useApp((s) => Math.floor(s.now));
  const settings = useApp((s) => s.settings);
  const { open, updateSettings } = useApp.getState();
  const today = isoDay();

  // Mark a moment as done for today when it closes.
  const previous = useRef(overlay);
  useEffect(() => {
    const was = previous.current;
    previous.current = overlay;
    if (was === "briefing" && overlay !== "briefing") updateSettings({ lastMorning: isoDay() });
    if (was === "review" && overlay !== "review") updateSettings({ lastEvening: isoDay() });
  }, [overlay, updateSettings]);

  // Open the one that's due, when nothing else is open.
  useEffect(() => {
    if (!hydrated || !onboarded || overlay !== null) return;
    const morning = dayWindow(settings.quietFrom, settings.quietTo).start;
    if (settings.planMyDay && settings.lastMorning !== today && minute >= morning && minute < settings.reviewAt) {
      open("briefing");
    } else if (settings.closeMyDay && settings.lastEvening !== today && minute >= settings.reviewAt) {
      open("review");
    }
  }, [hydrated, onboarded, overlay, minute, settings, today, open]);
}
