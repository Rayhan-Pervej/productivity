# Wholeday: notes for Claude

Calm Windows desktop day planner that lives in the tray. v0.1.0 shipped (2026-11-16); next is v0.2
(see `docs/03-roadmap.md`). Product docs: `docs/` (decision log in `docs/06-decisions.md`).

## Stack
- **Tauri 2 (Rust)** core + **React 19 / TypeScript 7 / Vite** UI, Tailwind v4, Motion, Zustand, cmdk.
- **SQLite via rusqlite**, owned by Rust: `%APPDATA%\app.productivity.desktop\productivity.db`.
- Windows only. pnpm. Rust via `~/.cargo/bin` (Git Bash: `PATH="$HOME/.cargo/bin:$PATH"`).

## Commands
```bash
pnpm tauri dev        # desktop app (quit the installed Wholeday first: same identity and DB)
pnpm check            # Biome lint + format check, tsc, vitest  (run once after a batch of edits)
pnpm check:rust       # rustfmt --check, clippy -D warnings, cargo test
pnpm format           # Biome + cargo fmt
pnpm tauri build      # installer: ONLY when the user asks
```

## Layout
- `src/lib/`: pure, tested logic. `parse.ts` (quick add), `time.ts`, `day.ts`, `repeat.ts`,
  `scale.ts` + `timelineLayout.ts` (timeline geometry), `sounds.ts`.
- `src/store/`: Zustand. `app.ts` (persist wiring), `slices/*` (ui, blocks, tasks, routines, plans),
  `day.ts` (pure rollover), `helpers.ts` (`change` = state change + undo + toast).
- `src/components/`: shared UI (Button, IconButton, Select, TimeSelect, SegmentedControl, ContextMenu,
  SettingRow, StepDots, Page…). `src/features/<area>/`: screens. `src/features/dev/`: dev-only tools.
- `src/platform/desktop.ts`: bridge to Rust commands/events.
- `src-tauri/src/`: `store/` (types, save, load, day rollover, `schedule.rs` = which reminders fire),
  `reminders.rs` (scheduler, toasts, actions), `sound.rs`, `tray.rs`, `window.rs`, `notify_settings.rs`.

## How it works
- UI keeps logic and saves a snapshot after each change; Rust writes changed rows (soft delete,
  activity log). Rust rolls the day over at midnight and computes reminders from the DB, with no window.
- Closing the window destroys the WebView; the app stays in the tray (~5 MB).
- Timeline layout must never depend on the clock. Empty time uses the gap curve in `lib/scale.ts`
  (always shorter than tracked time of the same length). Day range = waking day from quiet hours.
- Plan my day / Close my day: once a day (`settings.lastMorning` / `lastEvening`), opened by
  `features/system/useDailyMoments.ts`, a toast, or the tray. Deadlines show only in Plan my day.
- Toasts are silent; the app plays its own sound (Windows won't attach custom sounds to unpackaged apps).

## Rules (from the user)
- **Never write the em dash character.** Use a period, comma or colon.
- **One reusable component per UI pattern.** Never hand-copy a widget; extend the shared one.
- Think product and UX first, then engineering. Calm, readable UI; light theme text ≥ 4.5:1 contrast.
- **No installer/release build and no commit/push unless asked.** Conventional Commits, SemVer tags
  (`vX.Y.Z`, annotated); version lives in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
- Lint exceptions only with a `biome-ignore … : reason` comment.
- **Work token-efficiently:** grep for exact lines, batch edits, one check run, few screenshots, short replies.

## Gotchas
- Write multi-line edit scripts with the Write tool, not bash heredocs (quotes/backslashes break).
- Python on Windows writes CRLF; `.gitattributes` normalizes to LF on commit (warnings are harmless).
- Dev-only deep links for screenshots: `?t=HH:MM`, `?theme=light`, `?view=settings`, `?overlay=briefing`,
  `?planstep=2&planpick=2`, `?strip`, `?hoverband=2:30 PM`, `?day=-1`. Headless Edge works for screenshots;
  seed data by writing localStorage key `productivity-prototype` from a temporary page in `public/` (delete after).
