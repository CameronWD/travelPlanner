# Drag-to-reorder is a rough-only sketching gesture; dated stops and chapters stay date-ordered

The plan replaces the up/down arrows with drag-and-drop, but only for the **rough** (sketch) parts of the itinerary: you can drag rough Stops (reordering within a rough Chapter or the ungrouped run, and moving between rough Chapters + ungrouped) and reorder rough Chapters. **Scheduled (dated) Stops and dated Chapters are not draggable** — their position is their dates. This honours the standing rule (ADR 0008, CONTEXT.md) that *for any dated Stop, dates are the source of truth*. Persistence is via two `FOR UPDATE`-locked actions (cf. ADR 0007): `reorderStops` (rewrites global `sortOrder` + reassigns a rough Stop's `chapterId`) and `reorderChapters` (rewrites rough Chapters' `sortOrder`). A rough Stop can never be dropped into a dated Chapter (dated Chapters aren't registered as drop targets, and `reorderStops` rejects it server-side).

## Considered Options

- **R2 — drag everything; dropping a dated Stop reflows its dates** (firm-up-style ripple to honour the new position). Rejected: a drag would silently rewrite dates and cascade through following Stops — surprising and hard to undo. Moving a dated Stop should be an explicit date edit, not a side effect of a drag.
- **R3 — drag reorders raw `sortOrder` for all Stops, exactly like the old arrows** (dates untouched). Rejected: it preserves today's latent incoherence where a dated Stop's plan-list position can drift out of sync with its actual dates (which the Calendar/Timeline order by). Making the gesture rough-only removes that ambiguity instead of spreading it.

## Consequences

- Dated Stops/Chapters lose hand-reordering entirely; to move them you change dates (the existing adjust-dates / firm-up flow). The arrows are retired on desktop; the mobile overflow "Move up/down" stays as a touch fallback, but only on rough Stops.
- Rough Chapters gain a meaningful explicit order via the existing `Chapter.sortOrder` column; `sortedByStart` now orders dated Chapters by date and rough Chapters after them by `sortOrder`. `sortGroupStops` renders each group's dated Stops in date order and rough Stops by `sortOrder`, so R1 stays coherent.
- Reordering a *non-empty* rough Chapter also moves its Stops' `sortOrder` block (so the group visibly moves), since the itinerary's group order is driven by Stop order; `reorderChapters` additionally persists the canonical rough-Chapter order used for empty Chapters.
- New dependency: `@dnd-kit` (core/sortable/utilities) for accessible pointer + keyboard + touch dragging.
