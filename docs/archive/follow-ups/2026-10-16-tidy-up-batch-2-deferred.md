# Tidy-up pass, batch 2 — deferred minors (2026-10-16)

Left open by `chore/tidy-up-2-writes-editor` (spec `docs/specs/2026-10-14-tidy-up-pass.md`).
Every item below was raised by a task review and judged safe to defer; none changes
Traveller-visible behaviour. Grouped by the card the task belongs to.

## Card 2.Q — wording (Task 1)

- The task report wrongly said `lib/og-card.test.ts` was missing. It exists; no copy
  assertion was added to it.

## Batch-1 deferred cleanup (Task 3, `server/actions/stops.ts`)

- `reorderStops` treats an explicit `null` `forkId` on Fork rows as "use the rows'
  own plan", while `restoreStops` refuses the same case. Inconsistent, but both are
  gated the same way, so nothing is reachable through it.
- `reorderRowsForkId` is typed `string | null | undefined` to keep an existing test
  assertion working; normalise it to `?? null` instead.

## Card 2.E — revalidation (Tasks 5, 6)

- Commits `eb783bc5` and `25c0523b` carry a "Claude Sonnet 5" attribution trailer
  instead of the project's "Claude Opus 5.5 (1M context)" one. Cosmetic; left as-is
  so history stays stable.
- `deleteItem`/`deleteAccommodation`/`deleteTransport` also delete the Costs they own,
  but their revalidation only names the `plan` scope, not `money`. Not a real gap:
  every page that reads `money` is a subset of the pages that read `plan`.
- `setForksEnabled` now also revalidates `/trips` through the `trip` scope — a
  harmless widening, not a narrowing.

## Card 2.K — audited update (Tasks 7, 9)

- `chapters.test.ts`'s real-plan "DOES call recordActivity" mock doesn't pass a
  `tripId`; the test passes with it `undefined`.
- No test pins "an update that changes nothing records nothing" through `recordUpdate`.
- An inline Cost write now happens after the Stop's UPDATED activity is recorded; if
  the Cost write then fails, the Activity row describes a change that landed without it.
- No test covers `resolveSurpriseOf`'s `reportError` branch (ARCH-OBS-3's new report-
  before-swallow path).

## Card 2.I — Cost fields (Tasks 10, 11, 12)

- `proposalToFormState`'s fallback paths are untested — unreachable through the
  current seed data.
- The Proposal preview drops the Cost when Paid is ticked with a blank paid amount
  (follows the "refuse, don't drop" ruling, just not previewed).
- `cost.payload()` is computed twice per submit in the entity forms.
- MCP's `update_cost` on a legacy paidAt-only row now clears `dueDate` (or refuses an
  explicit `dueDate`) under the paid rule — true, but not called out in that commit's
  message.
- `costToFormState` repeats `paidFieldsFromRow`'s fallback logic inline instead of
  calling the function.

## BI-04 — Proposal warnings (Task 13)

- `refreshStayWarnings`'s filter removes every string equal to the old warning, not
  just the first one. Safe today because `finish()` already de-duplicates, but worth
  tightening if that changes.

## Card 2.H — the undoable-action hook (Tasks 14, 15)

- The hook's JSDoc should say Undo runs through live callbacks (`applyUndo`/
  `revertUndo` close over functional updaters/dispatch, not a stale snapshot), and
  that `revertUndo` can run after a throwing `applyUndo` — so it must be idempotent.
  Carried forward into the Task 15/17 work rather than fixed at the source.
- No test covers two overlapping runs both keeping `pending` true.
- `run()` itself can still reject if `revert`, `done`, or the toast call throws.
- The "suggest chapters" refusal toast differs in wording between the plan editor
  (shows the server's title message) and `ChaptersManager` (its own
  `suggestResultToast`); `lib/suggest-toast.ts`'s doc comment is stale against this.
- The unschedule-item tests no longer pin "a refused Undo shows the server's `_`
  message" now that the hook owns that path.
- No refusal/rejection tests exist for the Surprise handlers.

## Card 2.G — the plan-editor reducer (Tasks 16, 17)

- A dated chapter drag leaves the chapter's start/end dates optimistic until the
  server's rows arrive — correct, but worth knowing if a date ever looks stale for a
  moment.
- `hiddenTransportIds` is never pruned.
- The firmUp "holds props" test never rerenders mid-write, so it doesn't exercise a
  real concurrent-render case.
- A nights/dates refusal with no server message now falls back to generic copy
  (acceptable, just worth naming).
- A rough self-drop with no preview still sends a no-change `reorderStops` call —
  pre-existing, not introduced by this batch.
- The Undo-failure revert test is pure; if `revertUndo`'s own revert line threw,
  `pending` would stay at 1 — negligible, untested.

## Final whole-branch review

- A server snapshot held during a move is adopted when the move settles
  (`settle` → adopt the held rows). If that snapshot was taken before the move
  landed, the plan can briefly show the move's old order until the next props
  arrive. It heals itself on the next refresh.
- Integration tests were not run in the build container. Before deploy, run
  `npm run test:integration` against a local DB (`docker compose up -d`, then
  `npx prisma migrate deploy`): the access checks in `reorderStops` and
  `restoreStops` changed on this branch.
