# Shift check and feedback feel

Agreed with Cam 2026-11-23. Two branches. This spec covers both; each has its own plan.

## What Cam asked for

A pass over the whole site on loading states, layout shift and feedback, so it feels seamless.
His words: he likes the loading mark, and it is layout shift that annoys him, not the absence of
skeletons. He has no standout pages; it is a check.

## Unchanged

ADR 0063 stands. No page skeletons, no new `loading.tsx`, no `template.tsx`. The Teepee mark
(`LogoLoader`) stays as the loading signal.

## Branch A: nothing moves, everything answers

### A1. Extend the layout audit (`npm run audit:layout`), kept in the repo

- **Cold load** at phone (profile `iphone17-pwa`) and desktop (profile `1440`), with Globe,
  Account, Summary, Settings, Activity, Today, More and What's new added to the routes measured.
- **Section switch**, phone and desktop: each trip section to its neighbours, day to day, and
  Trips into a trip.
- **After an action**, on five flows: checklist tick, add an Item, add a Cost, vote, mark paid.
- Local demo trip only. Never the real trip.

### A2. Fix what it finds

- A page fails if anything moves without a touch, at any measurable size.
- Confirmed before the pass: the Day view bell widens the phone top bar after paint (0.0014,
  measured 2026-11-23); trip home to Plan on a phone measured 0.133 on 2026-11-20.
- To be judged by the audit, not assumed: the What's new card on the Trips list (it floats, so it
  may not shift anything), and the loading mark's position against the page that replaces it
  (polish decision N1 says it was already placed so nothing moves).
- A fix reserves the space or moves the decision to the server.
- A fix that needs more than a contained change (for example moving a browser-stored preference
  to a cookie) is listed with its reason, not built.

### A3. Feedback sweep

Every control that changes something does one of two things the moment it is used:

1. Shows its result at once (optimistic): ticks, toggles, votes.
2. Shows it is working (the existing `Button` `loading`, or disabled with `aria-busy` on a control
   that is not a `Button`): saves, adds, deletes, uploads.

A control that does neither is fixed with whichever fits. No new patterns.

### A4. Results

`docs/audits/2026-11-23-shift-and-feedback-check.md`: measured before and after, what was fixed,
what waits on Cam.

### Shipping

Main and beta together, on Cam's word.

## Branch B: the feel, built on A, one merge

- **Press response.** Every tappable reacts on press. Shadowed things use the existing `pressable`
  style; flat things (rows, chips, cards, tab bar, icon buttons) get a CSS-only tint and slight
  press. No JavaScript (ADR 0006).
- **Rows slide.** Every list a Traveller can add to, delete from or reorder uses `AnimatedList`.
  A new or changed row eases in with a brief highlight. Static lists are left alone.
- **Tick and pop.** `Checkbox`, `Switch`, `Segmented`, votes and paid marks share the pop and
  strike-through the checklist has.
- **Save tick.** In-place saves only (Settings, Account, Traveller details, Feedback panel, mark
  paid): spinner, then a tick for about a second, then the label. Built once in `Button` and
  `useServerAction`. Dialog saves close at once; the row is the confirmation.
- Reduced motion honoured throughout.
- Ships as a single merge, so one revert returns to branch A. Beta first for a phone check, then
  main on Cam's word (Gasket's ruling; Cam may overturn).

## Out of scope

Sheets and dialogs opening and closing (reworked 2026-11-23, phone checks owed). New toasts.
Phone vibration (iPhone Safari does not offer it). Anything inside a Surprise Stop.

## Order

Branch A is built, verified and reported first. Branch B is planned after that.
