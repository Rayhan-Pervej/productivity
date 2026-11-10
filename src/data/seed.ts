// Built-in defaults: the area list and starter plans. No sample tasks.
// Onboarding replaces the Workday plan with yours; every plan is editable in Plans.
import type { Area, Block, BlockKind, Template, TemplateBlock } from "@/domain/types";
import { uid } from "@/lib/utils";

export const AREAS: Area[] = [
  { id: "office", name: "Office", color: "#5B7BB5" },
  { id: "client", name: "Client", color: "#2E9C9C" },
  { id: "study", name: "Study", color: "#8A6BD1" },
  { id: "growth", name: "Growth", color: "#C96B8A" },
  { id: "reading", name: "Reading", color: "#C7923E" },
  { id: "news", name: "News", color: "#4FA3D1" },
  { id: "personal", name: "Personal", color: "#6FA86F" },
];

export const h = (hours: number, minutes = 0) => hours * 60 + minutes;

export const tb = (title: string, areaId: string, kind: BlockKind, start: number, end: number): TemplateBlock => ({
  id: uid(), title, areaId, kind, start, end,
});

/** Starter plans, used until you set up your own. */
export const TEMPLATES: Template[] = [
  {
    id: "workday",
    name: "Workday",
    days: "Mon – Fri",
    blocks: [
      tb("Office", "office", "context", h(9), h(17)),
      tb("Personal time", "personal", "context", h(18), h(20, 30)),
      tb("Client work", "client", "commitment", h(21), h(22)),
      tb("Study", "study", "commitment", h(22), h(23)),
      tb("Reading", "reading", "commitment", h(23), h(23, 30)),
    ],
  },
  {
    id: "weekend",
    name: "Weekend",
    days: "Sat – Sun",
    blocks: [
      tb("Study", "study", "commitment", h(11), h(13)),
      tb("Reading", "reading", "commitment", h(22), h(22, 30)),
    ],
  },
  {
    id: "holiday",
    name: "Holiday",
    days: "Any day",
    blocks: [],
  },
];

export function blocksFromTemplate(template: Template): Block[] {
  return template.blocks.map((b) => ({
    id: uid(),
    title: b.title,
    areaId: b.areaId,
    kind: b.kind,
    start: b.start,
    end: b.end,
    status: "planned",
    subtasks: [],
    fromPlan: true,
  }));
}

/** Which plan a day follows, by weekday: Sat/Sun → Weekend, otherwise Workday. */
export function templateForWeekday(templates: Template[], weekday: number) {
  const id = weekday === 0 || weekday === 6 ? "weekend" : "workday";
  return templates.find((t) => t.id === id) ?? templates[0];
}
