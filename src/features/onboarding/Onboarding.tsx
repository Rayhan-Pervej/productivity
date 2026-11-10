// First run: docs/04-v0.1-spec.md §3.6. Goal: a real plan for *your* day in about a minute.
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";
import { h, tb } from "@/data/seed";
import type { TemplateBlock } from "@/domain/types";
import { fmtDuration, fmtTime } from "@/lib/time";
import { cn, tint } from "@/lib/utils";
import { Button, Switch, TimeSelect } from "@/components/ui";
import { Select } from "@/components/Select";
import { LeadMinutesControl, SettingRow, SettingsGroup } from "@/components/settings";

interface Activity {
  areaId: string;
  title: string;
  hint: string;
  duration: number;
}

const ACTIVITIES: Activity[] = [
  { areaId: "client", title: "Client work", hint: "Freelance & side projects", duration: 60 },
  { areaId: "study", title: "Study", hint: "Courses, DSA, new skills", duration: 60 },
  { areaId: "growth", title: "Self-improvement", hint: "Talks, reflection, planning", duration: 30 },
  { areaId: "reading", title: "Reading", hint: "Books & long articles", duration: 30 },
  { areaId: "news", title: "News", hint: "Catch up, then stop", duration: 15 },
];
const DURATIONS = [15, 30, 45, 60, 90, 120];

export function Onboarding() {
  const areas = useApp((s) => s.areas);
  const complete = useApp((s) => s.completeOnboarding);
  const current = useApp((s) => s.settings);

  const [step, setStep] = useState(() =>
    import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("obstep") ?? 0) : 0,
  );
  const [name, setName] = useState(current.name);
  const [office, setOffice] = useState({ on: true, from: h(9), to: h(17) });
  const [personal, setPersonal] = useState({ on: true, from: h(18), to: h(20, 30) });
  const [eveningStart, setEveningStart] = useState(h(21));
  const [picked, setPicked] = useState<Activity[]>([]);
  const [lead, setLead] = useState(current.leadMinutes);
  const [reviewAt, setReviewAt] = useState(current.reviewAt);

  const plan = useMemo<TemplateBlock[]>(() => {
    const blocks: TemplateBlock[] = [];
    if (office.on) blocks.push(tb("Office", "office", "context", office.from, office.to));
    if (personal.on) blocks.push(tb("Personal time", "personal", "context", personal.from, personal.to));
    let t = eveningStart;
    for (const a of picked) {
      if (t >= h(24)) break;
      const end = Math.min(t + a.duration, h(24));
      blocks.push(tb(a.title, a.areaId, "commitment", t, end));
      t = end;
    }
    return blocks;
  }, [office, personal, eveningStart, picked]);

  const eveningEnd = plan.filter((b) => b.kind === "commitment").reduce((m, b) => Math.max(m, b.end), eveningStart);

  const toggle = (a: Activity) =>
    setPicked((p) => (p.some((x) => x.areaId === a.areaId) ? p.filter((x) => x.areaId !== a.areaId) : [...p, a]));
  const setDuration = (areaId: string, duration: number) =>
    setPicked((p) => p.map((x) => (x.areaId === areaId ? { ...x, duration } : x)));

  const finish = () =>
    complete({ ...current, name: name.trim(), leadMinutes: lead, reviewAt }, plan);

  const steps = [
    {
      title: "Let's shape your day",
      subtitle: "About a minute. You can change everything later.",
      body: (
        <label className="block">
          <span className="text-[13px] text-muted">What should I call you?</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setStep(1)}
            placeholder="Your name"
            className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-4 text-[16px] outline-none focus:border-accent"
          />
        </label>
      ),
    },
    {
      title: "Your daytime",
      subtitle: "These are background blocks. They shape the day, but there's nothing to tick.",
      body: (
        <div className="space-y-3">
          <Row
            on={office.on}
            setOn={(on) => setOffice({ ...office, on })}
            label="Office / day job"
            color={areas.find((a) => a.id === "office")?.color}
          >
            <TimeSelect label="Office from" value={office.from} onChange={(from) => setOffice({ ...office, from })} from={h(5)} to={h(14)} />
            <span className="text-muted">–</span>
            <TimeSelect label="Office to" value={office.to} onChange={(to) => setOffice({ ...office, to })} from={h(12)} to={h(22)} />
          </Row>
          <Row
            on={personal.on}
            setOn={(on) => setPersonal({ ...personal, on })}
            label="Time for yourself after"
            color={areas.find((a) => a.id === "personal")?.color}
          >
            <TimeSelect label="Personal from" value={personal.from} onChange={(from) => setPersonal({ ...personal, from })} from={h(12)} to={h(22)} />
            <span className="text-muted">–</span>
            <TimeSelect label="Personal to" value={personal.to} onChange={(to) => setPersonal({ ...personal, to })} from={h(14)} to={h(23)} />
          </Row>
        </div>
      ),
    },
    {
      title: "Your evenings",
      subtitle: "What do you want to make time for? Pick in the order you'd like to do them.",
      body: (
        <div>
          <div className="mb-3 flex items-center gap-2 text-[13px] text-muted">
            Evenings start at
            <TimeSelect label="Evening start" value={eveningStart} onChange={setEveningStart} from={h(17)} to={h(23)} />
            <span className="tabular ml-auto">{picked.length ? `until ${fmtTime(eveningEnd)}` : "Tap to pick, in order"}</span>
          </div>
          <div className="space-y-1.5">
            {ACTIVITIES.map((a) => {
              const sel = picked.find((p) => p.areaId === a.areaId);
              const order = picked.findIndex((p) => p.areaId === a.areaId) + 1;
              const color = areas.find((x) => x.id === a.areaId)?.color ?? "#888";
              return (
                <div
                  key={a.areaId}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                    sel ? "border-transparent" : "border-border bg-surface hover:border-muted",
                  )}
                  style={sel ? { background: tint(color, 12) } : undefined}
                >
                  <button onClick={() => toggle(a)} className="flex flex-1 items-center gap-3 text-left">
                    <span
                      className="tabular grid size-6 place-items-center rounded-full border text-[11px] font-semibold transition-all"
                      style={sel ? { background: color, borderColor: color, color: "white" } : { borderColor: "var(--border)" }}
                    >
                      {sel ? order : ""}
                    </span>
                    <span>
                      <span className="block text-[14px] font-medium">{a.title}</span>
                      <span className="block text-[12px] text-muted">{a.hint}</span>
                    </span>
                  </button>
                  {sel && (
                    <Select
                      label={`${a.title} duration`}
                      value={sel.duration}
                      onChange={(d) => setDuration(a.areaId, d)}
                      size="sm"
                      options={DURATIONS.map((d) => ({ value: d, label: fmtDuration(d) }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      title: "How should I nudge you?",
      subtitle: "Gentle by default. I'll stay quiet at night.",
      body: (
        <SettingsGroup>
          <SettingRow label="Remind me before something starts">
            <LeadMinutesControl value={lead} onChange={setLead} />
          </SettingRow>
          <SettingRow label="Close my day at">
            <TimeSelect label="Evening review" value={reviewAt} onChange={setReviewAt} from={h(20)} to={h(24)} />
          </SettingRow>
        </SettingsGroup>
      ),
    },
    {
      title: name.trim() ? `You're all set, ${name.trim()}` : "You're all set",
      subtitle: "Here's your workday. It fills in by itself every morning.",
      body: (
        <div className="space-y-1">
          {plan.map((b) => {
            const color = areas.find((a) => a.id === b.areaId)?.color;
            return (
              <div key={`${b.areaId}-${b.title}`} className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-[13.5px]">
                <span className="tabular w-24 text-[12px] text-muted">
                  {fmtTime(b.start)} – {fmtTime(b.end)}
                </span>
                <span className="h-4 w-[3px] rounded-full" style={{ background: color }} />
                <span className={cn(b.kind === "context" ? "text-muted" : "font-medium")}>{b.title}</span>
                {b.kind === "commitment" && <Check size={13} className="ml-auto text-muted" />}
              </div>
            );
          })}
          <p className="pt-2 text-[12px] text-muted">✓ = tracked & reminded. The rest is background.</p>
        </div>
      ),
    },
  ];

  const s = steps[step];
  const last = step === steps.length - 1;

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-y-auto bg-bg px-6 py-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="w-full max-w-[520px]">
        <div className="mb-8 flex items-center gap-2 text-accent">
          <Sparkles size={18} />
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all duration-300", i === step ? "w-6 bg-accent" : i < step ? "w-1.5 bg-accent/50" : "w-1.5 bg-border")} />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <h1 className="text-[28px] font-semibold tracking-tight">{s.title}</h1>
            <p className="mt-1 mb-6 text-[14px] text-muted">{s.subtitle}</p>
            {s.body}
          </motion.div>
        </AnimatePresence>

        {step > 0 && <DayStrip plan={plan} />}

        <div className="mt-8 flex items-center gap-2">
          {step > 0 && (
            <Button variant="ghost" size="lg" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={15} /> Back
            </Button>
          )}
          <Button variant="primary" size="lg" className="ml-auto min-w-36" onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? "Start my day" : "Continue"} <ArrowRight size={15} />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function Row({
  on, setOn, label, color, children,
}: { on: boolean; setOn: (v: boolean) => void; label: string; color?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3", !on && "opacity-60")}>
      <Switch checked={on} onChange={setOn} label={label} />
      <span className="size-2 rounded-full" style={{ background: color }} />
      <span className="flex-1 text-[14px]">{label}</span>
      <div className={cn("flex items-center gap-1.5", !on && "pointer-events-none")}>{children}</div>
    </div>
  );
}

/** Live preview of the day being built (06:00 – 24:00). */
function DayStrip({ plan }: { plan: TemplateBlock[] }) {
  const areas = useApp((s) => s.areas);
  const pct = (m: number) => `${((m - 360) / 1080) * 100}%`;
  return (
    <div className="mt-8">
      <div className="relative h-8 overflow-hidden rounded-lg bg-surface-2">
        {plan.map((b) => {
          const color = areas.find((a) => a.id === b.areaId)?.color ?? "#888";
          return (
            <motion.div
              layout
              key={`${b.areaId}-${b.title}`}
              className="absolute top-0 bottom-0 border-l-2"
              style={{
                left: pct(Math.max(360, b.start)),
                width: `${((b.end - Math.max(360, b.start)) / 1080) * 100}%`,
                background: b.kind === "context" ? tint(color, 22) : tint(color, 55),
                borderColor: color,
              }}
            />
          );
        })}
      </div>
      <div className="tabular mt-1 flex justify-between text-[10.5px] text-muted">
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}
