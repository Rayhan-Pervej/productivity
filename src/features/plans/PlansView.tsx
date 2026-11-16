// Plans: your reusable days (templates) and repeating routines.
import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";
import type { Template } from "@/domain/types";
import { fmtTime } from "@/lib/time";
import { cn, tint } from "@/lib/utils";
import { Button, TimeSelect } from "@/components/ui";
import { AreaSelect } from "@/components/AreaSelect";
import { Page } from "@/components/Page";
import { RoutinesSection } from "./RoutinesSection";
import { IconButton } from "@/components/IconButton";

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
      <RoutinesSection />
      <p className="mt-6 text-[12.5px] leading-relaxed text-muted">
        <span className="font-medium text-text">Tracked</span> blocks get reminders and count toward your day.{" "}
        <span className="font-medium text-text">Background</span> blocks (office, time out) shape the day but never need ticking. Changes
        apply from tomorrow, or press “Use for today”.
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
                    type="button"
                    onClick={() => updateTemplateBlock(t.id, b.id, { kind: b.kind === "context" ? "commitment" : "context" })}
                    title="Tracked blocks get reminders; background blocks don't"
                    className={cn(
                      "h-8 w-[92px] rounded-lg text-[12px] font-medium transition-colors",
                      b.kind === "commitment" ? "bg-accent/12 text-accent" : "bg-surface-2 text-muted",
                    )}
                  >
                    {b.kind === "commitment" ? "Tracked" : "Background"}
                  </button>
                  <TimeSelect
                    label="Start"
                    value={b.start}
                    onChange={(start) => updateTemplateBlock(t.id, b.id, { start, end: Math.max(b.end, start + 15) })}
                    step={15}
                  />
                  <TimeSelect
                    label="End"
                    value={b.end}
                    onChange={(end) => updateTemplateBlock(t.id, b.id, { end })}
                    from={b.start + 15}
                    step={15}
                  />
                  <IconButton
                    tone="danger"
                    label="Remove block"
                    onClick={() => removeTemplateBlock(t.id, b.id)}
                    icon={<Trash2 size={14} />}
                    className="opacity-0 transition-all group-hover:opacity-100"
                  />
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
