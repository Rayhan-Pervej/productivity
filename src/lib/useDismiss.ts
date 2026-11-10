// Close a popover when clicking outside it or pressing Esc. One behavior for every popover.
import { useEffect, useRef, type RefObject } from "react";

/**
 * @param open      whether the popover is showing
 * @param onClose   called on an outside click or Esc
 * @param refs      elements that count as "inside": the popover, and its trigger button, so
 *                  clicking the trigger toggles instead of closing and instantly reopening
 */
export function useDismiss(open: boolean, onClose: () => void, refs: RefObject<HTMLElement | null>[]) {
  // Always use the latest callback/refs without re-subscribing on every render.
  const latest = useRef({ onClose, refs });
  latest.current = { onClose, refs };

  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) =>
      latest.current.refs.some((r) => r.current && target instanceof Node && r.current.contains(target));

    const onPointer = (e: MouseEvent) => {
      if (!inside(e.target)) latest.current.onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Esc closes only this popover, not the view or dialog behind it.
      e.stopPropagation();
      latest.current.onClose();
    };
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
}
