// Plans → Repeats: everything that repeats on chosen weekdays, editable in one place.
import { Plus, Repeat, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";
import type { Routine } from "@/domain/types";
import { WEEKDAYS, repeatLabel, routineEnded } from "@/lib/repeat";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/DateInput";
import { Button, Kbd, SectionLabel, TimeSelect } from "@/components/ui";
import { AreaSelect } from "@/components/AreaSelect";
import { WeekdayPicker } from "@/components/WeekdayPicker";

export function RoutinesSection() {
  const routines = useApp((s) => s.routines);
  const addRoutine = useApp((s) => s.addRoutine);

  return (
    <section className="mt-10">
      <div className="flex items-center gap-2">
        <SectionLabel>Repeats</SectionLabel>
        <span className="text-[12px] text-muted">· things on set weekdays, like a standup or a class</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => addRoutine({ title: "New repeat", areaId: "personal", start: 21 * 60, end: 22 * 60, days: WEEKDAYS })}
        >
          <Plus size={13} /> Add
        </Button>
      </div>

      {routines.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-border px-5 py-6 text-[13px] leading-relaxed text-muted">
          Nothing repeats yet. Type it in quick add (<Kbd>N</Kbd>), for example{" "}
          <span className="text-text">“standup weekdays 8:30am #office”</span> or{" "}
          <span className="text-text">“ielts every sun tue thu 9pm”</span>. Or right-click any block → Repeat.
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          <AnimatePresence initial={false}>
            {routines.map((r) => (
              <RoutineRow key={r.id} routine={r} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function RoutineRow({ routine: r }: { routine: Routine }) {
  const color = useApp((s) => s.areas.find((a) => a.id === r.areaId)?.color ?? "#888");
  const { updateRoutine, stopRoutine } = useApp.getState();
  const duration = r.end - r.start;
  const ended = routineEnded(r);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={cn("group rounded-2xl border border-border bg-surface p-4", ended && "opacity-60 hover:opacity-100")}
    >
      {ended && (
        <div className="mb-2 text-[11.5px] font-medium text-muted">
          Ended {shortDate(r.until!)} · pick a later date to bring it back
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="h-6 w-1 rounded-full" style={{ background: color }} />
        <Repeat size={14} className="text-muted" />
        <input
          value={r.title}
          onChange={(e) => updateRoutine(r.id, { title: e.target.value })}
          aria-label="Title"
          className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-[14px] font-medium outline-none hover:border-border focus:border-accent"
        />
        <AreaSelect size="sm" value={r.areaId} onChange={(areaId) => updateRoutine(r.id, { areaId })} />
        <TimeSelect label="Start" value={r.start} step={15} onChange={(start) => updateRoutine(r.id, { start, end: start + duration })} />
        <span className="text-muted">–</span>
        <TimeSelect label="End" value={r.end} from={r.start + 15} step={15} onChange={(end) => updateRoutine(r.id, { end })} />
        <button
          onClick={() => stopRoutine(r.id)}
          aria-label="Stop repeating"
          title="Stop repeating (today's copy stays)"
          className="grid size-8 place-items-center rounded-lg text-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 pl-3">
        <WeekdayPicker
          value={r.days}
          presets={false}
          onChange={(days) => (days.length ? updateRoutine(r.id, { days }) : stopRoutine(r.id))}
        />
        <span className="text-[12px] text-muted">{repeatLabel(r.days)}</span>
        <span className="ml-auto flex items-center gap-2 text-[12.5px] text-muted">
          Until
          <DateInput label="Repeat until" value={r.until} onChange={(until) => updateRoutine(r.id, { until })} />
        </span>
      </div>
    </motion.div>
  );
}
