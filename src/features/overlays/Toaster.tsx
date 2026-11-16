// The small "Added · Undo" feedback toast at the bottom of the window.
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";

/** "Added · Undo" feedback toast, bottom center. */
export function Toaster() {
  const toast = useApp((s) => s.toast);
  const { undo, dismissToast } = useApp.getState();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 4000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[80] -translate-x-1/2">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex items-center gap-3 rounded-xl bg-text py-2 pr-2 pl-4 text-[13px] text-bg shadow-soft"
          >
            <span className="max-w-[340px] truncate">{toast.message}</span>
            {toast.canUndo ? (
              <button type="button" onClick={undo} className="rounded-md px-2 py-1 font-semibold text-accent hover:bg-white/10">
                Undo
              </button>
            ) : (
              <span className="w-1" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
