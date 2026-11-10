# Wholeday

> To rename the app, change `productName` in `src-tauri/tauri.conf.json`. Everything visible reads it from there.
> The internal identifier (`app.productivity.desktop`) stays fixed, because the database, backups and Windows registrations are tied to it.

A calm, always-running desktop day planner: plans your day with you, tells you what to do now,
adapts when plans break, and shows your progress. Product docs live in [docs/](docs/README.md).

## Status

**v0.1, usable daily.** Full UI, desktop core and database are done:

- **Desktop (Tauri + Rust):** tray, start with Windows, global quick add (Ctrl+Alt+Space), native notifications with actions.
- **Data (SQLite in Rust):** `%APPDATA%\app.productivity.desktop\productivity.db`, daily backups in `backups\` (14 kept), export to JSON in Settings.
- **Rust owns the day:** rolls over at midnight and computes reminders from the database, even when no window is open.

```bash
pnpm tauri dev     # desktop app, development
pnpm tauri build   # installer in src-tauri/target/release/bundle/nsis
pnpm test          # UI logic tests (Vitest)
cd src-tauri && cargo test   # data/core tests (Rust)
```

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
