// A calm banner when Windows won't show Wholeday's notifications, so reminders don't silently vanish.
// Checked on start and whenever the window comes back into focus (e.g. after fixing it in Settings).
import { useEffect, useState } from "react";
import { BellOff, X } from "lucide-react";
import { isDesktop, notificationsStatus, openNotificationSettings, type NotificationsStatus } from "@/platform/desktop";
import { Button } from "@/components/ui";
import { IconButton } from "@/components/IconButton";

const MESSAGE: Record<Exclude<NotificationsStatus, "on">, string> = {
  "app-off": "Windows notifications are off for Wholeday, so your reminders won't show.",
  "all-off": "All Windows notifications are off, so your reminders won't show.",
};

export function NotificationsBanner() {
  const [status, setStatus] = useState<NotificationsStatus>("on");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    const check = () => {
      notificationsStatus()
        .then(setStatus)
        .catch(() => setStatus("on"));
    };
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  if (status === "on" || hidden) return null;
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-attention/10 px-5 py-2 text-[13px]" role="status">
      <BellOff size={15} className="shrink-0 text-attention" />
      <span className="min-w-0 flex-1">{MESSAGE[status]}</span>
      <Button size="sm" variant="secondary" onClick={() => void openNotificationSettings()}>
        Turn on in Windows
      </Button>
      <IconButton size="sm" label="Not now" icon={<X size={14} />} onClick={() => setHidden(true)} />
    </div>
  );
}
