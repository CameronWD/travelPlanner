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

## Amendment 2026-09-27 — desktop Home tiles

At `lg` and up (full at `xl`, narrower 1024–1279), Home stops reusing the phone
layout and renders its own grid, built from the same `Phase` this ADR defines
— nothing about phase derivation changes, only what each phase shows at this
width. Below `lg` the phone Home in this ADR's original decision is untouched.

**Sketching / Planning / Final prep** (§C of
`docs/specs/2026-09-27-desktop-home.md`): a header (name, dates, meta line),
countdown tile with the cover polaroid where the Trip has one, Shared pot,
a Route map fit to the current geographic cluster (not a Chapter — outlying
Stops surface as inset cards instead), and **Sort these out**, built from the
same ranked list this ADR's Decision 4 calls "Next steps" — same ranking
(reminders due within 7 days, then problems, then nudges), same
"the trip's Home screen carries the same information as Next steps" claim,
different heading and tile chrome at this width.

**Travelling**: `Day N of M` (inclusive on both sides — a 4 Dec–8 Jan Trip
reads "Day 5 of 36", matching `describePhase` in `lib/trip-phase.ts`) and
spend so far, replacing the countdown and pot tiles; Today plus a Day map;
Today's journal last. No Upcoming payments, Nearby Wishlist, Day ideas, quick
links or Reminders at this width — the phone Travelling layout keeps all of
those; this is a narrower, glanceable desktop view of the same phase, not a
second implementation of it.

**Past**: header plus wrap-up tiles only.

**Reminders is removed from desktop Home as a tile.** It only ever appears
here as rows inside Sort these out (a reminder due within the next 7 days),
exactly like any other nudge — never a bare "0", never its own panel. The
full Reminders list-and-add surface moved to the Checklists page instead,
above its tabs, visible at every width — not just a `lg` fallback, since
Checklists never had a desktop-only Reminders view to lose. Phone Home is
unaffected: it keeps the Reminders card this ADR always showed there.

Two things this amendment does **not** change: there is no Fork switcher on
desktop Home (it always reads the real plan; the switcher stays on Plan and
Money's own headers), and desktop Home's `h1` is the trip name exactly as
this ADR's Decision 2 intended — the phone header's own `h1` for the same
Trip is simply `lg:hidden` on the Home route so the DOM briefly holds two,
one of them not in the accessibility tree.
