# Drag-to-reorder reflows dates on scheduled Stops & Chapters; Chapter bands self-heal

Reverses the rough-only half of ADR 0014 and tightens ADR 0008/0009's date↔chapter sync.

## Context

ADR 0014 made drag-to-reorder a **rough-only** gesture: scheduled (dated) Stops and
dated Chapters were not draggable, on the principle that a dated Stop's position *is*
its dates (ADR 0008). To reorder a dated Stop you first had to `makeStopRough` it. In
practice that is backwards — making a Stop rough removes it from **every dated view**
(Calendar, Today, Summary, ICS feed all filter rough Stops out, ADR 0009), which is the
very reason its dates were set. So the only route to reorder a dated leg made it vanish
from the views that motivated dating it. Travellers also expect to grab a whole Chapter
(leg) and move it as a block.

Separately, a Chapter's stored date range was only recomputed during a **batch Firm up**.
Dating Stops one at a time via the adjust-dates dialog left the Chapter's range stale, so
its now-dated Stops fell outside the band and the Chapter appeared to vanish — the
"chapters go weird once dated" report.

## Decision

1. **Scheduled Stops and Chapters are draggable.** On drop, the affected scheduled Stops'
   dates **re-flow forward from the anchor** using the existing Firm-up / `flowDates`
   engine (each Stop's nights preserved). Dragging a Chapter moves its whole block of
   Stops and re-flows likewise. **Rough** Stops continue to drag as pure reorder (no
   dates), exactly as before.
2. **Pinned Stops never move.** A Pinned Stop is the pressure valve: the ripple flows
   around it, and a move that cannot fit before a Pinned Stop raises a **Flag** rather
   than overwriting the pin (identical to Firm up today).
3. **No silent rewrite.** A drag **applies immediately** and surfaces a summary of exactly
   which Stops' dates shifted, with a one-tap **Undo**. There is no per-drag confirm modal
   (that friction was judged worse than an Undo).
4. **Chapter bands self-heal.** A Chapter's `startDate`/`endDate` are recomputed to span
   its member Stops on **any** member-Stop date change — not only batch Firm up. Making a
   Chapter's last dated Stop rough reverts the Chapter to rough (clears its band), so a
   dated Chapter is never stranded with no dated Stops.
5. Chapter membership for scheduled Stops stays **computed from dates** (ADR 0008):
   dragging a Stop across a Chapter's date boundary moves it between Chapters via its new
   dates.

## Considered Options

- **Keep rough-only + make revert frictionless** (a drag still needs a prior "make
  rough"): rejected — reverting removes the Stop from dated views, the exact thing the
  Traveller wanted to keep. This was the deciding argument.
- **Preview-then-apply on every drag**: rejected — a modal on every drag is more friction
  than the Undo it replaces.

## Consequences

- Chooses ADR 0014's previously-rejected "R2" (drag everything; dropping reflows dates),
  with the **Undo + pin** guardrails answering the "surprising / hard to undo" objection
  that drove its rejection. ADR 0014's rough-only rule is superseded; `reorderStops` /
  `reorderChapters` gain a reflow-dates path for scheduled entities (still under the ADR
  0007 `FOR UPDATE` lock).
- `makeStopRough` is retained but is **no longer the way to reorder** — only for genuinely
  un-dating a Stop. A clear "Clear dates" affordance replaces the buried overflow entry.
- **Undo** needs the pre-drag date snapshot of the affected span (captured client-side,
  re-applied via an action).
- Self-healing bands mean the adjust-dates action and firm-up share one "recompute the
  covering Chapter's span" step.
