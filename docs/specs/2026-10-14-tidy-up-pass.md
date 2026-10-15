# Spec — The 2026-10-14 tidy-up pass

**Status:** agreed in the 2026-10-14 session (grill). One spec, three
sequential branches. Target `main`, each branch merged and deployed by Cam
before the next starts. **Batch 1 is built** on `chore/tidy-up-1-foundations`
(2026-10-15), awaiting Cam's review, merge and deploy. **Batches 2 and 3 are
deferred, not queued** — Cam is doing the Claude Design refinement (`DS-01`)
first; a future session plans batch 2 from this spec's Batch 2 section with
no new grilling.
**Source:** `docs/audits/2026-10-14-architecture-review.html` (sixteen
candidates A–P, six verified bugs, and the routing of every open follow-up;
also published at https://claude.ai/artifact/FZickqRiUEfmSLXxz4BttR). The
cards are leads; the decisions here win.

## What this is, and is not

A **deepening pass**: places where one interface can absorb several
hand-written copies, plus the bugs found while looking, plus the open
follow-ups that those interfaces close or make trivial. Vocabulary follows
the review's glossary: *module, interface, implementation, deep/shallow,
seam, adapter, leverage, locality*.

It is **not** a feature branch, a redesign, or a Fork investment. Forks stay
in the code and must stay correct, but nothing fork-specific is deepened
(decided 2026-10-14; see `docs/open-follow-ups.md`, *Settled*). It does not
change any Traveller-visible behaviour except where a bug is fixed, and each
of those is listed under *Bugs* below.

## Decisions from the grilling

| # | Decision |
|---|---|
| Q1 | Three sequential branches, one spec. Each branch runs the full pipeline (writing-plans → subagent-driven development) and the full gate before it is reported finished. |
| Q2 | The Plan reader is **plan-aware**: `readPlan(tripId, viewer, plan: PlanId)` with the fork gate inside it; real-plan readers pass `REAL_PLAN`. The viewer is a required argument. CONTEXT.md says *Plan*, not *itinerary*; code follows. |
| Q3 | Card F is **minimal**: `duplicateTrip` reads the real plan only; no shared graph copier. Duplicate keeps working; the copy has no Forks. |
| Q4 | A `forkId` that is not a Fork of the Trip, or Forks switched off, is **not found on writes**; reads keep falling back to the real plan. |
| Q5 | One failure contract: `ActionResult<T>` from every action, form-level key `"_"`, optional `code`. ADR 0074 records the three conventions. |
| Q6 | `revalidateTrip(tripId, ...scopes)` with the scopes `plan`, `money`, `lists`, `journal`, `travellers`, `trip`; layout-wide only for `trip` and `travellers`; `revalidateAccount()` for profile. The six `router.refresh()` calls after actions come out where a scope now covers the page. |
| Q7 | Plan-editor reconciliation: five rules (adopt when idle; hold while pending; compare by content; Undo restores only touched rows; one revert path). |
| Q8 | Import boundaries become ESLint **errors**, including `lib` may not import `server`; pure reads move to `lib/*-reads.ts`. `noUncheckedIndexedAccess` declined (1,907 errors). |
| Q9 | `lib` folders without barrels: `auth/`, `money/` (finished), `feedback/` + `feedback/cli/`, `map/`, `share/`. Last task of batch 3. |
| Q10 | Page tests: **rewrite the mocks, keep the assertions.** Shared builders in `test/builders/`; query-shape-only assertions move to the reader's unit test and the integration tier. |
| Q11 | Dependencies: minor and patch bumps only; `@types/node` to 22. Majors recorded as follow-up `TD-01`. |
| Q12 | Between batches Cam merges and deploys; the next branch starts from fresh `main`. The spec, ADR 0074, the review and the follow-ups edits ship on branch 1. No Feedback notes are open, so no `Resolves-Feedback:` trailers are owed. |

## Branch rules

Same as every branch: never commit to, merge into, rebase onto or push
`main`; never deploy; never run `feedback:resolve`; subagents never run
`feedback:pull`; don't commit `next dev`'s CLAUDE.md block.

Branch names: `chore/tidy-up-1-foundations`, `chore/tidy-up-2-writes-editor`,
`chore/tidy-up-3-shape-hygiene`. Branch 1 is the current
`chore/tidy-up-review`, renamed.

## Verification tiers

Per `CLAUDE.md`. In addition:

- Any task that changes a Prisma query or a `*-reads.ts` module adds or
  extends a test in `test/integration/` for it (PX-02b).
- Any task that deletes a guard test replaces it with the lint rule in the
  same commit, and `npx eslint .` runs clean.
- `npm run knip` runs clean at the end of every branch.
- A task that fixes one of the *Bugs* below writes the failing test first.

---

## Bugs (verified 2026-10-14, each fixed with a test)

| Id | Where | What | Card |
|---|---|---|---|
| TB-01 | `lib/nav-counts.ts:134` | Sidebar badge omits `homeTimezone` from the Flag input; `flagEmptyDays` and `flagReturnLegAfterHardEnd` read it (`lib/flags.ts:943, 968`). Badge and Summary can disagree. Fixed in 1.B for `homeTimezone`; the whole-branch review (2026-10-15) found a second cause — the badge dropped Surprise placeholders that Summary counts — fixed then too (see 1.B). | B |
| TB-02 | `lib/compare.ts` via `computePlanMetrics` | Compare shows Nights 0 for the real plan where Summary says 34 (LA-215). | B |
| TB-03 | `server/actions/stops.ts:191-196, 329-334` | `createStop` checks the Chapter by `forkId` only; a real-plan Chapter from another Trip passes (ARCH-TEN-5). | C |
| TB-04 | `server/actions/stops.ts:495` vs `components/trip/stop-form-dialog.tsx:457` | `updateStop` returns the ADR 0073 refusal under `"_"`; the form renders `"_form"`. | D |
| TB-05 | `server/actions/trips.ts:534-541` | `duplicateTrip` copies Fork rows into the new real plan. | F |
| TB-06 | `server/actions/stops.ts:1326` | A second, published `assignStopToChapter` with no chapter-ownership check; `chapters.ts:252` is the real one. Delete and drop from the allowlist. | P |
| TB-07 | `components/trip/itinerary-manager.tsx:1600, 1660, 1673, 1698, 1761` | Awaited reorders with no catch; Undo `.then` with no `.catch`. | G |
| TB-08 | `server/actions/forks.ts` `getComparison` | Compare read every plan unfiltered by Surprise; now reads through `readPlan` and hides the inside like every other page (CONTEXT.md **Surprise**). | A/B |

---

## Batch 1 — Foundations and bugs (`chore/tidy-up-1-foundations`)

### 1.J · A test seam for the database
- [x] Done — `7a195f2f`/`44be6703`.
- `test/builders/` with `trip()`, `stop()`, `transport()`, `stay()`, `item()`,
  `cost()`, `chapter()`, `traveller()` returning Prisma-shaped rows with
  realistic defaults (a dated Trip, three Stops, a Home base with timezone).
  Overrides by partial. No new dependency.
- `test/helpers/db-mock.ts`: `mockDb()` building the `@/lib/db` mock from a
  list of delegates; used by every test this pass touches. Existing inline
  mocks elsewhere are left alone.
- One shared `walkSources()` in `test/helpers/` replaces the five private
  `walk()` copies in the guard tests that survive.

### 1.B · Flags take rows from one place
- [x] Done — `bd19ec0d`/`8e3a09a9`.
- `loadFlagRows(tripId, viewer)` in `lib/flags-loader.ts` is the only read;
  `flagsFromRows(rows)` the only road to `detectFlags`. The four private
  selects in `nav-counts`, `next-steps-loader`, `desktop-home-loader` and
  `compare` are deleted. TB-01 and TB-02 fixed here with their tests. Once
  1.A lands, `loadFlagRows` is a projection of the Plan reader.
- *As built (amended 2026-10-15):* `loadFlagRows` is **not** a projection of
  `readPlan`; it keeps its own five reads (Trip, Stops, Transports,
  Accommodation, Items) through the viewer's Surprise fragments. It now also
  appends the plan's Surprise placeholders (one per hidden root Item, masked
  to `{ id, stopId, category: "OTHER", date, startTime, endTime, lat: null,
  lng: null }`) so the badge counts the same days as Summary (`0887555a`).
  `homeTimezone` is required on `HomeTripInput` and `PhasePlanning`'s trip
  type so TB-01 cannot silently recur (`109b53e7`).

### 1.A · One Plan reader behind the pages
- [x] Done — `9e6a542a`/`67660302`/`867a033b`, plus pages `d37da0a8`,
  `7ab20f22`, `cbfcc956`, `2b88959f`, `cd533d9c`.
- `lib/plan-reads.ts`: `readPlan(tripId, viewer, plan)` in `cache()`,
  returning typed rows (Stops, Transports, Accommodation, scheduled Items,
  Costs, Chapters, Exchange rates, Day titles) with Surprise visibility
  applied and placeholders merged; `resolvePlan(tripId, planParam)` for the
  fork gate; `readTripHeader(tripId)` widening `TRIP_SHELL_SELECT` so
  `tripSlugFor` and `loadNavCounts` read from it instead of their own
  queries.
- Pages moved onto it: Summary, Print, Plan, Budget, Calendar, Wishlist
  (plan part), Compare, Share, the Calendar feed route, the Share
  `opengraph-image`. Each keeps only rendering. `findShareLink` gains
  `cache()` and the three route handlers use it.
- `surprise-readers.guard.test.ts` is deleted: the viewer is a required
  argument and the type system enforces it.
- Page tests rewritten per Q10.
- Closes NAV-03's data half (header data from the layout's read).
- *As built (amended 2026-10-15):* Share and its `opengraph-image`
  deliberately stay **off** `readPlan`: ADR 0051's floor wants their own
  dial-gated reads, so an off dial means the query never runs. Share
  reuses only `mergePlanItems`; the OG image reads through
  `loadShareStops`. `loadNavCounts` still has its own Trip read — through
  `loadFlagRows`' `trip.findUnique` — rather than reading the header.

### 1.C · One entity guard and one plan guard
- [x] Done — `dc3da59c`, `5c995eb3`, `1841fc57`/`46bb8356`, `d0e2f18d`,
  `fa60fd17`.
- `requireRowAccess(kind, id)` and `requirePlanAccess(tripId, forkId)` in
  `lib/guards.ts`; the 14 private copies deleted; `requireTripOwner`
  deleted. Transport's lack of a Surprise variant is a documented branch.
- Every write that accepts `forkId` (costs, stops, items, transport,
  chapters, stop-flow, booking import) calls `requirePlanAccess`. Not found
  on failure (Q4). Closes ARCH-TEN-5 (TB-03), ARCH-TEN-9 (`targetId` on
  `uploadAttachment` / `addNote` goes through `requireRowAccess`), BI-12.
- *Added by the whole-branch review (2026-10-15):* five more writers took a
  client `forkId` with only `requireTripAccess` and now call
  `requirePlanAccess` — `firmUpSegment`, `firmUpTrip`, `reorderStops`,
  `restoreStops`, `createAccommodation` (`76c99ddd`). ARCH-TEN-5 needed the
  Chapter check on `updateStop` (rough), `reorderStops`, `restoreStops` and
  `firmUpSegment` too, not only `createStop` (`0aafcaa8`).
  `assignStopToChapter` (`chapters.ts`) goes through `requireRowAccess`, so
  a surprised Traveller is refused (`62dca8c2`). Two inline cost guards remain
  by design: `markCostPaid`/`markCostUnpaid` keep their own equivalent
  access check, already reviewed and listed under the sitrep's "Deliberate —
  do not fix these".
- ARCH-TEN-10: cancelling an Invite requires owner-or-admin, the same
  predicate as creating one. **ARCH-TEN-11 was struck, not built** — see the
  dated note on it in `docs/architecture-sitrep-2026-09-22.md`: its premise
  (that `getRecentActivity` sending a member's user id tells the browser
  something it didn't already know) doesn't hold, so `activity.ts` is
  unchanged.

### 1.D · One failure contract
- [x] Done — `4819189b`, `734a141f`/`8511d15d`, `7fe54719`/`d138d9ac`.
- Per ADR 0074. `fail()` gains `code`; `"_form"` retired at its five
  writers and ten readers; `formError()` and `firstErrorMessage()` in
  `action-failure.ts`; the two private copies deleted; `run-tool.ts` loses
  its shape-sniffing. TB-04 fixed with a test that the Stop form shows the
  refusal.
- *Amended 2026-10-15:* there is no return-type assertion (ruled against
  adding one). The shape is held by `lib/action-result.guard.test.ts`, which
  scans `server/actions` for the legacy shapes (`success: false, error`,
  `_form`, `ok:`), and `lib/server-action-exports.test.ts`, which pins every
  `"use server"` module's exports to an allowlist. The three admin panels
  (`access-requests`, `allowed-emails`, `error-reports`) still read
  `errors._form` and were missed by the first grep (it skipped `app/`); they
  now read `formError()` (`5d0564b1`). ADR 0074 rule 2 amended to match.

### 1.F · Duplicate reads the real plan only
- [x] Done — `b9472599`.
- `duplicateTrip` reads with `REAL_PLAN` scope (TB-05). Test: a Trip with a
  Fork duplicates its real plan only and the copy has no Forks.

### 1.P-bugs · Deletions that are bugs or dead
- [x] Done — `fa60fd17` (TB-06), `b0857665`.
- TB-06 (`stops.ts` `assignStopToChapter`), `lib/reorder-transports.ts`,
  the four dead trigger buttons, the unused `homeCountryCode` prop.

---

## Batch 2 — Writes and the editor (`chore/tidy-up-2-writes-editor`)

### 2.E · A revalidation module
- `lib/revalidate.ts`: `revalidateTrip(tripId, ...scopes)` with the Q6 table
  and `revalidateAccount()`. All 164 `revalidatePath` calls in
  `server/actions` replaced; the nine local helpers deleted. Layout-wide
  only for `trip` and `travellers` (NAV-02). The six `router.refresh()`
  after actions removed where covered. A test derives "every page that
  reads a table is in the scope that writes it" from a declared map.
  ADR 0064 gains a dated amendment: revalidation goes through this builder.

### 2.G · A plan-editor state module
- `components/plan/plan-editor-state.ts`: a pure reducer and commands
  (`reorder`, `assignChapter`, `setNights`, `setDates`, `firmUp`, `undo`)
  returning `{ state, request?, undo? }`; the Q7 five rules enforced
  inside. `ItineraryManager` dispatches and renders. Snapshot = touched
  rows; `restoreStops` receives only those. One revert path (TB-07).
  Closes ARCH-CMP-1, -2, -3. ARCH-CMP-4: the empty-chapter delete button
  gets its 44px hit area. Reducer tests replace the handler-capture drag
  tests; the render test keeps its rendering assertions (Q10).

### 2.H · One undoable-mutation hook
- `components/ui/use-undoable-action.ts`: `{ apply, persist, revert, undo }`
  owning rejection handling and toast copy; `toastWithUndo` becomes its
  implementation. The manager's nine try/catch copies, the four Undo
  implementations and `unschedule-item-button` go through it. The local
  `toastRejected` is deleted in favour of `action-failure.ts`.

### 2.I · A Cost fields sub-form
- `components/money/cost-fields/`: `useCostFields(seed)`, `toCostPayload()`,
  `costToFormState(row)`; `inline-cost-fields.tsx` and `cost-seed.ts`
  folded in. Used by the Transport, Item and Accommodation forms, both cost
  editors and the MCP `completeInlineCost`. One ADR 0037 implementation;
  the `null` versus `undefined` drift ends. BI-04: warnings recompute from
  the shared state after an edit.

### 2.K · An audited-update helper
- `auditedUpdate(delegate, id, data, plan)` in `lib/activity.ts` typed over
  the Prisma delegate; the 15 read-before / 19 `describeChanges` sites use
  it; the 39 `as unknown as Record` casts go. ARCH-OBS-3: the swallow in
  `recordActivity` reports through `reportError` (ADR 0059) before it
  swallows.

---

## Batch 3 — Shape and hygiene (`chore/tidy-up-3-shape-hygiene`)

### 3.L · PATCH-shaped updates
- `updateStop`, `updateTrip`, `updateAccommodation` accept
  `Partial<Input>` and merge on the server inside the action that already
  holds the row. The MCP `loadXForPatch` / `mergeXPatch` helpers and the
  second access check are deleted. The Stop timezone default is decided in
  one function (today four places).

### 3.M · One day-assembly module
- `buildDayModel(rows, date, viewer)` in `lib/day-view-model.ts`, called by
  `day-view-loader` and `travelling-home-loader`; `getDays(tripId, dates,
  viewer)` reads the carousel window once (NAV-05).

### 3.N · Import boundaries as lint
- The Q8 rule set in `eslint.config.mjs` as errors; the five guard tests it
  replaces deleted; `client-zod.guard` and `server-action-exports` kept.
  The 14 `lib → server` imports resolved by moving pure reads to
  `lib/*-reads.ts`; the 4 `lib → components` types moved to `lib`; the 3
  `components → lib/db` and 1 `components → app` imports fixed.

### 3.P · Hygiene sweep
- Shared zod primitives `isoDate` (real-calendar-date, not format-only) and
  `hhmm` in `lib/validations/primitives.ts`; the 10 + 6 copies replaced.
  `plural` once; `formatISODate` at its 5 inline sites; `paidPct` once
  (capped at 100, the majority rule) with the four callers on it.
- Playground hygiene leads still live: `CHIP_TOUCH` → a `Chip` `touch`
  prop; `EmptyState` once in `timeline.tsx`; Badge `success`/`warning`
  variants on status tokens with the call-site workaround removed;
  `timeline.tsx` double import and per-render `BY_VALUE`.
- ARCH-ADR-4, -5: bare "Member" and "Command palette" in Traveller-facing
  or assistive copy replaced per CONTEXT.md (**Traveller**, **Search**).
- 15 `globals.css` text tests re-expressed over PostCSS; `page-widths.test`
  stops shelling out.
- One-off scripts moved to `scripts/archive/`, their npm entries removed,
  knip's entry list narrowed to recurring scripts.
- BI-10 (`lib/fx.ts` base URL), BI-13 (`AiUsage` row written in a `finally`
  after a paid call), BI-14 (`sameCity`: whole-word containment only when
  the shorter name is ≥ 4 characters and the countries agree), BI-16
  (`DESIGN-BRIEF.md:311`).
- Deferred test minors: `invites.test` asserts the Invite shape;
  `push-subscribe` conflict retry gets a test; `digest-dispatch` asserts
  the cooldown `where` is keyed on `slot` without `localDate`; ADR 0055
  `offset < 0` case tested.
- Dependencies: minor and patch bumps; `@types/node` 22 (Q11).

### 3.O · `lib` folders (last)
- `lib/auth/`, `lib/money/` finished, `lib/feedback/` + `cli/`, `lib/map/`,
  `lib/share/`; direct imports, no barrels (Q9). `tsc`, `knip`, the suite.

---

## Folded follow-ups, by card

ARCH-TEN-5, -9, -10, -11 → 1.C · ARCH-CMP-1..4 → 2.G · ARCH-OBS-3 → 2.K ·
ARCH-ADR-4, -5 → 3.P · NAV-02 → 2.E · NAV-03 → 1.A · NAV-05 → 3.M ·
LA-215 → 1.B · PX-02b → 1.J/1.A · BI-04 → 2.I · BI-10, -12, -13, -14, -16 →
1.C/3.P · deferred minors (2026-09-21) → 3.P · playground hygiene → 3.P.

## Out of scope (recorded, not built)

RG-01; ARCH-DAT-2, -5, -7, -8, -9, -10, -11, -12, -13; ARCH-TEN-6, -8, -12;
ARCH-OBS-4, -5, -6, -7; NAV-01, NAV-04; BI-01, -02, -03, -05, -06, -07,
-08, -09, -11, -15, -17; PX-01, PX-03; the layout-audit harness deferred
list; the playground kit gaps; major dependency upgrades (`TD-01`);
`noUncheckedIndexedAccess`; a shared plan-graph copier; any fork-specific
deepening.
