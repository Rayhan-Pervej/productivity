import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { useApp, type Overlay, type Theme, type View } from "./store/app";
import { parseQuickAdd } from "./lib/parse";
import { isDesktop, startDesktopBridge } from "./platform/desktop";

// Dev-only deep links for reviewing states, e.g. /?ob=1&t=21:25&theme=dark&view=focus&overlay=review
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  const s = useApp.getState();
  const t = q.get("t")?.match(/^(\d{1,2}):(\d{2})$/);
  if (t) s.simulate(Number(t[1]) * 60 + Number(t[2]));
  if (q.get("ob") === "1") useApp.setState({ onboarded: true, settings: { ...s.settings, name: q.get("name") ?? "" } });
  if (q.get("ob") === "0") useApp.setState({ onboarded: false });
  if (q.get("clock")) useApp.getState().updateSettings({ timeFormat: q.get("clock") === "24h" ? "24h" : "12h" });
  if (q.get("theme")) s.setTheme(q.get("theme") as Theme);
  if (q.get("view")) s.setView(q.get("view") as View);
  // ?add=gym fri 7am|pay rent 15 nov: pre-fill items through the real quick-add path
  for (const item of q.get("add")?.split("|") ?? []) useApp.getState().addParsed(parseQuickAdd(item, s.areas));
  // ?steps=a;b;c&stepsdone=1 adds steps to every block happening now (and ticks the first N)
  if (q.get("steps")) {
    const st = useApp.getState();
    for (const b of st.blocks.filter((x) => x.kind === "commitment" && x.start <= st.now && st.now < x.end)) {
      for (const title of q.get("steps")!.split(";")) useApp.getState().addSubtask(b.id, title);
      const fresh = useApp.getState().blocks.find((x) => x.id === b.id)!;
      fresh.subtasks.slice(0, Number(q.get("stepsdone") ?? 0)).forEach((t) => useApp.getState().toggleSubtask(b.id, t.id));
    }
  }
  // ?details=1 opens the details window of the block happening now
  if (q.has("details")) {
    const st = useApp.getState();
    const b = st.blocks.find((x) => x.kind === "commitment" && x.start <= st.now && st.now < x.end);
    if (b) st.openBlock(b.id);
  }
  if (q.has("rollover")) {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const key = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    useApp.setState({ dayKey: key });
  }
  if (q.get("overlay")) s.open(q.get("overlay") as Overlay, q.get("seed") ?? "");
}

// Dev-only: ?menu=app|block|band simulates a right-click so menus can be reviewed in screenshots.
if (import.meta.env.DEV && new URLSearchParams(location.search).get("menu")) {
  const kind = new URLSearchParams(location.search).get("menu");
  setTimeout(() => {
    const target =
      kind === "block" ? document.querySelector('[title^="Open details"]')
      : kind === "band" ? document.querySelector('[aria-label^="Add something during"]')
      : document.querySelector("main");
    if (!target) return;
    const r = target.getBoundingClientRect();
    const x = r.left + Math.min(220, r.width / 2);
    const y = r.top + Math.min(40, r.height / 2);
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }, 600);
}

// Dev-only: ?hoverband=top|bottom simulates hovering a background band's edge (hover guide review).
if (import.meta.env.DEV && new URLSearchParams(location.search).get("hoverband")) {
  const edge = new URLSearchParams(location.search).get("hoverband");
  setTimeout(() => {
    const band = document.querySelector('[aria-label^="Add something during"]');
    if (!band) return;
    const r = band.getBoundingClientRect();
    const y = edge === "bottom" ? r.bottom - 2 : r.top + 2;
    band.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: r.right - 40, clientY: y }));
    band.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: r.right - 40, clientY: y }));
  }, 600);
}

// Inside the desktop app: connect to the Rust core (reminders, tray actions, global shortcut).
if (isDesktop) void startDesktopBridge();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
