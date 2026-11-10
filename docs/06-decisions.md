# 06: Decisions & Open Questions

## Decision log

| # | Date | Decision | Rationale |
|---|---|---|---|
| D-001 | 2026-11-10 | Define features before choosing the tech stack | Requirements should drive the stack, not the reverse |
| D-002 | 2026-11-10 | v0.1 scope = personal MVP as defined in [v0.1 Spec](04-v0.1-spec.md) | Smallest version that solves "no plan / getting stuck / missed things" |
| D-003 | 2026-11-10 | Windows 11 is the first target platform | Author's daily machine |
| D-004 | 2026-11-10 | Hard requirement: very low CPU/RAM, must not behave like Chrome/Discord | Always-running background app |
| D-005 | 2026-11-10 | Local-first, sync-ready data model (see [Architecture](05-architecture-principles.md)) | Personal now, product later, no rewrite |
| D-006 | 2026-11-10 | Recurrence stored as iCalendar RRULE | Future calendar sync |
| D-007 | 2026-11-10 | Stack: Tauri 2 · Rust (Tokio, sqlx, jiff, rrule) · SQLite · React 19 + TS + Vite · Tailwind v4 · Motion · cmdk · Zustand | Light background process in Rust; React chosen over SolidJS because the WebView dominates memory and React's UI ecosystem is far richer |
| D-008 | 2026-11-10 | Build the React UI first against sample data, then wrap it in Tauri | Rust toolchain not yet installed; lets the design be reviewed early without throwaway work |
| D-009 | 2026-11-10 | Inter font bundled locally (@fontsource), no CDN | Desktop app must work offline |
| D-010 | 2026-11-10 | Two block kinds: **Background** (context: office, time out; completes on its own, never reminded or counted) and **Tracked** (commitment: reminded, counted, triaged) | Prototype review: ticking "Office done" daily and seeing "didn't happen" on lived time would create false guilt and get the app abandoned |
| D-011 | 2026-11-10 | Day progress counts tracked blocks only ("1 of 3 done") | "0% of day" after a full office day is discouraging and false |
| D-012 | 2026-11-10 | Simple "What should I do?" suggestion moves into v0.1 (due today → habits → fits free time); smart engine stays v0.2 | It is the user's core pain; v0.1 without it doesn't solve the problem |
| D-013 | 2026-11-10 | Adaptive timeline where space follows importance: tracked blocks full height, background compressed, past gaps shrink, upcoming free gaps plannable | Office took 60% of the screen while the evening (where the user gets stuck) was squeezed |
| D-014 | 2026-11-10 | Free time ends at the next block of any kind | Suggesting "free for 13h" before office is wrong |
| D-015 | 2026-11-11 | SQLite via **rusqlite** (bundled), not sqlx | Local single-user database: synchronous calls are simpler and faster to build; sqlx's async and compile-time checks add little here |
| D-016 | 2026-11-11 | Rust owns the data and the day; the UI keeps its logic and saves a snapshot after each change, which Rust writes into normalized tables (only changed rows are touched) | Real database now without rewriting all UI logic; Rust rolls the day over and computes reminders from the database, so no hidden window is needed at login or midnight |
| D-017 | 2026-11-11 | Blocks stored by real date (`day`), soft delete everywhere, append-only `activity` log | Sync-ready and keeps history for the future weekly review and insights |
| D-019 | 2026-11-11 | Name: **Wholeday**. Single source of truth: `productName` in tauri.conf.json (UI gets it at build time); internal identifier unchanged | Easy to rename later without losing data or Windows registrations |
| D-018 | 2026-11-11 | Daily automatic backup (`VACUUM INTO`, last 14 kept) and JSON export in Settings | Never lose data; never be locked in |

## Tech stack: **chosen (D-007)**, background-process footprint to be verified by a measurement spike

Requirements the stack must meet:

1. Very low idle CPU/RAM; background process can run without the UI loaded.
2. Industry standard, maintained, suitable for a commercial product.
3. Native Windows notifications with action buttons, tray, autostart, global hotkey.
4. Local SQLite (or equivalent) with migrations.
5. Path to macOS and mobile later (if required, see open questions).

**Leading candidate (from research, 2026-11-10):** Tauri 2 · Rust core (Tokio, sqlx) · SQLite · SolidJS or Svelte + TypeScript · Tailwind v4.
Note: on Windows the UI uses WebView2 (Chromium-based); lightness depends on unloading the WebView when the window is closed and keeping the background in Rust.

**Alternatives considered:** Electron (rejected: too heavy), Wails/Go (less mature), Flutter (heavier toolchain; strongest if mobile is a priority), native C# WinUI 3 (Windows-only).

## Open questions

| # | Question | Impacts | Status |
|---|---|---|---|
| Q-1 | Windows only, or macOS too? | Stack choice | Open |
| Q-2 | Will a phone companion app be needed (check plan while outside)? | Stack choice, sync priority | Open |
| Q-3 | Is cross-device sync needed before v1.0? | Data layer, backend | Open |
| Q-4 | AI planner wanted eventually? Which provider / local vs cloud? | Backend, privacy | Open |
| Q-5 | Product name | Branding, app ID, installer | Open |
