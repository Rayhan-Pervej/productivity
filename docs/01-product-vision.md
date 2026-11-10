# 01: Product Vision

## The problem

The user's day has a natural shape: office work, personal time outside, then an evening block
for client work, study, self-improvement, news and reading. But **nothing is planned**.
The result is getting stuck: free time arrives and there's no clear answer to *"what should I do now?"*

Three root causes, not one:

1. **Decision paralysis**: free time with no default action.
2. **No structure**: nothing planned, so the day drifts.
3. **No feedback loop**: no way to tell whether things are improving or slipping.

A plain to-do list solves none of these. It stores tasks; it doesn't plan, prompt, adapt, or reflect.

## The product in one sentence

> An always-on desktop companion that **plans your day with you, tells you what to do now,
> adapts when plans break, and shows you your progress**, while staying invisible and light.

## Who it's for

**Primary (v0.x):** the author, a developer with a day job, freelance client work in the evenings,
and personal goals (study, reading, self-improvement).

**Future (v1.0+):** knowledge workers, freelancers and students with a *split day*
(job + side work + self-improvement) who want structure without heavy planning overhead.

## The core loop

Every feature must belong to one stage of this loop. If it doesn't, it doesn't belong in the product.

```
   ┌──────────────────────────────────────────────┐
   ▼                                              │
 PLAN  ───►  DO  ───►  ADAPT  ───►  REFLECT  ─────┘
 (2 min)    (now)     (life       (60 sec / day,
                      happens)     weekly review)
```

| Stage | Question it answers |
|---|---|
| **Plan** | What does my day look like? (with near-zero effort) |
| **Do** | What should I be doing *right now*? |
| **Adapt** | The plan broke: what now? |
| **Reflect** | How did I do, and what should change? |

## Product principles

1. **Decide for me when I'm stuck.** The app should always be able to answer "what now?"
2. **Planning must cost less than 2 minutes a day.** Templates and defaults, not blank pages.
3. **Plans will break: make recovery one click.** Never punish, always offer a way forward.
4. **Interrupt only when it matters.** Respect focus, meetings, quiet hours. Notification fatigue kills apps.
5. **Invisible until needed.** Lives in the tray. Near-zero CPU, small RAM. Never "another Discord".
6. **Your data is yours.** Local-first, works offline, exportable, never lost.
7. **Keyboard-first, fast everywhere.** Capture anything in ~2 seconds.
8. **Build for one, design for many.** Ship for personal use first, but architect for a real product.

## What this product is *not* (for now)

- Not a project-management tool (no Gantt charts, no teams in v0.x).
- Not a note-taking app (notes on tasks only).
- Not a full calendar replacement (calendar sync comes later).

## Success criteria for v0.1

- Used **every day for 2 weeks** without going back to "no plan".
- Getting stuck ("what do I do now?") happens **rarely**: the app answers it.
- **No missed reminder** goes unnoticed, including when the PC was asleep or off.
- Idle resource use is **unnoticeable** (target: ~0% CPU, background process < 20 MB RAM).
