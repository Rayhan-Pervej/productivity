// Window chrome for the desktop app: our header *is* the title bar (no thin native bar on top).
// Provides the app logo, standard Windows caption buttons, and a drag strip for screens without a header.
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktop } from "@/platform/desktop";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config";

/** The app mark: a calm progress ring. Same artwork as the app/taskbar icon. */
export function AppLogo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <rect x="0" y="0" width="32" height="32" rx="7" fill="#5B5BD6" />
      <circle cx="16" cy="16" r="9.6" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="5" />
      <circle
        cx="16" cy="16" r="9.6" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"
        strokeDasharray="60.3" strokeDashoffset="19.5" transform="rotate(-90 16 16)"
      />
    </svg>
  );
}

/** Minimize / maximize-restore / close, sized and styled like native Windows 11 caption buttons. */
export function WindowControls({ className }: { className?: string }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized);
    void win.onResized(() => void win.isMaximized().then(setMaximized)).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  if (!isDesktop) return null;
  const win = getCurrentWindow();
  const button = "grid h-full w-[46px] place-items-center text-muted transition-colors hover:text-text";

  return (
    <div className={cn("flex h-full shrink-0 self-stretch", className)}>
      <button type="button" aria-label="Minimize" className={cn(button, "hover:bg-surface-2")} onClick={() => void win.minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore" : "Maximize"}
        className={cn(button, "hover:bg-surface-2")}
        onClick={() => void win.toggleMaximize()}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M2.5 2.5V0.5h7v7h-2M0.5 2.5h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button
        type="button"
        aria-label="Close"
        className={cn(button, "hover:bg-[#c42b1c] hover:text-white")}
        onClick={() => void win.close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}

/** A slim draggable bar with caption buttons, for full-screen views that have no header (onboarding). */
export function DragBar() {
  if (!isDesktop) return null;
  return (
    <div data-tauri-drag-region className="fixed top-0 right-0 left-0 z-[80] flex h-10 items-center pl-4">
      <AppLogo size={16} className="pointer-events-none" />
      <span className="pointer-events-none ml-2 text-[12px] text-muted">{APP_NAME}</span>
      <WindowControls className="ml-auto" />
    </div>
  );
}
