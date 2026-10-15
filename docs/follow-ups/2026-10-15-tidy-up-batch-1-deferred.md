# Tidy-up pass, batch 1 — deferred minors (2026-10-15)

Left open by `chore/tidy-up-1-foundations` (spec `docs/specs/2026-10-14-tidy-up-pass.md`).
Every item was raised by a task review or the whole-branch review and judged safe to
defer; none changes Traveller-visible behaviour. Fold them into whichever batch next
touches the file (batch 2: writes and the editor; batch 3: shape and hygiene).

## From the whole-branch review (park with a reason)

- **`firmUpTrip` (`server/actions/stops.ts` ~1164) still updates a Chapter by bare id.** The
  id comes from this plan's own Stops, so only a foreign `chapterId` planted before the
  ARCH-TEN-5 fix could reach it; scope the `where` to `{ tripId, ...planScope(plan) }`.
  Batch 2 (card G touches the same file).
- **`restoreStops` with an explicit `forkId` that differs from the rows' own** locks the
  passed plan but writes the rows by id; `reorderStops` refuses the same case. Lock
  correctness only, not tenancy. Batch 2.
- **Reorder/restore with no `forkId` fall back to the Stops' stored `forkId`** and so skip the
  `forksEnabled` gate for a dormant Fork. Cosmetic (Forks are frozen). Batch 2.
- **`markCostPaid` / `markCostUnpaid`** keep inline guards and answer "Cost not found" as a
  form failure rather than `notFound()` (`server/actions/costs.ts` ~289, ~330). Batch 3.
- **`cancelInvite` answers "Invite not found."** rather than `notFound()` — a small
  existence oracle, pre-existing (ADR 0074 rule 1 is the debt). Batch 3. The Invite panel
  also still shows Cancel to non-owners, who now get a refusal. Batch 3 polish.
- **Calendar page's Wishlist read now runs after `readPlan`** (`calendar/page.tsx` ~50) and the
  Plan page's attachments/notes wave adds one hop after `readPlan` (`plan/page.tsx` ~84).
  Batch 3 (card M territory).
- **Nav counts still pay their own Trip read** inside `loadFlagRows` (`lib/flags-loader.ts`
  ~216); spec 1.A wanted the header. Batch 3.
- **MCP PATCH loaders** (`lib/mcp/tools/*-write.ts`) are private guard copies with no
  Surprise check of their own (the downstream action re-checks). Batch 3, card L.

## From the task reviews

- T1 · `components/plan/banned-classes.test.ts` lost its `existsSync` guard on `DIRS` (throws ENOENT if a directory is removed).
- T1 · `test/helpers/walk-sources.ts` doc comment should name its SKIP rule.
- T2 · `requirePlanAccess` lacks an explicit return type; the `as PlanId` casts are redundant.
- T2 · `lib/globe.ts:79` and `lib/globe.test.ts:80` comments still name the deleted `requireTripOwner`.
- T3 · the checklist select landed in `lib/checklist-select.ts` (singular); three similarly named checklist files.
- T3 · `requireRowAccess`'s note/reminder Surprise-ref branches are untested (the reminder ref changed shape and is security-relevant — do this first in batch 2); redundant `where` literals for note/reminder in `findRow`.
- T4 · the four adapter doc comments in stops/items/transport/accommodation still describe the old select fields.
- T5 · four MCP tool test files carry near-identical forwarding `requireRowAccess` mocks (~150 lines) — a shared test double would collapse them; the same forwarding mocks ignore `kind`/`id`, so add one `toHaveBeenCalledWith("stop", id)` per file.
- T5 · `item-photo.ts` adapter drops `surpriseOf`; add a one-line comment that the Surprise check still runs.
- T6 · `confirmProposal` validates `forkId` twice (itself and inside `createStop`); harmless.
- T6 · `kindFor(targetType)` is duplicated in `notes.ts` and `attachments.ts` — move next to `RowKind` in `lib/guards.ts`.
- T7 · `add-from-globe-dialog`'s `firstErrorMessage` no longer prefers the form-level key when both kinds are present.
- T8 · three invented fallback strings (`danger-zone`, `hard-end-date-control`, `cover-image-field`) want a copy glance.
- T9 · `BookingImportResult` keeps its name (spec said `ImportBookingResult`); `BookingImportFailureReason` exported for one helper.
- T10 · `next-steps-loader` reads the Trip row twice; `desktop-home-loader` has no dedicated test file.
- T13 · the Summary test's `rowsFrom` helper re-implements Stop masking without blanking notes (inert) — import `maskPlanStops`.
- T15 · redundant `trip?.` optional chaining in `plan/page.tsx` now that `trip` is non-null.
- T16 · Wishlist reads `forksEnabled` twice (own Trip read + `resolvePlanParam`'s shell).
- T17 · `maskPlanStops` / `mergePlanItems` live in `lib/plan-reads.ts`, whose import graph pulls server code into the feed and Share tests — move the two pure helpers to a pure module.

## Batches 2 and 3

Specced in `docs/specs/2026-10-14-tidy-up-pass.md`, deferred (not queued) on 2026-10-15 while
the Claude Design refinement (DS-01) runs. A future session plans batch 2 from the spec's
Batch 2 section with `superpowers:writing-plans`; the rulings that shaped batch 1 are in
`~/.claude/projects/-work/memory/CURRENT.md` (session handover) and the items above.
