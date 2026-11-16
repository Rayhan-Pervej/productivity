// Look and motion shared by the floating surfaces drawn inside the window (popovers, panels, toasts).
export const panel = "fixed z-50 rounded-2xl border border-border bg-surface shadow-soft";
export const pop = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.98 },
  transition: { duration: 0.16 },
};
