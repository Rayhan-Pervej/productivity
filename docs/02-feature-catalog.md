# 02: Feature Catalog

All features, across all versions. Each one states the **problem it solves**.
The **Ver** column links to the [Roadmap](03-roadmap.md).

Legend: `0.1` personal MVP · `0.2` · `0.3` · `1.0` product · `later` unscheduled

---

## PLAN: structure with near-zero effort

| ID | Feature | Problem it solves | Ver |
|---|---|---|---|
| P1 | **Day templates** (Workday, Weekend, Holiday, custom) | Never plan from a blank page | 0.1 |
| P2 | **Task types**: fixed-time, flexible ("1h tonight"), deadline, habit, backlog/anytime | Real life isn't one flat list | 0.1 |
| P3 | **Areas** (Office, Client, Study, Personal, Reading, custom) with colors | Separate contexts at a glance | 0.1 |
| P4 | **Duration, priority, energy level** per task | Enables smart "what next" suggestions | 0.1 |
| P5 | **Recurrence rules** (weekdays, every N days, Nth weekday, last day of month) | "Repeat daily" isn't enough | 0.1 |
| P6 | **Brain-dump inbox**: capture now, sort later | Ideas get lost otherwise | 0.1 |
| P7 | **Subtasks & notes/links** on tasks | Tasks need context | 0.1 |
| P8 | **Overlap warning** when planning | Double-booking goes unnoticed | 0.1 |
| P9 | **Projects** inside areas (e.g. Client A, DSA course) | Group related work | 0.3 |
| P10 | **Reading / learning list**: save links, auto-schedule reading time | Saved articles are never read | 0.3 |
| P11 | **Goals** linked to tasks with progress % | Daily work feels disconnected from bigger aims | 0.3 |

## DO: remove the "what now?" moment

| ID | Feature | Problem it solves | Ver |
|---|---|---|---|
| D1 | **Today view**: timeline of the day, color-coded by area | See the whole day in one glance | 0.1 |
| D2 | **"Now" view**: current task, time left, what's next | Focus on one thing | 0.1 |
| D3 | **Global quick-add hotkey** with natural language ("client call 9pm 30m") | Capture in ~2 seconds from anywhere | 0.1 |
| D4 | **Actionable notifications** (Done / +10 min / Snooze / Skip / Start) | Handle reminders without opening the app | 0.1 |
| D5 | **Tray icon + menu** (current task, quick add, open, pause reminders) | Always reachable, never in the way | 0.1 |
| D6 | **Command palette** (`Ctrl+K`): do anything by keyboard | Speed | 0.1 |
| D7 | **"What should I do?" engine**: suggests a task from free time, energy, priority, deadlines | *The* core pain point: getting stuck | 0.2 |
| D8 | **Focus timer** (Pomodoro / custom countdown) tied to the current task | Starting is easier with an end in sight | 0.2 |
| D9 | **Always-on-top "Now" strip** (optional mini widget) | Keep the current task visible | 0.2 |

## ADAPT: when the plan meets real life

| ID | Feature | Problem it solves | Ver |
|---|---|---|---|
| A1 | **Missed-task triage**: Do now / Tomorrow / Backlog / Drop | Missed tasks become guilt, then the app gets abandoned | 0.1 |
| A2 | **Wake-up catch-up**: on PC start/wake, show reminders that fired while off/asleep | Reminders silently lost | 0.1 |
| A3 | **Shift the rest of today** by N minutes in one click | Running late breaks the whole plan | 0.2 |
| A4 | **Light-day mode**: keep essentials, defer the rest | Sick/bad days | 0.2 |
| A5 | **Carry-over limit**: flag tasks postponed 3+ times, suggest drop/re-plan | Infinite backlog | 0.2 |
| A6 | **Estimate learning**: "Client tasks take 1.5× your estimate" | Chronic over-planning | 0.3 |

## REFLECT: the self-improvement layer

| ID | Feature | Problem it solves | Ver |
|---|---|---|---|
| R1 | **End-of-day review** (~60 sec): done vs planned, triage leftovers, peek at tomorrow | Day never "closes"; tomorrow starts unplanned | 0.1 |
| R2 | **Morning briefing** on first PC start: "Here's your day" + quick adjust | Day starts without intention | 0.1 |
| R3 | **Streaks with forgiveness** (1 free miss/week) | Strict streaks break → users quit | 0.2 |
| R4 | **Weekly review**: planned vs actual, hours per area, wins/misses | No feedback loop | 0.3 |
| R5 | **Insights**: "You skip study on Thursdays", "Best focus: 9–11 PM" | Data without meaning | 0.3 |
| R6 | **Client time log**: hours per client, export for billing | Freelance billing | 0.3 |

## NOTIFICATIONS: done right

| ID | Feature | Problem it solves | Ver |
|---|---|---|---|
| N1 | **Start / end reminders** with configurable lead time (default 5 min before) | Core reminder function | 0.1 |
| N2 | **Escalation**: gentle → stronger → missed list | Easy to ignore or too annoying | 0.1 |
| N3 | **Quiet hours** + respect Windows Focus Assist / Do Not Disturb | Don't interrupt sleep, calls, presentations | 0.1 |
| N4 | **Smart snooze** (10 min / after this block / tonight / tomorrow) | Fixed snooze is too rigid | 0.1 |
| N5 | **Batching**: "3 things pending" instead of 3 pop-ups | Notification fatigue | 0.2 |
| N6 | **Per-area notification profiles** (Office silent, Study loud) | Contexts differ | 0.2 |
| N7 | **Full-screen / meeting detection** → defer notifications | Games, calls, presentations | 0.2 |

## TRUST & QUALITY: what makes it a real product

| ID | Feature | Problem it solves | Ver |
|---|---|---|---|
| Q1 | **Autostart with Windows**, lives in tray | Must always be running | 0.1 |
| Q2 | **Local-first, offline**, instant start | Speed and privacy | 0.1 |
| Q3 | **Autosave, crash-safe, undo** for every action, trash bin | Data loss destroys trust | 0.1 |
| Q4 | **Sleep/wake, time-zone and DST handling** | Reminders break silently | 0.1 |
| Q5 | **Low resource use**: ~0% idle CPU, background < 20 MB | "Not another Discord" | 0.1 |
| Q6 | **2-minute onboarding**: "describe your typical day" → first template | Empty app = abandoned app | 0.1 |
| Q7 | **Dark / light theme**, high-DPI, multi-monitor | Polish | 0.1 |
| Q8 | **Automatic local backups + export** (JSON/CSV) | Lock-in and data loss | 0.2 |
| Q9 | **Auto-update** | Shipping fixes | 0.2 |
| Q10 | **Opt-in crash reporting** | Finding bugs in the wild | 1.0 |

## PRODUCT: when it goes public

| ID | Feature | Ver |
|---|---|---|
| X1 | Multi-device sync (PC ↔ laptop) | 1.0 |
| X2 | Mobile companion app (view plan, quick add, notifications on the go) | 1.0 |
| X3 | Calendar sync (Google / Outlook) | 1.0 |
| X4 | AI planner: "plan my evening, I have 3 hours" | 1.0 |
| X5 | Accounts, licensing, Free/Pro tiers | 1.0 |
| X6 | Accountability partner / shared goals | later |
| X7 | Themes, integrations (GitHub, Notion, Todoist import) | later |

---

## Ideas inbox

> Add new needs discovered while using the app here. Triage them into a version during weekly planning.

- _(empty)_
