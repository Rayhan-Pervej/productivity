import { Command } from "cmdk";
import {
  CalendarDays, Check, Coffee, Inbox, LayoutTemplate, Moon, Plus, Settings, Sparkles, Sun, Sunrise, Target, Undo2, type LucideIcon,
} from "lucide-react";
import { useApp, useCurrent } from "@/store/app";
import { Kbd, Modal } from "@/components/ui";

export function CommandPalette() {
  const isOpen = useApp((s) => s.overlay === "palette");
  const close = useApp((s) => s.close);
  return (
    <Modal open={isOpen} onClose={close} width={560} align="top">
      {isOpen && <PaletteBody />}
    </Modal>
  );
}

function PaletteBody() {
  const s = useApp.getState();
  const current = useCurrent().commitment;
  const theme = useApp((st) => st.theme);
  const blocks = useApp((st) => st.blocks);

  const run = (fn: () => void) => () => {
    s.close();
    fn();
  };

  const item = (label: string, Icon: LucideIcon, fn: () => void, hint?: string) => (
    <Command.Item
      key={label}
      value={label}
      onSelect={run(fn)}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] data-[selected=true]:bg-surface-2"
    >
      <Icon size={16} strokeWidth={1.6} className="text-muted" />
      {label}
      {hint && <Kbd className="ml-auto">{hint}</Kbd>}
    </Command.Item>
  );

  const group = "px-2 pb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:uppercase";

  return (
    <Command label="Command palette" loop>
      <Command.Input
        autoFocus
        placeholder="Type a command or search…"
        className="w-full border-b border-border bg-transparent px-5 py-4 text-[16px] outline-none placeholder:text-muted/70"
      />
      <Command.List className="max-h-[380px] overflow-y-auto py-2">
        <Command.Empty className="px-5 py-6 text-center text-[13px] text-muted">Nothing found.</Command.Empty>

        <Command.Group heading="Actions" className={group}>
          {item("Quick add", Plus, () => s.open("quickAdd"), "Ctrl Alt Space")}
          {current && item(`Mark “${current.title}” done`, Check, () => s.completeBlock(current.id), "Space")}
          {item("What should I do now?", Sparkles, () => s.setView("focus"))}
          {item("Undo", Undo2, s.undo, "Ctrl Z")}
          {item("Morning briefing", Sunrise, () => s.open("briefing"))}
          {item("Close my day (evening review)", Moon, () => s.open("review"))}
          {item("Catch up on what I missed", Coffee, () => s.open("catchup"))}
          {item(theme === "dark" ? "Switch to light theme" : "Switch to dark theme", theme === "dark" ? Sun : Moon, () =>
            s.setTheme(theme === "dark" ? "light" : "dark"),
          )}
        </Command.Group>

        <Command.Group heading="Go to" className={group}>
          {item("Today", CalendarDays, () => s.setView("today"), "1")}
          {item("Focus", Target, () => s.setView("focus"), "2")}
          {item("Inbox", Inbox, () => s.setView("inbox"), "3")}
          {item("Plans", LayoutTemplate, () => s.setView("plans"), "4")}
          {item("Settings", Settings, () => s.setView("settings"))}
        </Command.Group>

        <Command.Group heading="Today's blocks" className={group}>
          {blocks.filter((b) => b.kind === "commitment").map((b) => item(b.title, CalendarDays, () => s.setView("today")))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
