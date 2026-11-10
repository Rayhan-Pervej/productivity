import { CalendarDays, Inbox, LayoutTemplate, Settings, Target, type LucideIcon } from "lucide-react";
import { useApp, type View } from "@/store/app";
import { dayProgress } from "@/lib/day";
import { greeting, todayLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Kbd } from "./ui";
import { AppLogo, WindowControls } from "./WindowChrome";
import { isDesktop } from "@/platform/desktop";

export function TitleBar() {
  const now = useApp((s) => Math.floor(s.now));
  const blocks = useApp((s) => s.blocks);
  const open = useApp((s) => s.open);
  const name = useApp((s) => s.settings.name);
  const { ratio, done, total } = dayProgress(blocks);

  // In the desktop app this header is the window's title bar: drag anywhere that isn't a control.
  // Text is pointer-events-none so dragging works on it too.
  return (
    <header
      className={cn("flex h-12 shrink-0 items-center gap-4 border-b border-border pl-[26px]", isDesktop ? "pr-0" : "pr-5")}
      data-tauri-drag-region
    >
      <AppLogo size={20} className="pointer-events-none" />
      <div className="pointer-events-none flex min-w-0 items-baseline gap-3">
        <span className="text-[15px] font-semibold tracking-tight whitespace-nowrap">
          {greeting(now)}
          {name && `, ${name}`}
        </span>
        <span className="truncate text-[13px] text-muted">{todayLabel()}</span>
      </div>

      <div
        className="pointer-events-none ml-auto flex items-center gap-3 max-[760px]:hidden"
        title="Progress counts what you chose to do. Background blocks don't count."
      >
        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <span className="tabular text-[12px] whitespace-nowrap text-muted">
          {total ? `${done} of ${total} done` : "Nothing tracked today"}
        </span>
      </div>

      <button
        onClick={() => open("palette")}
        className="flex h-7 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[12px] text-muted transition-colors hover:text-text max-[760px]:ml-auto"
      >
        Search or run…
        <Kbd>Ctrl K</Kbd>
      </button>
      <WindowControls />
    </header>
  );
}

const NAV: { view: View; label: string; icon: LucideIcon; key: string }[] = [
  { view: "today", label: "Today", icon: CalendarDays, key: "1" },
  { view: "focus", label: "Focus", icon: Target, key: "2" },
  { view: "inbox", label: "Inbox", icon: Inbox, key: "3" },
  { view: "plans", label: "Plans", icon: LayoutTemplate, key: "4" },
];

export function NavRail() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const inboxCount = useApp((s) => s.inbox.length);

  const item = (v: View, label: string, Icon: LucideIcon, hint: string, badge?: number) => (
    <button
      key={v}
      onClick={() => setView(v)}
      title={`${label} (${hint})`}
      className={cn(
        "group relative flex w-14 flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition-colors",
        view === v ? "bg-surface text-text shadow-soft" : "text-muted hover:bg-surface/60 hover:text-text",
      )}
    >
      <Icon size={20} strokeWidth={1.5} className={view === v ? "text-accent" : ""} />
      {label}
      {!!badge && (
        <span className="tabular absolute top-1 right-2 grid h-4 min-w-4 place-items-center rounded-full bg-surface-2 px-1 text-[10px] font-semibold text-muted">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-border py-3">
      {NAV.map((n) => item(n.view, n.label, n.icon, n.key, n.view === "inbox" ? inboxCount : undefined))}
      <div className="mt-auto">{item("settings", "Settings", Settings, ",")}</div>
    </nav>
  );
}
