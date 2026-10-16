# Spec — The 2026-10-14 tidy-up pass

**Status:** agreed in the 2026-10-14 session (grill). One spec, three
sequential branches. Target `main`, each branch merged and deployed by Cam
before the next starts. **Batch 1 is built** on `chore/tidy-up-1-foundations`
(2026-10-15), merged and deployed. **Batch 2 is built** on
`chore/tidy-up-2-writes-editor` (2026-10-16), with card 2.Q (wording) added
by the 2026-10-15 session's grill, merged and deployed. **Batch 3 re-grilled
2026-10-16** against the code after batch 2 (decisions Q13–Q15 and the
*Batch 3 drift* notes below). **Batch 3 is built** on
`chore/tidy-up-3-shape-hygiene` (2026-10-16); awaiting Cam's review, merge
and deploy. Then the Claude Design refinement (`DS-01`).
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
| Q13 | (2026-10-16) 3.L covers **all eight** MCP patch pairs — Stop, Trip, Accommodation, Transport, Cost, Reminder, Item, Chapter — not only the three the card named. |
| Q14 | (2026-10-16) The `lib → server` lint error carries one named exemption: `lib/mcp/tools/**` and `lib/booking-import/confirm.ts` may import `server/actions/*` (they are adapters over the actions), nothing else under `server/`. |
| Q15 | (2026-10-16) `paidPct`: the shared rule wins — 100 only when fully paid, otherwise capped at 99. The three `Math.min(100, …)` copies were wrong (TB-09). |
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
| TB-09 | `lib/past-home-loader.ts:237`, `components/trip/home/budget-glance.tsx:18`, `components/home/desktop/trip-cost-tile.tsx:47` | Paid percentage rounds 99.5 %+ up to "100 %" while money is still owed; `lib/money/summary-lines.ts` `paidPct` already caps at 99 (Q15). | P |
| TB-08 | `server/actions/forks.ts` `getComparison` | Compare read every plan unfiltered by Surprise; now reads through `readPlan` and hides the inside like every other page (CONTEXT.md **Surprise**). | A/B |
| TB-10 | lib/day-view-loader.ts:409 (projectDay) | The Day strip's check-in/check-out dots ignored every stay that did not touch the shown day (from 2026-12-04 a check-in on 2026-12-10 showed 0 dots). Found while planning 3.M; buildDayModel builds the itinerary from every stay. | M |

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
- *As built (2026-10-16):* 131 literal `revalidatePath` calls in
  `server/actions` were replaced, not 164 — the plan's count was measured
  wrong; the nine helpers were as stated. Only **three** `router.refresh()`
  calls remain (two others had already been removed by commits `94e2067c`,
  `3344e125` on 2026-10-06): none of the three follows a revalidating
  action — two follow `markAllRead` (the Activity read marker, deliberately
  not revalidated), one follows a slug-changing `router.replace` — so
  **none is removed**.

### 2.G · A plan-editor state module
- `components/plan/plan-editor-state.ts`: a pure reducer and commands
  (`reorder`, `assignChapter`, `setNights`, `setDates`, `firmUp`, `undo`)
  returning `{ state, request?, undo? }`; the Q7 five rules enforced
  inside. `ItineraryManager` dispatches and renders. Snapshot = touched
  rows; `restoreStops` receives only those. One revert path (TB-07).
  Closes ARCH-CMP-1, -2, -3. ARCH-CMP-4: the empty-chapter delete button
  gets its 44px hit area. Reducer tests replace the handler-capture drag
  tests; the render test keeps its rendering assertions (Q10).
- *As built (2026-10-16):* ARCH-CMP-4 was a size change only — the button
  already had `tap-target` (a 44px coarse-pointer hit area, added
  2026-09-30); the remaining gap was its visible 28px size vs ADR 0029's
  `size-8`, fixed in Task 18 (`b4ee4112`).

### 2.H · One undoable-mutation hook
- `components/ui/use-undoable-action.ts`: `{ apply, persist, revert, undo }`
  owning rejection handling and toast copy; `toastWithUndo` becomes its
  implementation. The manager's nine try/catch copies, the four Undo
  implementations and `unschedule-item-button` go through it. The local
  `toastRejected` is deleted in favour of `action-failure.ts`.
- *As built (2026-10-16):* a rejected (thrown/network) write in the plan
  editor now toasts the handler's own failure copy (e.g. "Couldn't move
  it.") instead of the generic `SOMETHING_WENT_WRONG`; a refusal (the
  action returning, not throwing) still shows the server's `"_"` message.
  This is the hook's contract (ADR 0074's split of guard/validation/
  infrastructure failures) and keeps the copy specific.

### 2.I · A Cost fields sub-form
- `components/money/cost-fields/`: `useCostFields(seed)`, `toCostPayload()`,
  `costToFormState(row)`; `inline-cost-fields.tsx` and `cost-seed.ts`
  folded in. Used by the Transport, Item and Accommodation forms, both cost
  editors and the MCP `completeInlineCost`. One ADR 0037 implementation;
  the `null` versus `undefined` drift ends. BI-04: warnings recompute from
  the shared state after an edit.
- *As built (2026-10-16):* the three entity forms used to silently drop a
  cost amount they couldn't parse and save without it; with the shared
  payload builder they now refuse with "Enter the cost", like the editors
  already did — a bug fix (a typed cost was being silently lost). The same
  builder also refuses Paid ticked with a blank paid amount ("Enter what
  you paid") in every form, where entity forms used to save it unpaid —
  ADR 0037's no-Paid-without-an-amount rule, now enforced everywhere. A
  legacy Cost row with a paid amount but no paid date still opens Paid
  unticked (`paidAt` is the sole "is paid" signal); a legacy row that **is**
  paid but has no recorded paid amount now opens — and stays saveable — with
  the cost amount as its paid amount, in both the forms (`costToFormState`)
  and the MCP (`paidFieldsFromRow`), matching the pre-fill behaviour
  ticking Paid already gave a fresh row. BI-04 keeps the import-time stay
  warning for a Transport end known only by a date (no wall time, so no
  `depAt`/`arrAt` for the shared state to recompute from) — the fix is
  edits refreshing warnings without stale or duplicate entries, not
  removing that warning.

### 2.K · An audited-update helper
- `auditedUpdate(delegate, id, data, plan)` in `lib/activity.ts` typed over
  the Prisma delegate; the 15 read-before / 19 `describeChanges` sites use
  it; the 39 `as unknown as Record` casts go. ARCH-OBS-3: the swallow in
  `recordActivity` reports through `reportError` (ADR 0059) before it
  swallows.
- *As built (2026-10-16):* `auditedUpdate` and its sibling `recordUpdate`
  live in `lib/activity-guard.ts`, not `lib/activity.ts` — `lib/activity.ts`
  is a pure module by contract ("no Prisma / React / network"), and
  `lib/activity-guard.ts` already owned `recordPlanActivity`. The pure
  `describeChanges`/`entityLabel` stayed in `lib/activity.ts` with new
  parameter types so the 39 casts could go. Five update sites run inside
  `db.$transaction` (some building a synthetic `after`); those call
  `recordUpdate(entityType, { tripId, plan, entityId, before, after })`
  after commit instead of `auditedUpdate`. Activity is still only ever
  recorded after the write succeeds.

### 2.Q · Wording: "Your whole trip, in one place." and no "shared pot"
Added 2026-10-15 (grill). Closes Feedback note `cmva2k0km000008jpa7pjv26q`
(Main): the commit carries `Resolves-Feedback: cmva2k0km000008jpa7pjv26q`;
resolved only once batch 2 is live on main. The old line assumed a group;
Teepee is for one Traveller or many.
- **Landing** (desktop and phone trees): h1 "Your whole trip, in one place"
  with the coral full stop; sub-line "Stops, trains, beds and budget. On
  your own or together." (verbatim, both trees).
- **Link-preview card** (`lib/og-card.tsx`): the same headline and sub-line.
- **Site description** (`app/layout.tsx`, `app/manifest.ts`): "Your whole
  trip, in one place."
- **Share-link CTA** unchanged (no "pot"; "for everyone who's going" is true
  of a shared Trip).
- **Desktop Home tile:** heading and aria-label "Shared pot" → "Trip cost"
  (the term Compare already uses; CONTEXT.md **Trip cost**). Component and
  file renamed `shared-pot-tile` → `trip-cost-tile` (`SharedPotTile` →
  `TripCostTile`), grid slot `pot` → `cost`.
- **"shared pot" suffixes and labels deleted, nothing in their place:**
  budget glance, Planning Home sub, Past Home sub, Spend so far card and
  tile, Compare table. The "never per person" tests stay, asserting no
  per-person wording, minus the "shared pot" expectation.
- Code comments saying "shared pot" reworded; `SPEC.md` line becomes
  "Money is one group total, never split per person."
- Left alone: past release notes, old specs, plans, design handoffs. No new
  release note.

---

## Batch 3 — Shape and hygiene (`chore/tidy-up-3-shape-hygiene`)

### Batch 3 drift (re-checked 2026-10-16, after batch 2)

These win over the cards below where they differ.

- **3.L** — all eight entities (Q13). Six places decide the Stop timezone
  default today (`server/actions/stops.ts` `resolveTimezone`,
  `lib/mcp/tools/trips-stops-write.ts` create + merge, `server/actions/stop-flow.ts`,
  `components/trip/stop-form-dialog.tsx`, `components/plan/mobile/add-stop-sheet.tsx`,
  `lib/booking-import/build.ts`); one pure `lib` function replaces them all, usable
  client-side. Read-side `?? "UTC"` fallbacks are out of scope. Forms keep
  sending full input.
- **3.M** — `lib/day-view-model.ts` already exists (display helpers);
  `buildDayModel` is added to it.
- **3.N** — `lib → server` is 15 files (batch 2 added `lib/money/cost-form-state.ts`),
  with the Q14 exemption. `lib → components` is 13 imports in 10 files: the view
  types move to `lib`, and `components/ui/logo-paths` (pure constants, used by
  `lib/og-card.tsx`) moves to `lib`. Guard tests other than the five replaced
  and the two kept are untouched.
- **3.P** —
  - `isoDate` replaces every zod copy (the 10 consts and the ~10 inline
    regexes); non-zod regex tests stay.
  - `formatISODate` has 7 inline sites (batch 2 added two).
  - `paidPct` per Q15.
  - `EmptyState` in `timeline.tsx` and the per-render `BY_VALUE` are already
    done; only the double import remains.
  - Bare "Member" is gone; what remains is "Trip members (N)" in three
    aria-labels → "Travellers (N)", "member avatars" in the Help guide →
    "Traveller avatars", and the dialog title "Command palette" → "Search".
  - BI-14's length check exists; only the country-agreement check is missing.
  - The push-subscribe retry and the digest cooldown `where` are already
    tested; struck in `docs/open-follow-ups.md`, not rebuilt.
  - Scripts archived: `backfill-geocode`, `backfill-cover-aspect`,
    `backfill-cover-small` (+ `-run` and its test), `sweep-orphaned-costs`,
    with their npm entries. `booking-import-smoke.ts` and
    `verify-r2-presign.ts` stay (DEPLOY.md and the runbook name them).
- **3.O** — `lib/feedback/cli/` holds the argument parsers
  (`feedback-accept-args`, `feedback-resolve-args`, `feedback-resolve-site`);
  the rest go to `lib/feedback/`. `lib/auth/` includes `auth-client`.

#### As built (2026-10-16)

Built on `chore/tidy-up-3-shape-hygiene`, 47 tasks plus the gate (3.Z).
Every deviation from the cards and the drift notes above, one line each.
The card notes and the SDD ledger
(`.superpowers/sdd/2026-10-16-tidy-up-3-shape-hygiene/`) hold the reasoning.

**Traveller-visible — flag these to Cam with the batch:**

- Today now shows the Surprise badge ("who is planning it") and Item photos
  that the Day view already showed; Day and Today are one assembly (3.M.5).
- Today also shows the "Hidden from shares" icon on an Item, as the Day view
  does (3.M.5).
- Paid reads 99% until a Cost is fully paid; only exactly paid reads 100%,
  on the mobile Budget glance, the desktop Trip cost tile and the Past-phase
  Summary (TB-09, 3.P.5).
- `updateStop` resolves a sent `"UTC"` from the Stop's country, as
  `createStop` already did: a form edit that sends `"UTC"` for a Stop the
  geocoder places in Japan saves `Asia/Tokyo` (3.L, deviation 3).
- A Stop stored as `"UTC"` in a known country gets its country's zone when
  a Trip re-date moves it (the lone-Stop "follow" rule; Ruling 3.L.1).
- The aria label "Trip members (N)" reads "Travellers (N)" (three places),
  the Help guide says "Traveller avatars", and the Search dialog's name is
  "Search", not "Command palette" (3.P).
- An impossible date in the right format (`2026-02-30`) is refused by every
  date field and by the Add a Reminder dialog ("Reminder date must be a real
  date") instead of rolling into March; one time-format message, "Time must
  be in HH:MM format (24h)" (3.P.1–3.P.2).
- Through Claude (MCP): `update_stop` with `country`/`countryCode` alone
  re-geocodes the Stop instead of keeping the old point under the new
  country; with `name` alone it still keeps the point (3.L, deviation 4).
- Through Claude: `update_transport` with `depIsHome: true` and an empty
  `depPlace`/`fromStopId` is Home, not a tool error, as `add_transport`
  already ruled; an empty Stop *and* an empty place is still an error
  (3.L, deviation 5).
- Through Claude: the tool-only refusals (lone date, timezone on a rough
  Stop, nights required or mismatched, "more than one Cost", cost amount
  without currency, due date on a paid Cost, "needs a stop or a place") now
  come from the actions, with their wording unchanged (3.L, deviation 6).
- Through Claude: a lone date on a rough Chapter is refused with "Set both
  dates or neither" (on `endDate`) instead of the tool's own wording (on
  `startDate`) (3.L, deviation 7).
- Through Claude: an inline Cost on an update to an owner with more than one
  Cost is refused for every caller; it was silently skipped outside the
  tool. No form sends it (3.L, deviation 9).

**3.N — import boundaries as lint:**

1. The counts differ from the card: the final rule set reported 26 boundary
   errors (9 `lib→server` in 8 files, 13 `lib→components`, 3
   `components→lib/db`, 1 `components→app`). Test files are outside every
   boundary.
2. `recordActivity` moved to `lib/activity-record.ts` (a write, so not a
   `*-reads` name); it is no longer a published Server Action.
3. `getRecentActivity`, `getUnreadActivityCount`, `listForks`,
   `getTripProjection` and `listRemindersForTrip` left the published surface
   too; the `server-action-exports` ALLOWLIST shrank by six.
4. `lib/mcp/acting-traveller-imports.test.ts` was replaced by lint as well
   (static, dynamic, `require`, by name, `export *`, no `"use server"`).
   Recorded weakening: an `eslint-disable` comment can silence it.
5. The Surprise readers guard became "must import" selectors over the same
   lists (`SURPRISE_VISIBILITY_READERS`, `SURPRISE_GUARD_READERS`);
   `eslint.config.test.ts` checks every listed file exists.
6. The `enum-values` identity check stayed a unit test (`lib/enums.test.ts`);
   "zod-free" became a lint restriction, which no longer covers test files.
7. Zones are written broad → narrow with every restriction repeated (ESLint
   never merges a rule's options across blocks); `eslint.config.test.ts`
   lints probe snippets through the real config.
8. Small translation differences: the trip-links check is AST-based (ignores
   comments, exempts a link inside `revalidatePath(…)`); the image-loader
   check reads the directive prologue.
9. `TravelMapPoint` and `TravelWhen` stayed module-private in
   `lib/trips/trip-views.ts` (knip; nothing imports them) (Ruling 3.N.1).
10. Review round on 3.N.7 also fenced `runAsTraveller` behind dynamic
    imports, `base + "/trips/" + id` links and `export *` from
    `acting-traveller`, restrictions the deleted tests had held.

**3.L — PATCH-shaped updates (ADR 0075):**

1. Update forms still build full input, but wrap it in `toPatch(input,
   CLEARABLE)` so a cleared field is sent as `null`; create calls, drafts and
   Booking-import proposals are unchanged.
2. The second access check survives as `requireRealPlanRow` in the tools;
   the row loads, hand-written merges and per-entity row types are gone.
3. `updateStop` applies the one Stop timezone rule (`stopTimezone`,
   `lib/tz.ts`); see the Traveller-visible list.
4. A Stop patch re-locates the Stop only when it says where (`country`,
   `countryCode`, `lat`, `lng`); a rough Stop keeps a sent `countryCode`
   when the geocoder misses (3.L.9 review).
5. `update_transport`'s Home rule matches `add_transport` (see above).
6. The tool-only refusals moved into the actions, wording unchanged.
7. Chapter has no merge rule of its own; `updateChapter` writes `null` dates
   as a clear. Not fixed: the Chapter form's "Set dates now" off on an edit
   keeps the dates (follow-up `TU-01`).
8. `auditedUpdate` takes an optional held `before`, so the four actions that
   read the row to merge read it once.
9. An inline Cost on an update refuses "more than one owned Cost" for every
   caller.
10. A lone `paidMinor` (no `paidAt`) never un-pays a Cost: paid is decided by
    `paidAt` only (Ruling 3.L.5).
11. A Stop stored as `"UTC"` in a known country gets its zone on a Trip
    re-date (Ruling 3.L.1); relocating a scheduled Stop through a patch keeps
    its old zone, as before (follow-up `TU-02`).
12. The Accommodation `notes` field-diff entry that 3.L.2 added to make its
    test pass was reverted (it would have changed the Activity feed); the
    test pins a field already diffed.
13. Several existing tests changed only their input to state PATCH intent
    (explicit `null` to clear, a valid cuid where the real schema now runs),
    with assertions kept; `Failure`/`isFailure` left `bookings-write.ts`
    once unused.

**3.M — one day-assembly module:**

1. `buildDayModel(rows, date)` takes no viewer: masking and placeholders
   need the `server-only` visibility loader, so they happen once per read
   in `readDayRows` (`lib/day-reads.ts`).
2. The strip's dot counts come from the dated Items already read; the
   `item.groupBy` query is gone.
3. TB-10 (below) found and fixed: the itinerary is built from every stay.
4. Today shows the Surprise badge, Item photos and the "Hidden from shares"
   icon (see above); its Wishlist read gained `forkId: null`, which changes
   nothing.
5. NAV-05's second half (two neighbours each side if rapid swiping sticks)
   is not built; it stays open as a watch item in `docs/open-follow-ups.md`.
6. `getDay` and the loader's `cache()` are deleted; `getDays` serves every
   caller, and `lib/day-view-loader.cache.test.ts`'s assertions moved.

**3.P part A — primitives, helpers, UI, copy:**

1. 11 `isoDate` const copies (not 10), 7 inline zod regexes, 6 `hhmm`
   sites; the two `hhmm` messages became one.
2. A non-format string gets only the format issue (the real-date refine
   skips it).
3. `lib/reminder-input.ts` (the Reminder client gate) gained the real-date
   check through `isRealCalendarDate`, keeping zod out of the client.
4. Non-zod format checks stayed format-only, as the card says.
5. One `plural(n, one, many = one + "s")` replaced 8 copies with two
   signatures; `share-tally.tsx`'s `pluralize` (word only) stayed.
6. `CHIP_TOUCH` had three copies (`wishlist-board.tsx` the third).
7. The Badge workaround had two sites (`countdown-hero.tsx` the second);
   the status tokens equal the old hues, so nothing changes visually; the
   feedback-launcher test that pinned `bg-teal` now pins `bg-success`.
8. `scripts/layout-audit/overlays.ts` follows the dialog name "Search";
   `aria-label="Command search"`, the Globe's "Current members" and
   `docs/mobile-pwa-checklist.md` stayed.
9. The `isoDay` lint (3.P.4) also converted
   `scripts/booking-import-smoke.ts`, an eighth site.

**3.P part B — tests, scripts, BI items, deps:**

1. `lib/cover-small-image.ts` and its test were archived with the cover
   backfill.
2. BI-13 adds the AiUsage outcome `error` ("billed, then the import failed
   on our side"); no migration (`String` column).
3. BI-14's country check is lenient, like the Stop check; the gap fixed was
   `matchesHome`; `sameCity` is unchanged.
4. Dependencies were two tasks (3.P.20 caret bumps + `@types/node` 22;
   3.P.21 exact pins within their majors + TD-01), each running the full
   suite. Both hit `ERESOLVE` from the `better-auth` family's exact
   `better-call` peer pin and resolved it without `--force`.
5. Archived npm entries: `backfill:geocode`, `backfill:cover-aspect`,
   `backfill:cover-small`, `sweep:orphaned-costs`.
6. knip's `entry` names only the four recurring scripts that have no npm
   entry (npm scripts are knip inputs already); narrowing it exposed dead
   exports in `scripts/layout-audit/`, which were removed (Ruling 3.P.13).
7. ADRs 0011, 0028 and 0039 keep the archived scripts' old paths (decision
   records); living docs were updated.
8. BI items are tracked only in `docs/follow-ups/2026-10-14-booking-import.md`.
9. The repo is on Vitest 4, not 3; `postcss` became a direct devDependency
   at the 8.5.28 already in the tree.

**3.O — `lib` folders:**

1. Naming rule: inside `lib/<folder>/` a module drops a leading `<folder>-`
   prefix; one named after the folder keeps its name (`auth/auth.ts`,
   `money/money.ts`, `map/maps.ts`); `share/share-traveller.ts` and
   `share/share-url.ts` keep the prefix (`lib/traveller.ts`, `lib/url.ts`).
2. No frozen site list: a committed codemod (now
   `scripts/archive/`) rewrote every resolving specifier, `vi.mock` path and
   living-doc mention, then ran `git mv`.
3. A new guard, `lib/lib-folders.test.ts`, checks no barrel and nothing of
   an area left flat.
4. History (dated docs, ADRs, migrations, `design_handoff/`) was left alone.

**Gate (3.Z):** `npm test`, `npx tsc --noEmit`, `npx eslint .` (0 errors),
`npm run knip`, `npm run test:integration` (against a sandbox Postgres) and
`npm run build` (in a copy with a localhost-only `.env`) all passed with no
fixes needed.

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
LA-215 → 1.B · PX-02b → 1.J/1.A · BI-04 → 2.I · Feedback `cmva2k0km000008jpa7pjv26q` → 2.Q · BI-10, -12, -13, -14, -16 →
1.C/3.P · deferred minors (2026-09-21) → 3.P · playground hygiene → 3.P.

## Out of scope (recorded, not built)

RG-01; ARCH-DAT-2, -5, -7, -8, -9, -10, -11, -12, -13; ARCH-TEN-6, -8, -12;
ARCH-OBS-4, -5, -6, -7; NAV-01, NAV-04; BI-01, -02, -03, -05, -06, -07,
-08, -09, -11, -15, -17; PX-01, PX-03; the layout-audit harness deferred
list; the playground kit gaps; major dependency upgrades (`TD-01`);
`noUncheckedIndexedAccess`; a shared plan-graph copier; any fork-specific
deepening.
