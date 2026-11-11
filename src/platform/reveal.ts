// The desktop window starts hidden (no white flash). Show it once the saved state has loaded
// and the first real frame has been painted.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { whenHydrated } from "@/store/app";

export async function revealWhenReady() {
  await whenHydrated();
  // Two frames: one for React to commit the loaded state, one for the browser to paint it.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const win = getCurrentWindow();
  if (!(await win.isVisible())) {
    await win.show();
    await win.setFocus();
  }
}
