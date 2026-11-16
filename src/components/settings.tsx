// Shared settings building blocks, used by both Settings and onboarding,
// so the same choice always looks and behaves the same.
import type { ReactNode } from "react";
import { Monitor, Moon, Play, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Theme } from "@/store/app";
import type { TimeFormat } from "@/lib/time";
import { REMINDER_SOUNDS, playSound } from "@/lib/sounds";
import { SegmentedControl } from "./SegmentedControl";
import { Select } from "./Select";
import { IconButton } from "./IconButton";

/** A rounded card that stacks setting rows with dividers. */
export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border rounded-2xl border border-border bg-surface", className)}>{children}</div>;
}

/** Label on the left, control on the right, vertically centered. */
export function SettingRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5 text-[13.5px]">
      <span>{label}</span>
      {children}
    </div>
  );
}

export const LEAD_MINUTES = [5, 10, 15] as const;

export function LeadMinutesControl({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <SegmentedControl
      label="Remind me before"
      value={value}
      onChange={onChange}
      options={LEAD_MINUTES.map((m) => ({ value: m, label: `${m} min` }))}
    />
  );
}

export function ThemeControl({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  return (
    <SegmentedControl
      label="Theme"
      value={value}
      onChange={onChange}
      options={[
        { value: "system", label: "System", icon: <Monitor size={14} /> },
        { value: "light", label: "Light", icon: <Sun size={14} /> },
        { value: "dark", label: "Dark", icon: <Moon size={14} /> },
      ]}
    />
  );
}

export function ClockControl({ value, onChange }: { value: TimeFormat; onChange: (f: TimeFormat) => void }) {
  return (
    <SegmentedControl
      label="Clock format"
      value={value}
      onChange={onChange}
      options={[
        { value: "12h", label: "12-hour · 9:30 PM" },
        { value: "24h", label: "24-hour · 21:30" },
      ]}
    />
  );
}

/** Pick a sound; choosing one plays it, and the play button replays it. */
export function SoundControl({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const silent = value === "none";
  return (
    <span className="flex items-center gap-1.5">
      <Select
        label="Reminder sound"
        value={value}
        onChange={(id) => {
          onChange(id);
          playSound(id);
        }}
        options={REMINDER_SOUNDS.map((s) => ({ value: s.id, label: s.label }))}
        className="w-44"
      />
      <IconButton variant="outline" label="Play sound" onClick={() => playSound(value)} disabled={silent} icon={<Play size={13} />} />
    </span>
  );
}
