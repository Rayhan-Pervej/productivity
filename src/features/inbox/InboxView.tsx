// Inbox: things you captured, each waiting for a home (today, a time, or let go).
import { ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/store/app";
import { Button, Kbd, SectionLabel } from "@/components/ui";
import { Page } from "@/components/Page";

export function InboxView() {
  const inbox = useApp((s) => s.inbox);
  const backlog = useApp((s) => s.backlog);
  const { inboxToToday, letGoInbox, backlogToToday, deleteTask, open } = useApp.getState();

  return (
    <Page title="Inbox" subtitle="Things you captured. Give each one a home, or let it go.">
      {inbox.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-dashed border-border py-14 text-center"
        >
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-surface-2 text-success">
            <Check size={18} />
          </div>
          <div className="text-[15px] font-medium">Clear mind. Nice.</div>
          <div className="mt-1 text-[13px] text-muted">
            Capture anything with <Kbd>Ctrl</Kbd> <Kbd>Alt</Kbd> <Kbd>Space</Kbd>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {inbox.map((item) => (
              <motion.div
                layout
                key={item.id}
                exit={{ opacity: 0, x: 24 }}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="flex-1 text-[14px]">{item.title}</span>
                <Button size="sm" variant="primary" onClick={() => inboxToToday(item.id)}>
                  Today <ArrowRight size={13} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => letGoInbox(item.id)}>
                  Let go
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
          <Button variant="ghost" className="mt-2" onClick={() => open("quickAdd")}>
            <Plus size={14} /> Capture something
          </Button>
        </div>
      )}

      {backlog.length > 0 && (
        <div className="mt-10">
          <SectionLabel>Backlog · parked for later</SectionLabel>
          <div className="mt-2 space-y-1">
            {backlog.map((t) => (
              <div key={t.id} className="group flex items-center gap-3 rounded-lg px-1 py-1.5 text-[13.5px]">
                <span className="flex-1 text-muted">{t.title}</span>
                <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => backlogToToday(t.id)}>
                  Bring to today
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger"
                  onClick={() => deleteTask(t.id)}
                  aria-label="Delete"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
