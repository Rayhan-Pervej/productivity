import { useEffect, useState } from "react";
import { dataInfo, exportData, getAutostart, isDesktop, setAutostart, type DataInfo } from "@/platform/desktop";
import { ArrowRight, Check, ChevronDown, Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";
import type { Template } from "@/domain/types";
import { fmtTime } from "@/lib/time";
import { cn, tint } from "@/lib/utils";
import { Button, Kbd, SectionLabel, Switch, TimeSelect } from "@/components/ui";
import { AreaSelect } from "@/components/AreaSelect";
import { ClockControl, LeadMinutesControl, SettingRow, SettingsGroup, ThemeControl } from "@/components/settings";

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-10">
        <h1 className="text-[24px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Inbox ───────────────────────────── */

export function InboxView() {
  const inbox = useApp((s) => s.inbox);
  const backlog = useApp((s) => s.backlog);
  const { inboxToToday, letGoInbox, backlogToToday, deleteTask, open } = useApp.getState();

  return (
    <Page title="Inbox" subtitle="Things you captured. Give each one a home, or let it go.">
      {inbox.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-dashed border-border py-14 text-center"
        >
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-surface-2 text-success">
            <Check size={18} />
          </div>
          <div className="text-[15px] font-medium">Clear mind. Nice.</div>
          <div className="mt-1 text-[13px] text-muted">
            Capture anything with <Kbd>Ctrl</Kbd> <Kbd>Alt</Kbd> <Kbd>Space</Kbd>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {inbox.map((item) => (
              <motion.div
                layout
                key={item.id}
                exit={{ opacity: 0, x: 24 }}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="flex-1 text-[14px]">{item.title}</span>
                <Button size="sm" variant="primary" onClick={() => inboxToToday(item.id)}>
                  Today <ArrowRight size={13} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => letGoInbox(item.id)}>
                  Let go
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
          <Button variant="ghost" className="mt-2" onClick={() => open("quickAdd")}>
            <Plus size={14} /> Capture something
          </Button>
        </div>
      )}

      {backlog.length > 0 && (
        <div className="mt-10">
          <SectionLabel>Backlog · parked for later</SectionLabel>
          <div className="mt-2 space-y-1">
            {backlog.map((t) => (
              <div key={t.id} className="group flex items-center gap-3 rounded-lg px-1 py-1.5 text-[13.5px]">
                <span className="flex-1 text-muted">{t.title}</span>
                <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => backlogToToday(t.id)}>
                  Bring to today
                </Button>
                <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger" onClick={() => deleteTask(t.id)} aria-label="Delete">
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}

/* ───────────────────────────── Plans ───────────────────────────── */

export function PlansView() {
  const templates = useApp((s) => s.templates);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Page title="Plans" subtitle="Your reusable days. Today fills itself from these, so you never start from a blank page.">
      <div className="grid gap-3">
        {templates.map((t) => (
          <PlanCard key={t.id} template={t} editing={editing === t.id} onToggle={() => setEditing(editing === t.id ? null : t.id)} />
        ))}
      </div>
      <p className="mt-6 text-[12.5px] leading-relaxed text-muted">
        <span className="font-medium text-text">Tracked</span> blocks get reminders and count toward your day.{" "}
        <span className="font-medium text-text">Background</span> blocks (office, time out) shape the day but never need ticking.
        Changes apply from tomorrow, or press “Use for today”.
      </p>
    </Page>
  );
}

function PlanCard({ template: t, editing, onToggle }: { template: Template; editing: boolean; onToggle: () => void }) {
  const areas = useApp((s) => s.areas);
  const activeId = useApp((s) => s.activeTemplateId);
  const { applyTemplate, updateTemplateBlock, addTemplateBlock, removeTemplateBlock } = useApp.getState();
  const color = (id: string) => areas.find((a) => a.id === id)?.color ?? "#888";
  const blocks = [...t.blocks].sort((a, b) => a.start - b.start);
  const active = t.id === activeId;

  return (
    <div className={cn("rounded-2xl border bg-surface p-5 transition-colors", active ? "border-accent" : "border-border")}>
      <div className="flex items-center gap-3">
        <div>
          <div className="text-[15px] font-semibold">{t.name}</div>
          <div className="text-[12.5px] text-muted">{t.days}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {active ? (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-accent">Today's plan</span>
          ) : (
            <Button size="sm" onClick={() => applyTemplate(t.id)}>
              Use for today
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onToggle} aria-expanded={editing}>
            {editing ? "Done" : "Edit"} <ChevronDown size={13} className={cn("transition-transform", editing && "rotate-180")} />
          </Button>
        </div>
      </div>

      <div className="relative mt-4 h-7 overflow-hidden rounded-lg bg-surface-2">
        {blocks.map((b) => (
          <div
            key={b.id}
            title={`${fmtTime(b.start)}–${fmtTime(b.end)} ${b.title}`}
            className="absolute top-0 bottom-0 border-l-2 transition-all duration-300"
            style={{
              left: `${((Math.max(360, b.start) - 360) / 1080) * 100}%`,
              width: `${((b.end - Math.max(360, b.start)) / 1080) * 100}%`,
              background: tint(color(b.areaId), b.kind === "context" ? 20 : 50),
              borderColor: color(b.areaId),
            }}
          />
        ))}
      </div>
      <div className="tabular mt-1 flex justify-between text-[10.5px] text-muted">
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>

      <AnimatePresence initial={false}>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-1.5 border-t border-border pt-4">
              {blocks.map((b) => (
                <div key={b.id} className="group flex items-center gap-2">
                  <span className="h-6 w-1 rounded-full" style={{ background: color(b.areaId) }} />
                  <input
                    value={b.title}
                    onChange={(e) => updateTemplateBlock(t.id, b.id, { title: e.target.value })}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-[13.5px] outline-none hover:border-border focus:border-accent"
                    aria-label="Block title"
                  />
                  <AreaSelect value={b.areaId} onChange={(areaId) => updateTemplateBlock(t.id, b.id, { areaId })} size="sm" />
                  <button
                    onClick={() => updateTemplateBlock(t.id, b.id, { kind: b.kind === "context" ? "commitment" : "context" })}
                    title="Tracked blocks get reminders; background blocks don't"
                    className={cn(
                      "h-8 w-[92px] rounded-lg text-[12px] font-medium transition-colors",
                      b.kind === "commitment" ? "bg-accent/12 text-accent" : "bg-surface-2 text-muted",
                    )}
                  >
                    {b.kind === "commitment" ? "Tracked" : "Background"}
                  </button>
                  <TimeSelect label="Start" value={b.start} onChange={(start) => updateTemplateBlock(t.id, b.id, { start, end: Math.max(b.end, start + 15) })} step={15} />
                  <TimeSelect label="End" value={b.end} onChange={(end) => updateTemplateBlock(t.id, b.id, { end })} from={b.start + 15} step={15} />
                  <button
                    onClick={() => removeTemplateBlock(t.id, b.id)}
                    aria-label="Remove block"
                    className="grid size-8 place-items-center rounded-lg text-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => addTemplateBlock(t.id)}>
                <Plus size={13} /> Add block
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────────────── Settings ───────────────────────────── */

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
        <SettingRow label="Close my day (evening review)">
          <TimeSelect label="Evening review" value={settings.reviewAt} onChange={(reviewAt) => updateSettings({ reviewAt })} from={20 * 60} to={24 * 60} />
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
  useEffect(() => {
    if (isDesktop) getAutostart().then(setOn).catch(() => setOn(false));
  }, []);
  if (!isDesktop) return <span className="text-[12.5px] text-muted">In the desktop app</span>;
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
    if (isDesktop) dataInfo().then(setInfo).catch(() => setInfo(null));
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
            Daily · last 14 days kept
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
