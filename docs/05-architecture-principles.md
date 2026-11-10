# 05: Architecture Principles

v0.1 is for personal use, but these decisions are made **now** so v1.0 (sync, mobile, calendar, AI)
doesn't require a rewrite. They are tech-stack independent.

## 1. Local-first data

- The local database is the source of truth. The app works fully offline.
- A future sync layer replicates local data; it never replaces it.

## 2. Sync-ready data model

| Rule | Why |
|---|---|
| Every record has a **UUID v7** primary key (not auto-increment) | IDs created on different devices never collide; v7 is time-sortable |
| Every record has `created_at`, `updated_at` (UTC) | Conflict resolution during sync |
| **Soft delete** (`deleted_at`) instead of hard delete | Deletions must sync to other devices; enables Trash |
| Optional `device_id` on changes | Debugging sync later |

## 3. Event log

- Every user action is appended to an **activity log**: `created`, `started`, `completed`, `skipped`,
  `snoozed`, `missed`, `moved`, `postponed`, with timestamp and task/occurrence ID.
- Powers: undo, end-of-day review, streaks (v0.2), weekly review & insights (v0.3), AI planner (v1.0).
- Append-only; never edited.

## 4. Standards over custom formats

| Area | Standard |
|---|---|
| Recurrence | iCalendar **RRULE** (RFC 5545): direct path to Google/Outlook sync |
| Time | Store UTC + IANA time zone; keep local wall-clock for fixed events |
| Export | JSON (full fidelity) + CSV (spreadsheets) |
| Dates in API/files | ISO 8601 |

## 5. Separate core logic from UI

```
┌──────────────────────────────┐
│ UI (windows, views)          │  ← replaceable (desktop now, mobile/web later)
├──────────────────────────────┤
│ Core: domain logic           │  ← scheduling, recurrence, triage rules,
│  - scheduler                 │     notifications, NL parser, suggestions
│  - recurrence engine         │
│  - NL quick-add parser       │
├──────────────────────────────┤
│ Storage (local DB)           │
└──────────────────────────────┘
```

- All business rules live in the **core**, never in UI code.
- The UI talks to the core through a small, typed command API.
- Result: the same core can later serve a mobile app, CLI, or sync server.

## 6. Persistent, event-driven scheduler

- The notification schedule is **stored in the database**, not only in memory.
- The scheduler **sleeps until the next due event**: no polling loops (keeps idle CPU ≈ 0%).
- On start / resume / clock or time-zone change: recompute, detect missed events, run catch-up.

## 7. Lightweight runtime

- Background process (tray, scheduler, notifications) must run **without the UI loaded**.
- The UI is loaded on demand and fully unloaded when the window is closed.
- Targets: idle CPU ≈ 0%, background RAM < 20 MB.

## 8. Settings & feature flags

- All settings in one versioned settings store.
- Feature flags from day one → enables experiments and Free/Pro tiers later.

## 9. Schema migrations

- Every database change ships as a numbered, forward-only migration.
- The app migrates on startup and backs up the DB before migrating.

## 10. Privacy by default

- No telemetry in v0.x. Any future analytics/crash reporting is **opt-in**.
- No network calls unless a feature explicitly needs one.
