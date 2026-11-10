# 07: UI / UX Design

The app is used every day, many times a day, often when tired (late evening) or stuck.
So the design goal is not "feature-rich": it's **calm, focused, and quietly encouraging**.

> **Design north star:** *Open it, know what to do in 2 seconds, close it, feel good.*

---

## 1. Emotional goals

| Feel | Not | How we get there |
|---|---|---|
| **Calm** | Busy, noisy dashboard | Lots of whitespace, muted colors, one accent, few borders |
| **Focused** | Distracted by everything at once | One primary thing per screen; details only on demand |
| **In control** | Overwhelmed by a long list | Show *now* and *next*, collapse the rest |
| **Encouraged** | Guilty about misses | Neutral language, no red shaming counters, celebrate small wins |
| **Fast** | Waiting, clicking around | Instant open, keyboard everything, no loading spinners |

## 2. Design principles

1. **One thing at a time.** Every screen has one hero element. Everything else is secondary.
2. **Glanceable.** The answer to "what now?" is readable in under 2 seconds, from across the desk.
3. **Progressive disclosure.** Simple by default; detail appears on hover, click, or expand.
4. **Color carries meaning, not decoration.** Area colors and status only. Everything else is neutral.
5. **Motion explains, never decorates.** Short, purposeful transitions; respects "reduce motion".
6. **Forgiving by design.** Every action is undoable. Every miss has a one-click way forward.
7. **Keyboard-first, mouse-friendly.** Every action has a shortcut; every target is easy to click.
8. **Feels native to Windows 11.** Mica backdrop, native title-bar behavior, system light/dark, system font fallback.

---

## 3. Surfaces: where things live

The app is not just a window. Most interactions happen *outside* the main window.

| Surface | Purpose | Frequency | Size / position |
|---|---|---|---|
| **Toast notification** | Reminders with actions | Many times/day | Windows Action Center |
| **Tray icon + menu** | Glance current task, quick actions | Several times/day | System tray |
| **Quick Add** | Capture in ~2 seconds | Several times/day | Floating, centered, 640 px wide |
| **Main window** | Plan and view the day | 2–5 times/day | 1120 × 720 default, min 820 × 560 |
| **Focus (Now) mode** | Work on the current task | During blocks | Main window, full content area |
| **Morning briefing** | Start the day with intention | Once/day | Small window, 480 × 560, centered |
| **Evening review** | Close the day | Once/day | Small window, 560 × 640, centered |
| **Catch-up panel** | Recover after sleep/off | Occasionally | Same as briefing |
| **Onboarding** | First run | Once | Main window, step-by-step |

**Rule:** the most frequent actions (respond to a reminder, add a task, see what's now) must never require opening the main window.

---

## 4. Main window layout

Three zones: **navigation → day → context.**

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ◐  Good evening, Rayha            Tue, 10 Nov  ·  ▓▓▓▓▓▓▓░░░ 68% of day     ⌘K : □ ×│
├──────┬──────────────────────────────────────────────────────┬──────────────────────┤
│      │                                                      │  NOW                 │
│  ◉   │  18:00 ─────────────────────────────────────────     │ ┌──────────────────┐ │
│ Today│        ▌ Personal time                  done ✓       │ │ ● Client         │ │
│      │  19:00 ▌                                             │ │ Fix login bug    │ │
│  ◎   │  20:00 ─────────────────────────────────────────     │ │                  │ │
│ Focus│                                                      │ │    ◯ 32:14 left  │ │
│      │  21:00 ▌ Client · Fix login bug        ◀ now         │ │                  │ │
│  ☐ 3 │ ━━━━━━━▌━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 21:28 ━━━━━━━   │ │ [ ✓ Done ]  [ ⏵ ]│ │
│ Inbox│  22:00 ▌ Study · DSA – graphs                        │ └──────────────────┘ │
│      │        ▌                                             │                      │
│  ▦   │  23:00 ▌ Reading · 30 min                            │  NEXT · 22:00        │
│ Plans│  23:30 ─────────────────────────────────────────     │  Study · DSA graphs  │
│      │                                                      │                      │
│      │                                                      │  ANYTIME TODAY       │
│      │                                                      │  ○ Reply to client   │
│      │                                                      │  ○ Read 1 article    │
│  ⚙   │                                                      │                      │
│      │                                                      │  ⌄ 2 didn't happen   │
└──────┴──────────────────────────────────────────────────────┴──────────────────────┘
   72px          flexible (timeline)                               320px
```

### Zones

| Zone | Contents | Notes |
|---|---|---|
| **Header** (48 px) | Time-of-day greeting · date · day progress bar · `Ctrl+K` hint · window controls | Custom title bar on Mica. Progress bar = planned blocks completed. |
| **Navigation rail** (72 px) | Today · Focus · Inbox (count) · Plans (templates) · Settings | Icons + small labels. No collapsible sidebar: always the same. |
| **Day timeline** (flexible) | Vertical timeline of the day; blocks colored by area; live "now" line | Auto-scrolls to *now* on open. Past blocks fade to 50% opacity. |
| **Context panel** (320 px) | NOW card · NEXT · Anytime today · Didn't happen (collapsed) | The "answer" column. Readable at a glance. |

### Responsive behavior
- **< 1000 px wide:** context panel collapses under the header as a compact NOW bar.
- **< 820 px:** navigation rail becomes icon-only.
- Remembers size & position per monitor.

### Timeline block design

```
 ▌ Client · Fix login bug                    21:00 – 22:00
 ▌ ☐ reproduce  ☐ patch  ☐ test                    ⋯
```
- 4 px left stripe in area color + very light tint (8% opacity) of the same color as background.
- Title in medium weight; time right-aligned in tabular numerals.
- Subtasks shown only if the block is ≥ 45 min tall.
- Hover → quick actions (✓ Done · ⏵ Start · ⏰ Snooze · ⋯). Drag to move, drag bottom edge to resize.
- States: **planned** (normal) · **active** (glow ring + "now" tag) · **done** (✓, muted, strike-free) · **skipped/missed** (dashed outline, muted).
- Free gaps ≥ 30 min show a faint "+ Add" target on hover.

---

## 5. Focus (Now) mode

Everything disappears except the current task. This is the "get into the zone" screen.

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│                         ● CLIENT                                   │
│                                                                    │
│                      Fix login bug                                 │
│                                                                    │
│                         ╭───────╮                                  │
│                       ╱           ╲                                │
│                      │   32:14     │      ← calm progress ring     │
│                       ╲           ╱                                │
│                         ╰───────╯                                  │
│                                                                    │
│              ☑ reproduce    ☐ patch    ☐ test                      │
│                                                                    │
│                [ ✓  Done ]     [ +10 min ]     [ ⏸ ]               │
│                                                                    │
│                                                                    │
│                      Next · 22:00 · Study                          │
└────────────────────────────────────────────────────────────────────┘
```

- Large type, centered, generous space. Background softly tinted with the area color.
- Progress ring drains smoothly (no ticking seconds animation: calmer).
- `Esc` returns to Today. `Space` = done. `+` = extend 10 min.
- When the block ends: gentle transition → "Nice. Next up: Study at 22:00" (or free-time suggestions).

---

## 6. Quick Add

Spotlight/Raycast-style. Appears in < 100 ms on `Ctrl+Alt+Space`, from anywhere.

```
╭──────────────────────────────────────────────────────────────╮
│  ＋  client call 9pm 45m #client                             │
├──────────────────────────────────────────────────────────────┤
│  ● Client    📅 Today 21:00 – 21:45    ⏱ 45 min    Fixed     │
│  ⚠ Overlaps with “Client · Fix login bug”                    │
╰──────────────────────────────────────────────────────────────╯
   Enter save  ·  Tab edit details  ·  Esc close
```

- Parsed result appears **live** as chips below the input: the user sees what will be saved.
- Recognized tokens are subtly highlighted inside the input text.
- `Tab` expands into the full editor without losing what was typed.
- After save: box closes with a soft check animation; a small "Added · Undo" toast appears for 4 s.

---

## 7. Tray

**Icon:** a minimal ring that fills with the day's progress. A small dot appears when something needs attention (neutral color, not red).

**Left-click** → compact popover (no full window):

```
╭────────────────────────────────╮
│  NOW · 21:28                   │
│  ● Fix login bug     32 min    │
│  [ ✓ Done ]  [ Focus ]         │
│ ────────────────────────────── │
│  Next  22:00  Study · DSA      │
│ ────────────────────────────── │
│  ＋ Quick add      Ctrl+Alt+␣  │
│  ◐ Open Today                  │
╰────────────────────────────────╯
```

**Right-click** → menu: Open · Quick add · Pause reminders (30 min / 1 h / until tomorrow) · Review my day · Settings · Quit.

---

## 8. Notifications (toasts)

Short, scannable, max 3 buttons.

| Type | Title | Body | Buttons |
|---|---|---|---|
| Upcoming | **Study · DSA graphs** | Starts in 5 min · 22:00 – 23:00 | Start · Snooze · Skip |
| Starting | **Time for Study** | DSA graphs · 1 hour | Start focus · Snooze · Skip |
| Ending | **Client block is ending** | Fix login bug: done? | Done · +10 min · Not yet |
| Didn't happen | **Fix login bug didn't happen** | Want to find it a new spot? | Tomorrow · Backlog · Open |
| Catch-up | **While you were away** | 3 things are waiting for you | Review |

- Title = the task (what), body = when / context. Never generic ("Reminder!").
- App icon + area color accent where Windows allows.
- Sound: soft, single, optional; silent by default for Office area.

---

## 9. Morning briefing

```
╭──────────────────────────────────────────╮
│                                          │
│   Good morning ☀                         │
│   Tuesday, 10 November                   │
│                                          │
│   Your day · Workday plan                │
│   ▌ 09:00  Office                        │
│   ▌ 18:00  Personal                      │
│   ▌ 21:00  Client · Fix login bug        │
│   ▌ 22:00  Study · DSA graphs            │
│   ▌ 23:00  Reading                       │
│                                          │
│   ⏳ Due today: Send invoice              │
│   ↻ From yesterday: Read 1 article        │
│                                          │
│   [  Looks good  ]    Adjust    Holiday ▾ │
╰──────────────────────────────────────────╯
```

- One primary button. Should take ~10 seconds.

## 10. Evening review: "Close your day"

Three short steps, progress dots at top. Target: under 60 seconds.

```
 ● ○ ○                                        ○ ● ○                                   ○ ○ ●
╭─────────────────────────────╮   ╭──────────────────────────────────╮   ╭─────────────────────────────╮
│  Nice work today            │   │  2 things didn't happen          │   │  Tomorrow · Wednesday       │
│                             │   │                                  │   │  ▌ 09:00 Office             │
│       ◯ 5 / 7               │   │  Read 1 article                  │   │  ▌ 21:00 Client             │
│   ✓ Office                  │   │  [Tomorrow] [Backlog] [Let go]   │   │  ▌ 22:00 Study              │
│   ✓ Personal                │   │                                  │   │                             │
│   ✓ Client · login bug      │   │  Gym                             │   │  ＋ Add something           │
│   ✓ Study · DSA             │   │  [Tomorrow] [Backlog] [Let go]   │   │                             │
│   ✓ Reading                 │   │                                  │   │  [ Good night ☾ ]           │
│          [ Next → ]         │   │          [ Next → ]              │   │                             │
╰─────────────────────────────╯   ╰──────────────────────────────────╯   ╰─────────────────────────────╯
```

- Starts with **what went well**, not what was missed.
- "Let go" instead of "Delete": makes dropping a task feel healthy, not like failure.

---

## 11. Visual language

### Typography
| Use | Font | Size / weight |
|---|---|---|
| UI | **Inter** (variable), fallback Segoe UI Variable | 14 px / 400–500 |
| Headings | Inter | 20–28 px / 600, tight letter-spacing |
| Times & numbers | Inter with **tabular numerals** | so times align in columns |
| Focus timer | Inter Display | 56–72 px / 300 (light, calm) |

### Spacing & shape
- 4 px base grid; common steps 4 · 8 · 12 · 16 · 24 · 32 · 48.
- Corner radius: 8 px (small), 12 px (cards), 16 px (windows/popovers).
- Shadows: very soft, low-opacity; prefer subtle borders + surface contrast over heavy shadows.
- Window backdrop: **Windows 11 Mica**, with solid fallback.

### Color

Neutral, warm-leaning base with **one accent**. Area colors are muted so the timeline never looks like a rainbow.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | #F7F7F5 | #141416 | Window background (under Mica) |
| `surface` | #FFFFFF | #1C1C1F | Cards, panels |
| `surface-2` | #F0F0EE | #232327 | Hover, inputs |
| `border` | #E6E6E3 | #2C2C31 | Hairlines |
| `text` | #1A1A1C | #EDEDEF | Primary text |
| `text-muted` | #6B6B70 | #9A9AA2 | Secondary text |
| `accent` | #5B5BD6 | #8B8BF5 | Primary actions, now line, focus |
| `success` | #2F9E6E | #4CC38A | Done states |
| `attention` | #C98A1B | #E0A84A | "Needs attention" (never red) |
| `danger` | #D14D4D | #F07171 | Destructive actions only (delete), and only on hover: never for missed tasks |

**Area palette** (muted, distinguishable in both themes; user can change):

| Area | Color |
|---|---|
| Office | Slate blue `#5B7BB5` |
| Client | Teal `#2E9C9C` |
| Study | Violet `#8A6BD1` |
| Personal | Sage green `#6FA86F` |
| Reading | Amber `#C7923E` |
| Extra 1–3 | Rose `#C96B8A` · Sky `#4FA3D1` · Stone `#8C8C84` |

All text/background pairs must meet **WCAG AA** contrast.

### Theme
- Follows Windows light/dark by default.
- Optional: **"Evening dim"**: auto-switch to dark after a set time (default: with evening review time). Matches the user's late-night work pattern.

### Iconography
- **Lucide**, 1.5 px stroke, 16/20 px sizes. Never mix icon styles.

### Motion
| Interaction | Animation | Duration |
|---|---|---|
| Hover / press | background fade, 0.98 scale on press | 120 ms |
| Panels, popovers | fade + 4 px slide | 180 ms, ease-out |
| Task done | check draws in, block softly settles | 250 ms |
| Day complete / review | progress ring fills | 600 ms |
| Window open (Quick Add) | fade + slight scale from 0.98 | 140 ms |

- All motion disabled when Windows "reduce animations" is on.

---

## 12. Moments of happiness (small, never cheesy)

- **Time-aware greeting**: "Good morning / afternoon / evening" in the header.
- **Day progress ring** in tray and header fills as the day goes well.
- **Completion feel**: a satisfying check animation + optional soft sound.
- **"Nice work today"**: evening review opens with wins, not misses.
- **Quiet streak hints** (v0.2): "Study · 5 days", shown small, never as pressure.
- **Empty states with warmth**: e.g. Inbox empty: *"Clear mind. Nice."*
- **No guilt**: missed items are "didn't happen", counters are neutral amber, never red.

## 13. Voice & copy

| Instead of | Say |
|---|---|
| Overdue! / Failed | Didn't happen |
| Delete | Let go (for tasks) · Delete (for templates/settings) |
| You missed 5 tasks | 5 things are waiting for you |
| Error saving | Couldn't save: retrying… (and it does) |
| Reminder! | Time for Study |

Short, human, second person. No exclamation marks except in genuine celebration.

---

## 14. Keyboard map

| Shortcut | Action | Scope |
|---|---|---|
| `Ctrl+Alt+Space` | Quick add | Global |
| `Ctrl+K` | Command palette | App |
| `1` / `2` / `3` / `4` | Today / Focus / Inbox / Plans | App |
| `T` | Jump to today / now | Today |
| `←` / `→` | Previous / next day | Today |
| `N` | New task in selected slot | Today |
| `Space` | Mark selected/current done | Today, Focus |
| `S` | Snooze | Today, Focus |
| `+` | Extend current block 10 min | Focus |
| `Ctrl+Z` | Undo | App |
| `Esc` | Close / back | Everywhere |

---

## 15. Accessibility

- WCAG AA contrast in both themes.
- Visible focus ring (accent, 2 px) on every interactive element.
- Full keyboard navigation; logical tab order.
- Respects Windows text scaling and "reduce animations".
- Color is never the only signal: states also use icons/labels (✓, dashed outline, text).
- Minimum hit target 32 px.

---

## 16. Design → build checklist

- [ ] Design tokens (colors, type, spacing, radius, motion) defined once in Tailwind theme.
- [ ] Clickable prototype of Today, Focus, Quick Add, Tray popover, Briefing, Review: reviewed before full build.
- [ ] Light + dark verified for every screen.
- [ ] Reduce-motion and 150% scaling verified.
