// Plans slice: plan templates and their blocks, areas, settings, and onboarding.
import type { TemplateBlock } from "@/domain/types";
import { AREAS, TEMPLATES, blocksFromTemplate, h, templateForWeekday } from "@/data/seed";
import { isoDay } from "@/lib/time";
import { uid } from "@/lib/utils";
import { DEFAULT_SETTINGS, blocksFor } from "../day";
import { nextToastId, type Slice } from "../helpers";

export const plansSlice: Slice<
  | "areas"
  | "templates"
  | "activeTemplateId"
  | "settings"
  | "onboarded"
  | "applyTemplate"
  | "updateTemplateBlock"
  | "addTemplateBlock"
  | "removeTemplateBlock"
  | "updateSettings"
  | "completeOnboarding"
  | "restartOnboarding"
> = (set, get, { change, mapTemplate }) => ({
  areas: AREAS,
  templates: TEMPLATES,
  activeTemplateId: "workday",
  settings: DEFAULT_SETTINGS,
  onboarded: false,

  applyTemplate: (id) => {
    const template = get().templates.find((t) => t.id === id);
    if (!template) return;
    change(
      (st) => ({ blocks: [...blocksFromTemplate(template), ...st.blocks.filter((b) => !b.fromPlan || b.routineId)] }),
      `Using ${template.name} plan today`,
    );
    set({ activeTemplateId: id });
  },
  updateTemplateBlock: (templateId, blockId, patch) =>
    change(
      mapTemplate(templateId, (t) => ({
        ...t,
        blocks: t.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
      })),
    ),
  addTemplateBlock: (templateId) =>
    change(
      mapTemplate(templateId, (t) => {
        const last = Math.max(h(20), ...t.blocks.map((b) => b.end));
        const start = Math.min(last, h(23));
        const block: TemplateBlock = {
          id: uid(),
          title: "New block",
          areaId: "personal",
          kind: "commitment",
          start,
          end: Math.min(start + 60, h(24)),
        };
        return { ...t, blocks: [...t.blocks, block] };
      }),
    ),
  removeTemplateBlock: (templateId, blockId) =>
    change(
      mapTemplate(templateId, (t) => ({ ...t, blocks: t.blocks.filter((b) => b.id !== blockId) })),
      "Block removed",
    ),

  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  completeOnboarding: (settings, workday) => {
    const s = get();
    const templates = s.templates.map((t) => (t.id === "workday" ? { ...t, blocks: workday } : t));
    const todayPlan = templateForWeekday(templates, new Date().getDay());
    // Setup (first time or re-run) only changes your plan and settings.
    // Everything you added yourself is kept: tasks, inbox, future days, and today's own blocks.
    const planBlocks = blocksFor(templates, todayPlan.id);
    const yourBlocks = s.blocks.filter((b) => !b.fromPlan || b.routineId);
    set({
      settings,
      templates,
      onboarded: true,
      activeTemplateId: todayPlan.id,
      blocks: [...planBlocks, ...yourBlocks],
      dayKey: isoDay(),
      history: [],
      toast: { id: nextToastId(), message: "Your plan is ready", canUndo: false },
    });
  },
  restartOnboarding: () => set({ onboarded: false, overlay: null }),
});
