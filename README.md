# Wholeday

> To rename the app, change `productName` in `src-tauri/tauri.conf.json`. Everything visible reads it from there.
> The internal identifier (`app.productivity.desktop`) stays fixed, because the database, backups and Windows registrations are tied to it.

A calm, always-running desktop day planner: plans your day with you, tells you what to do now,
adapts when plans break, and shows your progress. Product docs live in [docs/](docs/README.md).

## Status

**v0.1 is done** and used daily. What's in it:

- **Plan:** adaptive timeline (background bands like Office, tracked blocks, steps), plans per weekday, repeats with end dates and per-day exceptions, Inbox / Anytime / Backlog, natural-language quick add (Ctrl+Alt+Space).
- **Daily moments:** Plan my day each morning (pick up to 3, get free slots) and Close my day each evening, from a notification, the tray menu or Ctrl+K.
- **Reminders:** native Windows notifications with actions, one follow-up for unanswered blocks, snooze "until what you're in now ends", quiet hours, a custom sound, catch-up after sleep, a banner when Windows blocks notifications.
- **Desktop (Tauri + Rust):** tray, start with Windows, about 5 MB in the background. Rust owns the day: it rolls over at midnight and computes reminders from the database, even with no window open.
- **Data (SQLite in Rust):** `%APPDATA%\app.productivity.desktop\productivity.db`, daily backups in `backups\` (2 months kept), JSON export in Settings, past days viewable (read only).

```bash
pnpm tauri dev     # desktop app, development
pnpm tauri build   # installer in src-tauri/target/release/bundle/nsis
pnpm test          # UI logic tests (Vitest)
cd src-tauri && cargo test   # data/core tests (Rust)

pnpm check         # before committing: lint + format check (Biome), types, tests
pnpm check:rust    # same for Rust: rustfmt, clippy (warnings fail), tests
pnpm format        # format everything (Biome + rustfmt)
```

## Run the UI

```bash
pnpm install
pnpm dev          # http://localhost:1420
pnpm typecheck
```

In dev builds, the flask button (bottom-left) opens **prototype controls**: simulate the clock,
fire real Windows notifications (including follow-up and snooze), play the sounds, and open Plan my day /
Close my day. They're never in the installed app.

The first visit runs onboarding; your profile and plans are remembered in the browser.

Deep links for reviewing states (dev only; `ob=1` skips onboarding, `ob=0&obstep=2` opens a step):
`/?ob=1&t=21:25&theme=dark&view=focus` · `/?ob=1&t=23:50&overlay=review` · `/?ob=1&overlay=catchup`

## Keyboard

| Keys                          | Action                                       |
| ----------------------------- | -------------------------------------------- |
| `Ctrl+Alt+Space` / `N`    | Quick add                                    |
| `Ctrl+K`                    | Command palette                              |
| `1` `2` `3` `4` `,` | Today · Focus · Inbox · Plans · Settings |
| `Space`                     | Mark current block done                      |
| `Ctrl+Z`                    | Undo                                         |
| `Esc`                       | Close / back to Today                        |

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
