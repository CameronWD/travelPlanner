# Adaptive trip Home: a phase-derived front door that absorbs the Today view

## Context

A Trip had a flat row of ~10 tabs and landed on the planning canvas
(`Overview`). Nothing answered the question you actually have when you open a
Trip: *where is this at, and what should I do next?* Two tabs came close but
missed it — **Today** (the live during-trip screen) and **Summary** (the full
read-only report) — and both require dates, so a half-sketched Trip saw only an
empty state. The information a traveller wants up front was scattered across the
tabs and never adapted to whether the Trip was still an idea, weeks away, or
underway.

## Decision

1. **Add a `Home` tab as the default Trip landing.** The planning canvas stops
   being the landing and moves to a tab named **Plan**.

2. **Home is driven by a derived `Phase`** — `Sketching`, `Planning`,
   `Final prep`, `Travelling`, `Past` — computed from the Trip's start date and
   today (a missing end date falls back to the start date for the boundaries).
   Phase is **never stored**; it is recomputed on read. Each phase decides which
   modules Home leads with and in what order.

3. **The live during-trip view (Today) becomes the `Travelling` phase of Home,
   and the standalone `Today` tab is removed.** The `day/[date]` full-day view
   stays, and Home links into it.

4. **Home's "Next steps" wraps the existing `detectFlags` problems plus forward
   planning nudges** (rough Stops to firm up, Stops with no Accommodation,
   undated Chapters, no packing list, unbooked Transport), ranked with problems
   ahead of nudges and weighted by phase, each deep-linking to where you act.

5. **Summary stays as the comprehensive read-only report**, distinct from Home:
   Home is the glanceable, forward-looking front door; Summary is the full
   backward-looking picture.

## Consequences

- **A future reader won't find a Today tab** — it is Home's `Travelling` phase.
  This ADR is where that "where did Today go?" question is answered.
- **Phase is derived, not migrated.** No schema change; it stays correct as dates
  move, and Trips with a start but no end still resolve via the end→start
  fallback. A date-less Trip is always `Sketching`.
- **Home is a small phase state machine.** Adding or reordering the modules a
  phase shows is localised to that phase's branch; the heavy data still lives in
  (and is linked to from) the existing tabs.
- **Navigation becomes primary + overflow:** Home · Plan · Calendar · Budget ·
  Summary always visible, the rest under a **More** menu, with a real bottom tab
  bar on mobile. This is a UI pattern, easily adjusted, and not the subject of
  this ADR beyond Home taking the default slot.
- **Reversible at a price:** undoing this means re-adding a static landing and a
  Today tab — cheap in markup, but the `Phase` concept now also feeds the trips
  list, so unwinding it touches more than one screen.
