# Spec — Globe → Wishlist link (2026-07)

**Status:** agreed, ready to build. **Branch:** `feat/globe-wishlist-link`.
**Source:** the deferred "future step" from Globe v1 (see CONTEXT.md, ADR 0023).
Terminology follows `CONTEXT.md`. New decision: **ADR 0025** (seeding = copy +
provenance; overlap on `countryCode`; country-inclusion + proximity-ranking).

Two workstreams, **A first then B** — B reuses A's copy action.

---

## WS-A — Manual pull: seed a Wishlist from Globe Markers · ADR 0025

From a Trip's **Wishlist board**, a member draws on **their own Globe** (a user is
in at most one) to copy Markers in.

- **"Add from Globe"** button on the Wishlist board opens a dialog: a **list**
  (no map) of every Marker in the viewer's Globe, with **search + category
  filter** (reuse `marker-filters` patterns), each row **one-tap "Add"**.
- Adding **copies** the Marker into this Trip's Wishlist as an unscheduled Item
  (mapping per ADR 0025: title, category, lat/lng, address = city+country, link,
  notes = note + folded-in `timing`). Optimistic; toast; row flips to **"✓ added."**
- **Provenance:** new nullable `Item.sourceMarkerId` (→ `Marker`, `onDelete:
  SetNull`). "✓ added" iff an **unscheduled** Wishlist Item in this Trip has that
  `sourceMarkerId`. Removing the Item re-enables adding; **scheduling** it makes
  the Marker re-addable; deleting the Marker nulls the link but keeps the Item.
- Seeding logs the **same** Activity event as any manual Wishlist add.
- **No Globe → no button.** Globe empty → button shows, dialog is an empty state
  ("Your Globe has no markers yet" + link to Globe). Feature keys off the
  **viewer's** Globe membership.

**Acceptance:**
- "Add from Globe" lists the viewer's Markers; Add copies one in, toast, flips to
  "✓ added"; the copied Item appears in the Wishlist with mapped fields.
- Re-opening shows already-added Markers as "✓ added"; deleting the Wishlist Item
  re-enables it; scheduling the copy re-enables it.
- Deleting the source Marker leaves the Wishlist Item intact.
- Viewer in no Globe: no button. Empty Globe: button + empty-state dialog.

## WS-B — Auto-surface: suggest overlapping Markers · ADR 0025

On the Wishlist board, proactively surface Markers that overlap where the Trip is
going.

- **New nullable `Stop.countryCode`**, derived via the existing geocode path
  (ADR 0011); backfill existing located Stops.
- **Match rule:** a Marker surfaces iff its `countryCode` equals any Trip Stop's
  `countryCode` (country decides inclusion). **Proximity to a Stop's coords ranks**
  the matched set (nearest first); markers without coords sort last. Proximity
  never adds/removes.
- **"Suggested from your Globe" strip** on the board (not in a dialog), **expanded
  when non-empty**, capped at **top 5** proximity-ranked, excluding already-added
  Markers. Overflow → "+N more" opens the WS-A dialog pre-filtered to matches.
  Each row one-tap **Add** (same copy action as WS-A).
- **Hidden silently** when: viewer in no Globe, no matches, or Trip has no located
  Stops.

**Acceptance:**
- Trip with a Japan Stop + Japan Markers → strip shows them, proximity-ranked,
  ≤5, excluding added ones; Add copies in and it leaves the strip.
- Marker in a country the Trip doesn't visit → never suggested (still browsable
  via WS-A dialog).
- Trip with only rough/uncountried Stops → strip hidden.
- >5 matches → "+N more" opens the dialog filtered to matches.

## Out of scope / deferred

- Surfacing Markers near a Trip's **existing Wishlist items** (not only its Stops)
  — a proximity-*inclusion* refinement (interpretation ii), recorded in CONTEXT.md.
- Globe-side "push to a trip" flow, multi-select batch add, a map inside the
  dialog, proximity-inclusion / cross-border matches.
