// App-wide right-click menu. Any component calls `showMenu(event, items)` from onContextMenu;
// one <ContextMenuHost /> renders it. Replaces the browser's own menu (Back, Refresh, Print…).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

export type MenuItem =
  | {
      label: string;
      icon?: ReactNode;
      /** Keyboard hint shown on the right, e.g. "Space". */
      hint?: string;
      onSelect: () => void;
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

/** Open the app menu at the pointer. Call from an `onContextMenu` handler. */
export function showMenu(e: { preventDefault(): void; stopPropagation(): void; clientX: number; clientY: number }, items: MenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  const clean = items.filter((it, i, all) => it !== "separator" || (i > 0 && i < all.length - 1 && all[i - 1] !== "separator"));
  if (clean.length) useMenu.getState().show(e.clientX, e.clientY, clean);
}

/** True when the browser's own menu should be kept (text fields, or Shift+right-click while developing). */
export function wantsNativeMenu(e: MouseEvent) {
  const el = e.target as HTMLElement | null;
  if (import.meta.env.DEV && e.shiftKey) return true;
  return !!el?.closest("input, textarea, [contenteditable=true]");
}

const EDGE = 8;

export function ContextMenuHost() {
  const { open, x, y, items, hide } = useMenu();
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [active, setActive] = useState(-1);
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
  }, [open, x, y, items]);

  // Close on outside click, Esc, scroll, resize or window blur. Arrow keys + Enter navigate.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => panel.current && !panel.current.contains(e.target as Node) && hide();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        hide();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const at = actionable.indexOf(active);
        const next = e.key === "ArrowDown" ? (at + 1) % actionable.length : (at - 1 + actionable.length) % actionable.length;
        setActive(actionable[next] ?? -1);
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault();
        const it = items[active];
        if (it !== "separator") {
          hide();
          it.onSelect();
        }
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
  }, [open, active, items, actionable, hide]);

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
          className="fixed z-[90] min-w-[220px] origin-top-left rounded-xl border border-border bg-surface p-1 shadow-soft"
          style={pos}
          onContextMenu={(e) => e.preventDefault()}
        >
          {items.map((it, i) =>
            it === "separator" ? (
              <div key={`sep${i}`} className="mx-2 my-1 h-px bg-border" role="separator" />
            ) : (
              <button
                key={it.label}
                role="menuitem"
                disabled={it.disabled}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  hide();
                  it.onSelect();
                }}
                className={cn(
                  "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors disabled:opacity-40",
                  active === i && (it.danger ? "bg-danger/10 text-danger" : "bg-surface-2"),
                )}
              >
                <span className={cn("grid w-4 place-items-center", active === i && it.danger ? "text-danger" : "text-muted")}>
                  {it.icon}
                </span>
                <span className="flex-1 truncate">{it.label}</span>
                {it.hint && <span className="text-[11.5px] text-muted">{it.hint}</span>}
              </button>
            ),
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
