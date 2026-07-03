# Spec — Plan-editor feedback round (2026-07)

**Status:** agreed, ready to build. **Branch:** `feat/plan-editor-feedback`.
**Source:** eleven items of real user feedback on the plan editor, budget, forks, and
photo upload. Terminology follows `CONTEXT.md`.

**New decisions captured this round:** ADR 0021 (drag reflows dates; self-healing chapter
bands — reverses ADR 0014) · ADR 0022 (stop-scoped, optionally-dateless "things to do" —
extends ADR 0019).

Each workstream below is independent enough to build and verify on its own. Acceptance
criteria are the definition of done.

---

## WS-A — Reordering reflows dates (#3, #4, #8) · ADR 0021

- Scheduled Stops **and** whole Chapters become draggable. On drop, the affected scheduled
  Stops' dates **re-flow forward from the anchor** via the existing Firm-up / `flowDates`
  engine (nights preserved). Rough Stops keep dragging as pure reorder.
- **Pinned Stops never move**; a move that can't fit before a pin raises a Flag, never
  overwrites it (as Firm up does today).
- A drag **applies immediately** + shows a "what shifted" summary with one-tap **Undo**
  (pre-drag snapshot of the affected span, re-applied via an action). No per-drag modal.
- **Self-healing Chapter bands:** a Chapter's `startDate`/`endDate` recompute to span its
  member Stops on *any* member-Stop date change (not only batch Firm up). This is the
  root fix for "chapters go weird / disappear once dated."
- **Revert:** surface a clear **"Clear dates"** (make-rough) affordance on the stop card
  (out of the overflow menu). Making a Chapter's last dated Stop rough reverts the Chapter
  to rough (clears its band) so no dated Chapter is left stranded.

**Acceptance:**
- Drag a dated Stop → order changes; its and following Stops' dates re-flow; pinned Stops
  unchanged; toast lists the shift; Undo restores exactly.
- Drag a whole Chapter → its block moves and re-flows; pins respected.
- Hand-date one Stop inside a rough Chapter → the Chapter stays visible, spanning it.
- "Clear dates" on the last dated Stop of a Chapter → Chapter returns to rough & draggable.

## WS-B — Firm-up prominence on the plan page (#7)

- Make "Set dates / firm up" a **prominent, obvious control** on the plan page (per-leg +
  whole-trip), not the current faint ghost buttons. Keep the home entry point.

**Acceptance:** a first-time user finds firm-up on the plan page without hunting.

## WS-C — "Add a thing to do" in the plan editor (#10) · ADR 0022

- Under each Stop in the plan editor, an **"Add a thing to do"** action creates a
  plan-owned Item attached to that Stop (`stopId` set), **date optional** — works on rough
  Stops. Fields: title, Category, **booking reference, cost**, notes, link.
- Cost captured in the same form → rolls into the Budget like any Item cost.
- Once the Stop is dated, the thing-to-do can be slotted to a day/time (sets `date`) and
  then appears on the Calendar; undated ones live only under the Stop in the plan editor.
- **Discriminator audit (sharp edge):** "shared Wishlist idea vs plan-owned Item" moves
  from `date != null` to **`stopId != null` OR `date != null`**. Update `createFork` copy,
  `promoteFork` delete/retag, and the `getComparison` / promotion-preview item filters so
  dateless things-to-do are copied into Forks, replaced on Promote, scoped by `forkId`,
  and never confused with trip-wide ideas. Cover with tests.
- Never label it "Activity" (reserved for the change-log feed).

**Acceptance:**
- Add a thing-to-do to a rough Stop → shows under it; its cost appears in the Budget.
- Give it a date → it appears on the Calendar.
- Create a Fork → the thing-to-do is copied into it; Promote → it replaces the real plan.
- Wishlist ideas still behave exactly as before (shared, unscheduled, not forked).

## WS-D — Inline cost on Transport & Accommodation forms (#9)

- Add cost fields (estimated amount + currency, optional actual + paid date) to the
  Transport **and** Accommodation add/edit forms; on save, create/update the entity's Cost
  → flows into the Budget under the right leg. Existing CostEditor stays for edge cases.

**Acceptance:** create a Transport (and an Accommodation) with a cost in one step → the
cost shows in the Budget without a separate step.

## WS-E — Variant/Fork fixes (#1, #2)

- **#2:** thread the active `forkId` through `QuickAddStops` (and its discreet-mode twin)
  into `createStop`, so "add a place" lands in the **active plan**.
- **#1:** no scoping bug exists (reproduced at the data layer — a Fork carries its own
  copies of the original's Chapters; deleting its Stops leaves empty bands; the real plan
  is untouched). Fix: give every Chapter — **including empty ones** — a clear
  delete/remove control so a variant can be cleared out and rebuilt (with #2 fixed).

**Acceptance:** adding a place while a variant is active creates it in the variant (real
plan unchanged); empty Chapters are removable; emptying then rebuilding a variant works.

## WS-F — "Add a place" inserts at the clicked position (#5)

- `createStop` accepts an **insert anchor** (before/after a given Stop, or a position
  within a Chapter) and sets `sortOrder` (and `chapterSortOrder`) so the new Stop lands
  where it was added, not appended. The per-section `QuickAddStops` rows pass their
  position.

**Acceptance:** adding from a given add-row inserts adjacent to it, not at the bottom.

## WS-G — Cover / photo upload (#6)

- Raise `serverActions.bodySizeLimit` in `next.config.ts` to ~10–12 MiB (aligned with the
  existing 10 MiB `validateUpload` cap) and surface a friendly error if exceeded. Fixes
  the cover-image upload and, with it, journal photos and file attachments (same path).

**Acceptance:** uploading a typical multi-MB phone photo as a trip cover succeeds; an
oversized file shows a friendly, specific error (not a silent failure).

## WS-H — Budget "Add a cost" placement (#11)

- Move the primary "Add a cost" action to the **top** of the Other-costs card (and/or make
  it sticky) so it doesn't sink below a growing list.

**Acceptance:** with many costs entered, the add-cost control is reachable without
scrolling to the bottom.

---

## Non-goals / guardrails

- **No** per-drag confirm modal (Undo instead).
- Keep the **computed date-band** Chapter model (self-healing, not stored membership).
- "**Activity**" stays the change-log feed; planned things-to-do are "**things to do**."
- No new external services; storage stays local-disk in dev.

## Testing notes

Unit tests **mock `@/lib/db`** (no real DB in the suite). Add logic-level tests for: the
reflow-on-reorder path, self-healing band computation, insert-position `sortOrder`, and the
new plan-vs-wishlist discriminator (WS-C is the riskiest — test Fork copy / Promote
round-trips). Component tests for the new forms and drag behaviour where feasible. The
drag reflow and photo upload get a manual app **verify** pass when a database is available
(this sandbox has no Docker/Postgres).
