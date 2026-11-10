# Productivity

A calm, always-running desktop day planner: plans your day with you, tells you what to do now,
adapts when plans break, and shows your progress. Product docs live in [docs/](docs/README.md).

## Status

**v0.1 in progress.** The full UI is done. The desktop core (Tauri + Rust) runs: tray, start with
Windows, global quick-add shortcut, and a reminder scheduler with native notifications.
Next: SQLite storage in the Rust core.

Run the desktop app with `pnpm tauri dev`, or build the installer with `pnpm tauri build`.

## Run the UI

```bash
pnpm install
pnpm dev          # http://localhost:1420
pnpm typecheck
```

The flask button (bottom-left) opens **prototype controls**: simulate the clock, open the
morning briefing / evening review, and preview the tray popover and Windows notification.

The first visit runs onboarding; your profile and plans are remembered in the browser.

Deep links for reviewing states (dev only; `ob=1` skips onboarding, `ob=0&obstep=2` opens a step):
`/?ob=1&t=21:25&theme=dark&view=focus` · `/?ob=1&t=23:50&overlay=review` · `/?ob=1&overlay=catchup`

## Keyboard

| Keys | Action |
|---|---|
| `Ctrl+Alt+Space` / `N` | Quick add |
| `Ctrl+K` | Command palette |
| `1` `2` `3` `4` `,` | Today · Focus · Inbox · Plans · Settings |
| `Space` | Mark current block done |
| `Ctrl+Z` | Undo |
| `Esc` | Close / back to Today |

## Structure

```
src/
  domain/types.ts        domain model (Area, Block, Task, Template)
  data/seed.ts           sample data (replaced by SQLite via Tauri)
  lib/                   pure logic: time, day selectors, quick-add parser
  store/app.ts           Zustand store; actions become Tauri commands later
  components/            shared UI (Button, ProgressRing, Modal) and layout
  features/
    today/               timeline + context panel (Now / Next / Anytime / Didn't happen)
    focus/               focus mode
    other/               Inbox, Plans, Settings
    overlays/            Quick add, command palette, briefing, review, tray & toast previews
```
