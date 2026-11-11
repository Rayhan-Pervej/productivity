// App-wide right-click menu. Any component calls `showMenu(event, items)` from onContextMenu;
// one <ContextMenuHost /> renders it. Replaces the browser's own menu (Back, Refresh, Print…).
// Items can have a submenu (opens on hover, e.g. "Repeat ▸") and a check mark.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type MenuItem =
  | {
      label: string;
      icon?: ReactNode;
      /** Keyboard hint shown on the right, e.g. "Space". */
      hint?: string;
      onSelect?: () => void;
      /** Opens to the side on hover. */
      submenu?: MenuItem[];
      /** Shows a check mark (current choice). */
      checked?: boolean;
      danger?: boolean;
      disabled?: boolean;
    }
  | "separator";

interface MenuState {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  show: (x: number, y: number, items: MenuItem[]) => void;
  hide: () => void;
}

const useMenu = create<MenuState>()((set) => ({
  open: false,
  x: 0,
  y: 0,
  items: [],
  show: (x, y, items) => set({ open: true, x, y, items }),
  hide: () => set({ open: false }),
}));

/** Drop separators at the edges or doubled up. */
const tidy = (items: MenuItem[]) =>
  items.filter((it, i, all) => it !== "separator" || (i > 0 && i < all.length - 1 && all[i - 1] !== "separator"));

/** Open the app menu at the pointer. Call from an `onContextMenu` handler. */
export function showMenu(e: { preventDefault(): void; stopPropagation(): void; clientX: number; clientY: number }, items: MenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  const clean = tidy(items);
  if (clean.length) useMenu.getState().show(e.clientX, e.clientY, clean);
}

/** True when the browser's own menu should be kept (text fields, or Shift+right-click while developing). */
export function wantsNativeMenu(e: MouseEvent) {
  const el = e.target as HTMLElement | null;
  if (import.meta.env.DEV && e.shiftKey) return true;
  return !!el?.closest("input, textarea, [contenteditable=true]");
}

const EDGE = 8;
const PANEL = "rounded-xl border border-border bg-surface p-1 shadow-soft";
const SUBMENU_WIDTH = 230;

export function ContextMenuHost() {
  const { open, x, y, items, hide } = useMenu();
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<number | null>(null);
  const actionable = items.map((it, i) => (it !== "separator" && !it.disabled ? i : -1)).filter((i) => i >= 0);

  // Keep the menu inside the window (flip left/up near the edges).
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const { width, height } = panel.current.getBoundingClientRect();
    setPos({
      left: x + width + EDGE > window.innerWidth ? Math.max(EDGE, x - width) : x,
      top: y + height + EDGE > window.innerHeight ? Math.max(EDGE, y - height) : y,
    });
    setActive(-1);
    setSub(null);
  }, [open, x, y, items]);

  const choose = (it: Exclude<MenuItem, "separator">, i: number) => {
    if (it.submenu) return setSub(sub === i ? null : i);
    hide();
    it.onSelect?.();
  };

  // Close on outside click, Esc, scroll, resize or window blur. Arrows + Enter navigate the top level.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => panel.current && !panel.current.contains(e.target as Node) && hide();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (sub !== null) setSub(null);
        else hide();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const at = actionable.indexOf(active);
        const next = e.key === "ArrowDown" ? (at + 1) % actionable.length : (at - 1 + actionable.length) % actionable.length;
        setActive(actionable[next] ?? -1);
        setSub(null);
      } else if ((e.key === "Enter" || e.key === "ArrowRight") && active >= 0) {
        e.preventDefault();
        const it = items[active];
        if (it !== "separator" && (e.key === "Enter" || it.submenu)) choose(it, active);
      }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    window.addEventListener("wheel", hide, { passive: true });
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
      window.removeEventListener("wheel", hide);
    };
  });

  // Open submenus to the right, or to the left when there's no room.
  const subOnLeft = pos.left + (panel.current?.offsetWidth ?? 220) + SUBMENU_WIDTH + EDGE > window.innerWidth;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panel}
          role="menu"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.1 }}
          className={cn("fixed z-[90] min-w-[220px] origin-top-left", PANEL)}
          style={pos}
          onContextMenu={(e) => e.preventDefault()}
        >
          {items.map((it, i) =>
            it === "separator" ? (
              <Separator key={`sep${i}`} />
            ) : (
              <div key={it.label} className="relative">
                <MenuRow
                  item={it}
                  active={active === i}
                  open={sub === i}
                  onHover={() => {
                    setActive(i);
                    setSub(it.submenu ? i : null);
                  }}
                  onClick={() => choose(it, i)}
                />
                {it.submenu && sub === i && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, x: subOnLeft ? 4 : -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.1 }}
                    className={cn("absolute -top-1 z-[91]", PANEL, subOnLeft ? "right-full mr-1" : "left-full ml-1")}
                    style={{ width: SUBMENU_WIDTH }}
                  >
                    <SubmenuItems items={tidy(it.submenu)} onDone={hide} />
                  </motion.div>
                )}
              </div>
            ),
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SubmenuItems({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  const [active, setActive] = useState(-1);
  return (
    <>
      {items.map((it, i) =>
        it === "separator" ? (
          <Separator key={`sep${i}`} />
        ) : (
          <MenuRow
            key={it.label}
            item={it}
            active={active === i}
            onHover={() => setActive(i)}
            onClick={() => {
              onDone();
              it.onSelect?.();
            }}
          />
        ),
      )}
    </>
  );
}

function Separator() {
  return <div className="mx-2 my-1 h-px bg-border" role="separator" />;
}

/** One row: icon or check, label, keyboard hint or submenu arrow. */
function MenuRow({
  item,
  active,
  open = false,
  onHover,
  onClick,
}: {
  item: Exclude<MenuItem, "separator">;
  active: boolean;
  open?: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const danger = item.danger && active;
  return (
    <button
      role="menuitem"
      aria-haspopup={item.submenu ? "menu" : undefined}
      aria-expanded={item.submenu ? open : undefined}
      aria-checked={item.checked}
      disabled={item.disabled}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors disabled:opacity-40",
        (active || open) && (item.danger ? "bg-danger/10 text-danger" : "bg-surface-2"),
      )}
    >
      <span className={cn("grid w-4 place-items-center", danger ? "text-danger" : item.checked ? "text-accent" : "text-muted")}>
        {item.checked ? <Check size={15} strokeWidth={2.5} /> : item.icon}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.hint && <span className="text-[11.5px] text-muted">{item.hint}</span>}
      {item.submenu && <ChevronRight size={14} className="text-muted" />}
    </button>
  );
}
