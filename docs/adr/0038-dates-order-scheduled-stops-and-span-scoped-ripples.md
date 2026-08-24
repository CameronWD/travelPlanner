# Dates order scheduled Stops; drags and date edits ripple span-scoped, never whole-trip

Supersedes ADR 0021's reflow semantics (drag-to-reorder itself stays, as does band self-healing); restores ADR 0008/0014's "a dated Stop's position *is* its dates" for rendering.

## Context

ADR 0021 made `sortOrder` the ordering spine, with dates meant to follow it via reflow. In practice the sync was half-built and the reflow was a sledgehammer, producing the two field-reported failures:

1. **Any drop re-dated the whole trip.** `reorderStops` fed *every* scheduled Stop through `flowDates` from `trip.startDate` with same-day handoff — collapsing every intentional gap, shifting the plan to start at the trip's start date, and doing all of this even when the drag only moved a *rough* Stop (with no Undo offered on that path).
2. **Re-dating a Stop didn't move its tile.** The editor rendered purely by `sortOrder`, but `setStopDates` never renumbered — so the one gesture that *should* reposition a dated Stop (editing its dates) left the page order stale and the dates non-monotonic. Its ripple also repacked every following dated Stop back-to-back, eating gaps on a mere date edit.

## Decision

1. **Dates are the render order for scheduled Stops.** Every view, the plan editor included, reads scheduled Stops in date order. Rough Stops keep their traveller-placed slot relative to their neighbours (`sortOrder`). Re-dating a Stop therefore moves its tile with no extra machinery.
2. **Dragging a scheduled Stop is a span-scoped date edit that preserves gaps.** Only the Stops between the old and new positions (inclusive) are re-dated, flowing from the affected span's original start; each unmoved Stop keeps its nights *and its lead-in free days* (the one exception is the stop whose arrive date anchors the window — its lead-in already elapsed before the window start and is never re-applied, else a drag would duplicate the gap and extend the trip); everything outside the span keeps its exact dates. A drag never changes the trip's overall length as a side effect. Dragging a Chapter moves its block with the same semantics.
3. **A date edit ripples only on collision.** Later Stops shift forward just enough to stay non-overlapping, each keeping its own lead-in slack; shortening a stay moves nobody (the gap grows). No contiguous repack.
4. **Dragging a rough Stop never touches scheduled dates.** Rough drags are pure reorder, as ADR 0014 always had them.
5. **Pins and Undo carry over unchanged.** Pinned Stops hold and conflicts Flag rather than overwrite (ADR 0021 §2); the "N stops shifted" one-tap Undo toast stays for drags and now also appears when a date edit's collision-push shifts other Stops.
6. **A Stop's payload rides with it — except Transport.** When a Stop is re-dated, its scheduled Items keep their offset from the arrive date (one whose day falls off a shortened stay un-slots back to the Stop's things-to-do list, never dangles), and its Accommodation's check-in/out shift by the same offset — all counted in the toast and covered by Undo. Transport times never auto-move (a booked leg is date-anchored and has two endpoints that may move differently); a leg whose times no longer line up with its endpoints' dates raises a mismatch Flag instead. A genuinely immovable booking is expressed by pinning the Stop.

## Considered Options

- **Keep `sortOrder` as the spine and finish the sync** (date edits renumber `sortOrder`, reflow made minimal): rejected — two sources of truth to reconcile forever, for no behaviour the dates-rule doesn't already give.
- **Span reflow that collapses gaps within the span**: rejected — drags would quietly eat slack days, the exact class of surprise being fixed.
- **Insert-and-push-everything** (all later Stops shift by the moved Stop's length): rejected — a drag would change the trip's end date and trip Hard-end-date flags could fire as a side effect of a reorder.
- **Revert to rough-only dragging (ADR 0014)**: rejected again for ADR 0021's original reason — un-dating a Stop to move it removes it from every dated view.

## Consequences

- `sortGroupStops`'s premise ("sortOrder already tracks date order") is retired; renderers order scheduled Stops by date. `sortOrder` remains meaningful for rough Stops (and for slotting rough Stops between dated neighbours).
- `reorderStops` loses the whole-plan `flowDates` pass and the `trip.startDate` anchor; the reflow input is the affected span only, with lead-in slack preserved per Stop.
- `applyStopDates` (adjust-dates dialog) replaces its contiguous repack with the collision-push rule.
- Chapter bands still self-heal on any member date change (ADR 0021 §4) — unaffected.
- Every path that re-dates a Stop (drag span reflow, collision-push edit, Firm up) must also shift that Stop's scheduled Items and Accommodation and run the Transport mismatch check — and the Undo snapshot must now cover Item dates and Accommodation check-in/out, not just Stop dates.
