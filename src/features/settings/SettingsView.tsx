// Settings: you, reminders, areas, your data, and system.
import { useEffect, useState } from "react";
import { canAutostart, dataInfo, exportData, getAutostart, isDesktop, setAutostart, type DataInfo } from "@/platform/desktop";
import { Download, RotateCcw } from "lucide-react";
import { useApp } from "@/store/app";
import { Button, Kbd, SectionLabel, Switch, TimeSelect } from "@/components/ui";
import { ClockControl, LeadMinutesControl, SettingRow, SettingsGroup, SoundControl, ThemeControl } from "@/components/settings";
import { Page } from "@/components/Page";

export function SettingsView() {
  const theme = useApp((s) => s.theme);
  const settings = useApp((s) => s.settings);
  const areas = useApp((s) => s.areas);
  const { setTheme, updateSettings, restartOnboarding } = useApp.getState();

  return (
    <Page title="Settings" subtitle="Make it yours.">
      <SectionLabel>You</SectionLabel>
      <SettingsGroup className="mt-3">
        <SettingRow label="Name">
          <input
            value={settings.name}
            onChange={(e) => updateSettings({ name: e.target.value })}
            placeholder="Your name"
            className="h-8 w-48 rounded-lg border border-border bg-surface px-2.5 text-right text-[13px] outline-none focus:border-accent"
          />
        </SettingRow>
        <SettingRow label="Theme">
          <ThemeControl value={theme} onChange={setTheme} />
        </SettingRow>
        <SettingRow label="Clock">
          <ClockControl value={settings.timeFormat} onChange={(timeFormat) => updateSettings({ timeFormat })} />
        </SettingRow>
      </SettingsGroup>

      <SectionLabel className="mt-10">Reminders</SectionLabel>
      <SettingsGroup className="mt-3">
        <SettingRow label="Remind me before tracked blocks">
          <LeadMinutesControl value={settings.leadMinutes} onChange={(leadMinutes) => updateSettings({ leadMinutes })} />
        </SettingRow>
        <SettingRow label="Reminder sound">
          <SoundControl value={settings.notificationSound} onChange={(notificationSound) => updateSettings({ notificationSound })} />
        </SettingRow>
        <SettingRow label="Sound when I finish something">
          <Switch
            label="Sound when I finish something"
            checked={settings.completionSound}
            onChange={(completionSound) => updateSettings({ completionSound })}
          />
        </SettingRow>
        <SettingRow label="Close my day (evening review)">
          <TimeSelect
            label="Evening review"
            value={settings.reviewAt}
            onChange={(reviewAt) => updateSettings({ reviewAt })}
            from={20 * 60}
            to={24 * 60}
          />
        </SettingRow>
        <SettingRow label="Quiet hours">
          <div className="flex items-center gap-1.5">
            <TimeSelect label="Quiet from" value={settings.quietFrom} onChange={(quietFrom) => updateSettings({ quietFrom })} />
            <span className="text-muted">–</span>
            <TimeSelect label="Quiet to" value={settings.quietTo} onChange={(quietTo) => updateSettings({ quietTo })} />
          </div>
        </SettingRow>
      </SettingsGroup>

      <SectionLabel className="mt-10">Areas</SectionLabel>
      <div className="mt-3 flex flex-wrap gap-2">
        {areas.map((a) => (
          <span key={a.id} className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px]">
            <span className="size-2.5 rounded-full" style={{ background: a.color }} /> {a.name}
          </span>
        ))}
      </div>

      <DataSettings />

      <SectionLabel className="mt-10">System</SectionLabel>
      <SettingsGroup className="mt-3">
        <SettingRow label="Quick add shortcut">
          <span className="flex gap-1">
            <Kbd>Ctrl</Kbd> <Kbd>Alt</Kbd> <Kbd>Space</Kbd>
          </span>
        </SettingRow>
        <SettingRow label="Start with Windows">
          <AutostartToggle />
        </SettingRow>
        <SettingRow label="Set up my day again">
          <Button size="sm" onClick={restartOnboarding}>
            <RotateCcw size={13} /> Run setup
          </Button>
        </SettingRow>
      </SettingsGroup>
    </Page>
  );
}

function AutostartToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [allowed, setAllowed] = useState(true);
  useEffect(() => {
    if (!isDesktop) return;
    canAutostart()
      .then(setAllowed)
      .catch(() => setAllowed(false));
    getAutostart()
      .then(setOn)
      .catch(() => setOn(false));
  }, []);
  if (!isDesktop) return <span className="text-[12.5px] text-muted">In the desktop app</span>;
  if (!allowed) return <span className="text-[12.5px] text-muted">In the installed app</span>;
  if (on === null) return null;
  return (
    <Switch
      checked={on}
      label="Start with Windows"
      onChange={(v) => {
        setOn(v);
        setAutostart(v).catch(() => setOn(!v));
      }}
    />
  );
}

/** Where your data lives, daily backups, and export. Desktop app only. */
function DataSettings() {
  const say = useApp((s) => s.say);
  const [info, setInfo] = useState<DataInfo | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isDesktop)
      dataInfo()
        .then(setInfo)
        .catch(() => setInfo(null));
  }, []);
  if (!isDesktop) return null;

  return (
    <>
      <SectionLabel className="mt-10">Your data</SectionLabel>
      <SettingsGroup className="mt-3">
        <SettingRow label="Stored on this PC">
          <span className="max-w-[280px] truncate text-[12px] text-muted" title={info?.dbPath}>
            {info?.dbPath ?? "…"}
          </span>
        </SettingRow>
        <SettingRow label="Automatic backups">
          <span className="text-[12.5px] text-muted" title={info?.backupsDir}>
            Daily · last 2 months kept
          </span>
        </SettingRow>
        <SettingRow label="Export everything (JSON)">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const path = await exportData();
                say(`Exported to ${path}`);
              } catch {
                say("Export failed. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download size={13} /> Export
          </Button>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
