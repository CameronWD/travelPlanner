# Tidy-up batch 3 — Shape and hygiene — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the import boundaries lint errors, turn the eight update actions into server-side PATCH merges, assemble a day in one module, sweep the hygiene leads, and file the flat `lib` areas into folders, all without changing what a Traveller sees except where a listed bug is fixed.

**Architecture:** Five cards, run in the order 3.N → 3.L → 3.M → 3.P → 3.O, then a final gate.
- **3.N:** puts the Q8 rules into `eslint.config.mjs` as zones, after moving the reads and types that break them into `lib`.
- **3.L:** adds `lib/patch.ts` (undefined keeps, null clears). Each update action merges onto the row it already holds, and the eight MCP load/merge pairs are deleted.
- **3.M:** splits the day into one read (`lib/day-reads.ts`) and one pure assembly (`buildDayModel`). The Day view and Today both use them, and `getDays` reads the carousel window once.
- **3.P:** shared primitives and helpers, test hygiene, and the BI fixes and dependency bumps.
- **3.O:** moves the files with a tested codemod. No barrels.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before touching a Next API), React 19, Prisma 7, zod, Vitest 4 (a node project for `.ts`, happy-dom for `.tsx`), Testing Library, ESLint 9 flat config, PostCSS, TypeScript strict.

**Spec:** `docs/specs/2026-10-14-tidy-up-pass.md`. Read the decisions Q8, Q9, Q11 and Q13–Q15, the *Bugs* table (TB-09), **"Batch 3 drift (re-checked 2026-10-16, after batch 2)"** (it wins over the card text) and "Batch 3 — Shape and hygiene". The review source is `docs/audits/2026-10-14-architecture-review.html` (cards L, M, N, O, P). Each card section below opens with **Notes**: the interfaces it produces for later cards, and the deviations from the spec text decided while planning. Task 3.Z writes those deviations into the spec.

## Global Constraints

- **Branch** `chore/tidy-up-3-shape-hygiene`.
  - Never commit to, merge into, rebase onto or push `main`. Never deploy.
  - Never run `feedback:resolve`, `feedback:accept` or `feedback:pull`. This applies to subagents especially: `feedback:pull` opens production.
  - Don't commit `next dev`'s CLAUDE.md block if it reappears.
- **Vocabulary** follows CONTEXT.md: **Plan**, **real plan**, **Fork**, **Traveller**, **Surprise**, **Cost**, **cost amount**, **paid amount**, **Paid**, **Trip cost**, **Search**. Never write "member" in Traveller-facing or assistive copy, "itinerary" in new prose, or "shared pot".
- **Forks are frozen.** Every Fork path must stay correct; build nothing Fork-specific.
- **Verification per task:**
  - In the loop: `npx vitest run <the test files worked>`.
  - At task end: `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`.
  - Never the full suite or `next build` per task. The one exception is 3.P.20/3.P.21: a lockfile change has no related files, so those two run `npm test` + `npx eslint .` + `npm run knip`.
- **Once, at the end (Task 3.Z):** `npm test`, `npm run build`, `npm run test:integration` (local Postgres: `docker compose up -d`, then `npx prisma migrate deploy`), `npm run knip`, `npx eslint .`.
- **Queries:** a task that changes a Prisma query or a `*-reads.ts` module adds or extends a test in `test/integration/` (PX-02b). If the local DB is down, write the test anyway and say so in the report.
- **Guard tests:** a task that deletes a guard test lands the lint rule that replaces it in the same commit, and `npx eslint .` is clean there.
- **Bug fixes** write the failing test first, and the commit message names the id (TB-09, TB-10, BI-13, BI-14).
- **Commits:** one per task (more when a task says so), in the repo's `type(scope): …` style. End each message with these trailers:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LnCyba4taLzC7WxHYP3aUz
  ```
  No `Resolves-Feedback:` trailers are owed in this batch.
- **`"use server"` files:** every export is an `async function` and appears in `lib/server-action-exports.test.ts`'s `ALLOWLIST`. 3.N.3–3.N.6 shrink that list; later tasks start from the shrunk one.
- **Action results:** actions return `ActionResult` (ADR 0074). The form-level key is `"_"`; guards throw `notFound()`; validation returns; infrastructure reports.
- **Page and component tests:** rewrite the mocks and keep the assertions (Q10). Delete an assertion only when it pins a query shape or a mechanic that this task removes, and say so in the commit message.
- **After 3.N.7, the boundaries are lint errors and bind every later task:**
  - `lib` may not import `server`. The exception (Q14) is `lib/mcp/tools/**` and `lib/booking-import/confirm.ts`, which may import `server/actions/<file>` only.
  - `lib` may not import `components` or `app`.
  - `components` may not import `lib/db` or `app`.
  - `eslint.config.mjs` builds every block through one `rules()` helper. A later task adds a restriction through `S`/`I` and that helper, never as a block of its own (ESLint lets the last matching block replace a rule outright).
- **Line numbers are as of `4e6163c1`.** Earlier tasks move code, so re-grep with the command the task gives before editing. A site list that has grown or shrunk because an earlier batch-3 task changed it is expected. Note the difference in your report; it is not a blocker.

## Review Focus

These are inputs the spec implies but no existing test exercises. Each line names the task that adds its test.

1. **Clearing a field through an update form, versus omitting it through Claude.** A Traveller empties a Stop's Notes (or an Accommodation's address, a Transport's reference, a Cost's due date) and saves: the field is cleared. The same action called through Claude with that field omitted keeps it. Tested in 3.L.3–3.L.9: a form test for each entity, plus `test/integration/patch-updates.test.ts`.
2. **Un-ticking Paid in a Cost form, versus a patch through Claude that changes only the cost amount.** The form un-pays the Cost. The patch keeps it paid, with its paid amount. Tested in 3.L.5 and 3.L.6.
3. **A surprised Traveller sees the same day on Today and on the Day view.** `loadTravellingHome(...).dayPlan` deep-equals `getDays(..., [date], ...)[0].plan`, the placeholder shows on both, and a check-in on a day the shown stay doesn't touch still counts in the strip (TB-10). Tested in 3.M.3 and 3.M.5 (integration).
4. **A format-valid but impossible date** (`2026-02-30`), sent through MCP `set_stop_dates` or typed into the Reminder dialog, is refused and nothing is written. Tested in 3.P.1 and 3.P.2.
5. **A narrower lint zone must not drop a broader zone's restriction.** For example, `lib/guards.ts` importing `@/components/*` is still reported, and so is a `toISOString().slice` in a single-file zone. Tested in 3.N.7 (`eslint.config.test.ts`) and 3.P.4.

The section notes list more candidates: the Stop timezone through a patch (3.L.1, 3.L.9), the AiUsage row written exactly once (3.P.15), BI-14 leniency (3.P.16), the archive kept out of every tool (3.P.13), surviving `vi.mock` paths (3.O.1), and moved reads keeping their access and Surprise checks (3.N.6). Their tests are already in the owning tasks.

---

## Card 3.N — Import boundaries as lint (decisions Q8, Q14)

### Notes

**Interfaces this section produces (later sections rely on them):**
- The rules, as errors, in `eslint.config.mjs` (Task 3.N.7): `lib` may not import `server` (exemption Q14: `lib/mcp/tools/**` and `lib/booking-import/confirm.ts` may import `server/actions/<file>` and nothing else under `server/`); `lib` may not import `components` or `app`; `components` may not import `lib/db` or `app`. Type-only imports count too, and `../`-relative paths count as well as `@/`. Test files (`*.test.ts(x)`) are outside every boundary block.
- `eslint.config.mjs` exports `SURPRISE_VISIBILITY_READERS` and `SURPRISE_GUARD_READERS`, the file lists the old `surprise-readers.guard` held. `eslint.config.test.ts` checks that every listed file exists. **3.O must update these lists when it moves a listed file** (for example `lib/budget-loader.ts` or `lib/money-due-count.ts` into `lib/money/`). If it doesn't, `eslint.config.test.ts` fails, not the lint run. The same applies to the single-file zones in `ZONES` (`lib/guards.ts`, `lib/activity-record.ts`, `lib/trip-path.ts`, `lib/revalidate.ts`, `lib/enum-values.ts`, `lib/enums.ts`, `lib/booking-import/confirm.ts`, `lib/mcp/run-tool.ts`, `lib/mcp/acting-traveller.ts`, `lib/mcp/real-plan.ts`). If 3.O moves any of those, it edits `files` **and** `match`.
- New lib modules (3.L, 3.M, 3.P and 3.O import from these and must not reach back into components or server):
  - `lib/money/cost-row.ts`: `CostRow`. `server/actions/costs.ts` re-exports it as a type.
  - `lib/plan-entity-views.ts`: `ItemCardItem`, `TransportCardTransport`, `AccommodationCardAccommodation`, `StopOption`, `DayEntryEditor`.
  - `lib/attachment-view.ts`: `AttachmentView`, `FileOwner`.
  - `lib/day-map.ts`: `ItemDirections`. `lib/daylight.ts`: `DaylightView`. `lib/route-map.ts`: `RouteMapStop`.
  - `lib/trips/trip-views.ts`: `TripCoverInput`, `TripCardModel`, `TravelMapPoint`, `TravelWhen`, `TravelMapTrip`.
  - `lib/globe-views.ts`: `MarkerView`, `GlobeMemberView`, `ArrivalPin`, `GlobeArrival`. `components/globe/types.ts` becomes a type re-export.
  - `lib/wordmark.ts`: the `WORDMARK_*` constants. `components/ui/logo-paths.ts` is deleted.
  - `lib/traveller-reads.ts`: `readWhatsNewSeen(userId)` and `readWelcomeState(userId)`. `lib/sketch-reads.ts`: `readSketchingPlan(tripId, chaptersEnabled)`.
  - `components/trip/files-section-class.ts`: `FILES_SECTION_HEADER_CLASS`.
  - `lib/activity-record.ts`: `recordActivity` and `RecordActivityInput`. **3.M and 3.L import `recordActivity` from here, never from `server/actions/activity`**, and test mocks use `vi.mock("@/lib/activity-record", …)`.
  - `lib/activity-reads.ts`: `getRecentActivity` and `getUnreadActivityCount`. `lib/fork-reads.ts`: `listForks` and `ForkListItem`.
  - `lib/trip-projection-reads.ts`: `getTripProjection(tripId, forkId?)`. **3.M's day assembly and any loader take the projection from here.**
  - `lib/reminder-reads.ts`: `listRemindersForTrip` and `ReminderItem`. `server/actions/reminders.ts` re-exports the type.
- `lib/server-action-exports.test.ts` ALLOWLIST shrinks. Six functions stop being published Server Actions: `recordActivity`, `getRecentActivity`, `getUnreadActivityCount`, `listForks`, `getTripProjection` and `listRemindersForTrip`. Each is called only from server code (verified by grep, 2026-10-16). 3.L's ALLOWLIST edits must start from the shrunk lists.
- Test-mock convention for moved functions (Q10, rewrite the mocks and keep the assertions): when a `vi.mock(<action module>, () => ({ <moved fn>, … }))` factory loses its last key, keep it as `vi.mock(<action module>, () => ({}))`. That way the test's module graph does not change. Then add `vi.mock(<new lib module>, () => ({ <moved fn> }))`.

**Deviations from the spec text (decided while drafting):**
1. **Counts differ from the card.** The card says "14 lib→server, 4 lib→components types, 3 + 1". The drift note says 15 files, and 13 imports in 10 files. A trial run of the final rule set against today's tree (`eslint -c <draft> .`, 2026-10-16) reports exactly **26 boundary errors**:
   - 9 `lib→server` lines in 8 non-exempt files: `activity-guard`, `day-view-loader`, `flags-loader`, `money/cost-form-state`, `nav-counts`, `sort-these-out`, `trip-shell-reads` ×2 and `trips/trips-page-loader`.
   - 13 `lib→components` imports in 9 non-test files.
   - 3 `components→lib/db`.
   - 1 `components→app`.

   Test files importing across layers (`lib/help-guide.test.ts` → `components/trip/trip-nav`, the component tests importing `@/lib/db` to type their mocks) are deliberately outside the rule. Tests are not shipped and legitimately reach across layers to mock.
2. **`recordActivity` moves to `lib/activity-record.ts`** (it is a write, not a read, so the name is not `*-reads`). `lib/activity-guard.ts` is the non-exempt `lib→server` importer, and every server action imports the helper through it. Moving the helper is the only fix that does not move `activity-guard` into `server/`. It also stops `recordActivity` being a published action, which is the surface its own comment warns about (ARCH-TEN-2). The `requireTripAccess` call stays.
3. **The moved reads also leave the published surface.** `getRecentActivity`, `getUnreadActivityCount`, `listForks`, `getTripProjection` and `listRemindersForTrip` are no longer Server Actions (see the ALLOWLIST bullet above). Behaviour is unchanged for every caller.
4. **`lib/mcp/acting-traveller-imports.test.ts` is replaced too.** Lint expresses all four of its checks:
   - Static, relative and export-from imports: `no-restricted-imports`.
   - `import()` and `require()`: `no-restricted-syntax`.
   - `runAsTraveller` by name: `importNames`.
   - No `"use server"` in the module: `no-restricted-syntax`.

   One weakening, recorded: an `// eslint-disable` comment can silence the rule, and the test could not be silenced that way. That is the same trade every other boundary makes. `server-action-exports` stays as the hard security gate on the published surface. The importer allowlist changes from `server/actions/activity.ts` to `lib/activity-record.ts` (deviation 2).
5. **`surprise-readers.guard` becomes "must import" lint selectors** (`Program:not(:has(ImportDeclaration[...]))`) over the same file list. The audit's alternative ("a reader module that requires v by type replaces the list") is a redesign, not a translation, and it is out of scope here. The list changes in this section: `server/actions/activity.ts` → `lib/activity-reads.ts`, and `server/actions/reminders.ts` → `lib/reminder-reads.ts`. A lint `files` glob that matches nothing is silent, so `eslint.config.test.ts` asserts that every listed file exists.
6. **The `enum-values` identity assertion stays a unit test.** `lib/enums` must re-export the very same arrays as `lib/enum-values`, which is behaviour, so it moves into `lib/enums.test.ts`. "lib/enum-values.ts is zod-free" becomes a lint restriction. The `@/lib/enums` restriction no longer applies to test files (the old walk covered them). Tests are not bundled, so the zod cost the guard exists for does not arise there.
7. **ESLint never merges a rule's options across config blocks.** The last matching block wins. The boundaries are therefore written as zones (broad → narrow), and each zone lists every restriction that applies to its files. `eslint.config.test.ts` lints 43 probe snippets through the real config, so a zone that silently drops a restriction fails a test. This test is new: it tests the config, it is not a file walk.
8. **Small translation differences from the walks:**
   - The trip-links check is AST-based. It ignores comments, which the line regex used to flag. A `/trips/${…}` link anywhere inside a `revalidatePath(…)` call is exempt, where the walk exempted the whole line.
   - The image-loader check reads the directive prologue rather than a regex.

   Both are equivalent on today's tree: the draft ran clean apart from the 26 known errors.

**Review Focus candidates:**
1. **A narrower zone must not drop a broader zone's restriction.** Example: `lib/guards.ts` is in the acting-traveller allowlist zone, but it must still be refused `@/components/*` and `@/server/*`. Expected: the import is reported. Test: Task 3.N.7, `eslint.config.test.ts`, the case "an allowlisted acting-traveller importer is still a lib file".
2. **Q14's exemption is `server/actions/<file>` only.** `lib/mcp/tools/x.ts` importing `@/server/actions/stops` is clean. Importing `@/server/<anything else>` (for example a future `server/internal/…`) is reported, and so is `lib/booking-import/build.ts` (not exempt) importing an action. Test: Task 3.N.7, `eslint.config.test.ts`.
3. **A moved read must still check access before it reads, and still apply the viewer's Surprise fragment.** `listRemindersForTrip` called by a Traveller a Stop is hidden from must not return the Reminder about that Stop. Test: Task 3.N.6, `test/integration/reminder-reads.test.ts` (real Postgres, real `loadSurpriseVisibility`), plus the moved unit tests' `expectAccessCheckedBeforeWrite` assertions.

---

### Task 3.N.1: Types and constants that lib reads move into lib

`lib` stops importing `components` and imports no more types from `server/actions/costs`. Every moved type is defined once in `lib`. The old component file keeps an `export type { … } from "@/lib/…"` line where something other than `lib` still imports the type from it. Otherwise the component imports the type from `lib` and the export is gone (knip would flag a dead re-export).

**Files:**
- Create: `lib/money/cost-row.ts`, `lib/plan-entity-views.ts`, `lib/attachment-view.ts`, `lib/trips/trip-views.ts`, `lib/globe-views.ts`, `lib/wordmark.ts`
- Modify (definitions out → re-export or import):
  - `server/actions/costs.ts:334-359`
  - `components/trip/day-entry-link.tsx:5,8-11,24-37`
  - `components/trip/item-card.tsx:28,34-55`
  - `components/trip/transport-card.tsx:19-44`
  - `components/trip/accommodation-card.tsx:19-32`
  - `components/trip/item-form-dialog.tsx:50-55`
  - `components/trip/attachment-list.tsx:36-55`
  - `components/trip/timeline.tsx:46-49`
  - `components/weather/daylight-bar.tsx:3`
  - `components/trip/route-map.tsx:35-46`
  - `components/trips/trip-card.tsx:7,12-26`
  - `components/trips/trip-cover.tsx:10-23`
  - `components/trips/travel-map.tsx:28-42`
  - `components/globe/types.ts` (whole file)
  - `components/ui/logo.tsx:2`
  - `app/global-error.tsx:4-10`
- Modify (definitions in): `lib/day-map.ts:190-199`, `lib/daylight.ts` (after `DaylightResult`, line 40), `lib/route-map.ts:1`
- Modify (lib importers):
  - `lib/day-view-loader.ts:21,49-53`
  - `lib/files-index-loader.ts:5`
  - `lib/journal-loader.ts:14`
  - `lib/globe-list.ts:1`, `lib/globe-suggestions.ts:2`, `lib/marker-to-item.ts:1`
  - `lib/og-card.tsx:4`
  - `lib/past-home-loader.ts:32`
  - `lib/trips/trips-page-loader.ts:25-26`
  - `lib/money/cost-form-state.ts:28`
- Modify (test importers, so they follow the type): `lib/globe-list.test.ts:3`, `lib/globe-suggestions.test.ts:3`, `lib/marker-to-item.test.ts:3`
- Delete: `components/ui/logo-paths.ts`
- Test: no new test file. This task's red/green is the boundary grep plus `tsc` (types only). `lib/og-card.test.ts` and `components/ui/logo*.test.tsx` cover the constants through `vitest related`.

**Interfaces:**
- Consumes: nothing.
- Produces: the types listed in the assembler notes, with **identical shapes** (copied verbatim, doc comments included), and `lib/wordmark.ts` exporting `WORDMARK_VIEWBOX`, `WORDMARK_ASPECT`, `WORDMARK_TRANSFORM`, `WORDMARK_WORD_D` and `WORDMARK_DOT_D`, unchanged.

- [ ] **Step 1: Write the failing check**
```bash
git grep -nE "from ['\"]@/components/" -- 'lib/*.ts' 'lib/*.tsx' 'lib/**/*.ts' 'lib/**/*.tsx' ':!*.test.ts' ':!*.test.tsx'
git grep -n "@/server/actions/costs" -- 'lib/*.ts' 'lib/**/*.ts'
```
- [ ] **Step 2: Run it, expect FAIL.** The first command prints 13 lines:
  - `day-view-loader.ts:49,50,51,52`
  - `files-index-loader.ts:5`
  - `globe-list.ts:1`
  - `globe-suggestions.ts:2`
  - `journal-loader.ts:14`
  - `marker-to-item.ts:1`
  - `og-card.tsx:4`
  - `past-home-loader.ts:32`
  - `trips/trips-page-loader.ts:25,26`

  The second prints `day-view-loader.ts:53` and `money/cost-form-state.ts:28`.
- [ ] **Step 3: Implement**

`lib/money/cost-row.ts` (moved verbatim from `server/actions/costs.ts:345-359`; the doc comment rewritten because the type no longer lives in a `"use server"` file):
```ts
/**
 * Shape of a cost row as rendered by the entity cards. Pages fetch costs
 * inline via `db.cost.findMany` (after `requireTripAccess`) and pass rows
 * matching this shape to the cards. A plain type in lib (spec 2026-10-14
 * card 3.N) so lib loaders and the cost form state don't import a
 * "use server" module for it.
 */
export type CostRow = {
  id: string;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  rateToHome: number | null;
  paidAt: Date | null;
  dueDate: string | null;
  ownerType: string;
  ownerId: string | null;
  label: string | null;
  category: string | null;
  /** CONTEXT.md "Settlement" — BEFORE | ON_TRIP; anything else reads as BEFORE. */
  settlement: string;
};
```
In `server/actions/costs.ts`, replace lines 334-359 (the NOTE comment and the type) with:
```ts
// CostRow lives in lib/money/cost-row.ts; re-exported (type-only, erased) for the 27 component importers.
export type { CostRow } from "@/lib/money/cost-row";
```
`server-action-exports.test.ts` already ignores `export type { … }` (`isTypeOnly`).

`lib/plan-entity-views.ts` (the four entity view types and `StopOption` are copied verbatim from the component files named above, doc comments included):
```ts
import type { TransportMode } from "@/lib/enum-values";
import type { SurpriseView } from "@/lib/surprise";
import type { CostRow } from "@/lib/money/cost-row";

/**
 * The Plan's entity rows as the cards and the three edit dialogs take them,
 * built by lib loaders (lib/day-view-loader.ts) and the Plan page. In lib so
 * a loader can name them without importing components (spec 2026-10-14 Q8).
 */

export interface ItemCardItem { /* verbatim from components/trip/item-card.tsx:34-55 */ }
export interface TransportCardTransport { /* verbatim from components/trip/transport-card.tsx:19-44 */ }
export interface AccommodationCardAccommodation { /* verbatim from components/trip/accommodation-card.tsx:19-32 */ }
/** The Item dialog's Stop choice (components/trip/item-form-dialog.tsx). Not the Transport dialog's same-named type. */
export interface StopOption { /* verbatim from components/trip/item-form-dialog.tsx:50-55 */ }

/** Everything the three edit dialogs need, built once by the day page and looked up by entity id. */
export interface DayEntryEditor {
  tripId: string;
  stops: (StopOption & { timezone?: string | null })[];
  homeCurrency?: string;
  homeBaseName?: string | null;
  homeTimezone?: string | null;
  items: Record<string, ItemCardItem>;
  transports: Record<string, TransportCardTransport>;
  accommodations: Record<
    string,
    { accommodation: AccommodationCardAccommodation; stopDateRange: { arriveDate: string; departDate: string } }
  >;
  costsByOwner: Record<string, CostRow[]>;
}
```
(The `/* verbatim … */` markers mean: paste the body from that exact line range. Do not paraphrase it.)

`lib/attachment-view.ts`: `AttachmentView` and `FileOwner`, verbatim from `components/trip/attachment-list.tsx:36-55`, with `import type { Route } from "next";`.

`lib/trips/trip-views.ts`:
- `TripCoverInput`, verbatim from `components/trips/trip-cover.tsx:10-23`, importing `Hue` from `@/lib/hues` and `SketchStop` from `@/lib/trips/route-sketch`.
- `TripCardModel`, verbatim from `components/trips/trip-card.tsx:12-26`, importing `Route` from `next`, `SortRow` from `@/lib/sort-these-out`, and `BigNumber` and `TripCardKind` from `@/lib/trips/trip-status`.
- `TravelMapPoint`, `TravelWhen` and `TravelMapTrip`, verbatim from `components/trips/travel-map.tsx:28-42`.

`lib/globe-views.ts`: the whole of today's `components/globe/types.ts`, verbatim. `components/globe/types.ts` becomes:
```ts
/** The Globe's view types live in lib/globe-views.ts (spec 2026-10-14 Q8); re-exported for the 20+ component and page importers. */
export type { MarkerView, GlobeMemberView, ArrivalPin, GlobeArrival } from "@/lib/globe-views";
```

`lib/wordmark.ts`: the whole of `components/ui/logo-paths.ts`, verbatim. Delete `components/ui/logo-paths.ts`.

`lib/day-map.ts`, above `buildItemDirections` (line 190):
```ts
/** Directions links to one Item from the previous located point (Timeline renders them). */
export interface ItemDirections {
  google: string | null;
  apple: string | null;
}
```
In the same file, the return type changes from `Record<string, { google: string | null; apple: string | null }>` to `Record<string, ItemDirections>`, in both the signature and `const out`.

`lib/daylight.ts`: add `export interface DaylightView { sunrise: string | null; sunset: string | null; dayLengthMin: number; polarDay: boolean; polarNight: boolean }` (verbatim from `components/weather/daylight-bar.tsx:3`).

`lib/route-map.ts`: add `RouteMapStop`, verbatim from `components/trip/route-map.tsx:35-46`.

Component side, before → after:

| File | Before | After |
|---|---|---|
| `components/trip/day-entry-link.tsx` | defines `DayEntryEditor` at 24-37; imports `StopOption`, `ItemCardItem`, `TransportCardTransport`, `AccommodationCardAccommodation` and `CostRow` from components and server at 5, 8-11 | `import type { DayEntryEditor, ItemCardItem, TransportCardTransport, AccommodationCardAccommodation } from "@/lib/plan-entity-views"; export type { DayEntryEditor };`. Keep `ItemFormDialog` imported from `item-form-dialog`. Drop the imports the file no longer uses (ESLint's no-unused-vars tells you which). |
| `components/trip/item-card.tsx` | defines `ItemCardItem` at 34-55 | `import type { ItemCardItem } from "@/lib/plan-entity-views"; export type { ItemCardItem };`. Drop `SurpriseView` at :28 if it is now unused. |
| `components/trip/transport-card.tsx` | defines at 19-44 | `import type { TransportCardTransport } …; export type { TransportCardTransport };` |
| `components/trip/accommodation-card.tsx` | defines at 19-32 | the same pattern for `AccommodationCardAccommodation` |
| `components/trip/item-form-dialog.tsx` | defines `StopOption` at 50-55 | `import type { StopOption } from "@/lib/plan-entity-views"; export type { StopOption };` |
| `components/trip/attachment-list.tsx` | defines `AttachmentView` and `FileOwner` at 36-55 | `import type { AttachmentView } from "@/lib/attachment-view"; export type { AttachmentView };`. `FileOwner` has no non-lib importer, so it is not re-exported. |
| `components/trip/timeline.tsx` | `export interface ItemDirections` at 46-49 | `import type { ItemDirections } from "@/lib/day-map";` (no re-export: only lib imported it) |
| `components/weather/daylight-bar.tsx` | defines `DaylightView` at 3 | `import type { DaylightView } from "@/lib/daylight"; export type { DaylightView };` (`WeatherCard.tsx:6` keeps its import) |
| `components/trip/route-map.tsx` | defines `RouteMapStop` at 35-46 | `import type { RouteMapStop } from "@/lib/route-map"; export type { RouteMapStop };` (merge with the existing `HomeMapPoint` import) |
| `components/trips/trip-card.tsx` | defines `TripCardModel` at 12-26; imports `TripCoverInput` at 7 | `import type { TripCardModel } from "@/lib/trips/trip-views"; export type { TripCardModel };`. `TripCover` is still imported from `./trip-cover`, and the `TripCoverInput` import is dropped if unused. |
| `components/trips/trip-cover.tsx` | defines `TripCoverInput` at 10-23 | `import type { TripCoverInput } from "@/lib/trips/trip-views";` (no re-export: its only importer was `trip-card.tsx`) |
| `components/trips/travel-map.tsx` | defines the three types at 28-42 | `import type { TravelMapPoint, TravelMapTrip } from "@/lib/trips/trip-views"; export type { TravelMapTrip };`. `TravelWhen` is imported only if the file still names it. |
| `components/ui/logo.tsx:2` | `from "./logo-paths"` | `from "@/lib/wordmark"` |
| `app/global-error.tsx:10` | `from "@/components/ui/logo-paths"` | `from "@/lib/wordmark"` |

Lib side, before → after:

| File:line | Before | After |
|---|---|---|
| `lib/day-view-loader.ts:21` | `import { buildDayMapModel, buildItemDirections, type DayMapModel } from "@/lib/day-map";` | `import { buildDayMapModel, buildItemDirections, type DayMapModel, type ItemDirections } from "@/lib/day-map";` |
| `lib/day-view-loader.ts:49` | `import type { DayEntryEditor } from "@/components/trip/day-entry-link";` | `import type { DayEntryEditor } from "@/lib/plan-entity-views";` |
| `lib/day-view-loader.ts:50` | `… AttachmentView } from "@/components/trip/attachment-list";` | `import type { AttachmentView } from "@/lib/attachment-view";` |
| `lib/day-view-loader.ts:51` | `ItemDirections` from timeline | deleted (merged into :21) |
| `lib/day-view-loader.ts:52` | `DaylightView` from daylight-bar | `import type { DaylightView } from "@/lib/daylight";` |
| `lib/day-view-loader.ts:53` | `CostRow` from `@/server/actions/costs` | `import type { CostRow } from "@/lib/money/cost-row";` |
| `lib/files-index-loader.ts:5` | `FileOwner` from attachment-list | `import type { FileOwner } from "@/lib/attachment-view";` |
| `lib/journal-loader.ts:14` | `AttachmentView` from attachment-list | `import type { AttachmentView } from "@/lib/attachment-view";` |
| `lib/globe-list.ts:1`, `lib/globe-suggestions.ts:2`, `lib/marker-to-item.ts:1`, and the three `.test.ts:3` | `from "@/components/globe/types"` | `from "@/lib/globe-views"` |
| `lib/og-card.tsx:4` | `from "@/components/ui/logo-paths"` | `from "@/lib/wordmark"` |
| `lib/past-home-loader.ts:32` | `RouteMapStop` from `@/components/trip/route-map` | `import type { RouteMapStop } from "@/lib/route-map";` (merge into any existing `@/lib/route-map` import) |
| `lib/trips/trips-page-loader.ts:25-26` | `TripCardModel` and `TravelMapTrip` from components | `import type { TripCardModel, TravelMapTrip } from "@/lib/trips/trip-views";` |
| `lib/money/cost-form-state.ts:28` | `CostRow` from `@/server/actions/costs` | `import type { CostRow } from "@/lib/money/cost-row";` |

- [ ] **Step 4: Run it, expect PASS.** Step 1's two commands print nothing. Then run `npx tsc --noEmit`, which must be clean (a shape copied wrong fails here, at its consumers). Then run `npx knip --include files,exports,types`: no new unused export or file. Any re-export knip calls unused gets removed, and its importers switch to `lib`.
- [ ] **Step 5: Task-done check.** Run each of these:
  - `npx vitest related --run lib/day-view-loader.ts lib/files-index-loader.ts lib/journal-loader.ts lib/globe-list.ts lib/globe-suggestions.ts lib/marker-to-item.ts lib/og-card.tsx lib/past-home-loader.ts lib/trips/trips-page-loader.ts lib/money/cost-form-state.ts lib/day-map.ts lib/daylight.ts lib/route-map.ts components/ui/logo.tsx app/global-error.tsx components/trip/attachment-list.tsx components/trip/timeline.tsx components/trips/travel-map.tsx components/trips/trip-card.tsx`
  - `npx tsc --noEmit`
  - `npx eslint` on every file in **Files**
- [ ] **Step 6: Commit.** `git add` the files above, with message `refactor(lib): view types, CostRow and the wordmark paths live in lib (card 3.N)`.

---

### Task 3.N.2: Components stop reading the database and importing app

**Files:**
- Create: `lib/traveller-reads.ts`, `lib/traveller-reads.test.ts`, `lib/sketch-reads.ts`, `lib/sketch-reads.test.ts`, `components/trip/files-section-class.ts`, `test/integration/home-reads.test.ts`
- Modify:
  - `components/whats-new/whats-new-banner.tsx:1,23-26` and `components/whats-new/whats-new-banner.test.tsx:3,21,25`
  - `components/welcome/welcome-gate.tsx:1,18-21` and `components/welcome/welcome-gate.test.tsx:4,10,15,26-33`
  - `components/trip/home/phase-sketching.tsx:4-5,35-52` and `components/trip/home/phase-sketching.test.tsx:3-18,30-84`
  - `components/trip/files-index.tsx:8`
  - `app/(app)/trips/[tripId]/files/page.tsx:29`
- Delete: `app/(app)/trips/[tripId]/files/section-class.ts`

**Interfaces:**
- Produces:
```ts
// lib/traveller-reads.ts
export function readWhatsNewSeen(userId: string): Promise<{ whatsNewSeenAt: Date | null; createdAt: Date } | null>;
export function readWelcomeState(userId: string): Promise<{ welcomeSeenAt: Date | null; name: string | null; displayName: string | null } | null>;
// lib/sketch-reads.ts
export function readSketchingPlan(tripId: string, chaptersEnabled: boolean): Promise<{
  stops: { id: string; name: string; country: string | null; nights: number | null; chapterId: string | null; arriveDate: string | null }[];
  chapters: { id: string; name: string; colour: string }[];
}>;
// components/trip/files-section-class.ts
export const FILES_SECTION_HEADER_CLASS: string;
```

- [ ] **Step 1: Write the failing test.** The query-shape assertions move out of the component tests and into the readers' tests (Q10). Write `lib/traveller-reads.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { user: { findUnique } } }));

import { readWhatsNewSeen, readWelcomeState } from "./traveller-reads";

beforeEach(() => vi.clearAllMocks());

describe("traveller reads", () => {
  it("readWhatsNewSeen selects the What's new stamp and the sign-up date", async () => {
    findUnique.mockResolvedValue({ whatsNewSeenAt: null, createdAt: new Date("2026-01-01T00:00:00Z") });
    await readWhatsNewSeen("u1");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { whatsNewSeenAt: true, createdAt: true } });
  });

  it("readWelcomeState reads the Welcome stamp and both names in one query", async () => {
    findUnique.mockResolvedValue({ welcomeSeenAt: null, name: "Cam", displayName: null });
    await readWelcomeState("u1");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { welcomeSeenAt: true, name: true, displayName: true } });
  });

  it("both return null for a missing row", async () => {
    findUnique.mockResolvedValue(null);
    expect(await readWhatsNewSeen("gone")).toBeNull();
    expect(await readWelcomeState("gone")).toBeNull();
  });
});
```
Write `lib/sketch-reads.test.ts`. Its assertions are moved from `phase-sketching.test.tsx:30-84`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { stopFindMany, chapterFindMany } = vi.hoisted(() => ({ stopFindMany: vi.fn(), chapterFindMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { stop: { findMany: stopFindMany }, chapter: { findMany: chapterFindMany } } }));

import { readSketchingPlan } from "./sketch-reads";

beforeEach(() => {
  vi.clearAllMocks();
  stopFindMany.mockResolvedValue([{ id: "s1", name: "Rome", country: "Italy", nights: 3, chapterId: null, arriveDate: null }]);
  chapterFindMany.mockResolvedValue([{ id: "c1", name: "Chapter One", colour: "sky" }]);
});

describe("readSketchingPlan (the Sketching Home's Route card)", () => {
  it("scopes the stops query to the real plan, chapter order then plan order", async () => {
    await readSketchingPlan("trip-1", true);
    expect(stopFindMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", forkId: null },
      orderBy: [{ chapterSortOrder: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, country: true, nights: true, chapterId: true, arriveDate: true },
    });
  });

  it("scopes the chapters query to the real plan", async () => {
    await readSketchingPlan("trip-1", true);
    expect(chapterFindMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", forkId: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, colour: true },
    });
  });

  it("skips the chapters query when Chapters are off (Task 13)", async () => {
    const rows = await readSketchingPlan("trip-1", false);
    expect(chapterFindMany).not.toHaveBeenCalled();
    expect(rows.chapters).toEqual([]);
  });

  it("returns both row sets", async () => {
    expect(await readSketchingPlan("trip-1", true)).toEqual({
      stops: [{ id: "s1", name: "Rome", country: "Italy", nights: 3, chapterId: null, arriveDate: null }],
      chapters: [{ id: "c1", name: "Chapter One", colour: "sky" }],
    });
  });
});
```
Write `test/integration/home-reads.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { readWhatsNewSeen, readWelcomeState } from "@/lib/traveller-reads";
import { readSketchingPlan } from "@/lib/sketch-reads";

// Real Postgres (npm run test:integration): the selects moved out of
// WhatsNewBanner, WelcomeGate and PhaseSketching (card 3.N) are ones Postgres
// accepts, and the Sketching read keeps the Fork's rows out.
const USER = "it-home-user";
const TRIP_ID = "it-home-trip";
const FORK_ID = "it-home-fork";

describe.skipIf(process.env.INTEGRATION !== "1")("home reads (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: USER },
      update: { whatsNewSeenAt: null, welcomeSeenAt: null, displayName: "Xanthia" },
      create: { id: USER, email: "home-reads@example.test", name: "Home IT", displayName: "Xanthia" },
    });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades members, forks, stops, chapters
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT Home", homeCurrency: "AUD", createdById: USER, members: { create: { userId: USER, role: "owner" } } },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: USER } });
    await db.chapter.createMany({
      data: [
        { id: "it-home-ch-real", tripId: TRIP_ID, name: "IT North", colour: "sky" },
        { id: "it-home-ch-fork", tripId: TRIP_ID, forkId: FORK_ID, name: "IT Fork chapter", colour: "sky" },
      ],
    });
    await db.stop.createMany({
      data: [
        { id: "it-home-porto", tripId: TRIP_ID, name: "IT Porto", nights: 3, sortOrder: 1, chapterId: "it-home-ch-real", chapterSortOrder: 0 },
        { id: "it-home-lisbon", tripId: TRIP_ID, name: "IT Lisbon", nights: 2, sortOrder: 0 },
        { id: "it-home-seville", tripId: TRIP_ID, forkId: FORK_ID, name: "IT Seville", nights: 4, sortOrder: 0 },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("readWhatsNewSeen and readWelcomeState read the Traveller's row", async () => {
    expect(await readWhatsNewSeen(USER)).toMatchObject({ whatsNewSeenAt: null, createdAt: expect.any(Date) });
    expect(await readWelcomeState(USER)).toEqual({ welcomeSeenAt: null, name: "Home IT", displayName: "Xanthia" });
    expect(await readWelcomeState("it-home-nobody")).toBeNull();
  });

  it("readSketchingPlan reads the real plan only, chapter order then plan order", async () => {
    const { stops, chapters } = await readSketchingPlan(TRIP_ID, true);
    expect(stops.map((s) => s.name)).toEqual(["IT Lisbon", "IT Porto"]);
    expect(chapters.map((c) => c.name)).toEqual(["IT North"]);
    expect((await readSketchingPlan(TRIP_ID, false)).chapters).toEqual([]);
  });
});
```
(Check the ordering assertion against the real `orderBy`: `chapterSortOrder` is 0 for both real Stops, so `sortOrder` decides, and Lisbon (0) comes before Porto (1).)
- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/traveller-reads.test.ts lib/sketch-reads.test.ts`. Expected: `Failed to resolve import "./traveller-reads"` and the same for `./sketch-reads`.
- [ ] **Step 3: Implement**

`lib/traveller-reads.ts`:
```ts
import { db } from "@/lib/db";

/**
 * Per-Traveller reads the app shell's server components need (spec
 * 2026-10-14 Q8: components never import lib/db). Each returns null for a
 * row that has gone missing; the callers then render nothing.
 */

/** The What's new stamp and the sign-up date — `unreadReleaseNotes` (lib/release-notes.ts) needs both. */
export function readWhatsNewSeen(userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: { whatsNewSeenAt: true, createdAt: true } });
}

/** The first-sign-in Welcome stamp and both names (`needsDisplayName`, lib/traveller.ts). */
export function readWelcomeState(userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: { welcomeSeenAt: true, name: true, displayName: true } });
}
```
`lib/sketch-reads.ts`:
```ts
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";

/**
 * The Sketching Home's Route card rows (components/trip/home/phase-sketching.tsx).
 * The caller (the Trip Home page) has already checked Trip access.
 *
 * Dated views follow the real plan — CONTEXT.md; consistent with
 * calendar/day/print/summary. Policy (not a BND-2 spelling exemption):
 * deliberately ignores `?plan=` — never wire in a variable plan here.
 * A disabled trip renders as if it had no chapters (Task 13), so the
 * chapters query is skipped entirely rather than fetch-then-discard.
 */
export async function readSketchingPlan(tripId: string, chaptersEnabled: boolean) {
  const [stops, chapters] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: [{ chapterSortOrder: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, country: true, nights: true, chapterId: true, arriveDate: true },
    }),
    chaptersEnabled
      ? db.chapter.findMany({
          where: { tripId, ...REAL_PLAN },
          orderBy: { name: "asc" },
          select: { id: true, name: true, colour: true },
        })
      : Promise.resolve([]),
  ]);
  return { stops, chapters };
}
```
`components/whats-new/whats-new-banner.tsx`:
- Line 1 `import { db } from "@/lib/db";` becomes `import { readWhatsNewSeen } from "@/lib/traveller-reads";`.
- Lines 23-26 (`const row = await db.user.findUnique({…})`) become `const row = await readWhatsNewSeen(user.id);`.

`components/welcome/welcome-gate.tsx`:
- Line 1 becomes `import { readWelcomeState } from "@/lib/traveller-reads";`.
- Lines 18-21 become `const row = await readWelcomeState(user.id);`.

`components/trip/home/phase-sketching.tsx`:
- Lines 4-5 (`db` and `REAL_PLAN` imports) become `import { readSketchingPlan } from "@/lib/sketch-reads";`.
- Lines 35-52 (the `Promise.all`) become `const { stops, chapters } = await readSketchingPlan(tripId, chaptersEnabled);`.
- `const slug = await tripSlugFor(tripId);` stays where it is (line 34).

`components/trip/files-section-class.ts`: the contents of `app/(app)/trips/[tripId]/files/section-class.ts`, verbatim, with the doc comment's "Shared by the page (which re-exports it for its test) and the client FilesIndex" kept. Delete the app file.
- `components/trip/files-index.tsx:8` becomes `import { FILES_SECTION_HEADER_CLASS } from "@/components/trip/files-section-class";`.
- `app/(app)/trips/[tripId]/files/page.tsx:29` becomes `export { FILES_SECTION_HEADER_CLASS } from "@/components/trip/files-section-class";`. Its test imports it from the page; that is unchanged.

Component tests (Q10: rewrite the mocks, keep the assertions):
- `whats-new-banner.test.tsx`:
  - Line 3 becomes `vi.mock("@/lib/traveller-reads", () => ({ readWhatsNewSeen: vi.fn() }));`.
  - Line 21 becomes `import { readWhatsNewSeen } from "@/lib/traveller-reads";`.
  - Line 25 becomes `const mockFindUnique = readWhatsNewSeen as unknown as ReturnType<typeof vi.fn>;`.
  - Every `it` stays as written.
- `welcome-gate.test.tsx`:
  - Line 4 becomes `vi.mock("@/lib/traveller-reads", () => ({ readWelcomeState: vi.fn() }));`.
  - Line 10 becomes `import { readWelcomeState } from "@/lib/traveller-reads";`.
  - Line 15 becomes `const mockFindUnique = readWelcomeState as unknown as ReturnType<typeof vi.fn>;`.
  - The query-shape test at 26-33 ("reads the Welcome stamp and both names in one query") becomes `expect(mockFindUnique).toHaveBeenCalledWith("u1");`. The select assertion now lives in `lib/traveller-reads.test.ts`.
- `phase-sketching.test.tsx`:
  - Replace the db mock (8-18) with `const { readSketchingPlanMock } = vi.hoisted(() => ({ readSketchingPlanMock: vi.fn() })); vi.mock("@/lib/sketch-reads", () => ({ readSketchingPlan: readSketchingPlanMock }));`.
  - In each `beforeEach`, seed `readSketchingPlanMock.mockResolvedValue({ stops: [...], chapters: [...] })` with the same rows the file seeds today (later `describe`s that seed `stopFindManyMock` or `chapterFindManyMock` seed `readSketchingPlanMock` instead, with the same rows).
  - The two "scopes … to the real plan" tests become one test: `expect(readSketchingPlanMock).toHaveBeenCalledWith("trip-1", true)`.
  - The three gating tests assert that `readSketchingPlanMock` was called with `false`, `true` and `true` (defaulted) respectively.
  - The scoping and skip behaviour themselves are asserted in `lib/sketch-reads.test.ts`.
  - Update the header comment at 3-6 to say the component reads through `lib/sketch-reads`.

- [ ] **Step 4: Run it, expect PASS.**
  - `npx vitest run lib/traveller-reads.test.ts lib/sketch-reads.test.ts components/whats-new/whats-new-banner.test.tsx components/welcome/welcome-gate.test.tsx components/trip/home/phase-sketching.test.tsx "app/(app)/trips/[tripId]/files/page.test.tsx" components/trip/files-index.test.tsx`
  - If the local DB is up: `npm run test:integration -- test/integration/home-reads.test.ts`.
  - `git grep -nE "from ['\"]@/(lib/db|app/)" -- 'components/**' ':!*.test.tsx'` prints nothing.
- [ ] **Step 5: Task-done check.** Run each of these:
  - `npx vitest related --run lib/traveller-reads.ts lib/sketch-reads.ts components/whats-new/whats-new-banner.tsx components/welcome/welcome-gate.tsx components/trip/home/phase-sketching.tsx components/trip/files-index.tsx components/trip/files-section-class.ts "app/(app)/trips/[tripId]/files/page.tsx"`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
- [ ] **Step 6: Commit.** `git add` the files above (including the deletion), with message `refactor(components): read the Traveller and the sketch through lib; the Files header class leaves app (card 3.N)`.

---

### Task 3.N.3: `recordActivity` moves to `lib/activity-record.ts` and stops being a published action

**Files:**
- Create: `lib/activity-record.ts`, `lib/activity-record.test.ts`
- Modify:
  - `server/actions/activity.ts:1-75`, which keeps only `markAllRead`, plus `server/actions/activity.test.ts:1-281`
  - `lib/activity-guard.ts:10,13`
  - The `server/actions/*.ts` importers: `attachments.ts:10`, `checklists.ts:17`, `forks.ts:9`, `notes.ts:7`, `reminders.ts:12`, `trips.ts:19`, `votes.ts:7`
  - The test mocks of `@/server/actions/activity` whose factory provides `recordActivity`:
    - `lib/activity-guard.test.ts:9`
    - `server/actions/accommodation.test.ts:130` (+ the import at :179)
    - `attachments.test.ts:96`
    - `chapters.test.ts:116` (+ :119)
    - `checklists.test.ts:74`
    - `costs.test.ts:93` (+ :128)
    - `day-titles.test.ts:41` (+ the comment at :8)
    - `firm-up-trip.test.ts:34`
    - `forks.test.ts:258-260` (+ the comment at :11)
    - `items.test.ts:141` (+ :214)
    - `notes.test.ts:39` (+ :79)
    - `reminders.test.ts:59`
    - `stops.test.ts:190` (+ :296)
    - `surprise.test.ts:40`
    - `transport.test.ts:140` (+ :188)
    - `trips.test.ts:209`
    - `votes.test.ts:49`
  - `lib/server-action-exports.test.ts:41`
  - `lib/mcp/acting-traveller-imports.test.ts:20` (the guard still exists until 3.N.7)
  - `ONBOARDING.md:80`

**Interfaces:**
- Produces:
```ts
// lib/activity-record.ts
export interface RecordActivityInput { /* verbatim: the inline parameter type of today's recordActivity, server/actions/activity.ts:13-26 */ }
export async function recordActivity(input: RecordActivityInput): Promise<void>;
```
- After this task, `server/actions/activity.ts` exports only `markAllRead`.

- [ ] **Step 1: Write the failing test.**
  - Create `lib/activity-record.test.ts` by **moving** today's `server/actions/activity.test.ts:90-281` ("recordActivity — Surprise stamp" and "recordActivity"). Take with it the header it needs: lines 1-62's hoisted mocks for `requireTripAccess`, `activity.create`, `stop.findUnique` and `item.findUnique`, the `@/lib/error-sink` mock, the `@/lib/surprise-visibility` mock, the `runAsTraveller` import at line 3 and `beforeEach`/`afterEach`.
  - The import becomes `import { recordActivity } from "./activity-record";`.
  - Every route string the tests assert changes from `"server/actions/activity.ts#recordActivity"` to `"lib/activity-record.ts#recordActivity"` (activity.test.ts:268). If the moved tests assert `#resolveSurpriseOf`, that changes the same way.
  - Remove the moved blocks, and any mocks only they used, from `server/actions/activity.test.ts`. `markAllRead`, `getUnreadActivityCount` and "Activity and the Surprise" stay there until 3.N.4.
- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/activity-record.test.ts`. Expected: `Failed to resolve import "./activity-record"`.
- [ ] **Step 3: Implement.** Create `lib/activity-record.ts`:
```ts
import { db } from "@/lib/db";
import { reportError } from "@/lib/error-sink";
import { requireTripAccess } from "@/lib/guards";
import { isNextControlFlow } from "@/lib/next-control-flow";
import { currentActivitySource } from "@/lib/mcp/acting-traveller";
import type { ActivityVerb, ActivityEntityType, ActivityChange, ActivitySummary } from "@/lib/activity";
import { surpriseRootForEntity, type SurpriseRoot } from "@/lib/surprise-guard";

/**
 * The one writer of Activity rows the app's actions use (lib/activity-guard.ts
 * wraps it for plan entities; Forks stay silent there). A plain lib module,
 * not a "use server" action (spec 2026-10-14 card 3.N): nothing outside the
 * server ever needed to call it, and as a published action any client could
 * name any tripId (ARCH-TEN-2).
 */
export interface RecordActivityInput {
  tripId: string;
  verb: ActivityVerb;
  entityType: ActivityEntityType;
  entityId?: string | null;
  entityLabel: string;
  changes?: ActivityChange[] | { excerpt: string } | ActivitySummary | null;
  /**
   * The Surprise this row is inside (CONTEXT.md Surprise). `undefined`:
   * resolve it from entityType/entityId (the entity still exists). `null`:
   * not inside anything (the reveal line). A value: stamped as given (deletes
   * pass what the guard returned before the row was gone).
   */
  surpriseOf?: SurpriseRoot | null;
}

export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    // Guarded by Trip membership, not just requireUser(): the actor is the
    // signed-in Traveller, and a call for a Trip they aren't on hits
    // requireTripAccess's notFound() (a throw), which the catch{} below
    // absorbs — a silent no-op rather than a write into someone else's Trip
    // (ARCH-TEN-2). requireTripAccess is cache()'d, so calling it again here
    // costs nothing when the caller already checked access for the same
    // tripId this request — see the comments atop lib/guards.ts.
    const { user } = await requireTripAccess(input.tripId);
    if (input.verb === "UPDATED" && Array.isArray(input.changes) && input.changes.length === 0) return; // no real change
    const surpriseOf =
      input.surpriseOf !== undefined ? input.surpriseOf : await resolveSurpriseOf(input.entityType, input.entityId ?? null);
    await db.activity.create({
      data: {
        tripId: input.tripId,
        actorId: user.id,
        verb: input.verb,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        changes: (input.changes ?? undefined) as any,
        source: currentActivitySource(),
        surpriseOfType: surpriseOf?.type ?? null,
        surpriseOfId: surpriseOf?.id ?? null,
      },
    });
  } catch (err) {
    // best-effort: never break the caller's mutation. A guard refusal stays
    // silent (ARCH-TEN-2); everything else is reported before being
    // swallowed (ARCH-OBS-3, ADR 0059).
    if (!isNextControlFlow(err)) await reportError(err, { route: "lib/activity-record.ts#recordActivity", source: "server" });
  }
}

/** A failed Surprise lookup must not drop the Activity row: it is written unstamped instead. */
async function resolveSurpriseOf(entityType: string, entityId: string | null): Promise<SurpriseRoot | null> {
  try {
    return await surpriseRootForEntity(entityType, entityId);
  } catch (err) {
    if (!isNextControlFlow(err)) await reportError(err, { route: "lib/activity-record.ts#resolveSurpriseOf", source: "server" });
    return null;
  }
}
```
In `server/actions/activity.ts`, delete lines 13-75 (`recordActivity` and `resolveSurpriseOf`) and the imports only they used: `reportError`, `isNextControlFlow`, `currentActivitySource`, the four `@/lib/activity` types, `surpriseRootForEntity` and `SurpriseRoot`. `getRecentActivity` and `getUnreadActivityCount` stay until 3.N.4, along with their imports (`requireTripAccess`, `TRAVELLER_SELECT`, `loadSurpriseVisibility`).

Every source importer, before → after: `import { recordActivity } from "@/server/actions/activity";` becomes `import { recordActivity } from "@/lib/activity-record";`. The sites are `server/actions/attachments.ts:10`, `checklists.ts:17`, `forks.ts:9`, `notes.ts:7`, `reminders.ts:12`, `trips.ts:19` and `votes.ts:7`.

`lib/activity-guard.ts`:
- Line 10 becomes `import { recordActivity, type RecordActivityInput } from "@/lib/activity-record";`.
- Delete line 13 (`type RecordActivityInput = Parameters<typeof recordActivity>[0];`).

Every test mock, before → after:
- `vi.mock("@/server/actions/activity", () => ({ recordActivity: … }))` becomes `vi.mock("@/lib/activity-record", () => ({ recordActivity: … }))`, keeping the factory body unchanged.
- `import { recordActivity } from "@/server/actions/activity";` becomes `import { recordActivity } from "@/lib/activity-record";`.

The sites are the 17 test files listed in **Files**. Comments that name the old module (`day-titles.test.ts:8`, `forks.test.ts:11`) say `lib/activity-record`. `ONBOARDING.md:80` changes "and `@/server/actions/activity` for activity recording" to "and `@/lib/activity-record` for activity recording".

`lib/server-action-exports.test.ts:41` becomes `"activity.ts": ["getRecentActivity", "getUnreadActivityCount", "markAllRead"],`.

`lib/mcp/acting-traveller-imports.test.ts:20` changes `"server/actions/activity.ts"` to `"lib/activity-record.ts"`.

- [ ] **Step 4: Run it, expect PASS.** Run:
  - `npx vitest run lib/activity-record.test.ts server/actions/activity.test.ts lib/activity-guard.test.ts lib/server-action-exports.test.ts lib/mcp/acting-traveller-imports.test.ts server/actions/{accommodation,attachments,chapters,checklists,costs,day-titles,firm-up-trip,forks,items,notes,reminders,stops,surprise,transport,trips,votes}.test.ts`
  - `git grep -n "recordActivity" -- 'server/actions/activity.ts'` prints nothing.
  - `git grep -n "from \"@/server/actions/activity\"" -- 'lib/**' 'server/**'` prints only `lib/trip-shell-reads.ts:5`, which is fixed in 3.N.4.
- [ ] **Step 5: Task-done check.** Run each of these:
  - `npx vitest related --run lib/activity-record.ts lib/activity-guard.ts server/actions/activity.ts server/actions/{attachments,checklists,forks,notes,reminders,trips,votes}.ts`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
- [ ] **Step 6: Commit.** `git add` the files above, with message `refactor(activity): recordActivity lives in lib/activity-record and is no longer a published action (card 3.N)`.

---

### Task 3.N.4: The trip shell's activity and Fork reads move to lib

**Files:**
- Create: `lib/activity-reads.ts`, `lib/activity-reads.test.ts`, `lib/fork-reads.ts`, `lib/fork-reads.test.ts`, `test/integration/activity-reads.test.ts`
- Modify:
  - `server/actions/activity.ts:77-115` and `server/actions/activity.test.ts:319-399`
  - `server/actions/forks.ts:23-44`
  - `lib/trip-shell-reads.ts:5-6,19-20`
  - `lib/trip-shell-reads.test.ts:10-17,68`
  - `app/(app)/trips/[tripId]/day/[date]/page.test.tsx:26-29`
  - `app/(app)/trips/[tripId]/layout.test.tsx:87-93`
  - `app/(app)/trips/[tripId]/page.test.tsx:51-57`
  - `lib/server-action-exports.test.ts:41,89`
  - `lib/surprise-readers.guard.test.ts:42` (still exists until 3.N.7)

**Interfaces:**
- Consumes: `recordActivity` from `lib/activity-record.ts` (3.N.3), used by the integration test.
- Produces:
```ts
// lib/activity-reads.ts
export async function getRecentActivity(tripId: string, limit?: number): Promise<(Activity & { actor: TravellerRow })[]>; // the same inferred type as today
export async function getUnreadActivityCount(tripId: string): Promise<number>;
// lib/fork-reads.ts
export interface ForkListItem { id: string; name: string; sortOrder: number }
export async function listForks(tripId: string): Promise<ForkListItem[]>;
```
`lib/trip-shell-reads.ts` keeps `readUnreadActivityCount`, `readRecentActivity` and `readForks` unchanged, now over these modules.

- [ ] **Step 1: Write the failing test.**
  - Create `lib/activity-reads.test.ts` by **moving** `server/actions/activity.test.ts:319-399` ("getUnreadActivityCount" and "Activity and the Surprise"), with the mocks they use: `requireTripAccess`, `activity.count` and `activity.findMany`, the `loadSurpriseVisibility` mock, `NO_SURPRISES`, `hiddenVisibility`, `MARKER_WHERE` and `expectAccessCheckedBeforeWrite`. The import becomes `import { getUnreadActivityCount, getRecentActivity } from "./activity-reads";`.
  - Create `lib/fork-reads.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

const { requireTripAccess, forkFindMany } = vi.hoisted(() => ({
  requireTripAccess: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } }),
  forkFindMany: vi.fn().mockResolvedValue([{ id: "f1", name: "Plan B", sortOrder: 0 }]),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/db", () => ({ db: { fork: { findMany: forkFindMany } } }));

import { listForks } from "./fork-reads";

describe("listForks", () => {
  it("checks Trip access, then lists the Trip's Forks in sortOrder", async () => {
    expect(await listForks("t1")).toEqual([{ id: "f1", name: "Plan B", sortOrder: 0 }]);
    expect(requireTripAccess).toHaveBeenCalledWith("t1");
    expectAccessCheckedBeforeWrite(requireTripAccess, forkFindMany);
    expect(forkFindMany).toHaveBeenCalledWith({ where: { tripId: "t1" }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, sortOrder: true } });
  });
});
```
  - Create `test/integration/activity-reads.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ id: "it-act-owner" }));
vi.mock("@/lib/guards", () => ({
  requireUser: vi.fn(async () => ({ id: viewer.id })),
  requireTripAccess: vi.fn(async () => ({ user: { id: viewer.id }, membership: { role: "owner", lastReadActivityAt: null } })),
}));

import { db } from "@/lib/db";
import { getRecentActivity, getUnreadActivityCount } from "@/lib/activity-reads";
import { listForks } from "@/lib/fork-reads";
import { recordActivity } from "@/lib/activity-record";

// Real Postgres (npm run test:integration): the reads moved out of
// server/actions/{activity,forks}.ts (card 3.N) run against a real database,
// including the viewer's Surprise fragment on the feed.
const OWNER = "it-act-owner";
const OTHER = "it-act-other";
const TRIP_ID = "it-act-trip";
const SECRET = "it-act-secret";

describe.skipIf(process.env.INTEGRATION !== "1")("activity and Fork reads (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: OWNER }, update: {}, create: { id: OWNER, email: "act-owner@example.test", name: "Act Owner" } });
    await db.user.upsert({ where: { id: OTHER }, update: {}, create: { id: OTHER, email: "act-other@example.test", name: "Act Other" } });
  });

  beforeEach(async () => {
    viewer.id = OWNER;
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades members, forks, stops, activity
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Activity", homeCurrency: "AUD", createdById: OWNER, forksEnabled: true,
        startDate: "2027-06-01", endDate: "2027-06-07",
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: OTHER, role: "member" }] },
      },
    });
    // A live Surprise the owner planned for OTHER.
    await db.stop.create({
      data: {
        id: SECRET, tripId: TRIP_ID, name: "IT Secret", timezone: "Europe/Lisbon", sortOrder: 0,
        arriveDate: "2027-06-04", departDate: "2027-06-07", nights: 3,
        surprisePlannerId: OWNER, surpriseForIds: JSON.stringify([OTHER]),
      },
    });
    await db.activity.createMany({
      data: [
        { tripId: TRIP_ID, actorId: OTHER, verb: "CREATED", entityType: "ITEM", entityLabel: "IT Dinner", createdAt: new Date("2027-01-01T10:00:00Z") },
        { tripId: TRIP_ID, actorId: OWNER, verb: "UPDATED", entityType: "STOP", entityId: SECRET, entityLabel: "IT Secret",
          surpriseOfType: "STOP", surpriseOfId: SECRET, createdAt: new Date("2027-01-01T11:00:00Z") },
        { tripId: TRIP_ID, actorId: OTHER, verb: "CREATED", entityType: "ITEM", entityLabel: "IT Stamped",
          surpriseOfType: "STOP", surpriseOfId: SECRET, createdAt: new Date("2027-01-01T12:00:00Z") },
      ],
    });
    await db.fork.createMany({
      data: [
        { id: "it-act-fork-b", tripId: TRIP_ID, name: "IT Plan C", sortOrder: 1, createdById: OWNER },
        { id: "it-act-fork-a", tripId: TRIP_ID, name: "IT Plan B", sortOrder: 0, createdById: OWNER },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the unread count counts only others' unstamped rows", async () => {
    expect(await getUnreadActivityCount(TRIP_ID)).toBe(1);
  });

  it("the recent feed is newest first with the actor, and hides a Surprise's rows from the Traveller it surprises", async () => {
    const mine = await getRecentActivity(TRIP_ID, 10);
    expect(mine.map((a) => a.entityLabel)).toEqual(["IT Stamped", "IT Secret", "IT Dinner"]);
    expect(mine[2].actor?.name).toBe("Act Other");
    viewer.id = OTHER;
    expect((await getRecentActivity(TRIP_ID, 10)).map((a) => a.entityLabel)).toEqual(["IT Dinner"]);
  });

  it("recordActivity writes an app-sourced row as the signed-in Traveller", async () => {
    await recordActivity({ tripId: TRIP_ID, verb: "CREATED", entityType: "STOP", entityLabel: "IT Lisbon", surpriseOf: null });
    const row = await db.activity.findFirst({ where: { tripId: TRIP_ID, entityLabel: "IT Lisbon" } });
    expect(row).toMatchObject({ actorId: OWNER, source: null, surpriseOfId: null });
  });

  it("listForks lists the Trip's Forks in sortOrder", async () => {
    expect((await listForks(TRIP_ID)).map((f) => f.name)).toEqual(["IT Plan B", "IT Plan C"]);
  });
});
```
(The feed assertion encodes ADR 0051: rows stamped inside a live Surprise are hidden from the Traveller it surprises. If `loadSurpriseVisibility`'s Activity fragment keeps the owner's own stamped row visible to OTHER under some rule this test did not anticipate, read `lib/surprise-visibility.ts` and assert what that rule says. Do not change the code to fit the test.)
- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/activity-reads.test.ts lib/fork-reads.test.ts`. Expected: `Failed to resolve import "./activity-reads"` and `"./fork-reads"`.
- [ ] **Step 3: Implement**

`lib/activity-reads.ts` (bodies moved verbatim from `server/actions/activity.ts:85-115`):
```ts
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";

/**
 * The Trip's Activity feed reads (bell count, recent list). Pages reach them
 * through lib/trip-shell-reads.ts's cache() wrappers. Plain lib functions
 * (spec 2026-10-14 card 3.N): no longer published Server Actions.
 */

/**
 * Surprise (ADR 0051): rows inside a Surprise hidden from the viewer stay in
 * the database; once it is revealed they show again, in place.
 */
export async function getRecentActivity(tripId: string, limit = 10) {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);
  return db.activity.findMany({
    where: { tripId, ...v.where.activity },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: TRAVELLER_SELECT } },
  });
}

/**
 * Surprise (CONTEXT.md, ADR 0051): the count ignores every row stamped as
 * inside a Surprise, hidden or not. A reveal must not pile the old lines onto
 * the bell, and the count has no per-Surprise reveal time to compare against,
 * so only unstamped rows count (the "revealed" line among them).
 */
export async function getUnreadActivityCount(tripId: string): Promise<number> {
  const { user, membership } = await requireTripAccess(tripId);
  const since = membership.lastReadActivityAt ?? null;
  return db.activity.count({
    where: { tripId, actorId: { not: user.id }, surpriseOfId: null, ...(since ? { createdAt: { gt: since } } : {}) },
  });
}
```
`lib/fork-reads.ts` (moved verbatim from `server/actions/forks.ts:27-44`):
```ts
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";

export interface ForkListItem {
  id: string;
  name: string;
  sortOrder: number;
}

/**
 * List all forks for a trip in sortOrder. Used by the trip layout (through
 * lib/trip-shell-reads.ts's readForks) to populate the ForkSwitcher.
 */
export async function listForks(tripId: string): Promise<ForkListItem[]> {
  await requireTripAccess(tripId);
  return db.fork.findMany({
    where: { tripId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, sortOrder: true },
  });
}
```
- `server/actions/activity.ts`: delete lines 77-115 (`getRecentActivity` and `getUnreadActivityCount`) and the imports now unused (`requireTripAccess`, `TRAVELLER_SELECT`, `loadSurpriseVisibility`). The file keeps `"use server"`, `db`, `requireUser` and `markAllRead`.
- `server/actions/forks.ts`: delete lines 23-44 (the `listForks` banner, `ForkListItem` and `listForks`). Keep `requireTripAccess` if other functions use it (they do).
- `lib/trip-shell-reads.ts`:
  - Lines 5-6 become `import { getUnreadActivityCount, getRecentActivity } from "@/lib/activity-reads";` and `import { listForks } from "@/lib/fork-reads";`.
  - Delete the paragraph at 19-20 ("server/actions/activity.ts is a "use server" module… the cache() wrappers live here rather than there."). That workaround is gone; this fixes the comment the audit named.
- `lib/server-action-exports.test.ts:41` becomes `"activity.ts": ["markAllRead"],`. Delete `"listForks",` at :89.
- `lib/surprise-readers.guard.test.ts:42` changes `"server/actions/activity.ts"` to `"lib/activity-reads.ts"`.
- Remove the moved `describe`s from `server/actions/activity.test.ts`, along with the mocks only they used. It keeps "markAllRead".

Test mocks, before → after:

| File:line | Before | After |
|---|---|---|
| `lib/trip-shell-reads.test.ts:12` | `vi.mock("@/server/actions/activity", () => ({ getUnreadActivityCount…, getRecentActivity… }))` | the same factory under `vi.mock("@/lib/activity-reads", …)` |
| `lib/trip-shell-reads.test.ts:17` | `vi.mock("@/server/actions/forks", () => ({ listForks… }))` | `vi.mock("@/lib/fork-reads", () => ({ listForks… }))` |
| `lib/trip-shell-reads.test.ts:68` | `expect(src).not.toMatch(/from "@\/server\/actions\/activity"/);` | `expect(src).not.toMatch(/from "@\/(server\/actions\/activity|lib\/activity-reads|lib\/fork-reads)"/);` (the pages still go through the cached reads, never the raw ones) |
| `day/[date]/page.test.tsx:26-29` | `vi.mock("@/server/actions/activity", () => ({ getUnreadActivityCount: …, getRecentActivity: … }))` | the same factory under `vi.mock("@/lib/activity-reads", …)`, **plus** `vi.mock("@/server/actions/activity", () => ({}))` (keeps the graph: `markAllRead` was undefined before too) |
| `layout.test.tsx:87-93` | the activity mock and `vi.mock("@/server/actions/forks", () => ({ listForks: … }))` | the same factories under `@/lib/activity-reads` and `@/lib/fork-reads`, **plus** `vi.mock("@/server/actions/activity", () => ({}))` and `vi.mock("@/server/actions/forks", () => ({}))` |
| `page.test.tsx:51-57` | as for `layout.test.tsx` | as for `layout.test.tsx` |

- [ ] **Step 4: Run it, expect PASS.**
  - `npx vitest run lib/activity-reads.test.ts lib/fork-reads.test.ts lib/trip-shell-reads.test.ts server/actions/activity.test.ts server/actions/forks.test.ts lib/server-action-exports.test.ts lib/surprise-readers.guard.test.ts "app/(app)/trips/[tripId]/day/[date]/page.test.tsx" "app/(app)/trips/[tripId]/layout.test.tsx" "app/(app)/trips/[tripId]/page.test.tsx"`
  - If the local DB is up: `npm run test:integration -- test/integration/activity-reads.test.ts`.
- [ ] **Step 5: Task-done check.** Run each of these:
  - `npx vitest related --run lib/activity-reads.ts lib/fork-reads.ts lib/trip-shell-reads.ts server/actions/activity.ts server/actions/forks.ts`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
- [ ] **Step 6: Commit.** `git add` the files above, with message `refactor(trip-shell): activity and Fork reads live in lib; no longer published actions (card 3.N)`.

---

### Task 3.N.5: `getTripProjection` moves to `lib/trip-projection-reads.ts`

**Files:**
- Create: `lib/trip-projection-reads.ts`, `lib/trip-projection-reads.test.ts`, `test/integration/trip-projection-reads.test.ts`
- Modify:
  - `server/actions/stops.ts:6-7,1579-1603` and `server/actions/stops.test.ts:290,2066-2150`
  - `lib/flags-loader.ts:28` and `lib/flags-loader.test.ts:21`
  - `lib/nav-counts.ts:32` and `lib/nav-counts.test.ts:20`
  - `lib/next-steps-loader.test.ts:22`
  - `lib/mcp/tools/make-it-fit.ts:53` and `lib/mcp/tools/make-it-fit.test.ts:16`
  - `components/trip/home/phase-planning.test.tsx:67`
  - `app/(app)/trips/[tripId]/summary/page.test.tsx:61-63`
  - `lib/trip-projection.ts:5-6` (doc comment)
  - `lib/server-action-exports.test.ts:130`

**Interfaces:**
- Produces: `export async function getTripProjection(tripId: string, forkId?: PlanId): Promise<{ projectedEnd: string | null; hardEndDate: string | null; deadline: TripDeadline | null }>` in `lib/trip-projection-reads.ts`. Same signature and behaviour as today.

- [ ] **Step 1: Write the failing test.**
  - Create `lib/trip-projection-reads.test.ts` by **moving** the `getTripProjection` block of `server/actions/stops.test.ts`: from the `// getTripProjection` banner (line 2066) to the closing `});` of `describe("getTripProjection")`, just before the `// reorderStops` banner. Give it this header:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireTripAccessMock, tripFindUniqueMock, stopFindManyMock, transportFindManyMock } = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "user-1" }, membership: { role: "owner" } }),
  tripFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/db", () => ({
  db: { trip: { findUnique: tripFindUniqueMock }, stop: { findMany: stopFindManyMock }, transport: { findMany: transportFindManyMock } },
}));

import { getTripProjection } from "./trip-projection-reads";

beforeEach(() => {
  vi.clearAllMocks();
  transportFindManyMock.mockResolvedValue([]);
});

it("checks Trip access before reading", async () => {
  tripFindUniqueMock.mockResolvedValue(null);
  stopFindManyMock.mockResolvedValue([]);
  await getTripProjection("trip-1");
  expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
});
```
    Then add the ten moved `it`s, verbatim inside their `describe`. Remove that block and the `getTripProjection` import at `stops.test.ts:290`.
  - Create `test/integration/trip-projection-reads.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-proj-user" }, membership: { role: "owner" } })),
}));

import { db } from "@/lib/db";
import { getTripProjection } from "@/lib/trip-projection-reads";

// Real Postgres (npm run test:integration): the projection read moved out of
// server/actions/stops.ts (card 3.N) — the plan-scoped selects are ones
// Postgres accepts, and a Fork resolves its own rows.
const USER = "it-proj-user";
const TRIP_ID = "it-proj-trip";
const FORK_ID = "it-proj-fork";

describe.skipIf(process.env.INTEGRATION !== "1")("getTripProjection (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "proj@example.test", name: "Proj IT" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Projection", homeCurrency: "AUD", createdById: USER, forksEnabled: true,
        startDate: "2027-07-01", hardEndDate: "2027-07-20",
        members: { create: { userId: USER, role: "owner" } },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: USER } });
    await db.stop.createMany({
      data: [
        { id: "it-proj-a", tripId: TRIP_ID, name: "IT Porto", nights: 3, sortOrder: 0 },
        { id: "it-proj-b", tripId: TRIP_ID, name: "IT Rome", nights: 4, sortOrder: 1, timezone: "Europe/Rome" },
        { id: "it-proj-f", tripId: TRIP_ID, forkId: FORK_ID, name: "IT Seville", nights: 10, sortOrder: 0 },
      ],
    });
    await db.transport.create({
      data: { tripId: TRIP_ID, mode: "FLIGHT", fromStopId: "it-proj-b", arrIsHome: true, depAt: new Date("2027-07-08T09:00:00Z") },
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("projects the real plan and resolves its dated return leg as the deadline (ADR 0068)", async () => {
    const r = await getTripProjection(TRIP_ID);
    expect(r.projectedEnd).toBe("2027-07-08");
    expect(r.hardEndDate).toBe("2027-07-20");
    expect(r.deadline).toEqual({ kind: "return-leg", date: "2027-07-08", mode: "FLIGHT", homeward: true });
  });

  it("a Fork projects its own Stops and falls back to the hard end date", async () => {
    const r = await getTripProjection(TRIP_ID, FORK_ID);
    expect(r.projectedEnd).toBe("2027-07-11");
    expect(r.deadline).toEqual({ kind: "hard-end", date: "2027-07-20" });
  });
});
```
- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/trip-projection-reads.test.ts`. Expected: `Failed to resolve import "./trip-projection-reads"`.
- [ ] **Step 3: Implement.** Create `lib/trip-projection-reads.ts` (body moved verbatim from `server/actions/stops.ts:1580-1603`):
```ts
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { planScope, type PlanId } from "@/lib/plan-scope";
import { computeProjection } from "@/lib/trip-projection";
import type { TripDeadline } from "@/lib/trip-deadline";

/**
 * Compute a plan's projected end, its hard end date and its deadline (a dated
 * return leg's departure, else the hard end date — ADR 0068) in one round
 * trip, for the Flag detector on the Summary, Home and nav counts, and Make
 * it fit. Stops and transports are read in plan scope, so a Fork resolves its
 * own deadline. A lib read (spec 2026-10-14 card 3.N), no longer a published
 * action.
 */
export async function getTripProjection(
  tripId: string,
  forkId?: PlanId,
): Promise<{ projectedEnd: string | null; hardEndDate: string | null; deadline: TripDeadline | null }> {
  await requireTripAccess(tripId);
  const [trip, stops, transports] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, hardEndDate: true, roundTrip: true } }),
    db.stop.findMany({
      where: { tripId, ...planScope(forkId) },
      orderBy: { sortOrder: "asc" },
      select: { id: true, arriveDate: true, departDate: true, nights: true, pinned: true, sortOrder: true, timezone: true },
    }),
    db.transport.findMany({
      where: { tripId, ...planScope(forkId) },
      select: { mode: true, fromStopId: true, toStopId: true, depAt: true, arrIsHome: true },
    }),
  ]);
  return computeProjection({ trip, stops, transports });
}
```
In `server/actions/stops.ts`:
- Delete lines 1579-1603 (the doc comment and `getTripProjection`).
- Delete the imports at 6-7 (`TripDeadline` and `computeProjection`), which only it used. ESLint's no-unused-vars confirms this.

Importers, before → after:
- `lib/flags-loader.ts:28` and `lib/nav-counts.ts:32`: `import { getTripProjection } from "@/server/actions/stops";` becomes `import { getTripProjection } from "@/lib/trip-projection-reads";`.
- `lib/mcp/tools/make-it-fit.ts:53`: `import { getTripProjection, setStopNights, deleteStop } from "@/server/actions/stops";` becomes two imports: `import { setStopNights, deleteStop } from "@/server/actions/stops";` and `import { getTripProjection } from "@/lib/trip-projection-reads";`.
- `lib/trip-projection.ts:5-6`: "getTripProjection (server/actions/stops.ts) wraps it" becomes "getTripProjection (lib/trip-projection-reads.ts) wraps it".
- `lib/server-action-exports.test.ts:130`: delete `"getTripProjection",`.

Test mocks, before → after (the convention from the assembler notes):

| File:line | Before | After |
|---|---|---|
| `lib/flags-loader.test.ts:21` | `vi.mock("@/server/actions/stops", () => ({ getTripProjection }));` | `vi.mock("@/lib/trip-projection-reads", () => ({ getTripProjection }));` |
| `lib/nav-counts.test.ts:20` | `vi.mock("@/server/actions/stops", () => ({ getTripProjection: getTripProjectionMock }));` | `vi.mock("@/lib/trip-projection-reads", () => ({ getTripProjection: getTripProjectionMock }));` |
| `lib/next-steps-loader.test.ts:22` | `vi.mock("@/server/actions/stops", () => ({ getTripProjection }));` | `vi.mock("@/lib/trip-projection-reads", () => ({ getTripProjection }));` |
| `lib/mcp/tools/make-it-fit.test.ts:16` | `vi.mock("@/server/actions/stops", () => ({ getTripProjection, setStopNights, deleteStop }));` | `vi.mock("@/server/actions/stops", () => ({ setStopNights, deleteStop }));` + `vi.mock("@/lib/trip-projection-reads", () => ({ getTripProjection }));` |
| `components/trip/home/phase-planning.test.tsx:67` | `vi.mock("@/server/actions/stops", () => ({ getTripProjection: getTripProjectionMock }));` | `vi.mock("@/server/actions/stops", () => ({}));` + `vi.mock("@/lib/trip-projection-reads", () => ({ getTripProjection: getTripProjectionMock }));` (the `not.toHaveBeenCalled()` assertion at :186 is kept) |
| `app/(app)/trips/[tripId]/summary/page.test.tsx:61-63` | `vi.mock("@/server/actions/stops", () => ({ getTripProjection: vi.fn(…) }));` | `vi.mock("@/server/actions/stops", () => ({}));` + `vi.mock("@/lib/trip-projection-reads", () => ({ getTripProjection: vi.fn(async () => ({ projectedEnd: null, hardEndDate: null, deadline: null })) }));` |

If any MCP test that connects the whole server (`lib/mcp/tools/plan-write.test.ts`, `trips-stops-write.test.ts`, `reads.test.ts`, `bookings-write.test.ts`, `lists-write.test.ts`) now fails on importing `lib/trip-projection-reads` (through `make-it-fit`), add `vi.mock("@/lib/trip-projection-reads", () => ({ getTripProjection: vi.fn() }));` to that file.

- [ ] **Step 4: Run it, expect PASS.**
  - `npx vitest run lib/trip-projection-reads.test.ts server/actions/stops.test.ts lib/flags-loader.test.ts lib/nav-counts.test.ts lib/next-steps-loader.test.ts lib/mcp/tools/*.test.ts components/trip/home/phase-planning.test.tsx "app/(app)/trips/[tripId]/summary/page.test.tsx" lib/server-action-exports.test.ts`
  - If the local DB is up: `npm run test:integration -- test/integration/trip-projection-reads.test.ts`.
  - `git grep -n "getTripProjection" -- server/` prints nothing.
- [ ] **Step 5: Task-done check.** Run each of these:
  - `npx vitest related --run lib/trip-projection-reads.ts server/actions/stops.ts lib/flags-loader.ts lib/nav-counts.ts lib/mcp/tools/make-it-fit.ts lib/trip-projection.ts`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
- [ ] **Step 6: Commit.** `git add` the files above, with message `refactor(projection): getTripProjection is a lib read, no longer a published action (card 3.N)`.

---

### Task 3.N.6: `listRemindersForTrip` moves to `lib/reminder-reads.ts`

**Files:**
- Create: `lib/reminder-reads.ts`, `lib/reminder-reads.test.ts`, `test/integration/reminder-reads.test.ts`
- Modify:
  - `server/actions/reminders.ts:16,25-37,88-130` and `server/actions/reminders.test.ts:89-96,103,259-332`
  - `lib/trips/trips-page-loader.ts:16` and `lib/trips/trips-page-loader.test.ts:13`
  - `lib/mcp/tools/reads.ts:26` and `lib/mcp/tools/reads.test.ts:53`
  - `lib/sort-these-out.ts:16` and `lib/sort-these-out.test.ts:5`
  - `app/(app)/trips/[tripId]/page.tsx:21,43,53` and `app/(app)/trips/[tripId]/page.test.tsx:58-60`
  - `app/(app)/trips/[tripId]/checklists/page.tsx:18` and `app/(app)/trips/[tripId]/checklists/page.test.tsx:28`
  - `app/(app)/trips/[tripId]/plan/page.tsx:21`
  - `lib/server-action-exports.test.ts:122`
  - `lib/surprise-readers.guard.test.ts:40`

**Interfaces:**
- Produces:
```ts
// lib/reminder-reads.ts
export interface ReminderItem { id: string; title: string; date: string; stopId: string | null; stopName: string | null }
export async function listRemindersForTrip(tripId: string, fromDate: string): Promise<ReminderItem[]>;
```
`server/actions/reminders.ts` re-exports `ReminderItem` as a type, so the four component importers (`reminders-card.tsx`, `stop-extras-dialog.tsx`, `phase-planning.tsx` and `itinerary-manager.tsx`) do not change.

- [ ] **Step 1: Write the failing test.**
  - Create `lib/reminder-reads.test.ts` by **moving** `server/actions/reminders.test.ts:259-332` (the `listRemindersForTrip` banner and `describe`), with this header:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

const { requireTripAccessMock, reminderFindManyMock, loadSurpriseVisibilityMock } = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "user-1" }, membership: { role: "owner" } }),
  reminderFindManyMock: vi.fn(),
  loadSurpriseVisibilityMock: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/db", () => ({ db: { reminder: { findMany: reminderFindManyMock } } }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  loadSurpriseVisibilityMock.mockImplementation(async () => actual.NO_SURPRISES);
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import { listRemindersForTrip } from "./reminder-reads";

const TRIP_ID = "trip-1";
beforeEach(() => vi.clearAllMocks());
```
    After `vi.clearAllMocks()`, re-seed `loadSurpriseVisibilityMock` with `NO_SURPRISES` in the `beforeEach` if the moved "hidden" test's `mockResolvedValueOnce` needs it.
  - Delete the block from `reminders.test.ts`, along with the `listRemindersForTrip` import at :103. Also delete the `loadSurpriseVisibility` mock at 89-96 and the `hiddenVisibility` and `MARKER_WHERE` import, if nothing left in the file uses them.
  - Create `test/integration/reminder-reads.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ id: "it-rem-owner" }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({ user: { id: viewer.id }, membership: { role: "owner" } })),
}));

import { db } from "@/lib/db";
import { listRemindersForTrip } from "@/lib/reminder-reads";

// Real Postgres (npm run test:integration): the Reminders read moved out of
// server/actions/reminders.ts (card 3.N), with the real Surprise visibility
// loader — a Reminder about a Stop hidden from the viewer stays hidden (ADR 0051).
const OWNER = "it-rem-owner";
const MEMBER = "it-rem-member";
const TRIP_ID = "it-rem-trip";
const SECRET = "it-rem-secret";

describe.skipIf(process.env.INTEGRATION !== "1")("listRemindersForTrip (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: OWNER }, update: {}, create: { id: OWNER, email: "rem-owner@example.test", name: "Rem Owner" } });
    await db.user.upsert({ where: { id: MEMBER }, update: {}, create: { id: MEMBER, email: "rem-member@example.test", name: "Rem Member" } });
  });

  beforeEach(async () => {
    viewer.id = OWNER;
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Reminders", homeCurrency: "AUD", createdById: OWNER,
        startDate: "2027-06-01", endDate: "2027-06-07",
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] },
      },
    });
    await db.stop.createMany({
      data: [
        { id: "it-rem-porto", tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, sortOrder: 0 },
        { id: SECRET, tripId: TRIP_ID, name: "IT Secret", timezone: "Europe/Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-07", nights: 3, sortOrder: 1,
          surprisePlannerId: OWNER, surpriseForIds: JSON.stringify([MEMBER]) },
      ],
    });
    await db.reminder.createMany({
      data: [
        { tripId: TRIP_ID, title: "IT Old", date: "2026-12-31" },
        { tripId: TRIP_ID, title: "IT Visa", date: "2027-05-01" },
        { tripId: TRIP_ID, stopId: "it-rem-porto", title: "IT Port tour", date: "2027-06-02" },
        { tripId: TRIP_ID, stopId: SECRET, title: "IT Secret dinner", date: "2027-06-05" },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the planner sees every Reminder on or after the date, soonest first, with the Stop's name", async () => {
    const rows = await listRemindersForTrip(TRIP_ID, "2027-01-01");
    expect(rows.map((r) => r.title)).toEqual(["IT Visa", "IT Port tour", "IT Secret dinner"]);
    expect(rows[1]).toMatchObject({ stopId: "it-rem-porto", stopName: "IT Porto" });
    expect(rows[0]).toMatchObject({ stopId: null, stopName: null });
  });

  it("the Traveller the Stop surprises does not see the Reminder about it", async () => {
    viewer.id = MEMBER;
    expect((await listRemindersForTrip(TRIP_ID, "2027-01-01")).map((r) => r.title)).toEqual(["IT Visa", "IT Port tour"]);
  });
});
```
- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/reminder-reads.test.ts`. Expected: `Failed to resolve import "./reminder-reads"`.
- [ ] **Step 3: Implement.** Create `lib/reminder-reads.ts` (moved verbatim from `server/actions/reminders.ts:25-37` and `:92-130`):
```ts
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";

/**
 * A Reminder as the Home card (and a Stop card) render it: a title against a
 * calendar date. `stopId`/`stopName` are set when the Reminder is about a
 * Stop (Task 7) — `stopName` is the related Stop's name, joined at read time
 * so the Home card can render a chip without a second round trip. Both are
 * `null` (never omitted) for a Reminder about the Trip as a whole.
 */
export interface ReminderItem {
  id: string;
  title: string;
  date: string;
  stopId: string | null;
  stopName: string | null;
}

/**
 * Reminders for a trip dated on or after `fromDate`, soonest first.
 *
 * Called by the trip Home, the Checklists page, the Trips page loader and the
 * Claude connection's get_reminders. Access-checked: `requireTripAccess` is
 * the first statement. Surprise (ADR 0051): a Reminder about a Stop hidden
 * from the viewer stays in the database. A lib read (spec 2026-10-14 card
 * 3.N), no longer a published action.
 */
export async function listRemindersForTrip(tripId: string, fromDate: string): Promise<ReminderItem[]> {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);

  const rows = await db.reminder.findMany({
    where: { tripId, date: { gte: fromDate }, ...v.where.reminder },
    orderBy: { date: "asc" },
    take: 20,
    select: { id: true, title: true, date: true, stopId: true, stop: { select: { name: true } } },
  });

  return rows.map((r) => ({ id: r.id, title: r.title, date: r.date, stopId: r.stopId, stopName: r.stop?.name ?? null }));
}
```
In `server/actions/reminders.ts`:
- Replace the `ReminderItem` interface (25-37) with `export type { ReminderItem } from "@/lib/reminder-reads";`. If the file's own code still names `ReminderItem`, also add `import type { ReminderItem } from "@/lib/reminder-reads";`.
- Delete the "Reads" banner and `listRemindersForTrip` (88-130).
- Delete the `loadSurpriseVisibility` import (:16).

Importers, before → after:

| File:line | Before | After |
|---|---|---|
| `lib/trips/trips-page-loader.ts:16` | `import { listRemindersForTrip } from "@/server/actions/reminders";` | `import { listRemindersForTrip } from "@/lib/reminder-reads";` |
| `lib/mcp/tools/reads.ts:26` | the same | the same as above |
| `lib/sort-these-out.ts:16`, `lib/sort-these-out.test.ts:5` | `import type { ReminderItem } from "@/server/actions/reminders";` | `import type { ReminderItem } from "@/lib/reminder-reads";` |
| `app/(app)/trips/[tripId]/page.tsx:21,43` | the two imports from `@/server/actions/reminders` | `import { listRemindersForTrip, type ReminderItem } from "@/lib/reminder-reads";`. The comment at :53 ("server/actions/reminders.ts:69") becomes "lib/reminder-reads.ts". |
| `app/(app)/trips/[tripId]/checklists/page.tsx:18` | `import { listRemindersForTrip } from "@/server/actions/reminders";` | `import { listRemindersForTrip } from "@/lib/reminder-reads";` |
| `app/(app)/trips/[tripId]/plan/page.tsx:21` | `import type { ReminderItem } from "@/server/actions/reminders";` | `import type { ReminderItem } from "@/lib/reminder-reads";` |

Test mocks, before → after:

| File:line | Before | After |
|---|---|---|
| `lib/trips/trips-page-loader.test.ts:13` | `vi.mock("@/server/actions/reminders", () => ({ listRemindersForTrip: m.reminders }));` | `vi.mock("@/lib/reminder-reads", () => ({ listRemindersForTrip: m.reminders }));` |
| `lib/mcp/tools/reads.test.ts:53` | `vi.mock("@/server/actions/reminders", () => ({ listRemindersForTrip }));` | `vi.mock("@/lib/reminder-reads", () => ({ listRemindersForTrip }));` |
| `app/(app)/trips/[tripId]/page.test.tsx:58-60` | `vi.mock("@/server/actions/reminders", () => ({ listRemindersForTrip: vi.fn(async () => []) }));` | `vi.mock("@/server/actions/reminders", () => ({}));` + `vi.mock("@/lib/reminder-reads", () => ({ listRemindersForTrip: vi.fn(async () => []) }));` |
| `app/(app)/trips/[tripId]/checklists/page.test.tsx:28` | `vi.mock("@/server/actions/reminders", () => ({ listRemindersForTrip }));` | `vi.mock("@/server/actions/reminders", () => ({}));` + `vi.mock("@/lib/reminder-reads", () => ({ listRemindersForTrip }));` (the `toHaveBeenCalledWith("trip-1", today)` at :85 is kept) |

- `lib/server-action-exports.test.ts:122` becomes `"reminders.ts": ["addReminder", "deleteReminder", "updateReminder"],`.
- `lib/surprise-readers.guard.test.ts:40` changes `"server/actions/reminders.ts"` to `"lib/reminder-reads.ts"`.

- [ ] **Step 4: Run it, expect PASS.**
  - `npx vitest run lib/reminder-reads.test.ts server/actions/reminders.test.ts lib/trips/trips-page-loader.test.ts lib/mcp/tools/reads.test.ts lib/sort-these-out.test.ts "app/(app)/trips/[tripId]/page.test.tsx" "app/(app)/trips/[tripId]/checklists/page.test.tsx" "app/(app)/trips/[tripId]/plan/page.test.tsx" lib/server-action-exports.test.ts lib/surprise-readers.guard.test.ts`
  - If the local DB is up: `npm run test:integration -- test/integration/reminder-reads.test.ts`.
  - `git grep -nE "from ['\"]@/server/" -- 'lib/*.ts' 'lib/**/*.ts' 'lib/**/*.tsx' ':!lib/mcp/tools/**' ':!lib/booking-import/confirm.ts' ':!*.test.ts'` prints nothing.
- [ ] **Step 5: Task-done check.** Run each of these:
  - `npx vitest related --run lib/reminder-reads.ts server/actions/reminders.ts lib/trips/trips-page-loader.ts lib/mcp/tools/reads.ts lib/sort-these-out.ts "app/(app)/trips/[tripId]/page.tsx" "app/(app)/trips/[tripId]/checklists/page.tsx" "app/(app)/trips/[tripId]/plan/page.tsx"`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
- [ ] **Step 6: Commit.** `git add` the files above, with message `refactor(reminders): listRemindersForTrip is a lib read, no longer a published action (card 3.N)`.

---

### Task 3.N.7: The boundaries become ESLint errors; six guard tests are deleted

**Files:**
- Modify: `eslint.config.mjs` (whole file), `lib/enums.test.ts` (one test added)
- Create: `eslint.config.test.ts`
- Delete: `lib/enum-values.guard.test.ts`, `lib/trip-links.guard.test.ts`, `lib/surprise-readers.guard.test.ts`, `lib/image-loader-boundary.test.ts`, `components/ui/motion-lazy.guard.test.ts`, `lib/mcp/acting-traveller-imports.test.ts`
- Modify (comments that name a deleted guard):
  - `lib/enums.ts:16`
  - `lib/trip-path.ts:5`
  - `lib/mcp/acting-traveller.ts:10`
  - `components/trips/cover-photo-image.tsx:19`
  - `docs/adr/0072-surprise-is-hidden-in-the-query-and-from-every-shared-feed.md:44,109-112`
- Kept untouched: `lib/client-zod.guard.test.ts`, `lib/server-action-exports.test.ts`, `lib/server-only-boundary.test.ts`, `lib/action-result.guard.test.ts`, `lib/revalidate.guard.test.ts`, `lib/activity-guard.test.ts`, `components/ui/undo-toast.guard.test.ts`, `test/helpers/walk-sources.ts` (still used by the kept guards)

**Interfaces:**
- Consumes: every module path from 3.N.1–3.N.6. In particular, `lib/activity-record.ts` is in the acting-traveller allowlist, and `lib/activity-reads.ts` and `lib/reminder-reads.ts` are in the visibility-reader list.
- Produces: `eslint.config.mjs` default export (the flat config), and named exports `SURPRISE_VISIBILITY_READERS: string[]` and `SURPRISE_GUARD_READERS: string[]` (repo-relative paths, unescaped).

- [ ] **Step 1: Write the failing test.** Create `eslint.config.test.ts`. It lints probe snippets through the real config. Nothing is written to disk: `lintText` takes a virtual `filePath`.
```ts
import { existsSync } from "node:fs";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";
import { SURPRISE_GUARD_READERS, SURPRISE_VISIBILITY_READERS } from "./eslint.config.mjs";

/**
 * The import boundaries (spec 2026-10-14 card 3.N, Q8, Q14) are lint rules in
 * eslint.config.mjs. This pins that each one fires through the real config —
 * ESLint lets a later block silently replace an earlier block's
 * no-restricted-imports/-syntax, so a zone that forgets a restriction would
 * otherwise pass unnoticed. It replaces the six walk-based guard tests
 * (enum-values, trip-links, surprise-readers, image-loader-boundary,
 * motion-lazy, acting-traveller-imports).
 */
let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});

async function reports(filePath: string, code: string): Promise<boolean> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  return result.messages.some((m) => m.ruleId === "no-restricted-imports" || m.ruleId === "no-restricted-syntax");
}

const VIS = 'import { loadSurpriseVisibility } from "@/lib/surprise-visibility";\nexport const v = loadSurpriseVisibility;';
const GUARD = 'import { surpriseRootFor } from "@/lib/surprise-guard";\nexport const g = surpriseRootFor;';

// [what, file, code, reported?]
const CASES: [string, string, string, boolean][] = [
  // Q8: lib may not import server (types included; relative paths too)
  ["lib → server action", "lib/probe.ts", 'import { createStop } from "@/server/actions/stops";', true],
  ["lib → server, type only", "lib/probe.ts", 'import type { CostRow } from "@/server/actions/costs";', true],
  ["lib → server, relative", "lib/sub/probe.ts", 'import { x } from "../../server/actions/stops";', true],
  // Q14: the adapters may import server/actions/<file>, nothing else under server
  ["MCP tool → server action", "lib/mcp/tools/probe.ts", 'import { createStop } from "@/server/actions/stops";', false],
  ["MCP tool → elsewhere under server", "lib/mcp/tools/probe.ts", 'import { x } from "@/server/internal/thing";', true],
  ["booking confirm → server action", "lib/booking-import/confirm.ts", 'import "server-only";\nimport { createStop } from "@/server/actions/stops";', false],
  ["another booking-import file → server action", "lib/booking-import/build.ts", 'import { createStop } from "@/server/actions/stops";', true],
  // Q8: lib may not import components or app
  ["lib → components (type)", "lib/probe.ts", 'import type { AttachmentView } from "@/components/trip/attachment-list";', true],
  ["lib → app", "lib/probe.ts", 'import { x } from "@/app/(app)/trips/[tripId]/files/page";', true],
  // Q8: components may not import lib/db or app
  ["components → lib/db", "components/probe.tsx", 'import { db } from "@/lib/db";', true],
  ["components → lib/db, relative", "components/a/probe.tsx", 'import { db } from "../../lib/db";', true],
  ["components → app", "components/probe.tsx", 'import { x } from "@/app/(app)/trips/[tripId]/files/page";', true],
  ["components → server action is fine", "components/probe.tsx", 'import { createStop } from "@/server/actions/stops";', false],
  ["app → lib/db is fine", "app/probe.tsx", 'import { db } from "@/lib/db";', false],
  // spec 2026-10-06 §R: lib/enums only from server-side validation and lib/mcp; enum-values zod-free
  ["component → lib/enums", "components/probe.tsx", 'import { TRANSPORT_MODES } from "@/lib/enums";', true],
  ["validation → lib/enums", "lib/validations/probe.ts", 'import { TRANSPORT_MODES } from "@/lib/enums";', false],
  ["MCP → lib/enums", "lib/mcp/probe.ts", 'import { TRANSPORT_MODES } from "@/lib/enums";', false],
  ["enum-values → zod", "lib/enum-values.ts", 'import { z } from "zod";', true],
  // spec 2026-10-06 §Q: LazyMotion only
  ["m from motion/react", "components/probe.tsx", 'import { m } from "motion/react";', false],
  ["motion from motion/react", "components/probe.tsx", 'import { m, motion } from "motion/react";', true],
  // runAsTraveller / acting-traveller reachable only from the allowlist
  ["guards → acting-traveller", "lib/guards.ts", `import { getActingTraveller } from "@/lib/mcp/acting-traveller";\n${GUARD}`, false],
  ["guards → runAsTraveller", "lib/guards.ts", `import { runAsTraveller } from "@/lib/mcp/acting-traveller";\n${GUARD}`, true],
  ["an allowlisted acting-traveller importer is still a lib file", "lib/guards.ts", `import { x } from "@/components/ui/button";\n${GUARD}`, true],
  ["MCP route → runAsTraveller", "app/api/mcp/route.ts", 'import { runAsTraveller } from "@/lib/mcp/acting-traveller";', false],
  ["an action → acting-traveller", "server/actions/probe.ts", 'import { getActingTraveller } from "@/lib/mcp/acting-traveller";', true],
  ["relative → acting-traveller", "lib/mcp/reads/probe.ts", 'import { getActingTraveller } from "../acting-traveller";', true],
  ["re-export of acting-traveller", "app/api/mcp/probe.ts", 'export { runAsTraveller } from "@/lib/mcp/acting-traveller";', true],
  ["dynamic import of acting-traveller", "scripts/probe.mjs", 'await import("../lib/mcp/acting-traveller.ts");', true],
  ["acting-traveller as use server", "lib/mcp/acting-traveller.ts", '"use server";\nexport async function f() {}', true],
  // ADR 0064: Trip links through tripPath
  ["hand-built /trips/${…}", "components/probe.tsx", "export const u = (id: string) => `/trips/${id}/plan`;", true],
  ['"/trips/" + id', "server/actions/probe.ts", 'export const u = (id: string) => "/trips/" + id;', true],
  ["/api/trips/${…} is an id route", "components/probe.tsx", "export const u = (id: string) => `/api/trips/${id}/cover`;", false],
  ["revalidatePath takes the id path", "server/actions/probe.ts", 'import { revalidatePath } from "next/cache";\nexport const r = (id: string) => revalidatePath(`/trips/${id}/plan`);', false],
  ["lib/trip-path.ts builds them", "lib/trip-path.ts", "export const u = (id: string) => `/trips/${id}`;", false],
  // next/image loader only from a "use client" module
  ["loader= in a Server Component", "components/probe.tsx", 'import Image from "next/image";\nconst l = () => "";\nexport const C = () => <Image src="a" alt="" loader={l} />;', true],
  ["loader= in a Client Component", "components/probe.tsx", '"use client";\nimport Image from "next/image";\nconst l = () => "";\nexport const C = () => <Image src="a" alt="" loader={l} />;', false],
  // ADR 0072: non-readPlan readers import the Surprise helpers
  ["a visibility reader without the import", "lib/day-view-loader.ts", "export const x = 1;", true],
  ["a visibility reader with it", "lib/day-view-loader.ts", VIS, false],
  ["a visibility reader is still a lib file", "lib/day-view-loader.ts", `${VIS}\nimport type { A } from "@/components/x";`, true],
  ["an app visibility reader without the import", "app/(app)/trips/[tripId]/layout.tsx", "export const x = 1;", true],
  ["an attachment-bytes reader without the guard", "app/api/attachments/[id]/route.ts", "export const x = 1;", true],
  ["real-plan without requireRowAccess", "lib/mcp/real-plan.ts", 'import { requireUser } from "@/lib/guards";\nexport const x = requireUser;', true],
  // Tests sit outside every boundary
  ["a test reaches across layers", "lib/probe.test.ts", 'import { db } from "@/lib/db";\nimport { runAsTraveller } from "@/lib/mcp/acting-traveller";\nimport { createStop } from "@/server/actions/stops";', false],
];

describe("import boundaries (eslint.config.mjs, card 3.N)", { timeout: 30_000 }, () => {
  it.each(CASES)("%s", async (_what, file, code, expected) => {
    expect(await reports(file, code)).toBe(expected);
  });

  it.each([...SURPRISE_VISIBILITY_READERS, ...SURPRISE_GUARD_READERS, "lib/mcp/real-plan.ts"])(
    "%s exists (a lint files glob that matches nothing is silent)",
    (file) => {
      expect(existsSync(file)).toBe(true);
    },
  );
});
```
In `lib/enums.test.ts`, add the identity assertion from the deleted `enum-values.guard`:
```ts
import * as enumValues from "@/lib/enum-values";
import * as enumsModule from "@/lib/enums";

it("re-exports the very same values as lib/enum-values (spec 2026-10-06 §R)", () => {
  expect(enumsModule.TRANSPORT_MODES).toBe(enumValues.TRANSPORT_MODES);
  expect(enumsModule.isOnTrip).toBe(enumValues.isOnTrip);
});
```
(Put the imports at the file's top, alongside its existing `@/lib/enums` import, and the `it` inside its `describe("enums")`.)
- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run eslint.config.test.ts`. Expected: TypeScript/Vite import error, `SURPRISE_VISIBILITY_READERS` is not exported by `eslint.config.mjs`. Once that export exists, every `reports … true` case fails, because no restriction is configured yet.
- [ ] **Step 3: Implement.** Replace `eslint.config.mjs` with the following. It is the exact rule set that was run against the tree on 2026-10-16. All 43 probes behaved as listed, and the whole tree produced only the 26 known errors, which 3.N.1–3.N.6 remove.
```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ── Import boundaries (spec 2026-10-14 card 3.N, Q8, Q14) ──────────────────
// ESLint never merges a rule's options across blocks: for each file the LAST
// matching block's `no-restricted-imports` / `no-restricted-syntax` wins
// outright. So every block below lists ALL the restrictions for its files,
// built from the shared pieces, and blocks run broad → narrow. Pinned by
// eslint.config.test.ts, which lints probe snippets through this file.

const TESTS = ["**/*.test.ts", "**/*.test.tsx"];

/** `@/<dir>` or any `../`-relative path into the top-level `<dir>`. */
const into = (dir) => `^(?:@/|(?:\\.\\./)+)${dir}(?:/|$)`;
const ACTING = "(?:^|/)acting-traveller(?:\\.[cm]?[jt]s)?$";

const I = {
  server: { regex: into("server"), message: "lib may not import server (Q8): move the pure read to lib/*-reads.ts and let the action call it." },
  serverButActions: { regex: "^(?:@/|(?:\\.\\./)+)server(?:/(?!actions/[^/]+$)|$)", message: "lib/mcp/tools and lib/booking-import/confirm.ts adapt server/actions/* and import nothing else under server (Q14)." },
  components: { regex: into("components"), message: "lib may not import components (Q8): the view type lives in lib and the component imports it." },
  app: { regex: into("app"), message: "lib and components may not import app (Q8)." },
  libDb: { regex: "^(?:@/|(?:\\.\\./)+)lib/db$", message: "components may not import lib/db (Q8): read through a lib/*-reads.ts module." },
  enums: { regex: "^(?:@/lib/|\\./)enums$", message: "lib/enums builds zod schemas at load: import the plain values from @/lib/enum-values (spec 2026-10-06 §R)." },
  motion: { group: ["motion/react"], importNames: ["motion"], message: "Render m.* inside LazyMotion, never the full motion bundle (spec 2026-10-06 §Q)." },
  acting: { regex: ACTING, message: "Only lib/guards.ts, lib/activity-record.ts, lib/mcp/run-tool.ts and app/api/mcp/route.ts may import lib/mcp/acting-traveller." },
  runAs: { regex: ACTING, importNames: ["runAsTraveller"], message: "runAsTraveller is reachable only from app/api/mcp/route.ts." },
  zod: { group: ["zod", "zod/*"], message: "lib/enum-values.ts stays zod-free (spec 2026-10-06 §R)." },
};

const TRIP_LINK = "Build internal Trip links with tripPath() from lib/trip-path.ts (ADR 0064).";
const ACTING_DYNAMIC = "lib/mcp/acting-traveller is reachable only from its four allowlisted importers.";
const S = {
  actingDynamic: [
    { selector: `ImportExpression[source.value=/${ACTING.replaceAll("/", "\\/")}/]`, message: ACTING_DYNAMIC },
    { selector: `CallExpression[callee.name='require'][arguments.0.value=/${ACTING.replaceAll("/", "\\/")}/]`, message: ACTING_DYNAMIC },
  ],
  tripLinks: [
    // `/trips/${…}` — but not `/api/trips/${…}` (ids) or inside revalidatePath(…) (takes the id path).
    { selector: "TemplateElement[tail=false][value.raw=/(?<!\\/api)\\/trips\\/$/]:not(CallExpression[callee.name='revalidatePath'] TemplateElement)", message: TRIP_LINK },
    { selector: "BinaryExpression[operator='+'] > Literal.left[value='/trips/']", message: TRIP_LINK },
    { selector: "BinaryExpression[operator='+'] > TemplateLiteral.left[expressions.length=0][quasis.0.value.raw='/trips/']", message: TRIP_LINK },
  ],
  imageLoader: [
    { selector: "Program:not([body.0.directive='use client']):has(ImportDeclaration[source.value='next/image']) JSXAttribute[name.name='loader']", message: "A next/image loader function can only be handed over from a \"use client\" module (React error #441, 2026-09-28)." },
  ],
  mustImportVisibility: [
    { selector: "Program:not(:has(ImportDeclaration[source.value='@/lib/surprise-visibility']))", message: "This Item/Accommodation reader does not go through readPlan, so it must import lib/surprise-visibility (ADR 0072)." },
  ],
  mustImportGuard: [
    { selector: "Program:not(:has(ImportDeclaration[source.value='@/lib/surprise-guard']))", message: "An Attachment-bytes reader must import lib/surprise-guard (ADR 0072)." },
  ],
  mustUseRowAccess: [
    { selector: "Program:not(:has(ImportDeclaration[source.value='@/lib/guards'] > ImportSpecifier[imported.name='requireRowAccess']))", message: "lib/mcp/real-plan.ts delegates its Surprise check to requireRowAccess from lib/guards (ADR 0072)." },
  ],
  noUseServer: [
    { selector: "ExpressionStatement[directive='use server']", message: "lib/mcp/acting-traveller.ts must never be \"use server\": runAsTraveller would become a callable action." },
  ],
};

/** Readers of Item/Accommodation rows that do not go through readPlan (ADR 0072, amended 2026-10-15). */
export const SURPRISE_VISIBILITY_READERS = [
  "lib/day-view-loader.ts",
  "lib/budget-loader.ts",
  "lib/money-due-count.ts",
  "lib/desktop-home-loader.ts",
  "lib/travelling-home-loader.ts",
  "lib/past-home-loader.ts",
  "lib/flags-loader.ts",
  "lib/digest-dispatch.ts",
  "lib/activity-reads.ts",
  "lib/reminder-reads.ts",
  "lib/mcp/reads/trip-plan.ts",
  "lib/mcp/reads/costs.ts",
  "lib/mcp/reads/attachments.ts",
  "lib/mcp/tools/reads.ts",
  "server/actions/search.ts",
  "server/actions/ai.ts",
  "server/actions/forks.ts",
  "app/(app)/trips/[tripId]/files/page.tsx",
  "app/(app)/trips/[tripId]/layout.tsx",
  "app/(app)/trips/[tripId]/activity/page.tsx",
];
/** Readers of an Attachment's bytes (ADR 0072). */
export const SURPRISE_GUARD_READERS = ["app/api/attachments/[id]/route.ts", "lib/mcp/reads/attachment-content.ts", "lib/guards.ts"];

const LIB_I = [I.acting, I.enums, I.motion, I.server, I.components, I.app];
const MCP_I = [I.acting, I.motion, I.server, I.components, I.app];
const ADAPTER_I = [I.acting, I.motion, I.serverButActions, I.components, I.app];
const LIB_S = [...S.actingDynamic, ...S.tripLinks];
const UI_S = [...S.actingDynamic, ...S.tripLinks, ...S.imageLoader];
const runAs = (imports) => imports.map((p) => (p === I.acting ? I.runAs : p));

/**
 * Broad → narrow. `match` mirrors `files` so a single-file block below can
 * start from its folder's zone instead of silently replacing it.
 */
const ZONES = [
  { name: "everywhere", files: ["**/*.{js,mjs,cjs,ts,tsx}"], match: () => true, imports: [I.acting], syntax: S.actingDynamic },
  { name: "server", files: ["server/**"], match: (f) => f.startsWith("server/"), imports: [I.acting], syntax: LIB_S },
  { name: "app", files: ["app/**"], match: (f) => f.startsWith("app/"), imports: [I.acting, I.enums, I.motion], syntax: UI_S },
  { name: "components", files: ["components/**"], match: (f) => f.startsWith("components/"), imports: [I.acting, I.enums, I.motion, I.libDb, I.app], syntax: UI_S },
  { name: "lib", files: ["lib/**"], match: (f) => f.startsWith("lib/"), imports: LIB_I, syntax: LIB_S },
  // lib/mcp is reached only from app/api/mcp/route.ts (runtime nodejs), so @/lib/enums is fine there.
  { name: "lib-mcp", files: ["lib/mcp/**"], match: (f) => f.startsWith("lib/mcp/"), imports: MCP_I, syntax: LIB_S },
  // Q14: the adapters over the actions.
  { name: "lib-mcp-tools", files: ["lib/mcp/tools/**"], match: (f) => f.startsWith("lib/mcp/tools/"), imports: ADAPTER_I, syntax: LIB_S },
  { name: "booking-confirm", files: ["lib/booking-import/confirm.ts"], match: (f) => f === "lib/booking-import/confirm.ts", imports: [...ADAPTER_I, I.enums], syntax: LIB_S },
  { name: "validations", files: ["lib/validations/**", "lib/enums.ts"], match: (f) => f.startsWith("lib/validations/") || f === "lib/enums.ts", imports: MCP_I, syntax: LIB_S },
  { name: "enum-values", files: ["lib/enum-values.ts"], match: (f) => f === "lib/enum-values.ts", imports: [...LIB_I, I.zod], syntax: LIB_S },
  { name: "trip-path", files: ["lib/trip-path.ts", "lib/revalidate.ts"], match: (f) => f === "lib/trip-path.ts" || f === "lib/revalidate.ts", imports: LIB_I, syntax: S.actingDynamic },
  // The acting-traveller allowlist: may import the module and its dynamic forms, never runAsTraveller.
  { name: "acting-lib", files: ["lib/guards.ts", "lib/activity-record.ts"], match: (f) => f === "lib/guards.ts" || f === "lib/activity-record.ts", imports: runAs(LIB_I), syntax: S.tripLinks },
  { name: "acting-run-tool", files: ["lib/mcp/run-tool.ts"], match: (f) => f === "lib/mcp/run-tool.ts", imports: runAs(MCP_I), syntax: S.tripLinks },
  { name: "acting-module", files: ["lib/mcp/acting-traveller.ts"], match: (f) => f === "lib/mcp/acting-traveller.ts", imports: MCP_I.filter((p) => p !== I.acting), syntax: [...S.tripLinks, ...S.noUseServer] },
  { name: "mcp-route", files: ["app/api/mcp/route.ts"], match: (f) => f === "app/api/mcp/route.ts", imports: [I.enums, I.motion], syntax: [...S.tripLinks, ...S.imageLoader] },
];

const zoneOf = (file) => ZONES.findLast((z) => z.match(file));
const glob = (file) => file.replace(/[[\]]/g, "\\$&");
const rules = (imports, syntax) => ({
  "no-restricted-imports": imports.length ? ["error", { patterns: imports }] : "off",
  "no-restricted-syntax": syntax.length ? ["error", ...syntax] : "off",
});
/** One file that must import something: its folder's zone, plus the extra check. */
const mustImport = (name, file, extra) => {
  const z = zoneOf(file);
  return { name: `boundaries/${name}:${file}`, files: [glob(file)], ignores: TESTS, rules: rules(z.imports, [...z.syntax, ...extra]) };
};

const boundaries = [
  ...ZONES.map((z) => ({ name: `boundaries/${z.name}`, files: z.files, ignores: TESTS, rules: rules(z.imports, z.syntax) })),
  ...SURPRISE_VISIBILITY_READERS.map((f) => mustImport("surprise-visibility", f, S.mustImportVisibility)),
  ...SURPRISE_GUARD_READERS.map((f) => mustImport("surprise-guard", f, S.mustImportGuard)),
  mustImport("real-plan", "lib/mcp/real-plan.ts", S.mustUseRowAccess),
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...boundaries,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Exported design-tool artefacts (mock HTML + its support bundle), not
    // app source — linting them reports on generated third-party output.
    "design_handoff/**",
  ]),
]);

export default eslintConfig;
```
Delete the six guard tests listed in **Files**.

Comments that named a deleted guard:
- `lib/enums.ts:16`: "(spec 2026-10-06 §R; lib/enum-values.guard.test.ts)" becomes "(spec 2026-10-06 §R; enforced in eslint.config.mjs)".
- `lib/trip-path.ts:5`: "(lib/trip-links.guard.test.ts)" becomes "(eslint.config.mjs, ADR 0064)".
- `lib/mcp/acting-traveller.ts:10`: "(lib/mcp/acting-traveller-imports.test.ts enforces the importer list)" becomes "(eslint.config.mjs enforces the importer list: lib/guards.ts, lib/activity-record.ts, lib/mcp/run-tool.ts, app/api/mcp/route.ts)".
- `components/trips/cover-photo-image.tsx:19`: "`lib/image-loader-boundary.test.ts` guards this." becomes "`eslint.config.mjs` (no-restricted-syntax) guards this."

ADR 0072:
- Line 44's mention of `lib/surprise-readers.guard.test.ts` becomes "the import check in `eslint.config.mjs` (`SURPRISE_VISIBILITY_READERS`)".
- Lines 109-112 ("…or it fails the slim `lib/surprise-readers.guard.test.ts` before it ships; that list shrinks as readers move onto `readPlan` (amended 2026-10-15).") become: "…or it fails lint before it ships: `eslint.config.mjs` lists those readers (`SURPRISE_VISIBILITY_READERS`, `SURPRISE_GUARD_READERS`) and errors on a listed file that does not import the helper; that list shrinks as readers move onto `readPlan` (amended 2026-10-15; a lint rule since 2026-10-16, spec 2026-10-14 card 3.N)."

- [ ] **Step 4: Run it, expect PASS.**
  - `npx vitest run eslint.config.test.ts lib/enums.test.ts` passes: 43 probe cases, plus 24 file-exists cases, plus the enums test.
  - `npx eslint .` reports **no errors** (warnings unchanged from before the branch).
  - `git ls-files lib/enum-values.guard.test.ts lib/trip-links.guard.test.ts lib/surprise-readers.guard.test.ts lib/image-loader-boundary.test.ts components/ui/motion-lazy.guard.test.ts lib/mcp/acting-traveller-imports.test.ts` prints nothing.
- [ ] **Step 5: Task-done check.** Run each of these:
  - `npx vitest related --run eslint.config.mjs lib/enums.ts lib/trip-path.ts lib/mcp/acting-traveller.ts components/trips/cover-photo-image.tsx`
  - `npx tsc --noEmit`
  - `npx eslint .`: the whole tree this time, because the rule itself changed
  - `npx knip --include files,exports,types`: `test/helpers/walk-sources.ts` is still used by the kept guards
- [ ] **Step 6: Commit.** `git add eslint.config.mjs eslint.config.test.ts lib/enums.test.ts lib/enums.ts lib/trip-path.ts lib/mcp/acting-traveller.ts components/trips/cover-photo-image.tsx docs/adr/0072-surprise-is-hidden-in-the-query-and-from-every-shared-feed.md`, then `git rm` the six guard tests. Message `chore(lint): import boundaries are ESLint errors; six walk-based guard tests replaced (card 3.N, Q8, Q14)`.
## Card 3.L — PATCH-shaped updates (eight entities) and one Stop timezone default

### Notes

**Interfaces this section produces (for other sections and the final gate):**

- `lib/tz.ts` — `stopTimezone(stop: { timezone?: string | null; countryCode?: string | null; country?: string | null }): string` (pure, zod-free, client-safe). The only place a Stop's timezone default is decided.
- `lib/patch.ts` (zod-free, client-safe) — `type Patch<T>`, `patched(next, current)`, `applyPatch(current, patch)`, `toPatch(input, clearable)`. The PATCH contract: **undefined keeps, null clears**.
- `lib/activity-guard.ts` — `auditedUpdate(entityType, delegate, id, data, plan, held?: { before: Row | null })` (new optional 6th argument; existing callers unchanged).
- `lib/money/cost-patch.ts` — `mergeCostPatch`, `completeInlineCost`, `type OwnedCostRow`, `type InlineCostPatch`.
- `lib/transport-patch.ts` — `mergeTransportPatch`, `homeContradictionError`, `type TransportPatch`, `type TransportPatchRow`.
- `lib/stop-patch.ts` — `mergeStopPatch`, `type StopPatch`, `type StopPatchRow`, and the refusals `add_stop`'s `buildStopInput` shares: `NIGHTS_REQUIRED`, `LONE_DATE`, `TIMEZONE_ON_ROUGH`, `nightsMismatch`.
- Action signatures after this card: `updateStop(stopId, patch: StopPatch)`, `updateTrip(tripId, patch: Patch<TripInput>)`, `updateAccommodation(id, patch: Patch<AccommodationInput>)`, `updateTransport(id, patch: TransportPatch)`, `updateCost(id, patch: Patch<CostRawInput>)`, `updateReminder(id, patch: Patch<ReminderInput>)`, `updateItem(id, patch: Patch<ItemInput>)`, `updateChapter(id, patch: Patch<ChapterInput>)`. No new exports in any `"use server"` file, so `lib/server-action-exports.test.ts`'s ALLOWLIST is unchanged.
- `docs/adr/0075-update-actions-take-a-patch.md` (new ADR; the final gate's docs pass can cite it). If another section also creates an ADR, the assembler renumbers — this section uses **0075** and refers to it as "ADR 0075" in code comments only in Task 3.L.2 onwards.
- New integration file `test/integration/patch-updates.test.ts` (created in 3.L.3, extended by 3.L.4–3.L.9). 3.O (lib folders, last) may move `lib/money/cost-patch.ts`'s neighbours; it should leave the four new modules where they are (none belongs to `auth/`, `feedback/`, `map/`, `share/`).
- All new `lib` modules import only `lib` (types from `lib/validations/*`, values from `lib/tz`, `lib/dates`, `lib/money/cost-form-state`), so they respect 3.N's rules. `lib/mcp/tools/**` keeps importing `server/actions/*` under the Q14 exemption and newly imports `lib/stop-patch`, `lib/transport-patch` (allowed).

**Deviations from the spec text, decided while drafting (the final gate writes them into the spec's "Batch 3 drift" notes):**

1. **"Forms keep sending full input" — they do, but the update call wraps it in `toPatch(input, CLEARABLE)`.** Today every entity form encodes a cleared field as `undefined` (`notes.trim() || undefined`, conditional spreads such as `...(checkInTime ? { checkInTime } : {})`), and the actions write `?? null`. Under PATCH, `undefined` means *keep*, so a form that left those as `undefined` would silently keep a value the Traveller cleared. Key presence cannot carry the difference either: React's server-action argument encoding drops `undefined`-valued keys, and the conditional spreads omit them anyway. So each update form lists the fields it can clear and `toPatch` sends `null` for any of them it left empty. Create calls, drafts and Booking-import proposals keep the unchanged `buildInput()` output. The Trip settings form needs no change (it sends `""`, which the schema already maps to "no date"/"clear home").
2. **The "second access check" survives as the real-plan check.** Each `loadXForPatch` did `findUnique({ id, forkId: null })` + `requireTripAccess`. The tool now calls `requireRealPlanRow(kind, id)` (constraints.md: a Fork's row must read as not found through Claude, and the action cannot know it is called through Claude) — exactly what every non-PATCH tool already does. What is deleted is the row load, the hand-written merge and the per-entity row types; the action's own `requireTripAccess` is then a `cache()` hit. `update_trip` and `update_reminder` (no Fork) call the action directly.
3. **`updateStop` applies the Stop timezone rule too.** `createStop` resolves the client's `"UTC"` fallback from the (picked or geocoded) country; `updateStop` wrote the sent zone verbatim. With one rule, an edit that sends `"UTC"` for a Stop whose country is known saves the country's zone. (Visible only for a Stop in a known country saved with UTC — the zone the app never offers for one.)
4. **A Stop patch re-locates the Stop only when it says where.** The Stop's point (`lat`/`lng`/`countryCode`) is carried from the row unless the patch gives any of `country`, `countryCode`, `lat`, `lng`; then only the patch's point counts and a missing one is geocoded, as the form's save always did. The form always sends `country`, so it is unchanged. `update_stop` with `country`/`countryCode` alone now re-geocodes (it used to keep the old point under the new country); `update_stop` with `name` alone still keeps the point, as today.
5. **`update_transport` with `depIsHome: true` and an *empty* `depPlace`/`fromStopId` is Home**, not a tool error (only a non-empty Stop or place contradicts Home now — the rule `add_transport` already used, `bookings-write.ts:743-748`). Every other endpoint rule is kept, including "an empty Stop *and* an empty place is a tool error", which the tool now checks from the patch alone because the app's own form legitimately saves an end with neither (`transport-form-dialog.tsx:479,493`, the "none" kind).
6. **The tool-only refusals move into the actions with their wording unchanged** (`LONE_DATE`, `TIMEZONE_ON_ROUGH`, `NIGHTS_REQUIRED`, nights mismatch, "more than one Cost", "Pass both costMinor and currency", "A due date only applies…", "needs a stop or a place"). They name tool fields; no form can reach them (each is listed in its task with why), so no Traveller sees that wording.
7. **Chapter needs no merge rule of its own.** A lone date against a rough Chapter is refused by `chapterSchema`'s existing "Set both dates or neither" (on `endDate`) instead of the tool's "Pass both startDate and endDate, or neither, to a rough Chapter." (on `startDate`). `updateChapter` now writes `startDate/endDate: … ?? null` so an explicit `null` clears, honouring the contract. **Not fixed (recorded as a follow-up):** the Chapter form's "Set dates now" switched off on an edit still keeps the dates — it sends `{ name, colour }`, which was "leave dates" before and still is.
8. **`auditedUpdate` takes an optional held `before`.** Four actions (Accommodation, Transport, Item, Chapter) now read the full row up front to merge; passing it in keeps one read per update instead of two.
9. **Inline Cost on update refuses "more than one owned Cost" for every caller** (was: silently skipped the Cost write). The entity forms never send Cost fields when the owner has several Costs (the inline fields are seeded from `singleCost`, which is null then, so `cost.payload()` is `none`); only the tool could, and it already got this refusal.

**Review Focus candidates (each test is written in the task named):**

1. **Clearing a field through an update form vs omitting it.** A Traveller empties a Stop's Notes (or an Accommodation's address, a thing to do's link, a Transport's reference, a Cost's due date) and saves: the field is cleared (`null` written), not kept. The same action called through Claude with that field omitted keeps it. Both directions are tested per entity: a form test asserts the update call carries `null` for the emptied field, and `test/integration/patch-updates.test.ts` asserts, against real Postgres, that `updateX(id, { notes: null })` clears and `updateX(id, { name })` keeps every other column (Tasks 3.L.3–3.L.9).
2. **Un-ticking Paid in a Cost form vs a cost-amount-only patch through Claude.** The form's unpaid save sends `paidAt: null` and un-pays the Cost (the paid amount survives as history); `update_cost`/`update_accommodation` with only `costMinor` on a paid Cost keeps it paid with its paid pair. Both go through the same merge (Tasks 3.L.5, 3.L.6).
3. **A rough Stop scheduled through a patch with no timezone.** `update_stop { arriveDate, departDate }` on a rough Stop in a country the table doesn't know saves `"UTC"`; in a known country it saves the country's zone; and a form edit that sends `"UTC"` after the geocoder finds Japan saves `Asia/Tokyo` (Tasks 3.L.1, 3.L.9).

---

### Task 3.L.1: One Stop timezone default (`stopTimezone`)

The rule today, read from all six places: an explicit zone wins unless it is `"UTC"` — the fallback the clients send when they know no country — and then the Stop's country decides, its two-letter code first and its name second; neither known, `"UTC"`. `server/actions/stops.ts:81` `resolveTimezone` is the only copy that has the whole rule; the other five are partial (`guessTimezoneForCountry(countryCode ?? country)` never tries the name when a code is present but unknown, and the form copies only "set it when the guess isn't UTC"). One pure function replaces all of them.

**Files:**
- Modify: `lib/tz.ts` (add `stopTimezone` after `timezoneForCountryOrNull`, `:294-297`)
- Test: `lib/tz.test.ts`
- Modify: `server/actions/stops.ts:10, 75-84, 246, 371`
- Modify: `server/actions/stop-flow.ts:9, 147`
- Modify: `lib/mcp/tools/trips-stops-write.ts:25-33, 61, 165, 274`
- Modify: `components/trip/stop-form-dialog.tsx:22, 193-195, 264-283`
- Modify: `components/plan/mobile/add-stop-sheet.tsx:21, 136`
- Modify: `lib/booking-import/build.ts:11, 318`
- Test (existing, must stay green): `server/actions/stops.test.ts` (`:662-725` "UTC timezone fallback" block), `server/actions/stop-flow.test.ts`, `lib/mcp/tools/trips-stops-write.test.ts` (`:392` "add_stop derives a timezone…"), `components/trip/stop-form-dialog.test.tsx`, `components/plan/mobile/add-stop-sheet.test.tsx`, `lib/booking-import/build.test.ts`

**Interfaces:**
- Consumes: `timezoneForCountryOrNull(country?: string | null): string | null` (`lib/tz.ts:294`).
- Produces: `export function stopTimezone(stop: { timezone?: string | null; countryCode?: string | null; country?: string | null }): string` — used again by Task 3.L.9 (`lib/stop-patch.ts`, `updateStop`).

- [ ] **Step 1: Write the failing test** — append to `lib/tz.test.ts` (add `stopTimezone` to the existing import from `./tz`):

```ts
describe("stopTimezone (the one Stop timezone rule)", () => {
  it("an explicit zone wins", () => {
    expect(stopTimezone({ timezone: "Europe/Lisbon", countryCode: "fr", country: "France" })).toBe("Europe/Lisbon");
  });
  it("the UTC fallback takes the country code's zone", () => {
    expect(stopTimezone({ timezone: "UTC", countryCode: "jp" })).toBe("Asia/Tokyo");
  });
  it("no zone at all takes the country code's zone", () => {
    expect(stopTimezone({ countryCode: "it", country: "Italy" })).toBe("Europe/Rome");
    expect(stopTimezone({ timezone: null, countryCode: "it" })).toBe("Europe/Rome");
  });
  it("an unknown code falls through to the country name", () => {
    expect(stopTimezone({ timezone: "UTC", countryCode: "zz", country: "Italy" })).toBe("Europe/Rome");
  });
  it("the country name alone is enough", () => {
    expect(stopTimezone({ country: "  France " })).toBe("Europe/Paris");
  });
  it("nothing known is UTC", () => {
    expect(stopTimezone({})).toBe("UTC");
    expect(stopTimezone({ timezone: "UTC", country: "Atlantis" })).toBe("UTC");
    expect(stopTimezone({ timezone: "", countryCode: null, country: null })).toBe("UTC");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/tz.test.ts` — `SyntaxError`/`TypeError: stopTimezone is not a function` (not exported).

- [ ] **Step 3: Implement**

`lib/tz.ts`, after `timezoneForCountryOrNull`:

```ts
/**
 * The one rule for a Stop's timezone (spec 2026-10-14, card 3.L): a zone the
 * caller chose wins, unless it is "UTC" — the fallback every client sends
 * when it knew no country — and then the Stop's country decides: its
 * two-letter code first, then its name. Neither known: "UTC" (the Booking
 * import warns on that, `lib/booking-import/build.ts`). Pure and client-safe;
 * read-side `?? "UTC"` fallbacks for a stored null are not this rule.
 */
export function stopTimezone(stop: {
  timezone?: string | null;
  countryCode?: string | null;
  country?: string | null;
}): string {
  if (stop.timezone && stop.timezone !== "UTC") return stop.timezone;
  return timezoneForCountryOrNull(stop.countryCode) ?? timezoneForCountryOrNull(stop.country) ?? "UTC";
}
```

Call sites, before → after:

- `server/actions/stops.ts:75-84` — delete the `resolveTimezone` doc comment and function. `:10` import `guessTimezoneForCountry` → `stopTimezone`.
  - `:246` `const timezone = resolveTimezone(parsed.data.timezone, derivedCountryCode, country);` → `const timezone = stopTimezone({ timezone: parsed.data.timezone, countryCode: derivedCountryCode, country });`
  - `:371` `const appendTimezone = resolveTimezone(parsed.data.timezone, appendCountryCode, country);` → `const appendTimezone = stopTimezone({ timezone: parsed.data.timezone, countryCode: appendCountryCode, country });`
- `server/actions/stop-flow.ts:147` `timezone: stop.timezone ?? guessTimezoneForCountry(stop.countryCode ?? stop.country),` → `timezone: stopTimezone(stop),` (the `select` at `:135` already has `timezone`, `country`, `countryCode`). `:9` import → `stopTimezone`.
- `lib/mcp/tools/trips-stops-write.ts`
  - `:165` `timezone: timezone ?? guessTimezoneForCountry(countryCode ?? country),` → `timezone: stopTimezone({ timezone, countryCode, country }),`
  - `:274` `timezone: patch.timezone ?? current.timezone ?? guessTimezoneForCountry(countryCode ?? country),` → `timezone: stopTimezone({ timezone: patch.timezone ?? current.timezone, countryCode, country }),` (this function is deleted in Task 3.L.9; it is migrated now so no `guessTimezoneForCountry` Stop default survives this task).
  - `:61` import → `stopTimezone`. Header `:25-33` → replace the paragraph with: ``Timezone for a scheduled Stop: `stopTimezone` (lib/tz.ts), the one rule the Add-a-stop UI, `createStop`/`updateStop`, the lone-Stop rule and the Booking import share — an explicit zone wins unless it is the "UTC" fallback, then the country code, then the country name.``
- `components/trip/stop-form-dialog.tsx`
  - `:193-195` `stop?.timezone ?? proposed?.timezone ?? guessTimezoneForCountry(stop?.country) ?? "UTC",` → `stopTimezone({ timezone: stop?.timezone ?? proposed?.timezone, country: stop?.country }),` (`StopCardStop` has no `countryCode`, `components/plan/types.ts:11-16`).
  - `:268-271` `const guessed = guessTimezoneForCountry(value); if (guessed !== "UTC") { setTimezone(guessed); }` → `const guessed = stopTimezone({ country: value }); if (guessed !== "UTC") setTimezone(guessed);`
  - `:274-275` comment → `// A pick sets the name, country and point, and the timezone from the country (stopTimezone).`
  - `:281` `const tz = guessTimezoneForCountry(p.countryCode ?? pickedCountry);` → `const tz = stopTimezone({ countryCode: p.countryCode, country: pickedCountry });`
  - `:22` `import { TIMEZONES, guessTimezoneForCountry } from "@/lib/tz";` → `import { TIMEZONES, stopTimezone } from "@/lib/tz";`
- `components/plan/mobile/add-stop-sheet.tsx:136` `timezone: guessTimezoneForCountry(picked?.countryCode ?? country),` → `timezone: stopTimezone({ countryCode: picked?.countryCode, country }),`; `:21` import → `stopTimezone`.
- `lib/booking-import/build.ts:318` `const timezone = guessTimezoneForCountry(s.countryCode ?? s.country);` → `const timezone = stopTimezone({ countryCode: s.countryCode, country: s.country });`; `:11` import becomes `import { stopTimezone, timezoneForCountryOrNull } from "@/lib/tz";` (check `grep -n guessTimezoneForCountry lib/booking-import/build.ts` — no other use; drop it from the import if so).

`guessTimezoneForCountry` stays exported (`lib/digest-dispatch.ts:374` uses it for the Home zone, not a Stop).

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/tz.test.ts server/actions/stops.test.ts server/actions/stop-flow.test.ts lib/mcp/tools/trips-stops-write.test.ts components/trip/stop-form-dialog.test.tsx components/plan/mobile/add-stop-sheet.test.tsx lib/booking-import/build.test.ts`. Then `grep -rn "guessTimezoneForCountry" --include=*.ts --include=*.tsx app components lib server | grep -v "\.test\." ` → only `lib/tz.ts` and `lib/digest-dispatch.ts`.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/tz.ts server/actions/stops.ts server/actions/stop-flow.ts lib/mcp/tools/trips-stops-write.ts components/trip/stop-form-dialog.tsx components/plan/mobile/add-stop-sheet.tsx lib/booking-import/build.ts` + `npx tsc --noEmit` + `npx eslint lib/tz.ts lib/tz.test.ts server/actions/stops.ts server/actions/stop-flow.ts lib/mcp/tools/trips-stops-write.ts components/trip/stop-form-dialog.tsx components/plan/mobile/add-stop-sheet.tsx lib/booking-import/build.ts`

- [ ] **Step 6: Commit** — `git add lib/tz.ts lib/tz.test.ts server/actions/stops.ts server/actions/stop-flow.ts lib/mcp/tools/trips-stops-write.ts components/trip/stop-form-dialog.tsx components/plan/mobile/add-stop-sheet.tsx lib/booking-import/build.ts` — `refactor(stops): one Stop timezone rule, stopTimezone, replaces six copies (card 3.L)`

---

### Task 3.L.2: The PATCH contract — `lib/patch.ts`, a held `before` for `auditedUpdate`, ADR 0075

**Files:**
- Create: `lib/patch.ts`
- Test: `lib/patch.test.ts`
- Modify: `lib/activity-guard.ts:34-50` (`auditedUpdate`)
- Test: `lib/activity-guard.test.ts`
- Create: `docs/adr/0075-update-actions-take-a-patch.md`

**Interfaces:**
- Produces (`lib/patch.ts`, zod-free and React-free — client forms import `toPatch`):

```ts
export type Patch<T> = { [K in keyof T]?: T[K] | null };
export function patched<V>(next: V | null | undefined, current: V | null | undefined): V | undefined;
export function applyPatch<T extends object>(current: Patch<T>, patch: Patch<T>): Partial<T>;
export function toPatch<T extends object>(input: T, clearable: readonly (keyof T)[]): Patch<T>;
```
- Produces (`lib/activity-guard.ts`): `auditedUpdate(entityType, delegate, id, data, plan, held?: { before: Row | null })` — with `held`, it does not read.

- [ ] **Step 1: Write the failing tests**

`lib/patch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPatch, patched, toPatch } from "./patch";

type Input = { name: string; notes?: string; address?: string; nights?: number; hidden?: boolean };

describe("patched (one field)", () => {
  it("undefined keeps the current value", () => {
    expect(patched(undefined, "old")).toBe("old");
  });
  it("null clears, whatever the current value", () => {
    expect(patched(null, "old")).toBeUndefined();
  });
  it("a value replaces, falsy ones included", () => {
    expect(patched("", "old")).toBe("");
    expect(patched(0, 5)).toBe(0);
    expect(patched(false, true)).toBe(false);
  });
  it("a current null reads as no value", () => {
    expect(patched(undefined, null)).toBeUndefined();
  });
});

describe("applyPatch", () => {
  const row = { name: "Rome", notes: "old", address: null, nights: 2, hidden: true };
  it("an empty patch keeps every current value and turns a stored null into no value", () => {
    expect(applyPatch<Input>(row, {})).toEqual({ name: "Rome", notes: "old", nights: 2, hidden: true });
    expect(applyPatch<Input>(row, {})).not.toHaveProperty("address");
  });
  it("undefined keeps, null clears, a value replaces", () => {
    expect(applyPatch<Input>(row, { notes: null, name: "Roma", nights: undefined })).toEqual({ name: "Roma", nights: 2, hidden: true });
  });
  it("a full input replaces every field it names (a form's save)", () => {
    expect(applyPatch<Input>(row, { name: "Naples", notes: "new", address: "Via Roma 1", nights: 3, hidden: false })).toEqual({
      name: "Naples", notes: "new", address: "Via Roma 1", nights: 3, hidden: false,
    });
  });
  it("a key the row doesn't have passes through (inline cost fields, surpriseForIds)", () => {
    expect(applyPatch<Input & { costMinor?: number }>(row, { costMinor: 500 })).toMatchObject({ costMinor: 500 });
  });
});

describe("toPatch (a form's full input as a PATCH)", () => {
  it("sends null for a listed field the form left empty, absent or undefined", () => {
    const input: Input = { name: "Rome", notes: undefined };
    expect(toPatch(input, ["notes", "address"])).toEqual({ name: "Rome", notes: null, address: null });
  });
  it("leaves a filled field and every unlisted field alone", () => {
    const input: Input = { name: "Rome", notes: "kept", nights: undefined };
    const out = toPatch(input, ["notes"]);
    expect(out).toEqual({ name: "Rome", notes: "kept", nights: undefined });
  });
  it("does not change the input it was given", () => {
    const input: Input = { name: "Rome" };
    toPatch(input, ["notes"]);
    expect(input).toEqual({ name: "Rome" });
  });
});
```

`lib/activity-guard.test.ts` (mock setup as the file already has it — `recordActivityMock`):

```ts
it("auditedUpdate with a held before row writes and diffs without reading again", async () => {
  const delegate = {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: "a1", tripId: "t1", name: "Hilton", notes: "late check-in" }),
  };
  const before = { id: "a1", tripId: "t1", name: "Hilton", notes: null };
  await auditedUpdate("ACCOMMODATION", delegate, "a1", { notes: "late check-in" }, null, { before });
  expect(delegate.findUnique).not.toHaveBeenCalled();
  expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "ACCOMMODATION", entityId: "a1", changes: [expect.objectContaining({ field: "notes" })],
  }));
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/patch.test.ts lib/activity-guard.test.ts` — `Failed to resolve import "./patch"`; the activity-guard test fails with `expected "spy" to not be called` (it reads today).

- [ ] **Step 3: Implement**

`lib/patch.ts`:

```ts
/**
 * The PATCH contract every update action takes (ADR 0075, spec 2026-10-14
 * card 3.L): an update names only what changes.
 *
 *  - a field left `undefined` (or absent) keeps its current value;
 *  - a field set to `null` is cleared;
 *  - any other value replaces it — `""`, `0` and `false` included.
 *
 * The action holds the row, merges the patch onto it here, validates the
 * merged whole with the entity's existing schema, then writes. A form still
 * sends its full input; `toPatch` turns the fields it left empty into `null`
 * so they clear rather than keep. Zod-free and React-free: client forms
 * import `toPatch` (lib/client-zod.guard.test.ts).
 */

/** Every field optional; `null` clears it. */
export type Patch<T> = { [K in keyof T]?: T[K] | null };

/**
 * One field of a patch against its current value. `undefined` (the schemas'
 * "no value") comes back for a cleared field and for a current `null`, so the
 * result feeds a zod schema whose optional fields are `.optional()`.
 */
export function patched<V>(next: V | null | undefined, current: V | null | undefined): V | undefined {
  if (next === undefined) return current ?? undefined;
  return next ?? undefined;
}

/**
 * Merge a patch onto the current values (a row's columns, `null` for none).
 * A key the row doesn't carry (an inline Cost field, `surpriseForIds`)
 * passes through from the patch. The result is what the action hands its
 * schema — `Partial`, because the schema, not this, decides what is required.
 */
export function applyPatch<T extends object>(current: Patch<T>, patch: Patch<T>): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * A form's full input as a PATCH: each `clearable` field the form left empty
 * (absent or `undefined`) is sent as `null`, so the save clears it instead of
 * keeping the old value. List only fields whose emptiness means "clear" — a
 * derived field (a Stop's point), an "omit = leave alone" field
 * (`surpriseForIds`) or a field the form never shows stays out of the list.
 */
export function toPatch<T extends object>(input: T, clearable: readonly (keyof T)[]): Patch<T> {
  const out: Record<string, unknown> = { ...input };
  for (const key of clearable) {
    if (out[key as string] === undefined) out[key as string] = null;
  }
  return out as Patch<T>;
}
```

`lib/activity-guard.ts` `auditedUpdate`, before → after:

```ts
/**
 * Read-before → update → record UPDATED (Fork edits stay silent). Returns
 * both rows. Activity is recorded only after the update succeeds: a thrown
 * update records nothing. An action that already holds the row (a PATCH
 * merge reads it first — ADR 0075) passes it as `held` and no second read
 * is made.
 */
export async function auditedUpdate<Row extends { tripId: string }, Data>(
  entityType: ActivityEntityType,
  delegate: AuditedDelegate<Row, Data>,
  id: string,
  data: Data,
  plan: PlanId,
  held?: { before: Row | null },
): Promise<{ before: Row | null; after: Row }> {
  const before = held ? held.before : await delegate.findUnique({ where: { id } });
  const after = await delegate.update({ where: { id }, data });
  await recordUpdate(entityType, { tripId: after.tripId, plan, entityId: id, before, after });
  return { before, after };
}
```

`docs/adr/0075-update-actions-take-a-patch.md` (house format, see `docs/adr/0074-*.md`):

```markdown
# 0075 — Update actions take a PATCH: undefined keeps, null clears

## Status
Accepted (2026-10-16). Decided in the tidy-up re-grill
(`docs/specs/2026-10-14-tidy-up-pass.md`, card 3.L, decision Q13).

## Context

Eight update actions (`updateStop`, `updateTrip`, `updateAccommodation`,
`updateTransport`, `updateCost`, `updateReminder`, `updateItem`,
`updateChapter`) replaced the whole row with the input they were given: an
absent field was written as `null`, `false` or a schema default. The app's
forms always resend the whole form, so that held for them. The Claude
connection's update tools did not: each loaded the row, checked access a
second time, and hand-merged the fields it was given before calling the
action — eight `loadXForPatch` / `mergeXPatch` pairs, one of them recalling a
data-loss round on `hardEndDate`.

## Decision

1. Every update action takes `Patch<Input>` (`lib/patch.ts`): a field left
   `undefined` keeps its value, `null` clears it, any other value replaces it.
2. The action merges the patch onto the row it already holds, validates the
   merged whole with the entity's existing schema, then writes. Entity rules
   that need the current row (a Stop's mode from its dates, a Transport end,
   a Cost's paid pair and Due date, completing an inline Cost) live in pure
   modules beside it: `lib/stop-patch.ts`, `lib/transport-patch.ts`,
   `lib/money/cost-patch.ts`.
3. Forms still send their full input. The update call passes it through
   `toPatch(input, clearable)`, which turns each listed field the form left
   empty into `null`. `undefined` cannot mean "clear": it is "keep", and
   React's server-action encoding drops `undefined`-valued keys anyway.
4. The Claude tools pass the caller's fields straight to the action after
   the real-plan check (`lib/mcp/real-plan.ts`).

## Consequences

- One load and one merge per update; merge rules live next to the write.
- A field a form forgets to list in `toPatch` keeps its old value when the
  Traveller empties it — each form's test asserts its clearable fields.
- Fields an action already treated as "absent = leave alone" keep that
  meaning (Trip `homeName`/`homeTimezone`/`roundTrip`, Item
  `surpriseForIds`, a Reminder's `stopId`); `null` reads the same as absent
  for those.
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/patch.test.ts lib/activity-guard.test.ts`

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/patch.ts lib/activity-guard.ts` + `npx tsc --noEmit` + `npx eslint lib/patch.ts lib/patch.test.ts lib/activity-guard.ts lib/activity-guard.test.ts` + `npx vitest run lib/client-zod.guard.test.ts` (nothing imports `lib/patch` client-side yet; this pins that the module stays zod-free once Task 3.L.5 does).

- [ ] **Step 6: Commit** — `git add lib/patch.ts lib/patch.test.ts lib/activity-guard.ts lib/activity-guard.test.ts docs/adr/0075-update-actions-take-a-patch.md` — `feat(patch): the update PATCH contract — undefined keeps, null clears (ADR 0075, card 3.L)`

---

### Task 3.L.3: Reminder and Chapter take a PATCH; their MCP pairs go; the integration file

Both are small and share the shape: the action merges with `applyPatch`, the tool forwards. Neither has a form change (no Reminder update form; the Chapter form sends `name`/`colour` and both dates or none, unchanged — see deviation 7).

**Files:**
- Modify: `server/actions/reminders.ts:181-224` (`updateReminder`)
- Modify: `server/actions/chapters.ts:103-118` (`updateChapter`)
- Modify: `lib/mcp/tools/lists-write.ts:24-36` (header), `:65` (`notFound` import), `:68` (`db` import — check other uses first), `:69` (`requireTripAccess`), `:83` (`ReminderInput` type import), `:95-131` (delete the patch-helper block), `:162-176` (tool)
- Modify: `lib/mcp/tools/plan-write.ts:18-26` (header — Chapter half; Item half in 3.L.7), `:53` (`ChapterInput` import), `:187-246` (delete the Chapter block), `:416-434` (tool)
- Test: `server/actions/reminders.test.ts`, `server/actions/chapters.test.ts`, `lib/mcp/tools/lists-write.test.ts:169-220, 458-466`, `lib/mcp/tools/plan-write.test.ts:339-389, 439-445`
- Create: `test/integration/patch-updates.test.ts`

**Interfaces:**
- Consumes: `Patch`, `applyPatch` (3.L.2); `auditedUpdate(..., held)` (3.L.2); `requireRealPlanRow` (`lib/mcp/real-plan.ts`).
- Produces: `updateReminder(id: string, patch: Patch<ReminderInput>)`, `updateChapter(chapterId: string, patch: Patch<ChapterInput>)`; the integration file's harness (guard/geocode/fx/activity mocks and a seeded Trip `it-trip-patch` with a member `it-user`) that 3.L.4–3.L.9 extend with one `describe` each.

- [ ] **Step 1: Write the failing tests**

`server/actions/reminders.test.ts` (use the file's existing `reminderFindUnique`/`requireRowAccess` mock and `reminderUpdateMock`; the row the guard returns is `{ id: "r1", tripId: "trip-1", title: "Reconfirm the tour", date: "2026-07-02", stopId: null, stop: null }`) — these are the MCP assertions from `lists-write.test.ts:170-200`, moved to the action:

```ts
describe("updateReminder (PATCH, ADR 0075)", () => {
  it("with only title keeps the current date and writes no stopId", async () => {
    await updateReminder("r1", { title: "New title" });
    expect(reminderUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "r1" },
      data: { title: "New title", date: "2026-07-02" },
    }));
  });
  it("a supplied stopId replaces the current one", async () => {
    stopFindFirstMock.mockResolvedValue({ id: "new-stop" });
    await updateReminder("r1", { stopId: "new-stop" });
    expect(reminderUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: { title: "Reconfirm the tour", date: "2026-07-02", stopId: "new-stop" },
    }));
  });
  it("a null title is refused by the schema, nothing written", async () => {
    const r = await updateReminder("r1", { title: null });
    expect(r.success).toBe(false);
    expect(reminderUpdateMock).not.toHaveBeenCalled();
  });
});
```

`server/actions/chapters.test.ts` (existing mocks: `chapterFindUniqueMock` serves `requireChapterAccess` then the merge read, `chapterUpdateMock`, `chapterFindManyMock` for the overlap check) — the MCP assertions from `plan-write.test.ts:340-370`, moved:

```ts
describe("updateChapter (PATCH, ADR 0075)", () => {
  const dated = { id: "c1", tripId: "trip-1", forkId: null, name: "Italy", colour: "amber", startDate: "2026-05-01", endDate: "2026-05-10" };
  beforeEach(() => {
    chapterFindUniqueMock.mockResolvedValue(dated);
    chapterFindManyMock.mockResolvedValue([]);
    chapterUpdateMock.mockResolvedValue({ ...dated, name: "New name" });
  });
  it("with only name keeps colour and dates, reading the row once", async () => {
    await updateChapter("c1", { name: "New name" });
    expect(chapterUpdateMock).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { name: "New name", colour: "amber", startDate: "2026-05-01", endDate: "2026-05-10" },
    });
  });
  it("a lone endDate on a dated chapter merges with the current startDate", async () => {
    await updateChapter("c1", { endDate: "2026-05-12" });
    expect(chapterUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ startDate: "2026-05-01", endDate: "2026-05-12" }),
    }));
  });
  it("a lone startDate on a rough chapter is refused, nothing written", async () => {
    chapterFindUniqueMock.mockResolvedValue({ ...dated, startDate: null, endDate: null });
    const r = await updateChapter("c1", { startDate: "2026-06-01" });
    expect(r).toEqual({ success: false, errors: { endDate: ["Set both dates or neither"] } });
    expect(chapterUpdateMock).not.toHaveBeenCalled();
  });
  it("explicit nulls clear both dates", async () => {
    await updateChapter("c1", { startDate: null, endDate: null });
    expect(chapterUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ startDate: null, endDate: null }),
    }));
  });
});
```

`lib/mcp/tools/plan-write.test.ts` — replace the bodies of `describe("update_chapter (PATCH)")` (`:339-389`) with tool-adapter tests (the merge assertions above moved to the action):

```ts
describe("update_chapter (PATCH)", () => {
  it("checks the Chapter is real-plan, then forwards only the fields passed", async () => {
    updateChapter.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "update_chapter", arguments: { chapterId: CHAPTER_ID, name: "New name" } });
    expect(chapterFindUnique).toHaveBeenCalledWith({ where: { id: CHAPTER_ID, forkId: null }, select: { tripId: true } });
    expect(updateChapter).toHaveBeenCalledWith(CHAPTER_ID, { name: "New name" });
  });
  // keep, unchanged: "checks trip access before …" (:372) and "a made-up chapter id …" (:382) —
  // requireRealPlanRow's access check now refuses them.
  it("the action's refusal maps to isError", async () => {
    updateChapter.mockResolvedValue({ success: false, errors: { endDate: ["Set both dates or neither"] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "update_chapter", arguments: { chapterId: CHAPTER_ID, startDate: "2026-06-01" } });
    expect(r.isError).toBe(true);
  });
});
```

`lib/mcp/tools/lists-write.test.ts` — replace `:170-200` the same way: one test `update_reminder forwards only the fields passed` asserting `updateReminder` called with `(REMINDER_ID, { title: "New title" })` and `reminderFindUnique` **not** called; delete "checks trip access before using the loaded row" (`:211-220`) — access is the action's (`server/actions/reminders.test.ts` already covers a non-member via `requireRowAccess`); rewrite "a made-up reminderId reads as NOT_FOUND_TEXT" (`:202`) to mock `updateReminder.mockRejectedValue(notFoundErr())` and keep its two assertions on the text. `:458` ("update_reminder with a Fork's stopId…") stays as is.

`test/integration/patch-updates.test.ts` (new; same boundary-mock pattern as `test/integration/lone-stop-rule.test.ts:14-35`):

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ADR 0075 against the real Postgres: an update that names one field keeps
// every other column; an explicit null clears. Only the Next/auth boundary,
// the network (geocode, FX) and Activity are mocked; the actions and Prisma run for real.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({
  geocodePlace: vi.fn(async () => null),
  geocodePlaceDetailed: vi.fn(async () => null),
}));
vi.mock("@/lib/fx", () => ({
  resolveRateForTrip: vi.fn(async () => ({ rate: 1, persist: null })),
  persistRate: vi.fn(async () => undefined),
}));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
  // The actions only read id/tripId/forkId (+ the reminder's own fields) off the guard's row.
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const { notFound } = await import("next/navigation");
    const delegate = (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind];
    const row = await delegate.findUnique({ where: { id }, ...(kind === "reminder" ? { include: { stop: { select: { name: true } } } } : {}) });
    if (!row) notFound();
    return { row, user: { id: "it-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { updateReminder } from "@/server/actions/reminders";
import { updateChapter } from "@/server/actions/chapters";

const TRIP_ID = "it-trip-patch";

describe.skipIf(process.env.INTEGRATION !== "1")("update actions take a PATCH (ADR 0075, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it-user@example.test", name: "It User", isEmailVerified: true } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "PATCH trip", homeCurrency: "AUD", startDate: "2026-05-01", endDate: "2026-05-20", hardEndDate: "2026-05-25", createdById: "it-user",
        members: { create: { userId: "it-user", role: "owner" } } },
    });
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  describe("Reminder", () => {
    it("a title-only patch keeps the date and the Stop", async () => {
      const stop = await db.stop.create({ data: { tripId: TRIP_ID, name: "Rome", nights: 2, sortOrder: 0 } });
      const r = await db.reminder.create({ data: { tripId: TRIP_ID, title: "Old", date: "2026-05-02", stopId: stop.id } });
      expect(await updateReminder(r.id, { title: "New" })).toEqual({ success: true });
      expect(await db.reminder.findUnique({ where: { id: r.id } })).toMatchObject({ title: "New", date: "2026-05-02", stopId: stop.id });
    });
  });

  describe("Chapter", () => {
    it("a name-only patch keeps colour and dates; explicit nulls clear the dates", async () => {
      const ch = await db.chapter.create({ data: { tripId: TRIP_ID, name: "Italy", colour: "amber", startDate: "2026-05-01", endDate: "2026-05-05", sortOrder: 0 } });
      await updateChapter(ch.id, { name: "Italia" });
      expect(await db.chapter.findUnique({ where: { id: ch.id } })).toMatchObject({ name: "Italia", colour: "amber", startDate: "2026-05-01", endDate: "2026-05-05" });
      await updateChapter(ch.id, { startDate: null, endDate: null });
      expect(await db.chapter.findUnique({ where: { id: ch.id } })).toMatchObject({ name: "Italia", startDate: null, endDate: null });
    });
  });
});
```

(If `prisma/schema.prisma` names a required column this seed omits — e.g. `Chapter.sortOrder`, `Stop.sortOrder` — the implementer adds it; run `grep -n "model Chapter" -A20 prisma/schema.prisma` first. Do not change the assertions.)

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run server/actions/reminders.test.ts server/actions/chapters.test.ts lib/mcp/tools/lists-write.test.ts lib/mcp/tools/plan-write.test.ts` — the action PATCH tests fail on schema refusals (`title`/`date` "Required" — a partial input is parsed as a full one); the tool tests fail because the tool still sends the merged row. With the DB up: `INTEGRATION=1 TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/patch-updates.test.ts` fails the same way (or skips without the DB — then rely on the unit tier and run it at the branch gate).

- [ ] **Step 3: Implement**

`server/actions/reminders.ts` `updateReminder`:

```ts
/**
 * Update a Reminder (PATCH, ADR 0075): `title` and `date` merge onto the
 * held row. `stopId` keeps its "absent = leave as it is" meaning — there is
 * still no way to clear it (the schema has no null for it).
 *
 * - Access-checked via requireReminderAccess → requireTripAccess.
 */
export async function updateReminder(
  id: string,
  patch: Patch<ReminderInput>,
): Promise<ReminderActionResult> {
  const reminder = await requireReminderAccess(id);

  const parsed = reminderSchema.safeParse(applyPatch<ReminderInput>({ title: reminder.title, date: reminder.date }, patch));
  if (!parsed.success) {
    return validationResult(parsed.error);
  }
  // …unchanged from `const { title, date, stopId } = parsed.data;` to the end
}
```

Imports: `import { applyPatch, type Patch } from "@/lib/patch";`. The current row's `stopId` is deliberately **not** in the merge's current values: an absent `stopId` must reach the existing `...(stopId !== undefined ? { stopId } : {})` as absent, so the column is left alone (today's behaviour).

`server/actions/chapters.ts` `updateChapter`:

```ts
/** Update a Chapter (PATCH, ADR 0075). A lone date against a rough Chapter is refused by the schema ("Set both dates or neither"). */
export async function updateChapter(
  chapterId: string,
  patch: Patch<ChapterInput>,
): Promise<ChapterActionResult> {
  const chapter = await requireChapterAccess(chapterId);
  const before = await db.chapter.findUnique({ where: { id: chapterId } });
  if (!before) notFound();

  const parsed = chapterSchema.safeParse(applyPatch<ChapterInput>(
    { name: before.name, colour: before.colour as ChapterInput["colour"], startDate: before.startDate, endDate: before.endDate },
    patch,
  ));
  if (!parsed.success) return validationResult(parsed.error);

  if (await firstOverlap(chapter.tripId, parsed.data, chapterId)) {
    return { success: false, errors: { startDate: ["Chapters cannot overlap another chapter's dates"] } };
  }

  // Dates written `?? null`: absent now means "carried from the row" (merged above), so an explicit null clears.
  const data = { ...parsed.data, startDate: parsed.data.startDate ?? null, endDate: parsed.data.endDate ?? null };
  await auditedUpdate("CHAPTER", db.chapter, chapterId, data, chapter.forkId ?? null, { before });
  revalidateTrip(chapter.tripId, "plan");
  return { success: true };
}
```

Imports: `notFound` from `next/navigation` (check whether `chapters.ts` already imports it), `applyPatch`, `type Patch` from `@/lib/patch`. The existing Chapter tests that sequence `chapterFindUniqueMock` as "requireChapterAccess, then auditedUpdate before-read" (`chapters.test.ts:303, 326`) keep the same two reads — the second is now the merge's read. Their assertions stay; only comments saying "auditedUpdate before-read" become "merge read".

`lib/mcp/tools/lists-write.ts`:
- Delete `:95-131` (`ReminderRow`, `ReminderPatch`, `loadReminderForPatch`, `mergeReminderPatch` and the section banner).
- Tool body (`:171-175`) →

```ts
    ({ reminderId, ...patch }) =>
      runTool("update_reminder", async () => {
        await requireRealPlanRows([["stop", patch.stopId]]);
        return updateReminder(reminderId, patch);
      }),
```
- Header `:24-36` → ``"`update_reminder` passes only the fields the caller supplied: `updateReminder` takes a PATCH (ADR 0075) and merges onto the row it holds. There is still no way to clear an existing `stopId` (the schema has no null for it), so omitting `stopId` always means "leave it as is".`` Also drop "The one exception is `update_reminder` — see below." from `:19-20`.
- Drop now-unused imports: `notFound`, `ReminderInput`, and `db`/`requireTripAccess` if `grep -n "db\.\|requireTripAccess" lib/mcp/tools/lists-write.ts` shows no other use.

`lib/mcp/tools/plan-write.ts`:
- Delete `:187-246` (Chapter banner, `ChapterRow`, `ChapterPatch`, `CHAPTER_DATE_PAIR_REQUIRED`, `loadChapterForPatch`, `mergeChapterPatch`).
- Tool body (`:427-433`) →

```ts
    ({ chapterId, ...patch }) =>
      runTool("update_chapter", async () => {
        await requireRealPlanRow("chapter", chapterId);
        return updateChapter(chapterId, patch);
      }),
```
- Drop the `ChapterInput` type import (`:53`). `isFailure`/`Failure` (`:63-65`) stay until Task 3.L.7 checks their last use.

- [ ] **Step 4: Run it, expect PASS** — the four unit files above; with the DB up, the integration file.

- [ ] **Step 5: Task-done check** — `npx vitest related --run server/actions/reminders.ts server/actions/chapters.ts lib/mcp/tools/lists-write.ts lib/mcp/tools/plan-write.ts` + `npx tsc --noEmit` + `npx eslint server/actions/reminders.ts server/actions/chapters.ts lib/mcp/tools/lists-write.ts lib/mcp/tools/plan-write.ts test/integration/patch-updates.test.ts` + `grep -n "loadReminderForPatch\|mergeReminderPatch\|loadChapterForPatch\|mergeChapterPatch" -r lib server` → nothing.

- [ ] **Step 6: Commit** — `git add server/actions/reminders.ts server/actions/reminders.test.ts server/actions/chapters.ts server/actions/chapters.test.ts lib/mcp/tools/lists-write.ts lib/mcp/tools/lists-write.test.ts lib/mcp/tools/plan-write.ts lib/mcp/tools/plan-write.test.ts test/integration/patch-updates.test.ts` — `refactor(reminders,chapters): updates take a PATCH; MCP load/merge pairs deleted (card 3.L)` — body: "MCP tests that asserted the merged object now assert the forwarded patch; the merge assertions moved to the action tests. The tool-level 'checks trip access before using the loaded row' test for update_reminder is deleted: access is the action's."

---

### Task 3.L.4: Trip takes a PATCH; `update_trip`'s pair goes

`updateTrip` already reads the Trip once (`trips.ts:256-259`) for the Home base and date diffs; that read moves above the parse, gains the merged columns, and the merge happens there. `homeName`, `homeTimezone` and `roundTrip` already mean "absent = unchanged" in this action and are not merged. The settings form sends `""` for an empty date, which the schema maps to "no date", so it needs no change.

**Files:**
- Modify: `server/actions/trips.ts:221-267` (doc comment, signature, the read and the parse)
- Modify: `lib/mcp/tools/trips-stops-write.ts:301-350` (delete the Trip block), `:378-390` (tool), `:16-23` (header, Trip half), `:64` (`TripInput` import), `:73` (`isFailure`'s `TripInput` member)
- Test: `server/actions/trips.test.ts`, `lib/mcp/tools/trips-stops-write.test.ts:215-333`, `test/integration/patch-updates.test.ts`

**Interfaces:**
- Consumes: `Patch`, `applyPatch` (3.L.2).
- Produces: `updateTrip(tripId: string, patch: Patch<TripInput>): Promise<UpdateTripResult>`.

- [ ] **Step 1: Write the failing tests**

`server/actions/trips.test.ts` (the file's `tripFindUniqueMock` serves the one read; `tripUpdateMock` the write) — the assertions of `trips-stops-write.test.ts:216-297`, moved:

```ts
describe("updateTrip (PATCH, ADR 0075)", () => {
  const row = { name: "Old name", startDate: "2026-01-01", endDate: "2026-01-10", hardEndDate: "2026-01-15", homeCurrency: "GBP", homeName: "Leeds", homeCountryCode: "gb", homeTimezone: "Europe/London" };
  beforeEach(() => tripFindUniqueMock.mockResolvedValue(row));

  it("with only name keeps dates, the Hard end date and the currency, and leaves the home base untouched", async () => {
    await updateTrip("trip-1", { name: "New name" });
    const { data } = tripUpdateMock.mock.calls[0][0];
    expect(data).toMatchObject({ name: "New name", startDate: "2026-01-01", endDate: "2026-01-10", hardEndDate: "2026-01-15", homeCurrency: "GBP" });
    expect(data).not.toHaveProperty("homeName");
    expect(data).not.toHaveProperty("homeTimezone");
    expect(data).not.toHaveProperty("roundTrip");
  });
  it("a name-only patch is not a date change (the lone-Stop rule does not run)", async () => {
    await updateTrip("trip-1", { name: "New name" });
    expect(scheduleLoneStopTx).not.toHaveBeenCalled();
  });
  it("explicit null (or the form's \"\") clears a date", async () => {
    await updateTrip("trip-1", { hardEndDate: null });
    expect(tripUpdateMock.mock.calls[0][0].data).toMatchObject({ hardEndDate: null, startDate: "2026-01-01" });
    tripUpdateMock.mockClear();
    await updateTrip("trip-1", { hardEndDate: "" });
    expect(tripUpdateMock.mock.calls[0][0].data).toMatchObject({ hardEndDate: null });
  });
  it("homeTimezone alone is written for an existing Home base", async () => {
    await updateTrip("trip-1", { homeTimezone: "Australia/Brisbane" });
    expect(tripUpdateMock.mock.calls[0][0].data).toMatchObject({ homeTimezone: "Australia/Brisbane", name: "Old name" });
  });
});
```

(`scheduleLoneStopTx` is the file's existing mock of `@/server/actions/stop-flow`. The settings-form path is pinned by the existing `trips.test.ts` cases that pass a full `TripInput` — they stay unchanged and must pass.)

`lib/mcp/tools/trips-stops-write.test.ts` `describe("update_trip (PATCH)")` (`:215-333`) becomes:

```ts
describe("update_trip (PATCH)", () => {
  it("forwards only the fields passed", async () => {
    updateTrip.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "update_trip", arguments: { tripId: TRIP_ID, name: "New name" } });
    expect(updateTrip).toHaveBeenCalledWith(TRIP_ID, { name: "New name" });
    expect(tripFindUnique).not.toHaveBeenCalled();
  });
  it("with homeTimezone forwards it to updateTrip", async () => { /* :264-282, minus the tripFindUnique mock; assertion unchanged */ });
  it("surfaces updateTrip's validation error for an invalid homeTimezone", async () => { /* :299-322, minus the tripFindUnique mock; assertions unchanged */ });
});
```

Deleted, with reason in the commit body: "with only name keeps the other fields" / "…forwards an existing hardEndDate…" / "without homeTimezone, the merged input has no homeTimezone key" (moved to `trips.test.ts` above); "checks trip access before using the loaded row" (the tool no longer loads a row; `updateTrip`'s `requireTripAccess` is covered in `trips.test.ts`).

`test/integration/patch-updates.test.ts` — add `import { updateTrip } from "@/server/actions/trips";` and:

```ts
describe("Trip", () => {
  it("a name-only patch keeps the dates and the Hard end date (the hardEndDate data-loss round)", async () => {
    expect(await updateTrip(TRIP_ID, { name: "PATCH trip, renamed" })).toMatchObject({ success: true });
    expect(await db.trip.findUnique({ where: { id: TRIP_ID } })).toMatchObject({
      name: "PATCH trip, renamed", startDate: "2026-05-01", endDate: "2026-05-20", hardEndDate: "2026-05-25", homeCurrency: "AUD",
    });
  });
});
```

(`assignTripSlug` runs for real — it only touches `Trip.slug`.)

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run server/actions/trips.test.ts lib/mcp/tools/trips-stops-write.test.ts` — `name: ["Trip name is required"]`-style refusals for the partial patches; the tool test fails on the merged argument.

- [ ] **Step 3: Implement** — `server/actions/trips.ts`:

```ts
/**
 * Update a Trip (PATCH, ADR 0075): name, dates, Hard end date and home
 * currency merge onto the row; `homeName`, `homeTimezone` and `roundTrip`
 * already mean "absent = unchanged" below. A date sent as `null` or `""`
 * (the settings form's empty date input) is cleared.
 *
 * Note: changing homeCurrency doesn't retro-convert already-snapshotted cost
 * rates (rateToHome on Cost rows). That's intentional — the budget page can
 * refresh rates explicitly when needed.
 */
export async function updateTrip(
  tripId: string,
  patch: Patch<TripInput>,
): Promise<UpdateTripResult> {
  await requireTripAccess(tripId);

  // One read serves the merge, the home base diff and the date diff (ADR 0073).
  const before = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      name: true, startDate: true, endDate: true, hardEndDate: true, homeCurrency: true,
      homeName: true, homeCountryCode: true, homeTimezone: true,
    },
  });
  if (!before) notFound();

  const parsed = tripSchema.safeParse(applyPatch<TripInput>(
    {
      name: before.name,
      startDate: before.startDate,
      endDate: before.endDate,
      hardEndDate: before.hardEndDate,
      homeCurrency: before.homeCurrency as TripInput["homeCurrency"],
    },
    patch,
  ));
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const { name, startDate, endDate, hardEndDate, homeCurrency, homeName: rawHomeName, homeTimezone: rawHomeTimezone, roundTrip } = parsed.data;
  const datesChanged =
    (startDate ?? null) !== (before.startDate ?? null) ||
    (endDate ?? null) !== (before.endDate ?? null);
  // …the rest unchanged; `before?.` becomes `before.` (it is non-null now)
}
```

Delete the old read at `:256-259`. Imports: `notFound` (add to `next/navigation` import — today the file imports only `redirect`), `applyPatch`, `type Patch` from `@/lib/patch`. Note for the implementer: a `homeName: null` in a patch is dropped by `applyPatch` and reads as absent (unchanged) — ADR 0075 "Consequences"; the clear for a Home base stays `homeName: ""`.

`lib/mcp/tools/trips-stops-write.ts`:
- Delete `:301-350` (`update_trip patch helpers` banner, `TripRow`, `TripPatch`, `loadTripForPatch`, `mergeTripPatch`).
- Tool body (`:384-389`) → `({ tripId, ...patch }) => runTool("update_trip", () => updateTrip(tripId, patch)),`
- `:73` `const isFailure = (v: StopInput | Failure | TripInput): v is Failure =>` → `(v: StopInput | Failure): v is Failure =>`; drop the `TripInput` import (`:64`).
- Header `:16-23`: rewrite the PATCH paragraph to: ``"`update_trip` and `update_stop` are PATCH: the actions take a PATCH (ADR 0075) and merge onto the row they hold, so these tools pass only the fields the caller supplied (after the real-plan check for a Stop)."`` (Task 3.L.9 finishes the Stop half.)

- [ ] **Step 4: Run it, expect PASS** — the two unit files; the integration file with the DB up.

- [ ] **Step 5: Task-done check** — `npx vitest related --run server/actions/trips.ts lib/mcp/tools/trips-stops-write.ts` + `npx tsc --noEmit` + `npx eslint server/actions/trips.ts lib/mcp/tools/trips-stops-write.ts test/integration/patch-updates.test.ts`

- [ ] **Step 6: Commit** — `git add server/actions/trips.ts server/actions/trips.test.ts lib/mcp/tools/trips-stops-write.ts lib/mcp/tools/trips-stops-write.test.ts test/integration/patch-updates.test.ts` — `refactor(trips): updateTrip takes a PATCH; update_trip forwards the caller's fields (card 3.L)`

---

### Task 3.L.5: Standalone Cost takes a PATCH; the Cost editors send cleared fields as null

The paid pair and Due date rules move from `mergeCostPatch` (`bookings-write.ts:616-670`) into a pure `lib/money/cost-patch.ts`, generalised from "the row's paid state" to "the merged paid state" so the form's own paid edits run through the same rule. Rule for the paid pair: **if the patch says anything about paid (`paidMinor` or `paidAt` not undefined), the patch's pair is used; otherwise the row's (`paidFieldsFromRow`: `paidAt` decides; a paid row with no amount falls back to the cost).** The editors' unpaid save therefore has to say so: `toPatch` sends `paidAt: null`.

**Files:**
- Create: `lib/money/cost-patch.ts`
- Test: `lib/money/cost-patch.test.ts`
- Modify: `server/actions/costs.ts:178-252` (`updateCost`)
- Modify: `components/trip/cost-editor.tsx:238, 328` (the two `updateCost` calls), `components/trip/other-cost-editor.tsx:340`
- Modify: `lib/mcp/tools/bookings-write.ts:55-71` (header paragraph), `:526-570` (keep `costCreateShape`/`costPatchShape`, delete `CostPatch`, `CostRow`), `:573-597` (delete `loadCostForPatch`), `:616-670` (delete `mergeCostPatch`), `:844-857` (tool)
- Test: `server/actions/costs.test.ts`, `components/trip/cost-editor.test.tsx`, `components/trip/other-cost-editor.test.tsx`, `lib/mcp/tools/bookings-write.test.ts:744-870, 931-937, 1012-1078`, `test/integration/patch-updates.test.ts`

**Interfaces:**
- Consumes: `Patch`, `patched`, `toPatch` (3.L.2); `paidFieldsFromRow` (`lib/money/cost-form-state.ts:192`).
- Produces (`lib/money/cost-patch.ts`):

```ts
export type CostPatchRow = { costMinor: number; currency: string; paidMinor: number | null; paidAt: Date | string | null; dueDate: string | null; ownerType: string; ownerId: string | null; label: string | null; category: string | null; settlement: string };
export function mergeCostPatch(current: CostPatchRow, patch: Patch<CostRawInput>): CostRawInput | ActionFailure;
export function paidPairAfter(patch: { paidMinor?: number | null; paidAt?: string | null }, row: { costMinor: number; paidMinor: number | null; paidAt: Date | string | null } | null): { paidMinor?: number; paidAt?: string };
export const DUE_DATE_NOT_APPLICABLE: ActionFailure;
```
(`paidPairAfter` is reused by `completeInlineCost` in 3.L.6.)

- [ ] **Step 1: Write the failing tests**

`lib/money/cost-patch.test.ts` — the MCP `update_cost` assertions (`bookings-write.test.ts:745-849`) as pure tests, plus the form's two cases:

```ts
import { describe, expect, it } from "vitest";
import { mergeCostPatch, DUE_DATE_NOT_APPLICABLE } from "./cost-patch";

const paidRow = {
  costMinor: 12000, currency: "EUR", paidMinor: 12000, paidAt: new Date("2026-04-01T00:00:00Z"), dueDate: null,
  ownerType: "OTHER", ownerId: null, label: "Museum pass", category: "Activities", settlement: "BEFORE",
};
const unpaidRow = { ...paidRow, paidMinor: null, paidAt: null, dueDate: "2026-04-20" };

describe("mergeCostPatch", () => {
  it("with only category keeps every other field, including the paid amount and date", () => {
    expect(mergeCostPatch(paidRow, { category: "Tours" })).toEqual({
      costMinor: 12000, currency: "EUR", ownerType: "OTHER", ownerId: undefined, label: "Museum pass", category: "Tours",
      dueDate: undefined, settlement: "BEFORE", paidMinor: 12000, paidAt: "2026-04-01",
    });
  });
  it("a currency change on a paid Cost still carries the paid pair", () => {
    expect(mergeCostPatch(paidRow, { currency: "GBP" })).toMatchObject({ currency: "GBP", paidMinor: 12000, paidAt: "2026-04-01" });
  });
  it("an unpaid Cost carries neither paidMinor nor paidAt", () => {
    const m = mergeCostPatch({ ...unpaidRow, paidMinor: 900 }, { label: "Pass" });
    expect(m).not.toHaveProperty("paidMinor");
    expect(m).not.toHaveProperty("paidAt");
  });
  it("a legacy paid row with no amount stays paid, its amount falling back to the cost", () => {
    expect(mergeCostPatch({ ...paidRow, paidMinor: null }, { label: "Pass" })).toMatchObject({ paidMinor: 12000, paidAt: "2026-04-01" });
  });
  it("drops the row's dueDate when the patch sets settlement ON_TRIP", () => {
    expect(mergeCostPatch(unpaidRow, { settlement: "ON_TRIP" })).toMatchObject({ settlement: "ON_TRIP", dueDate: undefined });
  });
  it("an explicit dueDate on a paid Cost is refused", () => {
    expect(mergeCostPatch(paidRow, { dueDate: "2026-04-10" })).toEqual(DUE_DATE_NOT_APPLICABLE);
  });
  it("an explicit dueDate with settlement ON_TRIP (patched or current) is refused", () => {
    expect(mergeCostPatch(unpaidRow, { settlement: "ON_TRIP", dueDate: "2026-04-10" })).toEqual(DUE_DATE_NOT_APPLICABLE);
    expect(mergeCostPatch({ ...unpaidRow, settlement: "ON_TRIP" }, { dueDate: "2026-04-10" })).toEqual(DUE_DATE_NOT_APPLICABLE);
  });
  it("an explicit dueDate on an unpaid Cost paid before the trip is kept", () => {
    expect(mergeCostPatch(unpaidRow, { dueDate: "2026-04-25" })).toMatchObject({ dueDate: "2026-04-25" });
  });
  it("drops the row's dueDate when the Cost is paid", () => {
    expect(mergeCostPatch({ ...paidRow, dueDate: "2026-04-20" }, { label: "x" })).toMatchObject({ dueDate: undefined });
  });
  // The editors' saves (full input through toPatch):
  it("the editor's un-ticked Paid (paidAt: null) un-pays the Cost and keeps the paid amount as history", () => {
    const m = mergeCostPatch(paidRow, { costMinor: 12000, currency: "EUR", paidAt: null, settlement: "BEFORE" });
    expect(m).not.toHaveProperty("paidAt");
    expect(m).not.toHaveProperty("paidMinor"); // undefined: updateCost leaves the column (history)
  });
  it("the editor's cleared Due date (null) clears it", () => {
    expect(mergeCostPatch(unpaidRow, { dueDate: null, paidAt: null })).toMatchObject({ dueDate: undefined });
  });
});
```

`server/actions/costs.test.ts` (existing `costFindUniqueMock` — first call `requireCostAccess`'s row via `requireRowAccess`, then the full `before` row; `costUpdateMock` inside `$transaction`):

```ts
describe("updateCost (PATCH, ADR 0075)", () => {
  it("a category-only patch writes the row's paid pair back and keeps it paid", async () => {
    costFindUniqueMock.mockResolvedValue({ id: "c1", tripId: "trip-1", forkId: null, costMinor: 12000, currency: "EUR", paidMinor: 12000, paidAt: new Date("2026-04-01T00:00:00Z"), dueDate: null, ownerType: "OTHER", ownerId: null, label: "Museum pass", category: "Activities", settlement: "BEFORE" });
    await updateCost("c1", { category: "Tours" });
    expect(costUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ category: "Tours", label: "Museum pass", paidMinor: 12000, paidAt: new Date("2026-04-01T00:00:00Z") }),
    }));
  });
  it("a due date on a paid Cost is refused before any write", async () => { /* same row; dueDate: "2026-04-10" → success false, costUpdateMock not called */ });
  it("P3-3 still clears a history paid amount when an unpaid Cost changes currency", async () => {
    costFindUniqueMock.mockResolvedValue({ id: "c1", tripId: "trip-1", forkId: null, costMinor: 12000, currency: "EUR", paidMinor: 9000, paidAt: null, dueDate: null, ownerType: "OTHER", ownerId: null, label: "Pass", category: null, settlement: "BEFORE" });
    await updateCost("c1", { currency: "GBP" });
    expect(costUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currency: "GBP", paidMinor: null }) }));
  });
});
```

Editor tests (`components/trip/cost-editor.test.tsx`, `components/trip/other-cost-editor.test.tsx`) — add one each (render the file's existing edit fixture, untick Paid / clear the Due date, save):

```ts
it("an edit that un-ticks Paid sends paidAt: null, and a cleared Due date sends dueDate: null (PATCH: undefined would keep them)", async () => {
  // …existing edit-dialog setup for a paid Cost; click the Paid switch off; save
  expect(updateCost).toHaveBeenCalledWith("cost-1", expect.objectContaining({ paidAt: null, dueDate: null }));
});
```

(`other-cost-editor.test.tsx` adds `category: null` when its Category is cleared.) Where an existing editor assertion expected `paidAt: undefined`/`dueDate: undefined` on an **update** call, it now expects `null` — same intent, the cleared value; say so in the commit body.

`lib/mcp/tools/bookings-write.test.ts`: the `describe("update_cost (PATCH)")` cases `:745-849` move to `lib/money/cost-patch.test.ts` above; in their place:

```ts
describe("update_cost (PATCH)", () => {
  it("checks the Cost is real-plan, then forwards only the fields passed", async () => {
    updateCost.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, category: "Tours" } });
    expect(updateCost).toHaveBeenCalledWith(COST_ID, { category: "Tours" });
  });
  // keep: "checks trip access before using the loaded row…" (:851) and "a made-up cost id…" (:861), now refused by the real-plan check
});
```

The owner-kind cases (`:1012-1078`: "update_cost with a Fork's … ownerId", "update_cost with a real-plan owner still works", "…with neither ownerType nor ownerId supplied skips the owner check") stay with their assertions; their `costFindUnique` mock now answers the real-plan row read (it already returns `ownerType`/`ownerId`, the select the guard uses — `lib/guards.ts:257`).

`test/integration/patch-updates.test.ts` — add `import { updateCost } from "@/server/actions/costs";`:

```ts
describe("Cost", () => {
  it("a category-only patch on a paid Cost keeps it paid; the editor's paidAt: null un-pays it and keeps the amount", async () => {
    const cost = await db.cost.create({ data: { tripId: TRIP_ID, ownerType: "OTHER", label: "Museum pass", costMinor: 12000, paidMinor: 12000, currency: "AUD", rateToHome: 1, paidAt: new Date("2026-04-01T00:00:00Z"), settlement: "BEFORE" } });
    await updateCost(cost.id, { category: "Tours" });
    expect(await db.cost.findUnique({ where: { id: cost.id } })).toMatchObject({ category: "Tours", label: "Museum pass", paidMinor: 12000, paidAt: new Date("2026-04-01T00:00:00Z") });
    await updateCost(cost.id, { costMinor: 12000, currency: "AUD", paidAt: null, settlement: "BEFORE" });
    expect(await db.cost.findUnique({ where: { id: cost.id } })).toMatchObject({ paidAt: null, paidMinor: 12000 });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/money/cost-patch.test.ts server/actions/costs.test.ts components/trip/cost-editor.test.tsx components/trip/other-cost-editor.test.tsx lib/mcp/tools/bookings-write.test.ts` — unresolved `./cost-patch`; partial patches refused by `costSchema` ("Required"); editor calls carry no `null`.

- [ ] **Step 3: Implement**

`lib/money/cost-patch.ts`:

```ts
/**
 * A Cost's PATCH rules (ADR 0075, spec 2026-10-14 card 3.L): what a partial
 * update keeps, for the standalone Cost (`updateCost`) and for the inline
 * Cost an Accommodation, Transport or thing to do owns (`completeInlineCost`).
 *
 * The paid pair (CONTEXT.md "Paid", ADR 0037): a patch that says anything
 * about paid (`paidMinor` or `paidAt` given, `null` included) is taken as
 * said — the editors always say it; a patch that says nothing keeps the
 * row's pair, `paidAt` deciding (`paidFieldsFromRow`). A paid amount left
 * undefined is left alone by the action, so an un-paid Cost keeps it as
 * history.
 *
 * Pure: no Prisma, no zod (types only).
 */
import type { ActionFailure } from "@/lib/action-result";
import type { CostRawInput } from "@/lib/validations/cost";
import { paidFieldsFromRow } from "@/lib/money/cost-form-state";
import { patched, type Patch } from "@/lib/patch";

export type CostPatchRow = {
  costMinor: number;
  currency: string;
  paidMinor: number | null;
  paidAt: Date | string | null;
  dueDate: string | null;
  ownerType: string;
  ownerId: string | null;
  label: string | null;
  category: string | null;
  settlement: string;
};

/** A Due date only belongs to an unpaid Cost paid before the trip (CONTEXT.md "Due date"). */
export const DUE_DATE_NOT_APPLICABLE: ActionFailure = {
  success: false,
  errors: {
    dueDate: ["A due date only applies to an unpaid cost paid before the trip. Mark it unpaid or change settlement first, or leave dueDate out."],
  },
};

/** The paid pair after a patch: the patch's own when it says anything about paid, else the row's. */
export function paidPairAfter(
  patch: { paidMinor?: number | null; paidAt?: string | null },
  row: { costMinor: number; paidMinor: number | null; paidAt: Date | string | null } | null,
): { paidMinor?: number; paidAt?: string } {
  if (patch.paidMinor !== undefined || patch.paidAt !== undefined) {
    return {
      ...(patch.paidMinor != null ? { paidMinor: patch.paidMinor } : {}),
      ...(patch.paidAt != null ? { paidAt: patch.paidAt } : {}),
    };
  }
  return row ? paidFieldsFromRow(row) : {};
}

/**
 * Merge a patch onto a standalone Cost. `dueDate` drops out once the Cost
 * reads as paid or its Settlement is On the trip (as the editors do); a
 * Due date the caller *sends* in that state is refused rather than dropped.
 */
export function mergeCostPatch(current: CostPatchRow, patch: Patch<CostRawInput>): CostRawInput | ActionFailure {
  const paid = paidPairAfter({ paidMinor: patch.paidMinor, paidAt: patch.paidAt as string | null | undefined }, current);
  const settlement = (patch.settlement ?? current.settlement) as CostRawInput["settlement"];
  const noDueDate = paid.paidAt !== undefined || settlement === "ON_TRIP";
  if (noDueDate && patch.dueDate != null) return DUE_DATE_NOT_APPLICABLE;
  return {
    costMinor: patch.costMinor ?? current.costMinor,
    currency: patch.currency ?? current.currency,
    ownerType: (patch.ownerType ?? current.ownerType) as CostRawInput["ownerType"],
    ownerId: patched(patch.ownerId, current.ownerId),
    label: patched(patch.label, current.label),
    category: patched(patch.category, current.category),
    dueDate: noDueDate ? undefined : patched(patch.dueDate, current.dueDate),
    settlement,
    ...paid,
  };
}
```

(If `CostRawInput["paidAt"]` is `string | undefined`, the `as string | null | undefined` cast is a widening the compiler accepts; if it complains, type the parameter `Patch<CostRawInput>` and read `patch.paidAt ?? undefined`. The first test's `toEqual` lists `ownerId: undefined` and `dueDate: undefined`: `toEqual` treats them as absent.)

`server/actions/costs.ts` `updateCost`, before → after (signature, the first lines and the P3-3 condition):

```ts
/**
 * Update a Cost (PATCH, ADR 0075): merges onto the held row
 * (`lib/money/cost-patch.ts` — the paid pair and Due date rules).
 *
 * - Access-checks via requireCostAccess → requireTripAccess.
 * - Re-snapshots rateToHome (currency may have changed).
 */
export async function updateCost(
  costId: string,
  patch: Patch<CostRawInput>,
): Promise<CostActionResult> {
  const existing = await requireCostAccess(costId);
  const before = await db.cost.findUnique({ where: { id: costId } });
  if (!before) notFound();

  const merged = mergeCostPatch(before, patch);
  if ("success" in merged) return merged;
  const parsed = costSchema.safeParse(merged);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }
  const data = parsed.data;
  // …owner check, trip read, rate, transaction — unchanged; delete the later `const before = …` (:217)
```

and in the update `data`, the P3-3 line `...(data.currency !== existing.currency && data.paidMinor === undefined && !data.paidAt ? { paidMinor: null } : {})` stays as is: `data.paidMinor` is undefined exactly when the Cost ends up unpaid and no paid amount was sent — the condition P3-3 means. Imports: `notFound` (`next/navigation`), `mergeCostPatch` from `@/lib/money/cost-patch`, `type Patch` from `@/lib/patch`.

Editors, before → after (create calls unchanged):
- `components/trip/cost-editor.tsx:238` `await updateCost(cost.id, parsed.input)` → `await updateCost(cost.id, toPatch(parsed.input, OWNED_CLEARABLE))`
- `components/trip/cost-editor.tsx:328` `await updateCost(editingCost.id, parsed.input)` → `await updateCost(editingCost.id, toPatch(parsed.input, OWNED_CLEARABLE))`
- with, near `parseOwnedFormToInput` (`:191`): `/** An edit's empties are clears (ADR 0075): un-ticked Paid, a removed Due date. */ const OWNED_CLEARABLE = ["paidAt", "dueDate"] as const;`
- `components/trip/other-cost-editor.tsx:340` `cost ? await updateCost(cost.id, parsed.input) : …` → `cost ? await updateCost(cost.id, toPatch(parsed.input, ["paidAt", "dueDate", "category"])) : …`
- both files: `import { toPatch } from "@/lib/patch";`

`paidMinor` is deliberately not clearable: an un-ticked Paid leaves the paid amount as history (CONTEXT.md "Paid").

`lib/mcp/tools/bookings-write.ts`:
- Delete `CostPatch` (`:548-557`), `CostRow` (`:559-571`), `loadCostForPatch` (`:573-597`), `mergeCostPatch` (`:616-670`).
- Tool body (`:844-857`) →

```ts
    ({ costId, ...patch }) =>
      runTool("update_cost", async () => {
        const { row } = await requireRowAccess("cost", costId, { realPlanOnly: true });
        if (patch.ownerType !== undefined || patch.ownerId !== undefined) {
          const kind = realPlanKindForOwner(patch.ownerType ?? row.ownerType);
          const ownerId = patch.ownerId ?? row.ownerId;
          if (kind && ownerId) await requireRealPlanRow(kind, ownerId);
        }
        return updateCost(costId, patch);
      }),
```
(`requireRowAccess` from `@/lib/guards` — the guard `requireRealPlanRow` wraps, used directly here because the owner check needs the row's `ownerType`/`ownerId`, which `ROW_SELECT.cost` already selects.)
- Header `:55-71` (the `update_cost` paragraph) → ``"`update_cost` passes only the fields the caller supplied: `updateCost` takes a PATCH (ADR 0075); the paid pair and Due date rules are `lib/money/cost-patch.ts`'s. `paidMinor`/`paidAt` are not on its schema — use `mark_cost_paid`/`mark_cost_unpaid`."``
- `loadCostForMark` (`:599-614`) stays: it is the `mark_cost_*` not-found shape, not a PATCH pair.

- [ ] **Step 4: Run it, expect PASS** — the five unit files; the integration file with the DB up. `npx vitest run lib/client-zod.guard.test.ts` (the editors now import `lib/patch`).

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/money/cost-patch.ts server/actions/costs.ts components/trip/cost-editor.tsx components/trip/other-cost-editor.tsx lib/mcp/tools/bookings-write.ts` + `npx tsc --noEmit` + `npx eslint lib/money/cost-patch.ts lib/money/cost-patch.test.ts server/actions/costs.ts components/trip/cost-editor.tsx components/trip/other-cost-editor.tsx lib/mcp/tools/bookings-write.ts test/integration/patch-updates.test.ts`

- [ ] **Step 6: Commit** — `git add lib/money/cost-patch.ts lib/money/cost-patch.test.ts server/actions/costs.ts server/actions/costs.test.ts components/trip/cost-editor.tsx components/trip/cost-editor.test.tsx components/trip/other-cost-editor.tsx components/trip/other-cost-editor.test.tsx lib/mcp/tools/bookings-write.ts lib/mcp/tools/bookings-write.test.ts test/integration/patch-updates.test.ts` — `refactor(money): updateCost takes a PATCH; paid pair and Due date rules in lib/money/cost-patch (card 3.L)` — body names the `undefined`→`null` assertion changes.

---

### Task 3.L.6: Accommodation takes a PATCH; the inline Cost completes on the server

`completeInlineCost` (`bookings-write.ts:126-166`) becomes pure (it takes the owned Cost rows instead of reading them) and moves to `lib/money/cost-patch.ts`; the actions load those rows once — the query they already run at `accommodation.ts:212-215` moves up and widens its select. Transport (3.L.8) and Item (3.L.7) reuse it.

Why the action-level refusals are unreachable from the form: the entity form sends `costMinor` and `currency` together or neither (`toCostPayload`, `lib/money/cost-form-state.ts:158-182`), and with more than one owned Cost its inline fields are seeded empty (`seedCostFormState(singleCost = null, …)`), so `cost.payload()` is `none`. Confirm with `grep -n "hasMultipleCosts\|singleCost" components/trip/accommodation-form-dialog.tsx` before relying on it; if the form can send cost fields with several Costs, stop and report — do not soften the refusal.

**Files:**
- Modify: `lib/money/cost-patch.ts` (add `completeInlineCost`, `type OwnedCostRow`, `type InlineCostPatch`, `type InlineCost`, the two refusals)
- Test: `lib/money/cost-patch.test.ts`
- Modify: `server/actions/accommodation.ts:150-255` (`updateAccommodation`)
- Modify: `components/trip/accommodation-form-dialog.tsx:233-235`
- Modify: `lib/mcp/tools/bookings-write.ts` — `:117-166` (`completeInlineCost`) stays untouched until Task 3.L.8 (`update_transport` still calls it); `:202-275` (delete `AccommodationPatch`, `AccommodationRow`, `loadAccommodationForPatch`, `mergeAccommodationPatch`), `:715-732` (tool), header `:33-38` Accommodation half
- Test: `server/actions/accommodation.test.ts`, `components/trip/accommodation-form-dialog.test.tsx`, `lib/mcp/tools/bookings-write.test.ts:100-120, 239-347`, `test/integration/patch-updates.test.ts`

**Interfaces:**
- Consumes: `paidPairAfter` (3.L.5), `applyPatch`, `toPatch`, `Patch` (3.L.2), `auditedUpdate(…, held)` (3.L.2).
- Produces:

```ts
export type OwnedCostRow = { id: string; costMinor: number; currency: string; paidMinor: number | null; paidAt: Date | null };
export type InlineCostPatch = { costMinor?: number | null; currency?: string | null; paidMinor?: number | null; paidAt?: string | null; settlement?: "BEFORE" | "ON_TRIP" | null };
export type InlineCost = { costMinor: number; currency: string; paidMinor?: number; paidAt?: string; settlement?: "BEFORE" | "ON_TRIP" };
export function completeInlineCost(patch: InlineCostPatch, owned: readonly OwnedCostRow[]): InlineCost | ActionFailure | null;
/** The owned-Cost select the three actions load (only when the patch touches the Cost). */
export const OWNED_COST_SELECT: { id: true; costMinor: true; currency: true; paidMinor: true; paidAt: true };
```
- `updateAccommodation(accommodationId: string, patch: Patch<AccommodationInput>)`.

- [ ] **Step 1: Write the failing tests**

`lib/money/cost-patch.test.ts` — the MCP inline-cost assertions (`bookings-write.test.ts:260-327`), now pure:

```ts
import { completeInlineCost } from "./cost-patch";

describe("completeInlineCost", () => {
  const paid = { id: "c1", costMinor: 9000, currency: "EUR", paidMinor: 9000, paidAt: new Date("2026-04-15T00:00:00Z") };
  it("a patch that doesn't touch the Cost completes nothing", () => {
    expect(completeInlineCost({ paidAt: null }, [paid])).toBeNull();
  });
  it("costMinor-only on a paid owned Cost carries currency and the paid pair together", () => {
    expect(completeInlineCost({ costMinor: 9500 }, [paid])).toEqual({ costMinor: 9500, currency: "EUR", paidMinor: 9000, paidAt: "2026-04-15" });
  });
  it("keeps a paid Cost paid even if its paid amount is missing (paidAt decides)", () => {
    expect(completeInlineCost({ costMinor: 600 }, [{ ...paid, costMinor: 500, currency: "AUD", paidMinor: null, paidAt: new Date("2026-10-01T00:00:00Z") }]))
      .toMatchObject({ costMinor: 600, currency: "AUD", paidMinor: 500, paidAt: "2026-10-01" });
  });
  it("on an UNPAID owned Cost carries no paid pair", () => {
    const r = completeInlineCost({ costMinor: 9500 }, [{ ...paid, paidMinor: null, paidAt: null }]);
    expect(r).toEqual({ costMinor: 9500, currency: "EUR" });
  });
  it("currency-only with no owned Cost is refused", () => {
    expect(completeInlineCost({ currency: "EUR" }, [])).toMatchObject({ success: false, errors: { costMinor: [expect.stringMatching(/Pass both costMinor and currency/)] } });
  });
  it("against more than one owned Cost is refused", () => {
    expect(completeInlineCost({ costMinor: 1 }, [paid, { ...paid, id: "c2" }])).toMatchObject({ success: false, errors: { costMinor: [expect.stringMatching(/more than one Cost/)] } });
  });
  it("the form's unpaid save (paidAt: null) un-pays, keeping the amount as history", () => {
    expect(completeInlineCost({ costMinor: 9000, currency: "EUR", paidAt: null, settlement: "BEFORE" }, [paid]))
      .toEqual({ costMinor: 9000, currency: "EUR", settlement: "BEFORE" });
  });
});
```

`server/actions/accommodation.test.ts` — the merge assertions of `bookings-write.test.ts:240-288` at the action, plus the "parses with the real schema" case becoming free (the action parses the merged input with the real `accommodationSchema`):

```ts
describe("updateAccommodation (PATCH, ADR 0075)", () => {
  const row = { id: "acc-1", tripId: "trip-1", forkId: null, stopId: "stop-1", name: "Hilton", address: "1 Via Roma", checkIn: "2026-05-01", checkOut: "2026-05-04", checkInTime: "15:00", checkOutTime: null, confirmation: "ABC", notes: "old", lat: 41.9, lng: 12.5 };
  beforeEach(() => {
    accommodationFindUniqueMock.mockResolvedValue(row);           // guard row, then the held row
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", forkId: null });
    accommodationUpdateMock.mockResolvedValue({ ...row });
  });
  it("with only name keeps every other field, including stopId and dates, reading the row once", async () => {
    await updateAccommodation("acc-1", { name: "Hilton Garden Inn" });
    expect(accommodationUpdateMock).toHaveBeenCalledWith({ where: { id: "acc-1" }, data: expect.objectContaining({
      stopId: "stop-1", name: "Hilton Garden Inn", address: "1 Via Roma", checkIn: "2026-05-01", checkOut: "2026-05-04", checkInTime: "15:00", confirmation: "ABC", notes: "old",
    }) });
    expect(accommodationFindUniqueMock).toHaveBeenCalledTimes(2); // guard + held row; auditedUpdate does not re-read
  });
  it("explicit null clears notes and address", async () => {
    await updateAccommodation("acc-1", { notes: null, address: null });
    expect(accommodationUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ notes: null, address: null, lat: null, lng: null }) }));
  });
  it("costMinor-only on a paid owned Cost keeps it paid (passes the real schema)", async () => {
    costFindManyMock.mockResolvedValue([{ id: "c1", costMinor: 9000, currency: "EUR", paidMinor: 9000, paidAt: new Date("2026-04-15T00:00:00Z") }]);
    const r = await updateAccommodation("acc-1", { costMinor: 9500 });
    expect(r).toEqual({ success: true });
    expect(costUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1" }, data: expect.objectContaining({ costMinor: 9500, currency: "EUR", paidMinor: 9000, paidAt: new Date("2026-04-15") }) }));
  });
  it("cost fields against more than one owned Cost are refused before anything is written", async () => {
    costFindManyMock.mockResolvedValue([{ id: "c1", costMinor: 1, currency: "EUR", paidMinor: null, paidAt: null }, { id: "c2", costMinor: 2, currency: "EUR", paidMinor: null, paidAt: null }]);
    const r = await updateAccommodation("acc-1", { costMinor: 5 });
    expect(r.success).toBe(false);
    expect(accommodationUpdateMock).not.toHaveBeenCalled();
  });
});
```

(Mock names follow the file; rename to what it declares.)

`components/trip/accommodation-form-dialog.test.tsx` — add:

```ts
it("an edit that empties Notes, Address and Confirmation and the check-in time sends them as null (PATCH)", async () => {
  // render with existingAccommodation (give it notes/address/confirmation/checkInTime); clear the four inputs; save
  expect(updateAccommodation).toHaveBeenCalledWith("acc-1", expect.objectContaining({ notes: null, address: null, confirmation: null, checkInTime: null }));
});
it("a create still sends undefined for an empty field (toPatch is the update path only)", async () => {
  // add mode: leave Notes empty; save
  expect(vi.mocked(createAccommodation).mock.calls[0][0].notes).toBeUndefined();
});
```

`lib/mcp/tools/bookings-write.test.ts`:
- Imports `:111-118`: drop `mergeAccommodationPatch`, `type AccommodationRow` (keep `mergeTransportPatch`, `completeInlineCost`, `isFailure`, `TransportRow` until 3.L.8).
- `describe("update_accommodation (PATCH)")` `:239-347`: the cases at `:240, 260, 274, 290, 298, 308, 317` move as above; keep `:329` ("checks trip access…") and `:339` ("a made-up accommodation id…") — refused by `requireRealPlanRow("accommodation", …)` now — and add:

```ts
it("checks the Accommodation and any new Stop are real-plan, then forwards only the fields passed", async () => {
  updateAccommodation.mockResolvedValue({ success: true });
  const c = await connectTestClient();
  await c.callTool({ name: "update_accommodation", arguments: { accommodationId: ACCOMMODATION_ID, name: "Hilton Garden Inn", costMinor: 9500 } });
  expect(updateAccommodation).toHaveBeenCalledWith(ACCOMMODATION_ID, { name: "Hilton Garden Inn", costMinor: 9500 });
  expect(costFindMany).not.toHaveBeenCalled(); // completion is the action's now
});
```

`test/integration/patch-updates.test.ts` — add `import { updateAccommodation } from "@/server/actions/accommodation";`:

```ts
describe("Accommodation", () => {
  it("a name-only patch keeps the rest; null clears notes; a cost-only patch keeps a paid Cost paid", async () => {
    const stop = await db.stop.create({ data: { tripId: TRIP_ID, name: "Lisbon", arriveDate: "2026-05-01", departDate: "2026-05-04", timezone: "Europe/Lisbon", sortOrder: 1 } });
    const acc = await db.accommodation.create({ data: { tripId: TRIP_ID, stopId: stop.id, name: "Hilton", address: "1 Rua", checkIn: "2026-05-01", checkOut: "2026-05-04", checkInTime: "15:00", confirmation: "ABC", notes: "old" } });
    const cost = await db.cost.create({ data: { tripId: TRIP_ID, ownerType: "ACCOMMODATION", ownerId: acc.id, costMinor: 9000, paidMinor: 9000, currency: "AUD", rateToHome: 1, paidAt: new Date("2026-04-15T00:00:00Z"), settlement: "BEFORE" } });
    await updateAccommodation(acc.id, { name: "Hilton Garden Inn" });
    expect(await db.accommodation.findUnique({ where: { id: acc.id } })).toMatchObject({ name: "Hilton Garden Inn", address: "1 Rua", checkInTime: "15:00", confirmation: "ABC", notes: "old", stopId: stop.id });
    await updateAccommodation(acc.id, { notes: null });
    expect(await db.accommodation.findUnique({ where: { id: acc.id } })).toMatchObject({ notes: null, confirmation: "ABC" });
    await updateAccommodation(acc.id, { costMinor: 9500 });
    expect(await db.cost.findUnique({ where: { id: cost.id } })).toMatchObject({ costMinor: 9500, paidMinor: 9000, paidAt: new Date("2026-04-15T00:00:00Z") });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/money/cost-patch.test.ts server/actions/accommodation.test.ts components/trip/accommodation-form-dialog.test.tsx lib/mcp/tools/bookings-write.test.ts` — `completeInlineCost` not exported from `./cost-patch`; the partial patch refused ("Accommodation name is required"/"Stop is required"); the form sends `undefined`.

- [ ] **Step 3: Implement**

`lib/money/cost-patch.ts` — append:

```ts
/** The owned-Cost columns an update loads to complete its inline Cost. */
export const OWNED_COST_SELECT = { id: true, costMinor: true, currency: true, paidMinor: true, paidAt: true } as const;

export type OwnedCostRow = { id: string; costMinor: number; currency: string; paidMinor: number | null; paidAt: Date | null };
export type InlineCostPatch = {
  costMinor?: number | null;
  currency?: string | null;
  paidMinor?: number | null;
  paidAt?: string | null;
  settlement?: "BEFORE" | "ON_TRIP" | null;
};
export type InlineCost = { costMinor: number; currency: string; paidMinor?: number; paidAt?: string; settlement?: "BEFORE" | "ON_TRIP" };

const MORE_THAN_ONE_COST: ActionFailure = {
  success: false,
  errors: { costMinor: ["This has more than one Cost already. Use update_cost to edit a specific one."] },
};
const BOTH_HALVES: ActionFailure = {
  success: false,
  errors: { costMinor: ["Pass both costMinor and currency to add or change the Cost, or use add_cost/update_cost."] },
};

/**
 * Completes an update's inline Cost from its owner's Cost rows. `null` when
 * the patch touches neither `costMinor` nor `currency` (the action's "no
 * amount → skip"). With more than one owned Cost the Cost editor is
 * authoritative, so the update is refused rather than half-applied; a lone
 * half with no single Cost to complete it from is refused too. The paid
 * pair follows `paidPairAfter` — the entity forms always say it (an unpaid
 * save sends `paidAt: null`), the Claude tools never do.
 */
export function completeInlineCost(patch: InlineCostPatch, owned: readonly OwnedCostRow[]): InlineCost | ActionFailure | null {
  if (patch.costMinor == null && patch.currency == null) return null;
  if (owned.length > 1) return MORE_THAN_ONE_COST;
  const single = owned[0] ?? null;
  const costMinor = patch.costMinor ?? single?.costMinor;
  const currency = patch.currency ?? single?.currency;
  if (costMinor === undefined || currency === undefined) return BOTH_HALVES;
  return {
    costMinor,
    currency,
    ...paidPairAfter(patch, single),
    ...(patch.settlement != null ? { settlement: patch.settlement } : {}),
  };
}
```

`server/actions/accommodation.ts` `updateAccommodation` — the top half, before → after:

```ts
/**
 * Update an Accommodation (PATCH, ADR 0075): merges onto the held row; an
 * inline Cost is completed from its single owned Cost (`completeInlineCost`).
 *
 * Looks up the accommodation → requireTripAccess(acc.tripId).
 */
export async function updateAccommodation(
  accommodationId: string,
  patch: Patch<AccommodationInput>,
): Promise<AccommodationActionResult> {
  const acc = await requireAccommodationAccess(accommodationId);
  const before = await db.accommodation.findUnique({ where: { id: accommodationId } });
  if (!before) notFound();

  const owned = patch.costMinor != null || patch.currency != null
    ? await db.cost.findMany({ where: { ownerType: "ACCOMMODATION", ownerId: accommodationId }, select: OWNED_COST_SELECT })
    : [];
  const inlineCost = completeInlineCost(patch, owned);
  if (inlineCost && "success" in inlineCost) return inlineCost;

  const parsed = accommodationSchema.safeParse({
    ...applyPatch<AccommodationInput>(
      {
        stopId: before.stopId, name: before.name, address: before.address, checkIn: before.checkIn, checkOut: before.checkOut,
        checkInTime: before.checkInTime, checkOutTime: before.checkOutTime, confirmation: before.confirmation, notes: before.notes,
      },
      patch,
    ),
    ...inlineCost,
  });
  if (!parsed.success) {
    return validationResult(parsed.error);
  }
  const data = parsed.data;
  // …stop check, surprise check, geocode — unchanged
```

Further down:
- `await auditedUpdate("ACCOMMODATION", db.accommodation, accommodationId, { … }, acc.forkId ?? null);` → add `, { before }` as the sixth argument.
- In the inline-cost block, `const existingCosts = await db.cost.findMany({ where: { ownerType: "ACCOMMODATION", ownerId: accommodationId }, select: { id: true } });` → `const existingCosts = owned;` (loaded above whenever `data.costMinor`/`data.currency` can be set — both come only from `inlineCost`). Keep the `existingCosts.length <= 1` guard and both branches unchanged.
- Imports: `notFound` (`next/navigation`), `applyPatch`, `type Patch` (`@/lib/patch`), `completeInlineCost`, `OWNED_COST_SELECT` (`@/lib/money/cost-patch`).

The current values deliberately omit `lat`/`lng`: the action geocodes `address` and never reads a sent point (`bookings-write.ts:25-31`).

`components/trip/accommodation-form-dialog.tsx:233-235`:

```ts
      return isEdit && accommodation
        ? updateAccommodation(accommodation.id, toPatch(input, ACCOMMODATION_CLEARABLE))
        : createAccommodation(input, forkId ?? undefined);
```
with, above the component: `/** An edit's empty fields are clears (ADR 0075). The Cost's paid date: an un-ticked Paid. */ const ACCOMMODATION_CLEARABLE = ["address", "checkInTime", "checkOutTime", "confirmation", "notes", "paidAt"] as const;` and `import { toPatch } from "@/lib/patch";`. (`toPatch`'s `keyof T` for the `input` object literal type may not include `checkInTime`/`paidAt` because they arrive by conditional spread; if `tsc` refuses, annotate `const input: AccommodationInput = { … }` in `buildInput` — the type every caller already expects.)

`lib/mcp/tools/bookings-write.ts`:
- Delete `:202-275` (`AccommodationPatch`, `AccommodationRow`, `loadAccommodationForPatch`, `mergeAccommodationPatch`).
- Tool body (`:725-731`) →

```ts
    ({ accommodationId, ...patch }) =>
      runTool("update_accommodation", async () => {
        await requireRealPlanRows([
          ["accommodation", accommodationId],
          ["stop", patch.stopId],
        ]);
        return updateAccommodation(accommodationId, patch);
      }),
```
- Header: in the paragraph at `:33-38`, Accommodation now reads: ``"`update_accommodation` passes only the fields the caller supplied (ADR 0075); the action completes its inline Cost from the single owned Cost (`completeInlineCost`, lib/money/cost-patch.ts)."`` Leave the Transport half for 3.L.8. `completeInlineCost` in this file stays for `update_transport` until 3.L.8.

- [ ] **Step 4: Run it, expect PASS** — the four unit files; the integration file with the DB up.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/money/cost-patch.ts server/actions/accommodation.ts components/trip/accommodation-form-dialog.tsx lib/mcp/tools/bookings-write.ts` + `npx tsc --noEmit` + `npx eslint lib/money/cost-patch.ts lib/money/cost-patch.test.ts server/actions/accommodation.ts components/trip/accommodation-form-dialog.tsx lib/mcp/tools/bookings-write.ts test/integration/patch-updates.test.ts`

- [ ] **Step 6: Commit** — `git add lib/money/cost-patch.ts lib/money/cost-patch.test.ts server/actions/accommodation.ts server/actions/accommodation.test.ts components/trip/accommodation-form-dialog.tsx components/trip/accommodation-form-dialog.test.tsx lib/mcp/tools/bookings-write.ts lib/mcp/tools/bookings-write.test.ts test/integration/patch-updates.test.ts` — `refactor(accommodation): updateAccommodation takes a PATCH; the inline Cost completes on the server (card 3.L)`

---

### Task 3.L.7: Item takes a PATCH; `update_thing_to_do`'s pair goes

`hiddenFromShares` (the data-loss reason for the MCP merge, `plan-write.ts:18-26`) is now carried by the merge; `surpriseForIds` keeps "omitted = leave the Surprise alone" (it is not a row column, so `applyPatch` passes it through only when sent). The inline Cost uses 3.L.6's `completeInlineCost` (the form is the only caller that sends Cost fields; same reachability note as 3.L.6 — check `grep -n "hasMultipleCosts\|singleCost" components/trip/item-form-dialog.tsx`).

**Files:**
- Modify: `server/actions/items.ts:324-440` (`updateItem`)
- Modify: `components/trip/item-form-dialog.tsx:567-570`
- Modify: `lib/mcp/tools/plan-write.ts:17-26` (header, Item half), `:27-31` (`notFound`, `db`, `requireTripAccess` imports), `:52` (`ItemInput` import), `:63-65` (`Failure`/`isFailure`: delete if unused after this), `:99-185` (delete `ItemPatch`, `ItemRow`, `loadItemForPatch`, `mergeItemPatch`), `:271-277` (tool)
- Test: `server/actions/items.test.ts`, `components/trip/item-form-dialog.test.tsx`, `lib/mcp/tools/plan-write.test.ts:205-250, 412-437`, `test/integration/patch-updates.test.ts`

**Interfaces:**
- Consumes: `applyPatch`, `toPatch`, `Patch` (3.L.2); `completeInlineCost`, `OWNED_COST_SELECT` (3.L.6); `auditedUpdate(…, held)`.
- Produces: `updateItem(itemId: string, patch: Patch<ItemInput>)`.

- [ ] **Step 1: Write the failing tests**

`server/actions/items.test.ts` — the MCP assertion `plan-write.test.ts:206-222`, at the action:

```ts
describe("updateItem (PATCH, ADR 0075)", () => {
  const row = { id: "item-1", tripId: "trip-1", forkId: null, stopId: "stop-1", title: "Colosseum", category: "SIGHTSEEING", date: "2026-05-02", startTime: "09:00", endTime: "11:00", address: "Rome, Italy", link: null, booking: null, notes: "old notes", hiddenFromShares: true };
  beforeEach(() => {
    itemFindUniqueMock.mockResolvedValue(row);      // guard row, then the held row
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", forkId: null });
    itemUpdateMock.mockResolvedValue(row);
  });
  it("with only notes keeps the other fields, including hiddenFromShares and the times", async () => {
    await updateItem("item-1", { notes: "new notes" });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "item-1" }, data: expect.objectContaining({
      title: "Colosseum", category: "SIGHTSEEING", stopId: "stop-1", date: "2026-05-02", startTime: "09:00", endTime: "11:00",
      address: "Rome, Italy", notes: "new notes", hiddenFromShares: true,
    }) });
  });
  it("clearing the date (null) drops the times with it", async () => {
    await updateItem("item-1", { date: null });
    expect(itemUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ date: null, startTime: null, endTime: null }) }));
  });
  it("an omitted surpriseForIds leaves the Surprise alone", async () => {
    await updateItem("item-1", { notes: "x" });
    expect(setSurpriseMock).not.toHaveBeenCalled(); // use the file's existing Surprise spy name
  });
});
```

`components/trip/item-form-dialog.test.tsx` — add:

```ts
it("an edit that empties Link, Booking and Notes and the date sends them as null (PATCH)", async () => {
  // render the file's existing edit fixture (give it link/booking/notes/date); clear them; save
  expect(updateItem).toHaveBeenCalledWith("item-99", expect.objectContaining({ link: null, booking: null, notes: null, date: null, startTime: null, endTime: null }));
});
```

Existing `:1271` (`surpriseForIds: []`) stays as is.

`lib/mcp/tools/plan-write.test.ts` — `describe("update_thing_to_do (PATCH)")` (`:205-250`): replace `:206-222` with

```ts
it("checks the item and any new Stop are real-plan, then forwards only the fields passed", async () => {
  updateItem.mockResolvedValue({ success: true });
  const c = await connectTestClient();
  await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, notes: "new notes" } });
  expect(itemFindUnique).toHaveBeenCalledWith({ where: { id: ITEM_ID, forkId: null }, select: { tripId: true } });
  expect(updateItem).toHaveBeenCalledWith(ITEM_ID, { notes: "new notes" });
});
```
keep `:224`, `:234`, `:243` unchanged (now refused by `requireRealPlanRow("item", …)`); the Fork cases at `:412-437` stay. The `itemRow()` fixture (`:116-130`) shrinks to what `requireRowAccess` reads (`{ tripId: TRIP_ID }` is enough) only if nothing else needs its fields — check first.

`test/integration/patch-updates.test.ts` — add `import { updateItem } from "@/server/actions/items";`:

```ts
describe("Item", () => {
  it("a notes-only patch keeps hiddenFromShares and the schedule; null clears the link", async () => {
    const item = await db.item.create({ data: { tripId: TRIP_ID, title: "Colosseum", category: "SIGHTSEEING", date: "2026-05-02", startTime: "09:00", link: "https://example.test", hiddenFromShares: true, sortOrder: 0 } });
    await updateItem(item.id, { notes: "book ahead" });
    expect(await db.item.findUnique({ where: { id: item.id } })).toMatchObject({ notes: "book ahead", hiddenFromShares: true, date: "2026-05-02", startTime: "09:00", link: "https://example.test" });
    await updateItem(item.id, { link: null });
    expect(await db.item.findUnique({ where: { id: item.id } })).toMatchObject({ link: null, notes: "book ahead" });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run server/actions/items.test.ts components/trip/item-form-dialog.test.tsx lib/mcp/tools/plan-write.test.ts` — "Title is required" on the partial patch; `hiddenFromShares: false` written; the form sends `undefined`.

- [ ] **Step 3: Implement** — `server/actions/items.ts` `updateItem`, top half:

```ts
/**
 * Update an Item (PATCH, ADR 0075): merges onto the held row —
 * `hiddenFromShares` included, so a patch that only touches `notes` no
 * longer un-hides it. `surpriseForIds` keeps "omitted = leave the Surprise
 * alone". An inline Cost completes from its single owned Cost.
 *
 * - Access-checked via requireItemAccess → requireTripAccess.
 * - If stopId changed, validates it still belongs to the same trip.
 */
export async function updateItem(
  itemId: string,
  patch: Patch<ItemInput>,
): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);
  const before = await db.item.findUnique({ where: { id: itemId } });
  if (!before) notFound();

  const owned = patch.costMinor != null || patch.currency != null
    ? await db.cost.findMany({ where: { ownerType: "ITEM", ownerId: itemId }, select: OWNED_COST_SELECT })
    : [];
  const inlineCost = completeInlineCost(patch, owned);
  if (inlineCost && "success" in inlineCost) return inlineCost;

  const parsed = itemSchema.safeParse({
    ...applyPatch<ItemInput>(
      {
        title: before.title, category: before.category as ItemInput["category"], stopId: before.stopId, date: before.date,
        startTime: before.startTime, endTime: before.endTime, address: before.address, link: before.link,
        booking: before.booking, notes: before.notes, hiddenFromShares: before.hiddenFromShares,
      },
      patch,
    ),
    ...inlineCost,
  });
  if (!parsed.success) {
    return validationResult(parsed.error);
  }
  const data = parsed.data;
  // …unchanged
```

- `const { before } = await auditedUpdate("ITEM", db.item, itemId, { … }, item.forkId ?? null);` → `await auditedUpdate("ITEM", db.item, itemId, { … }, item.forkId ?? null, { before });` — if code below `auditedUpdate` uses the returned `before` (grep `before` in the function), it now uses the held `before` declared above; remove the destructuring.
- Inline cost block: `const existingCosts = await db.cost.findMany({ where: { ownerType: "ITEM", ownerId: itemId }, select: { id: true } });` → `const existingCosts = owned;`.
- Imports: `notFound`, `applyPatch`, `type Patch`, `completeInlineCost`, `OWNED_COST_SELECT`.

`components/trip/item-form-dialog.tsx:567-570`:

```ts
      return isEdit && item
        ? updateItem(item.id, toPatch(input, ITEM_CLEARABLE))
        : createItem(tripId, input, forkId ?? undefined);
```
with `/** An edit's empty fields are clears (ADR 0075). Not surpriseForIds (omitted = leave the Surprise alone). */ const ITEM_CLEARABLE = ["stopId", "date", "startTime", "endTime", "address", "link", "booking", "notes", "paidAt"] as const;` and `import { toPatch } from "@/lib/patch";` (annotate `buildInput`'s `input` as `ItemInput` if `tsc` refuses `paidAt` as a key).

`lib/mcp/tools/plan-write.ts`:
- Delete `:99-185` (`ItemPatch`, `ItemRow`, `loadItemForPatch`, `mergeItemPatch`).
- Tool body (`:271-277`) →

```ts
    ({ itemId, ...patch }) =>
      runTool("update_thing_to_do", async () => {
        await requireRealPlanRows([
          ["item", itemId],
          ["stop", patch.stopId],
        ]);
        return updateItem(itemId, patch);
      }),
```
- Header `:17-26` → ``"`update_thing_to_do` and `update_chapter` pass only the fields the caller supplied: the actions take a PATCH (ADR 0075) and merge onto the row they hold — `hiddenFromShares` included, which an earlier replace-shaped `updateItem` reset."`` and `:14-16` "(`../real-plan.ts`, or the PATCH loaders' own `forkId: null`)" → "(`../real-plan.ts`)".
- Drop now-unused imports (`notFound`, `db`, `requireTripAccess`, `ItemInput`) and `Failure`/`isFailure` (`:63-65`) if `grep -n "isFailure\|Failure" lib/mcp/tools/plan-write.ts` shows no other use.

- [ ] **Step 4: Run it, expect PASS** — the three unit files; the integration file with the DB up.

- [ ] **Step 5: Task-done check** — `npx vitest related --run server/actions/items.ts components/trip/item-form-dialog.tsx lib/mcp/tools/plan-write.ts` + `npx tsc --noEmit` + `npx eslint server/actions/items.ts components/trip/item-form-dialog.tsx lib/mcp/tools/plan-write.ts test/integration/patch-updates.test.ts`

- [ ] **Step 6: Commit** — `git add server/actions/items.ts server/actions/items.test.ts components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx lib/mcp/tools/plan-write.ts lib/mcp/tools/plan-write.test.ts test/integration/patch-updates.test.ts` — `refactor(items): updateItem takes a PATCH; update_thing_to_do forwards the caller's fields (card 3.L)`

---

### Task 3.L.8: Transport takes a PATCH; the endpoint rules move to `lib/transport-patch.ts`

The endpoint merge (`bookings-write.ts:386-485`) moves as a pure module, adapted to `null`: a given-but-empty Stop or place (`""` from the tool, `null` from the form) is "none". The form always sends each end whole (`fromStopId`, `depIsHome`, `depPlace` together), so only the both-given branch reaches it; the tool's partial patches reach the rest. Times: a row's `depAt`/`arrAt` is an instant (`Date`), which `transportSchema`'s `isoDatetime` keeps as is (`lib/validations/transport.ts:14-23`), so a patch that doesn't touch the time keeps the instant even when an end's zone changes — as the tool did.

**Files:**
- Create: `lib/transport-patch.ts`
- Test: `lib/transport-patch.test.ts`
- Modify: `server/actions/transport.ts:216-328` (`updateTransport`)
- Modify: `components/trip/transport-form-dialog.tsx:520-523`
- Modify: `lib/mcp/tools/bookings-write.ts` — delete `:117-166` (`InlineCostEdit`, `InlineCostPatch`, `completeInlineCost`; keep `inlineCostCreateShape` `:168-171`), `:325-485` (`TransportPatch`, `TransportRow`, `loadTransportForPatch`, `Endpoint`, `EndpointPatch`, `homeContradictionError`, `mergeEndpoint`), `:487-520` (`mergeTransportPatch`); tool `:787-803`; `add_transport` (`:743-748`) imports `homeContradictionError` from the new module; header `:12-16, 18-24, 33-54`; drop `db`/`notFound`/`requireTripAccess`/`paidFieldsFromRow`/`TransportInput`/`AccommodationInput` imports if unused (`grep` each)
- Test: `server/actions/transport.test.ts`, `components/trip/transport-form-dialog.test.tsx`, `lib/mcp/tools/bookings-write.test.ts:100-120, 457-704`, `test/integration/patch-updates.test.ts`

**Interfaces:**
- Consumes: `patched`, `Patch`, `toPatch` (3.L.2); `completeInlineCost`, `OWNED_COST_SELECT`, `InlineCostPatch` (3.L.6); `auditedUpdate(…, held)`.
- Produces (`lib/transport-patch.ts`):

```ts
export type TransportPatch = Patch<TransportInput>;
export type TransportPatchRow = { mode: string; fromStopId: string | null; toStopId: string | null; anchorStopId: string | null; depIsHome: boolean; arrIsHome: boolean; depPlace: string | null; arrPlace: string | null; depAt: Date | null; arrAt: Date | null; reference: string | null; notes: string | null };
export function mergeTransportPatch(current: TransportPatchRow, patch: TransportPatch): Partial<TransportInput> | ActionFailure;
export function homeContradictionError(fields: { stopField: string; placeField: string; homeField: string }): ActionFailure;
```
- `updateTransport(transportId: string, patch: TransportPatch)`.

- [ ] **Step 1: Write the failing tests**

`lib/transport-patch.test.ts` — every endpoint case from `bookings-write.test.ts:458-672` as a pure call. The row fixture is the file's `transportRow()` (copy it: stop departure with a point, stop arrival, times as `Date`s). One example per rule, then the full list:

```ts
import { describe, expect, it } from "vitest";
import { mergeTransportPatch } from "./transport-patch";

const row = {
  mode: "TRAIN", fromStopId: "stop-a", toStopId: "stop-b", anchorStopId: "stop-a", depIsHome: false, arrIsHome: false,
  depPlace: "Roma Termini", arrPlace: null, depAt: new Date("2026-05-04T08:00:00Z"), arrAt: new Date("2026-05-04T11:00:00Z"),
  reference: "FR 9512", notes: null,
};
const homeDep = { ...row, fromStopId: null, depPlace: null, depIsHome: true };

describe("mergeTransportPatch", () => {
  it("with only reference keeps every other field, including stop ids, home flags and times", () => {
    expect(mergeTransportPatch(row, { reference: "FR 9514" })).toEqual({
      mode: "TRAIN", fromStopId: "stop-a", toStopId: "stop-b", anchorStopId: "stop-a", depIsHome: false, arrIsHome: false,
      depPlace: "Roma Termini", arrPlace: undefined, depAt: row.depAt, arrAt: row.arrAt, reference: "FR 9514", notes: undefined,
    });
  });
  it("keeps depIsHome true when the patch doesn't mention it", () => {
    expect(mergeTransportPatch(homeDep, { notes: "x" })).toMatchObject({ depIsHome: true, fromStopId: undefined });
  });
  it("the form's whole end (stop + null point + not home) replaces the end", () => {
    expect(mergeTransportPatch(row, { fromStopId: "stop-c", depPlace: null, depIsHome: false })).toMatchObject({ fromStopId: "stop-c", depPlace: undefined, depIsHome: false });
  });
  it("the form's Home end (nulls + home) is Home, not a contradiction", () => {
    expect(mergeTransportPatch(row, { fromStopId: null, depPlace: null, depIsHome: true })).toMatchObject({ depIsHome: true, fromStopId: undefined, depPlace: undefined });
  });
  it("the form's 'none' end (nulls, not home) saves an end with neither (the app allows it)", () => {
    expect(mergeTransportPatch(row, { fromStopId: null, depPlace: null, depIsHome: false })).toMatchObject({ fromStopId: undefined, depPlace: undefined, depIsHome: false });
  });
  it("depIsHome true together with a non-empty fromStopId is refused", () => {
    expect(mergeTransportPatch(row, { depIsHome: true, fromStopId: "stop-c" })).toMatchObject({ success: false, errors: { depIsHome: [expect.any(String)] } });
  });
  it("explicit null clears the reference", () => {
    expect(mergeTransportPatch(row, { reference: null })).toMatchObject({ reference: undefined });
  });
});
```

and port, one `it` each with the same name and expectation, the tool cases at `bookings-write.test.ts`: `:480` (forwards depIsHome), `:518` (fromStopId on a Home departure clears depIsHome and depPlace), `:527` (depPlace alone keeps the Stop), `:536` (depPlace alone on Home sets a point with no Stop), `:545` (`fromStopId ""` + depPlace → point alone), `:557` (`fromStopId ""` alone with no current place → refused), `:577` (`depPlace ""` alone on Home → Home unchanged), `:586` (`depPlace ""` alone on a point-alone end → refused), `:595` (`fromStopId ""` alone unlinks, keeps the place), `:604` (both set), `:616` (new Stop + `depPlace ""` → no point), `:628` (same Stop keeps the point), `:637` (different Stop clears a stale point), `:646` (`depIsHome: true` alone clears both), `:655` (Home + fromStopId refused), `:666` (un-homing with nothing to fall back on refused). Each changes only its call (`mergeTransportPatch(rowFixture, patchArgs)` instead of the tool call) and keeps its assertion on the merged fields; where the tool test asserted `updateTransport` was not called, the pure test asserts `{ success: false }` with the same field key. `:565` (`fromStopId ""` + `depPlace ""` → tool error) stays a **tool** test (deviation 5) — see below.

`server/actions/transport.test.ts`:

```ts
describe("updateTransport (PATCH, ADR 0075)", () => {
  // held row = the row above + { id: "t1", tripId: "trip-1", forkId: null }
  it("a reference-only patch keeps both ends, the anchor and the instants, reading the row once", async () => {
    await updateTransport("t1", { reference: "FR 9514" });
    expect(transportUpdateMock).toHaveBeenCalledWith({ where: { id: "t1" }, data: expect.objectContaining({
      fromStopId: "stop-a", toStopId: "stop-b", anchorStopId: "stop-a", depPlace: "Roma Termini",
      depAt: new Date("2026-05-04T08:00:00Z"), arrAt: new Date("2026-05-04T11:00:00Z"), reference: "FR 9514",
    }) });
  });
  it("costMinor-only on a paid owned Cost keeps it paid (passes the real transportSchema)", async () => { /* as accommodation.test.ts in 3.L.6, ownerType TRANSPORT */ });
  it("an endpoint refusal writes nothing", async () => {
    const r = await updateTransport("t1", { depIsHome: true, fromStopId: "stop-c" });
    expect(r.success).toBe(false);
    expect(transportUpdateMock).not.toHaveBeenCalled();
  });
});
```

`components/trip/transport-form-dialog.test.tsx` — add:

```ts
it("an edit that empties the reference, notes and the departure point sends them as null (PATCH)", async () => {
  // existing edit fixture with reference/notes/depPoint; clear them; save
  expect(updateTransport).toHaveBeenCalledWith("transport-99", expect.objectContaining({ reference: null, notes: null, depPlace: null }));
});
```

Existing `:1580` (`anchorStopId: ""`) stays — `""` is a value, not empty-as-undefined.

`lib/mcp/tools/bookings-write.test.ts`:
- Imports `:111-118`: drop `mergeTransportPatch`, `completeInlineCost`, `type TransportRow` (and `isFailure`, `transportSchema`, `accommodationSchema` if no test still uses them).
- `describe("update_transport (PATCH)")` `:457-704`: the merge cases move as listed; keep `:686`, `:696` (refused by `requireRealPlanRow("transport", …)` now); `:489`, `:503`, `:674` move to `transport.test.ts`/`cost-patch.test.ts`; `:565` stays, its arrange unchanged (it never reaches the row now) and its assertions unchanged; add:

```ts
it("checks the Transport and any named Stops are real-plan, then forwards only the fields passed", async () => {
  updateTransport.mockResolvedValue({ success: true });
  const c = await connectTestClient();
  await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, reference: "FR 9514", depPlace: "" } });
  expect(updateTransport).toHaveBeenCalledWith(TRANSPORT_ID, { reference: "FR 9514", depPlace: "" });
});
```

`test/integration/patch-updates.test.ts` — add `import { updateTransport } from "@/server/actions/transport";`:

```ts
describe("Transport", () => {
  it("a reference-only patch keeps both ends and the instants; null clears the notes", async () => {
    const a = await db.stop.create({ data: { tripId: TRIP_ID, name: "Rome", arriveDate: "2026-05-01", departDate: "2026-05-04", timezone: "Europe/Rome", sortOrder: 2 } });
    const b = await db.stop.create({ data: { tripId: TRIP_ID, name: "Florence", arriveDate: "2026-05-04", departDate: "2026-05-07", timezone: "Europe/Rome", sortOrder: 3 } });
    const t = await db.transport.create({ data: { tripId: TRIP_ID, mode: "TRAIN", fromStopId: a.id, toStopId: b.id, depPlace: "Roma Termini", depAt: new Date("2026-05-04T08:00:00Z"), arrAt: new Date("2026-05-04T11:00:00Z"), reference: "FR 9512", notes: "coach 4" } });
    await updateTransport(t.id, { reference: "FR 9514" });
    expect(await db.transport.findUnique({ where: { id: t.id } })).toMatchObject({ fromStopId: a.id, toStopId: b.id, depPlace: "Roma Termini", depAt: new Date("2026-05-04T08:00:00Z"), reference: "FR 9514", notes: "coach 4" });
    await updateTransport(t.id, { notes: null });
    expect(await db.transport.findUnique({ where: { id: t.id } })).toMatchObject({ notes: null, reference: "FR 9514" });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/transport-patch.test.ts server/actions/transport.test.ts components/trip/transport-form-dialog.test.tsx lib/mcp/tools/bookings-write.test.ts` — unresolved `./transport-patch`; partial patches write `depIsHome: false`/nulls; the form sends `undefined`.

- [ ] **Step 3: Implement**

`lib/transport-patch.ts`:

```ts
/**
 * A Transport's PATCH rules (ADR 0075, spec 2026-10-14 card 3.L). Each end
 * is a Stop, a Stop plus its exact point (`depPlace`/`arrPlace`: the station,
 * airport or pier), a point alone, Home, or nothing. `""` and `null` both
 * mean "none" for a Stop or a point; `undefined` keeps it.
 *
 *  - Home with a non-empty Stop or point is refused; Home alone (or with
 *    empty ones, as the form sends it) clears both.
 *  - Stop and point given together set the end as given — the form's save;
 *    both empty and not Home is an end with neither, which the app allows.
 *  - A Stop alone: empty unlinks it (the point stays; nothing left is
 *    refused); a new Stop clears a stale point, the same Stop keeps it.
 *  - A point alone keeps the end's Stop (unless it is Home); an empty point
 *    leaves a Home end Home, and on a point-alone end is refused.
 *  - `isHome: false` alone keeps the Stop and point (nothing to fall back on
 *    is refused). A patch that touches none of these keeps the end.
 *
 * Times stay as the row's instants unless the patch sends one. Pure.
 */
import type { ActionFailure } from "@/lib/action-result";
import type { TransportInput } from "@/lib/validations/transport";
import { patched, type Patch } from "@/lib/patch";

export type TransportPatch = Patch<TransportInput>;
export type TransportPatchRow = {
  mode: string;
  fromStopId: string | null;
  toStopId: string | null;
  anchorStopId: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  depPlace: string | null;
  arrPlace: string | null;
  depAt: Date | null;
  arrAt: Date | null;
  reference: string | null;
  notes: string | null;
};

type Endpoint = { stopId: string | null; place: string | null; isHome: boolean };
type EndpointPatch = { stopId?: string | null; place?: string | null; isHome?: boolean | null };
type EndpointFields = { stopField: string; placeField: string; homeField: string; label: string };

/** The one "Home plus a Stop/point" refusal (spec B2), shared with `add_transport`. */
export function homeContradictionError(fields: { stopField: string; placeField: string; homeField: string }): ActionFailure {
  return {
    success: false,
    errors: { [fields.homeField]: [`${fields.homeField} can't be true together with ${fields.stopField} or ${fields.placeField}.`] },
  };
}

function mergeEndpoint(current: Endpoint, patch: EndpointPatch, fields: EndpointFields): Endpoint | ActionFailure {
  const stopGiven = patch.stopId !== undefined;
  const placeGiven = patch.place !== undefined;
  const stopId = patch.stopId || null;
  const place = patch.place || null;
  const neither: ActionFailure = { success: false, errors: { [fields.stopField]: [`${fields.label} needs a stop or a place.`] } };

  if (patch.isHome === true) {
    if (stopId !== null || place !== null) return homeContradictionError(fields);
    return { stopId: null, place: null, isHome: true };
  }
  if (stopGiven && placeGiven) return { stopId, place, isHome: false };
  if (stopGiven) {
    if (stopId === null) {
      if (current.place == null) return neither;
      return { stopId: null, place: current.place, isHome: false };
    }
    return { stopId, place: stopId === current.stopId ? current.place : null, isHome: false };
  }
  if (placeGiven) {
    if (current.isHome && place === null) return { stopId: null, place: null, isHome: true };
    const keptStop = current.stopId != null && !current.isHome ? current.stopId : null;
    if (keptStop === null && place === null) return neither;
    return { stopId: keptStop, place, isHome: false };
  }
  if (patch.isHome === false) {
    if (current.stopId == null && current.place == null) {
      return { success: false, errors: { [fields.stopField]: [`${fields.label} needs a stop or a place when it isn't Home.`] } };
    }
    return { stopId: current.stopId, place: current.place, isHome: false };
  }
  return current;
}

const isFailure = (v: object): v is ActionFailure => "success" in v;

/** Merge a patch onto a Transport row (inline Cost fields pass through; `completeInlineCost` completes them). */
export function mergeTransportPatch(current: TransportPatchRow, patch: TransportPatch): Partial<TransportInput> | ActionFailure {
  const dep = mergeEndpoint(
    { stopId: current.fromStopId, place: current.depPlace, isHome: current.depIsHome },
    { stopId: patch.fromStopId, place: patch.depPlace, isHome: patch.depIsHome },
    { stopField: "fromStopId", placeField: "depPlace", homeField: "depIsHome", label: "Departure" },
  );
  if (isFailure(dep)) return dep;
  const arr = mergeEndpoint(
    { stopId: current.toStopId, place: current.arrPlace, isHome: current.arrIsHome },
    { stopId: patch.toStopId, place: patch.arrPlace, isHome: patch.arrIsHome },
    { stopField: "toStopId", placeField: "arrPlace", homeField: "arrIsHome", label: "Arrival" },
  );
  if (isFailure(arr)) return arr;

  return {
    mode: (patch.mode ?? current.mode) as TransportInput["mode"],
    fromStopId: dep.stopId ?? undefined,
    toStopId: arr.stopId ?? undefined,
    anchorStopId: patched(patch.anchorStopId, current.anchorStopId),
    depIsHome: dep.isHome,
    arrIsHome: arr.isHome,
    depPlace: dep.place ?? undefined,
    arrPlace: arr.place ?? undefined,
    depAt: patched(patch.depAt, current.depAt),
    arrAt: patched(patch.arrAt, current.arrAt),
    reference: patched(patch.reference, current.reference),
    notes: patched(patch.notes, current.notes),
  };
}
```

(If `patched(patch.depAt, current.depAt)` fails to unify `string | Date` with `Date`, write `patch.depAt === undefined ? current.depAt ?? undefined : patch.depAt ?? undefined`.)

`server/actions/transport.ts` `updateTransport`, top half:

```ts
/**
 * Update a Transport (PATCH, ADR 0075): merges onto the held row
 * (`lib/transport-patch.ts` — the endpoint rules); an inline Cost completes
 * from its single owned Cost.
 *
 * Looks up the transport → requireTripAccess(transport.tripId).
 */
export async function updateTransport(
  transportId: string,
  patch: TransportPatch,
): Promise<TransportActionResult> {
  const transport = await requireTransportAccess(transportId);
  const before = await db.transport.findUnique({ where: { id: transportId } });
  if (!before) notFound();

  const merged = mergeTransportPatch(before, patch);
  if ("success" in merged) return merged;
  const owned = patch.costMinor != null || patch.currency != null
    ? await db.cost.findMany({ where: { ownerType: "TRANSPORT", ownerId: transportId }, select: OWNED_COST_SELECT })
    : [];
  const inlineCost = completeInlineCost(patch, owned);
  if (inlineCost && "success" in inlineCost) return inlineCost;

  const parsed = transportSchema.safeParse({ ...merged, ...inlineCost });
  if (!parsed.success) {
    return validationResult(parsed.error);
  }
  const data = parsed.data;
  // …normalisation, stop check, zones, geocode — unchanged
```

- `await auditedUpdate("TRANSPORT", db.transport, transportId, { … }, transport.forkId ?? null);` → add `, { before }`.
- Inline cost block: the `db.cost.findMany({ … select: { id: true } })` → `const existingCosts = owned;`.
- Imports: `notFound`, `mergeTransportPatch`, `type TransportPatch` (`@/lib/transport-patch`), `completeInlineCost`, `OWNED_COST_SELECT` (`@/lib/money/cost-patch`).

`components/trip/transport-form-dialog.tsx:520-523`:

```ts
      return isEdit && transport
        ? updateTransport(transport.id, toPatch(input, TRANSPORT_CLEARABLE))
        : createTransport(tripId, input, forkId ?? undefined);
```
with `/** An edit's empty fields are clears (ADR 0075). Each end is sent whole; the home flags are always booleans. */ const TRANSPORT_CLEARABLE = ["fromStopId", "toStopId", "depPlace", "arrPlace", "depAt", "arrAt", "reference", "notes", "anchorStopId", "paidAt"] as const;` and `import { toPatch } from "@/lib/patch";`.

`lib/mcp/tools/bookings-write.ts`:
- Delete the blocks listed under **Files**.
- `update_transport` body (`:787-803`) →

```ts
    ({ transportId, ...patch }) =>
      runTool("update_transport", async () => {
        // The app's form may save an end with neither; through Claude, emptying both in one call is a mistake (deviation 5).
        if (patch.fromStopId === "" && patch.depPlace === "" && !patch.depIsHome) {
          return { success: false, errors: { fromStopId: ["Departure needs a stop or a place."] } };
        }
        if (patch.toStopId === "" && patch.arrPlace === "" && !patch.arrIsHome) {
          return { success: false, errors: { toStopId: ["Arrival needs a stop or a place."] } };
        }
        await requireRealPlanRows([
          ["transport", transportId],
          ["stop", patch.fromStopId || undefined],
          ["stop", patch.toStopId || undefined],
          ["stop", patch.anchorStopId],
        ]);
        return updateTransport(transportId, patch);
      }),
```
- `add_transport` keeps its own pre-checks, now `import { homeContradictionError } from "@/lib/transport-patch";`.
- Header: replace `:12-16` ("every PATCH/mark_* loader also scopes its lookup to `forkId: null`…") with "every Accommodation/Transport/Cost/Stop id a tool takes goes through `../real-plan.ts` first"; replace `:33-54` with: ``"The update tools pass only the fields the caller supplied (ADR 0075): `updateAccommodation`/`updateTransport`/`updateCost` merge onto the row they hold — the endpoint rules are lib/transport-patch.ts's, the paid pair, Due date and inline-Cost completion lib/money/cost-patch.ts's. `paidMinor`/`paidAt`/`settlement` are deliberately not on these tools' schemas (use `update_cost`/`mark_cost_paid` once the owned Cost exists)."``; trim `:18-24` ("Guiding principle…reproduces without the dialog") to its first sentence.

- [ ] **Step 4: Run it, expect PASS** — the four unit files; the integration file with the DB up. `grep -n "completeInlineCost\|mergeEndpoint\|loadTransportForPatch\|mergeTransportPatch\|loadAccommodationForPatch\|loadCostForPatch" lib/mcp/tools/bookings-write.ts` → nothing.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/transport-patch.ts server/actions/transport.ts components/trip/transport-form-dialog.tsx lib/mcp/tools/bookings-write.ts` + `npx tsc --noEmit` + `npx eslint lib/transport-patch.ts lib/transport-patch.test.ts server/actions/transport.ts components/trip/transport-form-dialog.tsx lib/mcp/tools/bookings-write.ts test/integration/patch-updates.test.ts`

- [ ] **Step 6: Commit** — `git add lib/transport-patch.ts lib/transport-patch.test.ts server/actions/transport.ts server/actions/transport.test.ts components/trip/transport-form-dialog.tsx components/trip/transport-form-dialog.test.tsx lib/mcp/tools/bookings-write.ts lib/mcp/tools/bookings-write.test.ts test/integration/patch-updates.test.ts` — `refactor(transport): updateTransport takes a PATCH; endpoint rules in lib/transport-patch (card 3.L)` — body: "update_transport with depIsHome true and an empty point is now Home (only a non-empty Stop or point contradicts Home, as add_transport already ruled). Emptying both ends' Stop and point stays a tool error, checked from the patch."

---

### Task 3.L.9: Stop takes a PATCH; the mode and place rules move to `lib/stop-patch.ts`

The last pair, and the one with derived fields. Rules (from `mergeStopPatch`, `trips-stops-write.ts:223-285`, generalised so a form's full input runs through them unchanged):

- **Mode.** `patch.mode` when given (the form always gives it). Otherwise: both dates → scheduled; `nights` with no dates on a scheduled Stop → rough; else the Stop's current mode.
- **Dates.** A lone date merges with the current other date on a scheduled Stop; against a Stop that ends up rough it is refused (`LONE_DATE`). Nights given with both dates must agree (`nightsMismatch`).
- **Timezone.** Only on a scheduled result (`TIMEZONE_ON_ROUGH` otherwise): patch's, else the row's, else `stopTimezone` from the merged country; `updateStop` then applies `stopTimezone` once more with the geocoded country (deviation 3).
- **Place.** The point (`lat`/`lng`/`countryCode`) is the row's unless the patch gives any of `country`, `countryCode`, `lat`, `lng` — then only the patch's point counts and a missing one is geocoded by the existing branches (deviation 4).
- **Chapter** (rough only): patch's (`null` = none), else the row's.

Why the form can't reach the refusals: its rough save always sends `nights` and no dates or timezone; its scheduled save always sends both dates and a timezone and no nights (`stop-form-dialog.tsx:218-243`).

**Files:**
- Create: `lib/stop-patch.ts`
- Test: `lib/stop-patch.test.ts`
- Modify: `server/actions/stops.ts:400-505` (`updateStop`)
- Modify: `components/trip/stop-form-dialog.tsx:252-256`
- Modify: `lib/mcp/tools/trips-stops-write.ts:1-34` (header), `:36-40` (`notFound`, `db`, `requireTripAccess` imports — `loadStopPinned` still uses them, keep), `:62` (`nightsBetween` — drop if unused), `:71-101` (move `NIGHTS_REQUIRED`, `LONE_DATE`, `TIMEZONE_ON_ROUGH`, `nightsMismatch` to the new module and import them), `:135-146` (`StopPatch` type → delete; `buildStopInput`'s arg type becomes the zod-inferred create args), `:172-286` (delete `StopRow`, `loadStopForPatch`, `mergeStopPatch`), `:428-434` (tool)
- Test: `server/actions/stops.test.ts:946-1100, 3303-3330, 3421-3450, 4024-4080`, `components/trip/stop-form-dialog.test.tsx`, `lib/mcp/tools/trips-stops-write.test.ts:421-536, 608-718`, `test/integration/patch-updates.test.ts`

**Interfaces:**
- Consumes: `stopTimezone` (3.L.1), `patched` (3.L.2), `toPatch` (3.L.2), `nightsBetween` (`lib/dates`).
- Produces (`lib/stop-patch.ts`):

```ts
export type StopPatch = { mode?: "rough" | "scheduled"; name?: string; country?: string | null; countryCode?: string | null; lat?: number | null; lng?: number | null; notes?: string | null; nights?: number; chapterId?: string | null; arriveDate?: string; departDate?: string; timezone?: string };
export type StopPatchRow = { name: string; country: string | null; countryCode: string | null; lat: number | null; lng: number | null; notes: string | null; nights: number | null; arriveDate: string | null; departDate: string | null; timezone: string | null; chapterId: string | null };
export function mergeStopPatch(current: StopPatchRow, patch: StopPatch): StopInput | ActionFailure;
export const NIGHTS_REQUIRED: ActionFailure; export const LONE_DATE: ActionFailure; export const TIMEZONE_ON_ROUGH: ActionFailure;
export function nightsMismatch(nights: number | undefined, arriveDate: string, departDate: string): ActionFailure | null;
```
`StopInput` (either variant) is assignable to `StopPatch`, so `updateStop(stop.id, input)` type-checks for any full input.
- `updateStop(stopId: string, patch: StopPatch): Promise<StopActionResult>`.

- [ ] **Step 1: Write the failing tests**

`lib/stop-patch.test.ts` — every `update_stop` merge case from `trips-stops-write.test.ts:422-516, 668-718` as a pure call, with the file's `roughStopRow()`/`scheduledStopRow()` fixtures (`:123-153`, minus `tripId`):

```ts
import { describe, expect, it } from "vitest";
import { mergeStopPatch, LONE_DATE, NIGHTS_REQUIRED, TIMEZONE_ON_ROUGH } from "./stop-patch";

const rough = { name: "Rome", country: "Italy", countryCode: "it", lat: 41.9, lng: 12.5, notes: "old notes", nights: 2, arriveDate: null, departDate: null, timezone: null, chapterId: "chap-1" };
const scheduled = { ...rough, nights: null, arriveDate: "2026-05-01", departDate: "2026-05-04", timezone: "Europe/Rome", chapterId: null };

describe("mergeStopPatch", () => {
  it("on a rough Stop with only notes keeps chapterId, mode and the point", () => {
    expect(mergeStopPatch(rough, { notes: "new notes" })).toEqual({
      mode: "rough", name: "Rome", country: "Italy", countryCode: "it", lat: 41.9, lng: 12.5, notes: "new notes", nights: 2, chapterId: "chap-1",
    });
  });
  it("on a scheduled Stop with only name keeps dates, timezone and the point", () => {
    expect(mergeStopPatch(scheduled, { name: "New name" })).toMatchObject({
      mode: "scheduled", name: "New name", arriveDate: "2026-05-01", departDate: "2026-05-04", timezone: "Europe/Rome", lat: 41.9, countryCode: "it",
    });
  });
  it("switches a scheduled Stop to rough when nights is given with no dates", () => {
    expect(mergeStopPatch(scheduled, { nights: 5 })).toMatchObject({ mode: "rough", nights: 5 });
  });
  it("switches a rough Stop to scheduled when both dates are given, the zone from the country", () => {
    expect(mergeStopPatch(rough, { arriveDate: "2026-06-01", departDate: "2026-06-03" })).toMatchObject({ mode: "scheduled", arriveDate: "2026-06-01", departDate: "2026-06-03", timezone: "Europe/Rome" });
  });
  it("a rough patch with no nights anywhere is refused", () => {
    expect(mergeStopPatch({ ...rough, nights: null }, { notes: "x" })).toEqual(NIGHTS_REQUIRED);
  });
  it("a lone date on a rough Stop is refused; on a scheduled Stop it merges with the other", () => {
    expect(mergeStopPatch(rough, { arriveDate: "2026-06-01" })).toEqual(LONE_DATE);
    expect(mergeStopPatch(rough, { departDate: "2026-06-03" })).toEqual(LONE_DATE);
    expect(mergeStopPatch(scheduled, { arriveDate: "2026-04-30" })).toMatchObject({ arriveDate: "2026-04-30", departDate: "2026-05-04" });
    expect(mergeStopPatch(scheduled, { departDate: "2026-05-06" })).toMatchObject({ arriveDate: "2026-05-01", departDate: "2026-05-06" });
  });
  it("a timezone on a Stop that ends up rough is refused (rough, or made rough by nights)", () => {
    expect(mergeStopPatch(rough, { timezone: "Europe/Rome" })).toEqual(TIMEZONE_ON_ROUGH);
    expect(mergeStopPatch(scheduled, { nights: 3, timezone: "Europe/Rome" })).toEqual(TIMEZONE_ON_ROUGH);
  });
  it("nights that disagree with both supplied dates are refused; agreeing ones accepted", () => {
    expect(mergeStopPatch(scheduled, { arriveDate: "2026-06-01", departDate: "2026-06-03", nights: 5 })).toMatchObject({ success: false, errors: { nights: [expect.stringMatching(/cover 2 nights/)] } });
    expect(mergeStopPatch(scheduled, { arriveDate: "2026-06-01", departDate: "2026-06-03", nights: 2 })).toMatchObject({ mode: "scheduled" });
  });
  // Place (deviation 4) and the form's full input:
  it("a patch that says where (country) drops the row's point so the save re-geocodes", () => {
    const m = mergeStopPatch(scheduled, { country: "France" });
    expect(m).toMatchObject({ country: "France" });
    expect(m).not.toHaveProperty("lat");
    expect(m).not.toHaveProperty("countryCode");
  });
  it("the form's rough save with No chapter and emptied notes clears both", () => {
    expect(mergeStopPatch(rough, { mode: "rough", name: "Rome", country: "Italy", nights: 2, chapterId: null, notes: null }))
      .toMatchObject({ mode: "rough", chapterId: undefined, notes: undefined });
  });
  it("the form's scheduled save is taken whole", () => {
    expect(mergeStopPatch(rough, { mode: "scheduled", name: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77, countryCode: "jp", timezone: "Asia/Tokyo", arriveDate: "2026-12-22", departDate: "2026-12-24", notes: null }))
      .toEqual({ mode: "scheduled", name: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77, countryCode: "jp", timezone: "Asia/Tokyo", arriveDate: "2026-12-22", departDate: "2026-12-24" });
  });
});
```

`server/actions/stops.test.ts` — the existing `describe("updateStop")` cases (`:946-1100`, plus `:3303-3330`, `:3421-3450`, `:4024-4080`) pass full `StopInput`s, the form's shape; they **keep their assertions**. Rewire only their `stopFindUniqueMock`: the action now reads the guard row, then the held row (that second read already existed as `before`), so a single `mockResolvedValue(row)` still serves both; where a test sequenced `mockResolvedValueOnce(guardRow).mockResolvedValueOnce(beforeRow)` (`:1052, 1069`), the `beforeRow` is now also the merge's current values — keep it. Add:

```ts
describe("updateStop (PATCH, ADR 0075)", () => {
  const held = { id: "s1", tripId: "trip-1", forkId: null, sortOrder: 0, pinned: false, name: "Rome", country: "Italy", countryCode: "it", lat: 41.9, lng: 12.5, notes: "old notes", nights: 2, arriveDate: null, departDate: null, timezone: null, chapterId: "chap-1" };
  it("a notes-only patch on a rough Stop keeps the chapter and the point, with no geocode", async () => {
    stopFindUniqueMock.mockResolvedValue(held);
    chapterFindUniqueMock.mockResolvedValue({ tripId: "trip-1", forkId: null });
    stopUpdateMock.mockResolvedValue({});
    await updateStop("s1", { notes: "new notes" });
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "s1" }, data: expect.objectContaining({ notes: "new notes", chapterId: "chap-1", lat: 41.9, lng: 12.5, countryCode: "it", nights: 2 }) });
  });
  it("an edit that sends UTC takes the geocoded country's zone, as create does", async () => {
    stopFindUniqueMock.mockResolvedValue({ ...held, nights: null, arriveDate: "2026-07-01", departDate: "2026-07-05", timezone: "UTC", chapterId: null });
    geocodePlaceDetailedMock.mockResolvedValue({ lat: 35.01, lng: 135.77, countryCode: "jp" });
    stopUpdateMock.mockResolvedValue({});
    await updateStop("s1", { mode: "scheduled", name: "Kyoto", country: "Japan", timezone: "UTC", arriveDate: "2026-07-01", departDate: "2026-07-05" });
    expect(stopUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ timezone: "Asia/Tokyo", countryCode: "jp" }) }));
  });
  it("a lone date on a rough Stop is refused before anything is written", async () => {
    stopFindUniqueMock.mockResolvedValue(held);
    const r = await updateStop("s1", { arriveDate: "2026-06-01" });
    expect(r).toEqual({ success: false, errors: { arriveDate: ["Pass both arriveDate and departDate to schedule a Stop."] } });
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });
});
```

(The second test sends `country`, as the form always does, so the place is "said" and the geocode runs; without it the row's point is kept and no geocode happens.)

`components/trip/stop-form-dialog.test.tsx` — add:

```ts
it("an edit that empties Notes and Country, or picks No chapter on a rough Stop, sends them as null (PATCH)", async () => {
  // LONDON fixture with notes; clear Notes and Country; save
  expect(updateStop).toHaveBeenCalledWith("stop-1", expect.objectContaining({ notes: null, country: null }));
  // and the rough fixture with a chapter → choose "No chapter" → save
  expect(updateStop).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ mode: "rough", chapterId: null }));
});
```
Existing `:183` (`expect(input).not.toHaveProperty("lat")`) stays and must pass: `lat` is not in the clearable list.

`lib/mcp/tools/trips-stops-write.test.ts`:
- `describe("update_stop (PATCH)")` `:421-536`: `:422-516` move to `lib/stop-patch.test.ts` (above); keep `:518` ("a non-member's stop id…") and `:528` ("a made-up stop id…"), now refused by `requireRealPlanRow`; add:

```ts
it("checks the Stop is real-plan, then forwards only the fields passed", async () => {
  updateStop.mockResolvedValue({ success: true });
  const c = await connectTestClient();
  await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, notes: "new notes" } });
  expect(updateStop).toHaveBeenCalledWith(STOP_ID, { notes: "new notes" });
});
```
- `describe("add_stop and update_stop never drop an accepted field")` `:608-718`: the `add_stop` cases (`:613-666`) stay as tool tests (`buildStopInput` is still the tool's); the `update_stop` cases (`:668-718`) move to `lib/stop-patch.test.ts` (the TIMEZONE_ON_ROUGH and nights-mismatch cases above).
- The `:778` Fork loop keeps `update_stop`.

`test/integration/patch-updates.test.ts` — add `import { updateStop } from "@/server/actions/stops";`:

```ts
describe("Stop", () => {
  it("a notes-only patch keeps the chapter, nights and the point; null clears the notes", async () => {
    const ch = await db.chapter.create({ data: { tripId: TRIP_ID, name: "South", colour: "rose", sortOrder: 1 } });
    const s = await db.stop.create({ data: { tripId: TRIP_ID, name: "Naples", country: "Italy", countryCode: "it", lat: 40.85, lng: 14.27, nights: 3, chapterId: ch.id, notes: "pizza", sortOrder: 9 } });
    expect(await updateStop(s.id, { notes: "more pizza" })).toMatchObject({ success: true });
    expect(await db.stop.findUnique({ where: { id: s.id } })).toMatchObject({ notes: "more pizza", chapterId: ch.id, nights: 3, lat: 40.85, countryCode: "it" });
    await updateStop(s.id, { notes: null });
    expect(await db.stop.findUnique({ where: { id: s.id } })).toMatchObject({ notes: null, chapterId: ch.id });
  });
});
```

(The seeded Trip is dated with several Stops by now, so the lone-Stop rule does not fire.)

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/stop-patch.test.ts server/actions/stops.test.ts components/trip/stop-form-dialog.test.tsx lib/mcp/tools/trips-stops-write.test.ts` — unresolved `./stop-patch`; `updateStop("s1", { notes })` refused by the discriminated union ("Invalid input"); the form sends `undefined`.

- [ ] **Step 3: Implement**

`lib/stop-patch.ts`:

```ts
/**
 * A Stop's PATCH rules (ADR 0075, spec 2026-10-14 card 3.L): what a partial
 * update of a Stop means, for `updateStop`. A form's save (it always names
 * its mode and sends the whole Stop) runs through the same rules and comes
 * out as it went in.
 *
 *  - Mode: the patch's; else both dates → scheduled, nights with no dates on
 *    a scheduled Stop → rough (as `make_stop_rough`), else unchanged.
 *  - A lone date merges with the other on a scheduled Stop and is refused
 *    on one that ends up rough; nights sent with both dates must agree.
 *  - A timezone only applies to a scheduled result; none sent keeps the
 *    row's, else `stopTimezone` from the country.
 *  - The point (lat/lng/countryCode) is the row's unless the patch says
 *    where (country, countryCode, lat or lng); then only the patch's point
 *    counts and `updateStop` geocodes a missing one.
 *  - The Chapter (rough only): the patch's (`null` = none), else the row's.
 *
 * The refusals name tool fields; no form can send them (spec 3.L notes).
 * Pure: no Prisma, no zod (types only).
 */
import type { ActionFailure } from "@/lib/action-result";
import type { StopInput } from "@/lib/validations/stop";
import { nightsBetween } from "@/lib/dates";
import { patched } from "@/lib/patch";
import { stopTimezone } from "@/lib/tz";

export type StopPatch = {
  mode?: "rough" | "scheduled";
  name?: string;
  country?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  nights?: number;
  chapterId?: string | null;
  arriveDate?: string;
  departDate?: string;
  timezone?: string;
};

export type StopPatchRow = {
  name: string;
  country: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  nights: number | null;
  arriveDate: string | null;
  departDate: string | null;
  timezone: string | null;
  chapterId: string | null;
};

const refusal = (field: string, message: string): ActionFailure => ({ success: false, errors: { [field]: [message] } });

export const NIGHTS_REQUIRED = refusal("nights", "Nights is required for a rough stop.");
export const LONE_DATE = refusal("arriveDate", "Pass both arriveDate and departDate to schedule a Stop.");
export const TIMEZONE_ON_ROUGH = refusal(
  "timezone",
  "A timezone only applies to a Stop with dates. Pass arriveDate and departDate too, or leave timezone out.",
);

/** `nights` alongside both dates must agree with them; the dates win otherwise, so a mismatch would be dropped. */
export function nightsMismatch(nights: number | undefined, arriveDate: string, departDate: string): ActionFailure | null {
  if (nights === undefined) return null;
  const covered = nightsBetween(arriveDate, departDate);
  if (nights === covered) return null;
  return refusal("nights", `Those dates cover ${covered} nights, not ${nights}. Pass matching nights, or leave nights out.`);
}

export function mergeStopPatch(current: StopPatchRow, patch: StopPatch): StopInput | ActionFailure {
  const hasArrive = patch.arriveDate !== undefined;
  const hasDepart = patch.departDate !== undefined;
  const bothDates = hasArrive && hasDepart;
  const wasScheduled = current.arriveDate != null;
  const mode = patch.mode ?? (bothDates || (wasScheduled && patch.nights === undefined) ? "scheduled" : "rough");

  if (mode === "rough" && hasArrive !== hasDepart) return LONE_DATE;
  if (mode === "rough" && patch.timezone !== undefined) return TIMEZONE_ON_ROUGH;
  if (bothDates) {
    const mismatch = nightsMismatch(patch.nights, patch.arriveDate as string, patch.departDate as string);
    if (mismatch) return mismatch;
  }

  const saysWhere = [patch.country, patch.countryCode, patch.lat, patch.lng].some((v) => v !== undefined);
  const point = saysWhere
    ? { countryCode: patch.countryCode ?? undefined, lat: patch.lat ?? undefined, lng: patch.lng ?? undefined }
    : { countryCode: current.countryCode ?? undefined, lat: current.lat ?? undefined, lng: current.lng ?? undefined };
  const place = {
    name: patch.name ?? current.name,
    country: patched(patch.country, current.country),
    ...Object.fromEntries(Object.entries(point).filter(([, v]) => v !== undefined)),
    ...(patched(patch.notes, current.notes) !== undefined ? { notes: patched(patch.notes, current.notes) } : {}),
  };

  if (mode === "scheduled") {
    // The schema refuses a missing date (a mode: "scheduled" patch on a rough Stop with no dates).
    const arriveDate = (patch.arriveDate ?? current.arriveDate ?? undefined) as string;
    const departDate = (patch.departDate ?? current.departDate ?? undefined) as string;
    const timezone = patch.timezone ?? current.timezone ?? stopTimezone({ countryCode: point.countryCode, country: place.country });
    return { mode, ...place, timezone, arriveDate, departDate } as StopInput;
  }

  const nights = patch.nights ?? current.nights ?? undefined;
  if (nights === undefined) return NIGHTS_REQUIRED;
  const chapterId = patched(patch.chapterId, current.chapterId);
  return { mode, ...place, nights, ...(chapterId !== undefined ? { chapterId } : {}) } as StopInput;
}
```

(Undefined-valued keys are filtered so the merged object equals the form's input exactly — the pure tests use `toEqual` and the existing form test asserts `not.toHaveProperty("lat")` on the *input*; `country` stays even when `undefined`, which `toEqual` treats as absent.)

`server/actions/stops.ts` `updateStop`, before → after (top; the two branches keep their bodies except the two lines named):

```ts
/**
 * Update a Stop (PATCH, ADR 0075): merges onto the held row
 * (`lib/stop-patch.ts` — mode, dates, place and Chapter rules), then the
 * rough or scheduled write as before. A scheduled save resolves its
 * timezone by `stopTimezone` with the final country, as `createStop` does.
 * Verifies the stop belongs to a trip the user can access.
 */
export async function updateStop(
  stopId: string,
  patch: StopPatch,
): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
  const before = await db.stop.findUnique({ where: { id: stopId } });
  if (!before) notFound();

  const merged = mergeStopPatch(before, patch);
  if ("success" in merged) return merged;
  const parsed = stopSchema.safeParse(merged);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }
  // delete the old `const before = await db.stop.findUnique({ where: { id: stopId } });` (:419)
```

- Scheduled branch `:466` `const { name, country, timezone, arriveDate, departDate, notes } = parsed.data;` stays; in the transaction's `data` (`:487`) `timezone,` → `timezone: stopTimezone({ timezone, countryCode: parsed.data.countryCode ?? updateCountryCode, country }),`.
- Imports: `stopTimezone` is already imported (3.L.1); add `mergeStopPatch`, `type StopPatch` from `@/lib/stop-patch`; `type StopInput` stays for `createStop`. `notFound` is already imported (`:3`).

`components/trip/stop-form-dialog.tsx:252-256`:

```ts
      return isEdit && stop
        ? updateStop(stop.id, toPatch<StopPatch>(input, STOP_CLEARABLE))
        : createStop(tripId, input, forkId ?? undefined);
```
with `/** An edit's empty fields are clears (ADR 0075). Not the point: an unpicked place is re-geocoded, never cleared. */ const STOP_CLEARABLE = ["country", "notes", "chapterId"] as const;`, `import { toPatch } from "@/lib/patch";`, `import type { StopPatch } from "@/lib/stop-patch";`. (`chapterId` set to `null` on a scheduled save is ignored by the merge — a scheduled result carries no Chapter.)

`lib/mcp/tools/trips-stops-write.ts`:
- Move `:75-101` to `lib/stop-patch.ts` (done above) and import `NIGHTS_REQUIRED, LONE_DATE, TIMEZONE_ON_ROUGH, nightsMismatch` from `@/lib/stop-patch`; `Failure`/`isFailure` (`:72-73`) stay for `buildStopInput`/`add_stop`.
- Delete `StopPatch` (`:135-146`); type `buildStopInput`'s parameter inline as `{ name: string; countryCode: string; country?: string; lat?: number; lng?: number; notes?: string; nights?: number; arriveDate?: string; departDate?: string; timezone?: string }`.
- Delete `:172-286` (`StopRow`, `loadStopForPatch`, `mergeStopPatch`).
- Tool body (`:428-434`) →

```ts
    ({ stopId, ...patch }) =>
      runTool("update_stop", async () => {
        await requireRealPlanRow("stop", stopId);
        return updateStop(stopId, patch);
      }),
```
- Header `:16-24` → ``"`update_trip` and `update_stop` pass only the fields the caller supplied (ADR 0075): the actions merge onto the row they hold — `updateStop` by lib/stop-patch.ts's rules (mode from the dates, the lone-date and nights checks, the Chapter carried)."``
- Drop `nightsBetween` from the imports if `grep` shows no other use.

- [ ] **Step 4: Run it, expect PASS** — the four unit files; the integration file with the DB up. Then `grep -rn "ForPatch\|merge\(Stop\|Trip\|Accommodation\|Transport\|Cost\|Reminder\|Item\|Chapter\)Patch" lib/mcp` → nothing (the eight pairs are gone), and `grep -rn "requireTripAccess" lib/mcp/tools/*.ts | grep -v test` → only `loadStopPinned` and `loadCostForMark` (not PATCH pairs).

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/stop-patch.ts server/actions/stops.ts components/trip/stop-form-dialog.tsx lib/mcp/tools/trips-stops-write.ts` + `npx tsc --noEmit` + `npx eslint lib/stop-patch.ts lib/stop-patch.test.ts server/actions/stops.ts components/trip/stop-form-dialog.tsx lib/mcp/tools/trips-stops-write.ts test/integration/patch-updates.test.ts` + `npx vitest run lib/client-zod.guard.test.ts lib/server-action-exports.test.ts`

- [ ] **Step 6: Commit** — `git add lib/stop-patch.ts lib/stop-patch.test.ts server/actions/stops.ts server/actions/stops.test.ts components/trip/stop-form-dialog.tsx components/trip/stop-form-dialog.test.tsx lib/mcp/tools/trips-stops-write.ts lib/mcp/tools/trips-stops-write.test.ts test/integration/patch-updates.test.ts` — `refactor(stops): updateStop takes a PATCH; mode and place rules in lib/stop-patch; last MCP pair gone (card 3.L)` — body: "update_stop with country/countryCode alone now re-geocodes like the app's save (was: kept the old point). An edit that sends the UTC fallback takes the geocoded country's zone, as createStop always did."
## Card 3.M — One day-assembly module (+ NAV-05)

### Notes

**Produces (for other sections / the final gate):**
- `lib/day-view-model.ts` gains `buildDayModel(rows: DayRows, date: string): DayModel` plus the exported types `DayRows`, `DayModel`. Still pure and client-safe. `components/trip/day/day-strip.tsx` (`"use client"`) imports `dotsFor` from it, so it must never import `lib/db`, `lib/surprise-visibility` (that module is `server-only`) or anything under `server/`.
- New `lib/day-reads.ts`: `readDayRows(tripId, viewerId, alongside)` and the type `DayReadContext`. This is the one query set behind every dated day. It holds the Surprise fragments, `maskSurpriseStops` and the placeholder merge.
- `lib/day-view-loader.ts`: `getDays(tripId, dates, viewerId): Promise<Array<DayViewData | "invalid" | "out-of-range" | "dateless">>`, with results in the same order as `dates`. **`getDay` is deleted**, and so is the loader's `cache()`. `DayViewData` and `getDayWeatherView` stay as they are.
- `lib/day-view-loader.cache.test.ts` is deleted in 3.M.3. Its assertions move to `lib/day-view-loader.test.ts` (`getDays` reads once) and `lib/day-reads.test.ts` (Day titles and things to do selected by Trip).
- New integration files: `test/integration/day-reads.test.ts` and `test/integration/travelling-home-loader.test.ts`. `test/integration/day-view-loader.test.ts` is rewritten to use `getDays`.
- For 3.O: `lib/day-map.ts` is imported by `lib/day-view-model.ts`. If 3.O moves it into `lib/map/`, that import moves too.

**Assumed from 3.N (reconcile, don't re-move):** `lib/day-view-loader.ts` imports `DayEntryEditor`, `AttachmentView`, `ItemDirections`, `DaylightView` and `CostRow` from `lib` and no longer from `components/` or `server/`. The code below writes them as `@/lib/plan-entity-views`, `@/lib/attachment-view`, `@/lib/day-map` (`ItemDirections`), `@/lib/daylight` (`DaylightView`) and `@/lib/money/cost-row` (`CostRow`). **Keep whatever paths 3.N actually chose; this card moves no types.** 3.N.7 moved the Surprise-reader list into `eslint.config.mjs` (`SURPRISE_VISIBILITY_READERS`); 3.M.2/3.M.3/3.M.5 edit it there.

**Deviations from the spec text (decided while drafting):**
1. **`buildDayModel(rows, date)` takes no viewer.** The viewer is used only in the read: the Surprise fragments, `maskSurpriseStops` and the placeholders all need `SurpriseVisibility`, and that comes from a `server-only` module that a client-imported `day-view-model.ts` cannot load. The masking does not depend on the date, so applying it once per read is what makes it right for every date in the window (CONTEXT.md **Surprise**). The viewer goes to `readDayRows` and `getDays` instead. The Journal's mine/others split stays in the Day view's own projection, because Today's Journal has its own shape (`loadTodaysJournal`).
2. **The strip's dot counts come from the dated Items already read.** The `item.groupBy` query goes. It counted the same rows as the dated-Item read, plus a placeholder merge done by hand. The loader's own query-shape assertion on `groupBy` becomes `not.toHaveBeenCalled()`.
3. **Bug found while drafting (proposed id TB-10; please add it to the spec's *Bugs* table in the final gate).** `projectDay` builds the whole-Trip itinerary from only the stays that touch the day being shown (`lib/day-view-loader.ts:409`). The strip's check-in and check-out dots on every other day are therefore missing: from 2026-12-04, a check-in on 2026-12-10 shows 0 dots. `buildDayModel` builds the itinerary from every stay. 3.M.3 writes the failing test first.
4. **Traveller-visible on Today, by construction (the card's "Day and Today agree").** Until now the Travelling Home's Timeline items carried no `surprise` view and no `photoUrl`. A hidden Item showed there as a plain row titled "Surprise", with no "who is planning it" badge, and Item photos never appeared. After 3.M.5 Today shows both, exactly as the Day view already does. This matches CONTEXT.md **Surprise** ("who is planning it") and **Item photo** ("wherever the Item is listed"). Flag it to Cam when the batch is reported. The Wishlist read on Today also gains `forkId: null`, which changes nothing: Wishlist ideas are trip-wide and every other Wishlist read already scopes this way (`lib/nav-counts.ts:47`, `lib/mcp/tools/reads.ts:46`).
5. NAV-05's second half ("render two neighbours each side if rapid swiping sticks") is **not built**. It stays open in the follow-ups as a watch item (3.M.5 rewrites the entry rather than striking all of it).

**Review Focus candidates:**
1. *A check-in on a day the shown day's stay does not touch.* Expected: that day's strip dot counts it (TB-10). Test: 3.M.3.
2. *The same date read as Today and as a Day view, for a surprised member.* Expected: `loadTravellingHome(...).dayPlan` deep-equals `getDays(..., [effectiveDate], ...)[0].plan`, and the placeholder shows on both with its Surprise view. Test: 3.M.5 (integration).
3. *A three-day window where only the middle day holds a Surprise placeholder.* Expected: the placeholder appears on that day only, carries `surprise`, and its strip dot counts on every panel's strip, including days outside the window. Test: 3.M.3.

---

### Task 3.M.1: `buildDayModel` — the pure day assembly

**Files:**
- Modify: `lib/day-view-model.ts:1-3` (imports) and append after `:138`
- Test: `lib/day-view-model.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `buildItinerary`, `pickDayPlan`, `isFreeFormDay`, `dayHasEntries`, `type DayPlan` (`lib/itinerary.ts`); `buildDayMapModel`, `buildItemDirections`, `type DayMapModel` (`lib/day-map.ts`); `nearbyWishlistItems`, `dayIdeasWishlist`, `type NearbyResult`, `type DayIdeaResult` (`lib/nearby.ts`); `chapterForDate` (`lib/chapters.ts`); `titlesByDate` (`lib/day-titles.ts`); `itemPhotoUrl` (`lib/item-photo.ts`); `dayNumberInTrip` (`lib/dates.ts`); `type SurpriseView` (`lib/surprise.ts`).
- Produces:

```ts
export interface DayRows {
  trip: DayTripRow;            // the Trip row as read (endDate may be null)
  startDate: string;           // trip.startDate
  endDate: string;             // trip.endDate ?? trip.startDate
  stops: DayStopRow[];         // dated real-plan Stops, masked, each with its Surprise view
  items: DayItemRow[];         // dated real-plan Items + dated real-plan placeholders
  transports: DayTransportRow[];
  accommodations: DayAccommodationRow[];  // every stay of the Trip
  wishlist: DayWishlistRow[];
  attachments: DayAttachmentRow[];
  chapters: DayChapterRow[];   // [] when Chapters are off
  dayTitles: DayTitleRow[];
  thingsToDo: DayThingToDoRow[];
}
export interface DayModel { /* see Step 3 */ }
export function buildDayModel(rows: DayRows, date: string): DayModel;
```

**Constraint:** `lib/day-view-model.ts` may call only `buildItinerary`, `pickDayPlan`, `isFreeFormDay` and `dayHasEntries` from `lib/itinerary`, and only `chapterForDate` from `lib/chapters`. `components/trip/home/phase-travelling.test.tsx:79-93` mocks those modules with exactly those exports, and 3.M.5 runs Today through this function. `orderDayEntries` and `flagTightConnections` therefore stay in the Day view's projection.

- [ ] **Step 1: Write the failing test** (append to `lib/day-view-model.test.ts`, and extend its import line with `buildDayModel, type DayRows`)

```ts
describe("buildDayModel (card 3.M)", () => {
  const stop = (o: Partial<DayRows["stops"][number]> & { id: string; name: string; arriveDate: string; departDate: string; sortOrder: number }) => ({
    country: "France", countryCode: "FR", timezone: "Europe/Paris", lat: 48.57, lng: 7.75, surprise: null, ...o,
  });
  const item = (o: Partial<DayRows["items"][number]> & { id: string; date: string }) => ({
    title: `Item ${o.id}`, category: "SIGHTSEEING", startTime: null, endTime: null, sortOrder: 0, stopId: "s-stras",
    lat: null, lng: null, address: null, link: null, booking: null, notes: null, hiddenFromShares: false,
    photoAttachmentId: null, surprise: null, ...o,
  });
  const SURPRISED = { plannerId: "u-pat", plannerName: "Pat", forIds: ["u-viv"], forNames: ["Viv"], youAreSurprised: true };
  const HOTEL = {
    id: "a-corbeau", stopId: "s-stras", name: "Hôtel Cour du Corbeau", address: "6 Rue des Couples", checkIn: "2026-12-10",
    checkOut: "2026-12-13", checkInTime: null, checkOutTime: null, confirmation: null, notes: null, lat: 48.5795, lng: 7.7498,
  };
  function rows(over: Partial<DayRows> = {}): DayRows {
    return {
      trip: { name: "Xmas", startDate: "2026-12-04", endDate: "2026-12-20", homeCurrency: "AUD", homeName: "Brisbane", homeTimezone: null, chaptersEnabled: true, roundTrip: true },
      startDate: "2026-12-04",
      endDate: "2026-12-20",
      stops: [
        stop({ id: "s-paris", name: "Paris", arriveDate: "2026-12-06", departDate: "2026-12-10", sortOrder: 0, lat: 48.8566, lng: 2.3522 }),
        stop({ id: "s-stras", name: "Strasbourg", arriveDate: "2026-12-10", departDate: "2026-12-13", sortOrder: 1 }),
      ],
      items: [
        item({ id: "i-photo", date: "2026-12-11", startTime: "09:00", lat: 48.58, lng: 7.75, photoAttachmentId: "att-1" }),
        item({ id: "i-secret", date: "2026-12-11", title: "Surprise", category: "OTHER", surprise: SURPRISED }),
      ],
      transports: [],
      accommodations: [HOTEL],
      wishlist: [
        { id: "w-near", title: "Petite France walk", category: "SIGHTSEEING", lat: 48.5809, lng: 7.7406, countryCode: "FR" },
        { id: "w-cc", title: "Tarte flambée", category: "FOOD", lat: null, lng: null, countryCode: "FR" },
      ],
      attachments: [
        { id: "att-1", filename: "a.jpg", title: null, mime: "image/jpeg", size: 1, url: "/api/attachments/att-1", uploadedById: "u-1", createdAt: new Date("2026-11-01T00:00:00Z"), targetId: "i-photo" },
      ],
      chapters: [{ id: "c-alsace", name: "Alsace", colour: "sky", startDate: "2026-12-10", endDate: "2026-12-13", sortOrder: 0 }],
      dayTitles: [{ stopId: "s-stras", dayIndex: 1, title: "Market day" }],
      thingsToDo: [{ id: "t-market", title: "Christkindelsmärik", category: "SHOPPING", startTime: "17:00", endTime: null, stopId: "s-stras" }],
      ...over,
    };
  }

  it("a planned day: its plan, Stop, title, Chapter, number, tonight, map, photo and Surprise view", () => {
    const m = buildDayModel(rows(), "2026-12-11");
    expect(m.date).toBe("2026-12-11");
    expect(m.dayPlan?.dateISO).toBe("2026-12-11");
    expect(m.hasEntries).toBe(true);
    expect(m.freeForm).toBe(false);
    expect(m.dayStop?.id).toBe("s-stras");
    expect(m.dayTitle).toEqual({ title: "Market day", stopId: "s-stras" });
    expect(m.chapter?.name).toBe("Alsace");
    expect(m.dayNumber).toBe(8);
    expect(m.totalDays).toBe(17);
    expect(m.tonight?.id).toBe("a-corbeau");
    expect(m.accommodations.map((a) => a.id)).toEqual(["a-corbeau"]);
    expect(m.dayMap.points.map((p) => p.id)).toContain("i-photo");
    expect(Object.keys(m.itemDirections)).toContain("i-photo");
    expect(m.nearby.map((n) => n.id)).toEqual(["w-near"]);
    expect(m.thingsToDo).toEqual([]); // a planned day offers no things to do
    expect(m.attachmentsByTarget["i-photo"]?.map((a) => a.id)).toEqual(["att-1"]);
    const planned = [...m.dayPlan!.timedItems, ...m.dayPlan!.untimedItems].map((e) => e.item);
    expect(planned.find((i) => i.id === "i-photo")?.photoUrl).toBe("/api/attachments/att-1");
    expect(planned.find((i) => i.id === "i-secret")).toMatchObject({ title: "Surprise", surprise: SURPRISED });
  });

  it("a free-form day with a Stop: that Stop's things to do and its Wishlist ideas", () => {
    const m = buildDayModel(rows(), "2026-12-12");
    expect(m.freeForm).toBe(true);
    expect(m.hasEntries).toBe(false);
    expect(m.thingsToDo).toEqual([{ id: "t-market", title: "Christkindelsmärik", category: "SHOPPING", startTime: "17:00", endTime: null }]);
    expect(m.ideasWishlist.map((w) => w.id)).toEqual(["w-near", "w-cc"]);
  });

  it("a gap day: no Stop, no tonight, no ideas", () => {
    const m = buildDayModel(rows(), "2026-12-16");
    expect(m.dayStop).toBeNull();
    expect(m.tonight).toBeNull();
    expect(m.thingsToDo).toEqual([]);
    expect(m.ideasWishlist).toEqual([]);
  });

  it("a date outside the Trip has no plan", () => {
    expect(buildDayModel(rows(), "2027-01-01").dayPlan).toBeNull();
  });

  it("the itinerary covers every stay, not just the day's (TB-10): a check-in shows on its own day whatever day is asked for", () => {
    const m = buildDayModel(rows(), "2026-12-05");
    expect(m.accommodations).toEqual([]);
    const checkInDay = m.itinerary.find((d) => d.dateISO === "2026-12-10");
    expect(checkInDay?.accommodationEntries.map((e) => e.kind)).toEqual(["accommodation-checkin"]);
  });

  it("days of one read share one itinerary, built once", () => {
    const r = rows();
    expect(buildDayModel(r, "2026-12-11").itinerary).toBe(buildDayModel(r, "2026-12-12").itinerary);
    expect(buildDayModel(rows(), "2026-12-11").itinerary).not.toBe(buildDayModel(r, "2026-12-11").itinerary);
  });

  it("a Trip with Chapters off has no Chapter", () => {
    expect(buildDayModel(rows({ chapters: [] }), "2026-12-11").chapter).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/day-view-model.test.ts`. Expected: `SyntaxError`/`TypeError: buildDayModel is not a function`, or tsc-style "has no exported member 'buildDayModel'".
- [ ] **Step 3: Implement.** Replace the three import lines at `lib/day-view-model.ts:1-3` with:

```ts
import { addDays, dayNumberInTrip, daysBetween, formatDayLabel, formatLongDate, nightsBetween } from "@/lib/dates";
import type { TransportMode } from "@/lib/enum-values";
import { findOutboundLeg, findReturnLeg } from "@/lib/home-base";
import { buildItinerary, pickDayPlan, isFreeFormDay, dayHasEntries, type DayPlan } from "@/lib/itinerary";
import { buildDayMapModel, buildItemDirections, type DayMapModel } from "@/lib/day-map";
import { nearbyWishlistItems, dayIdeasWishlist, type NearbyResult, type DayIdeaResult } from "@/lib/nearby";
import { chapterForDate } from "@/lib/chapters";
import { titlesByDate } from "@/lib/day-titles";
import { itemPhotoUrl } from "@/lib/item-photo";
import type { SurpriseView } from "@/lib/surprise";
```

Append after `forecastOpensOn` (`:138`):

```ts
// ── One day, assembled (card 3.M) ─────────────────────────────────────────
// The Day view (lib/day-view-loader.ts) and the Travelling Home's today
// (lib/travelling-home-loader.ts) both build their day here from the same
// rows (lib/day-reads.ts), so Day and Today agree by construction. Pure and
// client-safe: the Surprise masking is done in the read, once per read, so
// every date of a window gets the same masked rows (CONTEXT.md "Surprise").

interface DayTripRow {
  name: string; startDate: string | null; endDate: string | null; homeCurrency: string;
  homeName: string | null; homeTimezone: string | null; chaptersEnabled: boolean; roundTrip: boolean;
}
interface DayStopRow {
  id: string; name: string; country: string | null; countryCode: string | null; timezone: string | null;
  arriveDate: string | null; departDate: string | null; sortOrder: number; lat: number | null; lng: number | null;
  surprise: SurpriseView | null;
}
interface DayItemRow {
  id: string; title: string; category: string; date: string | null; startTime: string | null; endTime: string | null;
  sortOrder: number; stopId: string | null; lat: number | null; lng: number | null; address: string | null;
  link: string | null; booking: string | null; notes: string | null; hiddenFromShares: boolean;
  photoAttachmentId: string | null; surprise: SurpriseView | null;
}
interface DayTransportRow {
  id: string; mode: string; fromStopId: string | null; toStopId: string | null; depPlace: string | null; arrPlace: string | null;
  depAt: Date | null; arrAt: Date | null; depLat: number | null; depLng: number | null; arrLat: number | null; arrLng: number | null;
  reference: string | null; notes: string | null; sortOrder: number; anchorStopId: string | null; depIsHome: boolean; arrIsHome: boolean;
}
interface DayAccommodationRow {
  id: string; stopId: string; name: string; address: string | null; checkIn: string; checkOut: string;
  checkInTime: string | null; checkOutTime: string | null; confirmation: string | null; notes: string | null;
  lat: number | null; lng: number | null;
}
interface DayWishlistRow { id: string; title: string; category: string; lat: number | null; lng: number | null; countryCode: string | null }
interface DayAttachmentRow {
  id: string; filename: string; title: string | null; mime: string; size: number; url: string;
  uploadedById: string; createdAt: Date; targetId: string | null;
}
interface DayChapterRow { id: string; name: string; colour: string; startDate: string | null; endDate: string | null; sortOrder: number }
interface DayTitleRow { stopId: string; dayIndex: number; title: string }
interface DayThingToDoRow { id: string; title: string; category: string; startTime: string | null; endTime: string | null; stopId: string | null }

export interface DayRows {
  trip: DayTripRow;
  /** `trip.startDate`. */
  startDate: string;
  /** `trip.endDate`, or the start when the Trip has none. */
  endDate: string;
  stops: DayStopRow[];
  items: DayItemRow[];
  transports: DayTransportRow[];
  accommodations: DayAccommodationRow[];
  wishlist: DayWishlistRow[];
  attachments: DayAttachmentRow[];
  chapters: DayChapterRow[];
  dayTitles: DayTitleRow[];
  thingsToDo: DayThingToDoRow[];
}

export interface DayModel {
  date: string;
  /** The whole Trip, built from every stay — the strip's dots and the next departure read it. */
  itinerary: DayPlan[];
  /** Null only for a date outside the Trip. */
  dayPlan: DayPlan | null;
  hasEntries: boolean;
  freeForm: boolean;
  /** The Stop row behind `dayPlan.stop` (the arriving one on a Changeover day); null on a gap day. */
  dayStop: DayStopRow | null;
  dayTitle: { title: string; stopId: string } | null;
  chapter: DayChapterRow | null;
  dayNumber: number;
  totalDays: number;
  /** The stays that touch the day (checkIn ≤ date ≤ checkOut). */
  accommodations: DayAccommodationRow[];
  /** Tonight's bed (checkIn ≤ date < checkOut). */
  tonight: DayAccommodationRow | null;
  attachmentsById: Map<string, { url: string }>;
  attachmentsByTarget: Record<string, DayAttachmentRow[]>;
  dayMap: DayMapModel;
  itemDirections: Record<string, { google: string | null; apple: string | null }>;
  /** Wishlist ideas near the day's located Items and tonight's bed. */
  nearby: NearbyResult[];
  /** The day's Stop's things to do — a free-form day with a Stop only (CONTEXT.md "Day ideas"). */
  thingsToDo: Array<{ id: string; title: string; category: string; startTime: string | null; endTime: string | null }>;
  /** Wishlist ideas for the day's Stop (near it, or in its country); [] on a gap day. */
  ideasWishlist: DayIdeaResult[];
}

interface TripDerived {
  itinerary: DayPlan[];
  attachmentsById: Map<string, { url: string }>;
  attachmentsByTarget: Record<string, DayAttachmentRow[]>;
  titles: Map<string, { title: string; stopId: string }>;
}
const derivedByRows = new WeakMap<DayRows, TripDerived>();

/** The Trip-wide projections every day of one read shares — built once per `rows`. */
function deriveTrip(rows: DayRows): TripDerived {
  const hit = derivedByRows.get(rows);
  if (hit) return hit;
  // CONTEXT.md "Item photo" — keyed by the Attachment's own id.
  const attachmentsById = new Map(rows.attachments.map((a) => [a.id, { url: a.url }]));
  const attachmentsByTarget: Record<string, DayAttachmentRow[]> = {};
  for (const a of rows.attachments) if (a.targetId) (attachmentsByTarget[a.targetId] ??= []).push(a);
  const derived: TripDerived = {
    attachmentsById,
    attachmentsByTarget,
    titles: titlesByDate(
      rows.stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })),
      rows.dayTitles,
    ),
    itinerary: buildItinerary({
      startDate: rows.startDate,
      endDate: rows.endDate,
      // Non-null at runtime: the read keeps dated Stops only.
      stops: rows.stops.map((s) => ({
        id: s.id, name: s.name, country: s.country, timezone: s.timezone ?? "UTC",
        arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder,
      })),
      items: rows.items.map((i) => ({
        id: i.id, title: i.title, category: i.category, date: i.date, startTime: i.startTime, endTime: i.endTime,
        stopId: i.stopId, address: i.address, link: i.link, booking: i.booking, notes: i.notes,
        hiddenFromShares: i.hiddenFromShares, photoUrl: itemPhotoUrl(i, attachmentsById), surprise: i.surprise,
      })),
      transports: rows.transports.map((t) => ({
        id: t.id, mode: t.mode as TransportMode, fromStopId: t.fromStopId, toStopId: t.toStopId,
        depPlace: t.depPlace, arrPlace: t.arrPlace, depAt: t.depAt, arrAt: t.arrAt,
        reference: t.reference, notes: t.notes, depIsHome: t.depIsHome, arrIsHome: t.arrIsHome,
      })),
      // Every stay (TB-10): a day's check-in/out entries never depend on which day was asked for.
      accommodations: rows.accommodations.map((a) => ({
        id: a.id, stopId: a.stopId, name: a.name, address: a.address, checkIn: a.checkIn, checkOut: a.checkOut,
        checkInTime: a.checkInTime, checkOutTime: a.checkOutTime, confirmation: a.confirmation, notes: a.notes,
      })),
      homeTimezone: rows.trip.homeTimezone,
    }),
  };
  derivedByRows.set(rows, derived);
  return derived;
}

/** One dated day, from the rows `lib/day-reads.ts` read — the Day view's and Today's shared core. */
export function buildDayModel(rows: DayRows, date: string): DayModel {
  const trip = deriveTrip(rows);
  const dayPlan = pickDayPlan(trip.itinerary, date);
  const dayStop = rows.stops.find((s) => s.id === dayPlan?.stop?.id) ?? null;
  const freeForm = dayPlan ? isFreeFormDay(dayPlan) : false;

  const accommodations = rows.accommodations.filter((a) => a.checkIn <= date && a.checkOut >= date);
  const tonight = accommodations.find((a) => a.checkOut > date) ?? null;
  const bed = tonight ? { id: tonight.id, name: tonight.name, lat: tonight.lat, lng: tonight.lng, address: tonight.address } : null;

  const dayItems = rows.items
    .filter((i) => i.date === date)
    .map((i) => ({ id: i.id, title: i.title, lat: i.lat, lng: i.lng, address: i.address, startTime: i.startTime, sortOrder: i.sortOrder }));
  const legIds = new Set((dayPlan?.transportEntries ?? []).map((e) => e.transport.id));
  const dayMap = buildDayMapModel({
    date,
    items: dayItems,
    accommodation: bed,
    transports: rows.transports
      .filter((t) => legIds.has(t.id))
      .map((t) => ({ id: t.id, depPlace: t.depPlace, arrPlace: t.arrPlace, depLat: t.depLat, depLng: t.depLng, arrLat: t.arrLat, arrLng: t.arrLng })),
  });

  // Nearby Wishlist rail: the day's located Items + tonight's bed.
  const anchors = [
    ...dayItems.filter((i) => i.lat != null && i.lng != null).map((i) => ({ lat: i.lat!, lng: i.lng! })),
    ...(bed?.lat != null && bed?.lng != null ? [{ lat: bed.lat, lng: bed.lng }] : []),
  ];
  const nearby = nearbyWishlistItems({
    anchors,
    candidates: rows.wishlist
      .filter((w) => w.lat != null && w.lng != null)
      .map((w) => ({ id: w.id, title: w.title, category: w.category, lat: w.lat!, lng: w.lng! })),
  });

  return {
    date,
    itinerary: trip.itinerary,
    dayPlan,
    hasEntries: dayPlan != null && dayHasEntries(dayPlan),
    freeForm,
    dayStop,
    dayTitle: trip.titles.get(date) ?? null,
    chapter: chapterForDate(date, rows.chapters),
    dayNumber: dayNumberInTrip(date, rows.startDate),
    totalDays: dayNumberInTrip(rows.endDate, rows.startDate),
    accommodations,
    tonight,
    attachmentsById: trip.attachmentsById,
    attachmentsByTarget: trip.attachmentsByTarget,
    dayMap,
    itemDirections: buildItemDirections(dayMap),
    nearby,
    thingsToDo:
      freeForm && dayStop
        ? rows.thingsToDo
            .filter((t) => t.stopId === dayStop.id)
            .map(({ id, title, category, startTime, endTime }) => ({ id, title, category, startTime, endTime }))
        : [],
    ideasWishlist: dayStop
      ? dayIdeasWishlist({ stop: { lat: dayStop.lat, lng: dayStop.lng, countryCode: dayStop.countryCode }, candidates: rows.wishlist })
      : [],
  };
}
```

(The `w-cc` row in the test is matched "same country" by `dayIdeasWishlist`. If its real ordering puts the unlocated row first, assert on the set instead: `expect(new Set(...)).toEqual(new Set(["w-near","w-cc"]))`. Don't change the function.)

- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/day-view-model.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/day-view-model.ts`, then `npx tsc --noEmit`, then `npx eslint lib/day-view-model.ts lib/day-view-model.test.ts`. `vitest related` also runs the client-side `day-strip` tests, which proves the module still loads client-side.
- [ ] **Step 6: Commit.** `git add lib/day-view-model.ts lib/day-view-model.test.ts`, with the message `feat(day): buildDayModel — one pure day assembly (card 3.M)`.

---

### Task 3.M.2: `readDayRows` — one query set for a dated day

**Files:**
- Create: `lib/day-reads.ts`
- Test: `lib/day-reads.test.ts`, `test/integration/day-reads.test.ts`
- Modify: `eslint.config.mjs` (add `"lib/day-reads.ts",` as the first entry of `SURPRISE_VISIBILITY_READERS`)

**Interfaces:**
- Consumes: `type DayRows` (3.M.1); `loadSurpriseVisibility`, `maskSurpriseStops`, `type SurpriseVisibility` (`lib/surprise-visibility.ts`); `REAL_PLAN`, `WISHLIST_IDEA_WHERE`, `THINGS_TO_DO_WHERE` (`lib/plan-scope.ts`).
- Produces:

```ts
export interface DayReadContext {
  tripId: string;
  trip: DayRows["trip"];
  startDate: string;
  endDate: string;            // resolved: trip.endDate ?? trip.startDate
  visibility: SurpriseVisibility;
  /** The dated real-plan Stops, unmasked, as soon as they land (for a read that needs the Trip's today). */
  stopRows: Promise<Array<Omit<DayRows["stops"][number], "surprise">>>;
}
export function readDayRows<X>(
  tripId: string,
  viewerId: string | null,
  alongside: (ctx: DayReadContext) => Promise<X>,
): Promise<"missing" | "dateless" | { rows: DayRows; visibility: SurpriseVisibility; alongside: X }>;
```

`"dateless"` means the Trip has no `startDate`. A Trip with a start but no end reads with `endDate = startDate`; the Day view treats that case as dateless itself (3.M.3). `alongside` runs **in the same wave** as the shared reads, so neither loader adds a round trip.

- [ ] **Step 1: Write the failing tests**

`lib/day-reads.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, loadSurpriseVisibilityMock } = vi.hoisted(() => ({
  db: {
    trip: { findUnique: vi.fn() },
    stop: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
    transport: { findMany: vi.fn() },
    accommodation: { findMany: vi.fn() },
    attachment: { findMany: vi.fn() },
    chapter: { findMany: vi.fn() },
    dayTitle: { findMany: vi.fn() },
  },
  loadSurpriseVisibilityMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import { readDayRows } from "@/lib/day-reads";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, placeholderItem, MARKER_WHERE, SURPRISED_VIEW } from "@/test/helpers/surprise-visibility";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

type Where = Record<string, unknown>;
const TRIP = { name: "Paris week", startDate: "2026-12-04", endDate: "2026-12-10", homeCurrency: "AUD", homeName: "Brisbane", homeTimezone: null, chaptersEnabled: true, roundTrip: true };
const PARIS = { id: "s-paris", name: "Paris", country: "France", countryCode: "FR", timezone: "Europe/Paris", arriveDate: "2026-12-04", departDate: "2026-12-10", sortOrder: 0, lat: 48.8566, lng: 2.3522 };
const LOUVRE = {
  id: "i-louvre", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-05", startTime: "10:00", endTime: null, sortOrder: 0,
  stopId: PARIS.id, lat: null, lng: null, address: null, link: null, booking: null, notes: "Book ahead", hiddenFromShares: false, photoAttachmentId: null,
};
const none = async () => null;
const whereOf = (m: { mock: { calls: unknown[][] } }) => m.mock.calls.map(([a]) => (a as { where: Where }).where);

beforeEach(() => {
  vi.clearAllMocks();
  db.trip.findUnique.mockResolvedValue(TRIP);
  db.stop.findMany.mockResolvedValue([PARIS]);
  for (const m of [db.item.findMany, db.transport.findMany, db.accommodation.findMany, db.attachment.findMany, db.chapter.findMany, db.dayTitle.findMany]) m.mockResolvedValue([]);
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
});

describe("readDayRows (card 3.M)", () => {
  it("a missing Trip, and a Trip with no start, read nothing more", async () => {
    db.trip.findUnique.mockResolvedValueOnce(null);
    expect(await readDayRows("trip-1", "u-1", none)).toBe("missing");
    db.trip.findUnique.mockResolvedValueOnce({ ...TRIP, startDate: null, endDate: null });
    expect(await readDayRows("trip-1", "u-1", none)).toBe("dateless");
    expect(loadSurpriseVisibilityMock).not.toHaveBeenCalled();
    expect(db.stop.findMany).not.toHaveBeenCalled();
  });

  it("a Trip with a start and no end runs to its start", async () => {
    db.trip.findUnique.mockResolvedValueOnce({ ...TRIP, endDate: null });
    const read = await readDayRows("trip-1", "u-1", none);
    if (typeof read === "string") throw new Error(read);
    expect([read.rows.startDate, read.rows.endDate, read.rows.trip.endDate]).toEqual(["2026-12-04", "2026-12-04", null]);
  });

  it("selects Day titles and things to do by the Trip, not by a list of Stop ids", async () => {
    await readDayRows("trip-1", "u-1", none);
    expect(db.dayTitle.findMany).toHaveBeenCalledWith({
      where: { stop: { tripId: "trip-1", forkId: null } },
      select: { stopId: true, dayIndex: true, title: true },
    });
    expect(db.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1", forkId: null, stopId: { not: null }, date: null } }),
    );
  });

  it("skips the Chapters read when Chapters are off", async () => {
    db.trip.findUnique.mockResolvedValueOnce({ ...TRIP, chaptersEnabled: false });
    const read = await readDayRows("trip-1", "u-1", none);
    expect(db.chapter.findMany).not.toHaveBeenCalled();
    expect(typeof read !== "string" && read.rows.chapters).toEqual([]);
  });

  it("asks the visibility loader for this viewer first, and spreads its fragments into every Item, Accommodation, Attachment and Day title read", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ viewerId: "u-1" }));
    await readDayRows("trip-1", "u-1", none);
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith("trip-1", "u-1");
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, db.stop.findMany);
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, db.item.findMany);
    expect(whereOf(db.item.findMany)).toHaveLength(3); // dated, Wishlist ideas, things to do — in that order
    for (const w of whereOf(db.item.findMany)) expect(w).toMatchObject({ tripId: "trip-1", forkId: null, ...MARKER_WHERE.item });
    expect(whereOf(db.accommodation.findMany)[0]).toMatchObject({ forkId: null, ...MARKER_WHERE.accommodation });
    expect(whereOf(db.attachment.findMany)[0]).toEqual({ tripId: "trip-1", ...MARKER_WHERE.attachment });
    expect(whereOf(db.dayTitle.findMany)[0]).toMatchObject(MARKER_WHERE.dayTitle);
    expect(JSON.stringify(db.stop.findMany.mock.calls[0][0])).not.toContain("surpriseMarker");
    expect(JSON.stringify(db.transport.findMany.mock.calls[0][0])).not.toContain("surpriseMarker");
  });

  it("runs the caller's reads in the same wave, handing them the Trip, its range and the viewer's fragments", async () => {
    let release!: (v: unknown[]) => void;
    db.stop.findMany.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const seen: unknown[] = [];
    const pending = readDayRows("trip-1", "u-1", async (ctx) => {
      seen.push({ tripId: ctx.tripId, start: ctx.startDate, end: ctx.endDate, where: ctx.visibility.where });
      return (await ctx.stopRows).length;
    });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(db.dayTitle.findMany).toHaveBeenCalled();
    expect(db.item.findMany).toHaveBeenCalledTimes(3);
    release([PARIS]);
    const read = await pending;
    if (typeof read === "string") throw new Error(read);
    expect(read.alongside).toBe(1);
    expect(seen[0]).toEqual({ tripId: "trip-1", start: "2026-12-04", end: "2026-12-10", where: NO_SURPRISES.where });
  });

  it("Surprise: a hidden Stop keeps its shell with its view; a hidden dated real-plan Item becomes a placeholder; a Fork's or an undated one does not", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(
      hiddenVisibility({
        viewerId: "u-1",
        hiddenStopIds: [PARIS.id],
        placeholders: [
          placeholderItem({ id: "i-dinner", stopId: PARIS.id, date: "2026-12-06", startTime: "19:30" }),
          placeholderItem({ id: "i-fork", stopId: PARIS.id, date: "2026-12-06", forkId: "fork-1" }),
          placeholderItem({ id: "i-todo", stopId: PARIS.id, date: null }),
        ],
      }),
    );
    db.item.findMany.mockImplementation(async ({ where }: { where: Where }) => (where.date !== null ? [LOUVRE] : []));
    const read = await readDayRows("trip-1", "u-1", none);
    if (typeof read === "string") throw new Error(read);
    expect(read.rows.stops[0]).toMatchObject({ id: PARIS.id, name: "Paris", surprise: SURPRISED_VIEW });
    expect(read.rows.items.map((i) => i.id)).toEqual(["i-louvre", "i-dinner"]);
    expect(read.rows.items[0].surprise).toBeNull();
    expect(read.rows.items[1]).toMatchObject({ title: "Surprise", category: "OTHER", date: "2026-12-06", startTime: "19:30", notes: null, surprise: SURPRISED_VIEW });
    expect(read.visibility.hiddenStopIds).toEqual([PARIS.id]);
  });
});
```

`test/integration/day-reads.test.ts` (real Postgres, same scaffolding as `test/integration/plan-reads.test.ts`):

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { readDayRows } from "@/lib/day-reads";

// Real Postgres (npm run test:integration). lib/day-reads.test.ts mocks the
// db; only a real database proves the selects, the plan scope and the
// Surprise fragments are ones Postgres accepts and applies.
const PLANNER = "it-dayreads-planner";
const MEMBER = "it-dayreads-member";
const TRIP_ID = "it-dayreads-trip";
const FORK_ID = "it-dayreads-fork";
const PORTO = "it-dayreads-porto";
const SECRET = "it-dayreads-secret";
const FORK_STOP = "it-dayreads-seville";
const none = async () => null;

describe.skipIf(process.env.INTEGRATION !== "1")("readDayRows (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: PLANNER }, update: {}, create: { id: PLANNER, email: "dayreads-planner@example.test", name: "Pat" } });
    await db.user.upsert({ where: { id: MEMBER }, update: {}, create: { id: MEMBER, email: "dayreads-member@example.test", name: "Viv" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades members, forks, stops, items, stays, day titles
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Day reads", homeCurrency: "AUD", createdById: PLANNER, forksEnabled: true, chaptersEnabled: true,
        startDate: "2027-06-01", endDate: "2027-06-07",
        members: { create: [{ userId: PLANNER, role: "owner" }, { userId: MEMBER, role: "member" }] },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: PLANNER } });
    await db.stop.createMany({
      data: [
        { id: PORTO, tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, sortOrder: 0 },
        // A live Surprise (departs in the future) hidden from MEMBER.
        {
          id: SECRET, tripId: TRIP_ID, name: "IT Secret", timezone: "Europe/Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-07", nights: 3, sortOrder: 1,
          surprisePlannerId: PLANNER, surpriseForIds: JSON.stringify([MEMBER]),
        },
        { id: FORK_STOP, tripId: TRIP_ID, forkId: FORK_ID, name: "IT Seville", timezone: "Europe/Madrid", arriveDate: "2027-06-01", departDate: "2027-06-07", nights: 6, sortOrder: 0 },
      ],
    });
    await db.item.createMany({
      data: [
        { id: "it-dr-tram", tripId: TRIP_ID, stopId: PORTO, title: "IT Tram 22", category: "ACTIVITY", date: "2027-06-02", sortOrder: 0 },
        // A Surprise Item on a seen Stop: MEMBER gets a placeholder on its day.
        { id: "it-dr-dinner", tripId: TRIP_ID, stopId: PORTO, title: "IT Birthday dinner", category: "FOOD", date: "2027-06-03", startTime: "19:30", sortOrder: 1, surprisePlannerId: PLANNER, surpriseForIds: JSON.stringify([MEMBER]) },
        // Inside the Surprise Stop: hidden from MEMBER, no placeholder (only a root Item gets one).
        { id: "it-dr-inside", tripId: TRIP_ID, stopId: SECRET, title: "IT Hidden spa", category: "ACTIVITY", date: "2027-06-05", sortOrder: 0 },
        { id: "it-dr-idea", tripId: TRIP_ID, title: "IT Port lodge tour", category: "FOOD", sortOrder: 0 },
        { id: "it-dr-todo", tripId: TRIP_ID, stopId: PORTO, title: "IT Livraria Lello", category: "SIGHTSEEING", sortOrder: 0 },
        { id: "it-dr-fork", tripId: TRIP_ID, forkId: FORK_ID, stopId: FORK_STOP, title: "IT Flamenco", category: "NIGHTLIFE", date: "2027-06-02", sortOrder: 0 },
      ],
    });
    await db.accommodation.create({
      data: { id: "it-dr-villa", tripId: TRIP_ID, stopId: SECRET, name: "IT Secret villa", checkIn: "2027-06-04", checkOut: "2027-06-07" },
    });
    await db.dayTitle.createMany({
      data: [
        { stopId: PORTO, dayIndex: 1, title: "IT Tram day" },
        { stopId: SECRET, dayIndex: 0, title: "IT The big reveal" },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the surprised member: the Stop's shell, a placeholder on the Item's day, nothing from inside, no Fork rows", async () => {
    const read = await readDayRows(TRIP_ID, MEMBER, none);
    if (typeof read === "string") throw new Error(read);
    const { rows } = read;
    expect(rows.stops.map((s) => s.id)).toEqual([PORTO, SECRET]);
    expect(rows.stops.find((s) => s.id === SECRET)?.surprise?.youAreSurprised).toBe(true);
    expect(rows.items.map((i) => [i.id, i.title, i.date])).toEqual([
      ["it-dr-tram", "IT Tram 22", "2027-06-02"],
      ["it-dr-dinner", "Surprise", "2027-06-03"],
    ]);
    expect(rows.items[1].surprise?.youAreSurprised).toBe(true);
    expect(rows.accommodations).toEqual([]);
    expect(rows.dayTitles.map((t) => t.title)).toEqual(["IT Tram day"]);
    expect(rows.wishlist.map((w) => w.id)).toEqual(["it-dr-idea"]);
    expect(rows.thingsToDo.map((t) => t.id)).toEqual(["it-dr-todo"]);
    expect(JSON.stringify(rows)).not.toMatch(/Birthday dinner|Hidden spa|Secret villa|big reveal|Seville|Flamenco/);
  });

  it("the planner sees inside, with their own Surprise's view for the badge", async () => {
    const read = await readDayRows(TRIP_ID, PLANNER, none);
    if (typeof read === "string") throw new Error(read);
    const { rows } = read;
    expect(rows.items.map((i) => i.id).sort()).toEqual(["it-dr-dinner", "it-dr-inside", "it-dr-tram"]);
    expect(rows.items.find((i) => i.id === "it-dr-dinner")).toMatchObject({ title: "IT Birthday dinner", surprise: { youAreSurprised: false } });
    expect(rows.accommodations.map((a) => a.id)).toEqual(["it-dr-villa"]);
    expect(rows.dayTitles).toHaveLength(2);
  });
});
```

(If a column in the fixtures has a different name or required field in `prisma/schema.prisma`, for example `nights` or the `members` role, follow the schema and `test/integration/plan-reads.test.ts`. The assertions stay as written.)

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/day-reads.test.ts`. Expected: `Failed to resolve import "@/lib/day-reads"`.
- [ ] **Step 3: Implement** `lib/day-reads.ts`:

```ts
/**
 * The one query set behind a dated day (card 3.M): the Day view's carousel
 * window (lib/day-view-loader.ts `getDays`) and the Travelling Home's today
 * (lib/travelling-home-loader.ts) read these rows and assemble them with
 * `buildDayModel` (lib/day-view-model.ts), so Day and Today agree by
 * construction.
 *
 * Real plan only — policy (not a BND-2 spelling exemption): dated views
 * ignore `?plan=` (architecture-sitrep-2026-09-22.md).
 *
 * Surprise (ADR 0051, CONTEXT.md "Surprise"): the visibility loader runs for
 * `viewerId` before the wave and its fragments go into every Item,
 * Accommodation, Attachment and Day title read, so nothing inside a Surprise
 * hidden from the viewer leaves the database. Stops keep their shell with
 * their Surprise view; a hidden dated real-plan Item joins as a placeholder
 * titled "Surprise". Done once per read, so every date assembled from these
 * rows is masked the same way.
 *
 * `alongside` is the caller's own reads (the Day view's Costs and Journal
 * window; Today's whole Costs, Journal and slug), run in the same wave.
 */
import { db } from "@/lib/db";
import { THINGS_TO_DO_WHERE, WISHLIST_IDEA_WHERE, REAL_PLAN } from "@/lib/plan-scope";
import { loadSurpriseVisibility, maskSurpriseStops, type SurpriseVisibility } from "@/lib/surprise-visibility";
import type { DayRows } from "@/lib/day-view-model";

export interface DayReadContext {
  tripId: string;
  trip: DayRows["trip"];
  startDate: string;
  /** `trip.endDate`, or the start when the Trip has none. */
  endDate: string;
  visibility: SurpriseVisibility;
  /** The dated real-plan Stops, unmasked, as soon as they land — for a read that needs the Trip's today. */
  stopRows: Promise<Array<Omit<DayRows["stops"][number], "surprise">>>;
}

export async function readDayRows<X>(
  tripId: string,
  viewerId: string | null,
  alongside: (ctx: DayReadContext) => Promise<X>,
): Promise<"missing" | "dateless" | { rows: DayRows; visibility: SurpriseVisibility; alongside: X }> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { name: true, startDate: true, endDate: true, homeCurrency: true, homeName: true, homeTimezone: true, chaptersEnabled: true, roundTrip: true },
  });
  // The callers have already checked access; a missing row is a bad link.
  if (!trip) return "missing";
  if (!trip.startDate) return "dateless";
  const startDate = trip.startDate;
  const endDate = trip.endDate ?? trip.startDate;

  // Known before the wave, so every query below leaves the hidden inside in the database.
  const v = await loadSurpriseVisibility(tripId, viewerId);

  // `.then((rows) => rows)`: one settled promise that both the wave and `alongside` consume.
  const stopRows = db.stop
    .findMany({
      // Rough (date-less) Stops don't appear on a dated day.
      where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, country: true, countryCode: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true, lat: true, lng: true },
    })
    .then((rows) => rows);

  const [stops, itemRows, transports, accommodations, wishlist, attachments, chapters, dayTitles, thingsToDo, extra] = await Promise.all([
    stopRows,
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, date: { not: null }, ...v.where.item },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true, title: true, category: true, date: true, startTime: true, endTime: true, sortOrder: true, stopId: true,
        lat: true, lng: true, address: true, link: true, booking: true, notes: true, hiddenFromShares: true, photoAttachmentId: true,
      },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, mode: true, fromStopId: true, toStopId: true, depPlace: true, arrPlace: true, depAt: true, arrAt: true,
        depLat: true, depLng: true, arrLat: true, arrLng: true, reference: true, notes: true, sortOrder: true,
        anchorStopId: true, depIsHome: true, arrIsHome: true,
      },
    }),
    // Every stay of the Trip; buildDayModel keeps the ones that touch a day.
    db.accommodation.findMany({
      where: { tripId, ...REAL_PLAN, ...v.where.accommodation },
      orderBy: { checkIn: "asc" },
      select: {
        id: true, stopId: true, name: true, address: true, checkIn: true, checkOut: true,
        checkInTime: true, checkOutTime: true, confirmation: true, notes: true, lat: true, lng: true,
      },
    }),
    // Wishlist ideas (trip-wide, unscheduled — ADR 0022), located or not: the nearby rail and Day ideas.
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, ...WISHLIST_IDEA_WHERE, ...v.where.item },
      select: { id: true, title: true, category: true, lat: true, lng: true, countryCode: true },
    }),
    db.attachment.findMany({
      where: { tripId, ...v.where.attachment },
      orderBy: { createdAt: "asc" },
      select: { id: true, filename: true, title: true, mime: true, size: true, url: true, uploadedById: true, createdAt: true, targetId: true },
    }),
    // A Trip with Chapters off renders as if it had none — skip the query.
    trip.chaptersEnabled
      ? db.chapter.findMany({
          where: { tripId, ...REAL_PLAN },
          orderBy: { startDate: "asc" },
          select: { id: true, name: true, colour: true, startDate: true, endDate: true, sortOrder: true },
        })
      : Promise.resolve([]),
    // Day titles through the Stop (spec 2026-10-06 §B), so they join this wave.
    db.dayTitle.findMany({
      where: { stop: { tripId, ...REAL_PLAN }, ...v.where.dayTitle },
      select: { stopId: true, dayIndex: true, title: true },
    }),
    // Every Stop's things to do (ADR 0044); buildDayModel picks the day's Stop.
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE, ...v.where.item },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, category: true, startTime: true, endTime: true, stopId: true },
    }),
    alongside({ tripId, trip, startDate, endDate, visibility: v, stopRows }),
  ]);

  const placeholders = v.placeholderItems.filter((p) => p.forkId === null && p.date !== null);
  const items: DayRows["items"] = [
    ...itemRows.map((it) => ({ ...it, surprise: v.views.items.get(it.id) ?? null })),
    ...placeholders.map((p) => ({
      id: p.id, title: p.title, category: p.category, date: p.date, startTime: p.startTime, endTime: p.endTime,
      sortOrder: p.sortOrder, stopId: p.stopId, lat: p.lat, lng: p.lng, address: p.address, link: p.link,
      booking: p.booking, notes: p.notes, hiddenFromShares: p.hiddenFromShares, photoAttachmentId: p.photoAttachmentId,
      surprise: p.surprise,
    })),
  ];

  return {
    rows: {
      trip, startDate, endDate,
      stops: maskSurpriseStops(stops, v, v.views.stops),
      items, transports, accommodations, wishlist, attachments, chapters, dayTitles, thingsToDo,
    },
    visibility: v,
    alongside: extra,
  };
}
```

Guard: in `eslint.config.mjs`, add `"lib/day-reads.ts",` at the top of `SURPRISE_VISIBILITY_READERS` (`eslint.config.test.ts` then checks it exists and lint checks it imports `@/lib/surprise-visibility`).

- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/day-reads.test.ts eslint.config.test.ts`. If the local DB is up, also run `npm run test:integration -- test/integration/day-reads.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/day-reads.ts`, then `npx tsc --noEmit`, then `npx eslint lib/day-reads.ts lib/day-reads.test.ts test/integration/day-reads.test.ts eslint.config.mjs eslint.config.test.ts`.
- [ ] **Step 6: Commit.** `git add lib/day-reads.ts lib/day-reads.test.ts test/integration/day-reads.test.ts eslint.config.mjs eslint.config.test.ts`, with the message `feat(day): readDayRows — one query set for a dated day (card 3.M)`.

---

### Task 3.M.3: `getDays` — the Day view reads its window once (NAV-05, TB-10)

**Files:**
- Modify: `lib/day-view-loader.ts`. The header (`:1-12`) and imports (`:14-53`) change; `loadDayTripDataUncached`/`loadDayTripData`/`DayTripData` (`:132-343`) are deleted; `loadDayDateData` (`:345-381`) is deleted; `getDay` (`:383-399`) is replaced by `getDays`; `projectDay` (`:401-813`) is replaced by `shareAcrossDays` + `projectDayView`. `DayViewData` (`:58-130`) and `getDayWeatherView`/`DayWeatherView` (`:815-863`) stay unchanged.
- Modify: `lib/day-view-loader.test.ts` (mocks plus the cases listed below)
- Delete: `lib/day-view-loader.cache.test.ts` (its two assertions now live in `lib/day-view-loader.test.ts` and `lib/day-reads.test.ts`)
- Modify: `test/integration/day-view-loader.test.ts` (`getDay` → `getDays`, plus a Journal window)
- Modify: `eslint.config.mjs`. Delete the `"lib/day-view-loader.ts",` entry from `SURPRISE_VISIBILITY_READERS` and put this comment above the list: `// lib/nav-counts.ts and lib/next-steps-loader.ts are not listed: they read through lib/flags-loader.ts's loadFlagRows (listed), which applies it. lib/day-view-loader.ts reads through lib/day-reads.ts's readDayRows (listed), and its own Cost read takes the fragment from readDayRows's context.`
- Temporarily keep `export const getDay = async (tripId: string, date: string, viewerId: string) => (await getDays(tripId, [date], viewerId))[0];` at the bottom of `lib/day-view-loader.ts` so `app/(app)/trips/[tripId]/day/[date]/page.tsx:9,44-46` still compiles. 3.M.4 deletes it.

**Interfaces:**
- Consumes: `readDayRows`, `type DayReadContext` (3.M.2); `buildDayModel`, `type DayModel`, `type DayRows` (3.M.1).
- Produces: `export async function getDays(tripId: string, dates: readonly string[], viewerId: string): Promise<Array<DayViewData | "invalid" | "out-of-range" | "dateless">>`. Results come back in input order, one per input date. Dates that clamp to the same day each get their own entry; the page dedupes. If no date is well-formed, nothing is read.

- [ ] **Step 1: Write the failing tests.** Edit `lib/day-view-loader.test.ts`:
  1. `:3-6` header comment: `getDays() runs the Day view's reads (lib/day-reads.ts + its own Costs and Journal window) against per-model db mocks …`.
  2. `:71`: `import { getDays, getDayWeatherView } from "@/lib/day-view-loader";`
  3. `:194-198`, which replaces `loadDay`:

     ```ts
     async function one(date: string) {
       return (await getDays(TRIP_ID, [date], VIEWER))[0];
     }
     async function loadDay(date: string) {
       const out = await one(date);
       if (typeof out === "string") throw new Error(`expected DayViewData, got ${out}`);
       return out;
     }
     ```
  4. `:207-210, 216-217`: `getDay(TRIP_ID, X, VIEWER)` → `one(X)` (5 sites).
  5. `:220`, test title: `"… strip of every day with counts from the dated Items"`. Then `:257-263` (the `itemGroupByMock` `toHaveBeenCalledWith` block and its comment) becomes:

     ```ts
     // The dot counts come from the dated Items already read (card 3.M) — no second grouped query.
     expect(itemGroupByMock).not.toHaveBeenCalled();
     ```
     `:179` (`itemGroupByMock.mockResolvedValue(...)`) is deleted. The mock itself stays declared so `not.toHaveBeenCalled` still works.
  6. `:358-367`, the Journal fixtures gain their date (this is mock data): `coEntry` and `myEntry` get `date: "2026-12-12"`, and `coPhoto` gets `targetId: "2026-12-12"`.
  7. `:419`, test title: `"spreads the fragments into every Item read, Accommodations, Attachments, Costs and Day titles"`. `:424` becomes `expect(itemGroupByMock).not.toHaveBeenCalled();`.
  8. Append a TB-10 case to `describe("getDay")` (rename that describe to `"getDays — one day"`):

     ```ts
     it("strip dots count a stay's check-in and check-out on their own days, whatever day is shown (TB-10)", async () => {
       const d = await loadDay("2026-12-04"); // the Hôtel's stay (12-10 → 12-14) does not touch this day
       const count = (iso: string) => d.strip.dates.find((s) => s.iso === iso)?.count;
       expect(count("2026-12-10")).toBe(1);
       expect(count("2026-12-14")).toBe(1);
     });
     ```
  9. Append a new describe:

     ```ts
     describe("getDays — the carousel window in one read (NAV-05)", () => {
       const dateOf = (d: Awaited<ReturnType<typeof one>>) => (typeof d === "string" ? d : d.date);

       it("reads every query once for three dates, the Journal with one `in` list", async () => {
         const days = await getDays(TRIP_ID, ["2026-12-12", "2026-12-11", "2026-12-13"], VIEWER);
         expect(days.map(dateOf)).toEqual(["2026-12-12", "2026-12-11", "2026-12-13"]);
         for (const m of [tripFindUniqueMock, loadSurpriseVisibilityMock, stopFindManyMock, transportFindManyMock, accommodationFindManyMock, costFindManyMock, chapterFindManyMock, dayTitleFindManyMock, journalEntryFindManyMock])
           expect(m).toHaveBeenCalledTimes(1);
         expect(itemFindManyMock).toHaveBeenCalledTimes(3); // dated, Wishlist ideas, things to do
         expect(itemGroupByMock).not.toHaveBeenCalled();
         expect(journalEntryFindManyMock.mock.calls[0][0].where).toEqual({ tripId: TRIP_ID, date: { in: ["2026-12-12", "2026-12-11", "2026-12-13"] } });
         const photoReads = attachmentFindManyMock.mock.calls.map(([a]) => (a as { where: Where }).where).filter((w) => w.targetType === "JOURNAL");
         expect(photoReads).toEqual([{ tripId: TRIP_ID, targetType: "JOURNAL", targetId: { in: ["2026-12-12", "2026-12-11", "2026-12-13"] } }]);
       });

       it("answers each date on its own: malformed, beyond the buffer, clamped; clamped twins read one Journal date", async () => {
         const days = await getDays(TRIP_ID, ["nope", "2026-12-01", "2026-12-02", "2026-12-04"], VIEWER);
         expect(days.map(dateOf)).toEqual(["invalid", "out-of-range", "2026-12-04", "2026-12-04"]);
         expect(journalEntryFindManyMock.mock.calls[0][0].where.date).toEqual({ in: ["2026-12-04"] });
       });

       it("reads nothing when no date is well-formed", async () => {
         expect(await getDays(TRIP_ID, ["nope", "2026-12-1"], VIEWER)).toEqual(["invalid", "invalid"]);
         expect(tripFindUniqueMock).not.toHaveBeenCalled();
       });

       it("a missing Trip is invalid; a Trip with no end, or no dates, is dateless", async () => {
         tripFindUniqueMock.mockResolvedValueOnce(null);
         expect(await getDays(TRIP_ID, ["2026-12-12"], VIEWER)).toEqual(["invalid"]);
         tripFindUniqueMock.mockResolvedValueOnce({ ...TRIP, endDate: null });
         expect(await getDays(TRIP_ID, ["2026-12-12", "x"], VIEWER)).toEqual(["dateless", "invalid"]);
         tripFindUniqueMock.mockResolvedValueOnce({ ...TRIP, startDate: null, endDate: null });
         expect(await getDays(TRIP_ID, ["2026-12-12"], VIEWER)).toEqual(["dateless"]);
       });

       it("each day keeps its own Journal", async () => {
         const entry = (id: string, date: string, body: string) => ({ id, body, date, authorId: CO, updatedAt: new Date(`${date}T20:00:00Z`), hiddenFromShares: false, author: traveller(CO, "Sam") });
         setup({ today: "2026-12-12", journal: [entry("j-11", "2026-12-11", "Petite France"), entry("j-12", "2026-12-12", "Snow!")] });
         const [d11, d12, d13] = await getDays(TRIP_ID, ["2026-12-11", "2026-12-12", "2026-12-13"], VIEWER);
         if (typeof d11 === "string" || typeof d12 === "string" || typeof d13 === "string") throw new Error("expected three days");
         expect(d11.journal.others.map((o) => o.body)).toEqual(["Petite France"]);
         expect(d12.journal.others.map((o) => o.body)).toEqual(["Snow!"]);
         expect(d13.journal.others).toEqual([]);
       });

       it("Surprise holds on every day of the window: the placeholder on its own day only, counted on every strip", async () => {
         loadSurpriseVisibilityMock.mockResolvedValue(
           hiddenVisibility({
             viewerId: VIEWER,
             hiddenStopIds: [STRASBOURG.id],
             placeholders: [placeholderItem({ id: "i-dinner", stopId: COLMAR.id, date: "2026-12-14", startTime: "19:30" })],
           }),
         );
         const days = await getDays(TRIP_ID, ["2026-12-13", "2026-12-14", "2026-12-15"], VIEWER);
         const ids = days.map((d) => (typeof d === "string" ? d : [...d.plan.timedItems, ...d.plan.untimedItems].map((e) => e.item.id)));
         expect(ids).toEqual([[], ["i-dinner"], []]);
         const d14 = days[1];
         if (typeof d14 === "string") throw new Error(d14);
         expect(d14.plan.timedItems[0].item).toMatchObject({ title: "Surprise", surprise: SURPRISED_VIEW });
         expect(d14.editor.items["i-dinner"]).toMatchObject({ title: "Surprise", notes: null });
         for (const d of days) if (typeof d !== "string") expect(d.strip.dates.find((s) => s.iso === "2026-12-14")?.count).toBe(2); // placeholder + check-out
         // A day outside the window still counts the dated Items (three on 12-11).
         for (const d of days) if (typeof d !== "string") expect(d.strip.dates.find((s) => s.iso === "2026-12-11")?.count).toBe(3);
       });
     });
     ```
     (`placeholderItem`, `hiddenVisibility`, `SURPRISED_VIEW` and `Where` are already imported/declared in this file.)

  `test/integration/day-view-loader.test.ts`: switch `:3` to `import { getDays } from "@/lib/day-view-loader";` and add `const one = async (d: string) => (await getDays(TRIP_ID, [d], USER))[0];`. Use `one(...)` at `:45` and `:63`. Replace the "three neighbouring days" case (`:58-61`) with:

  ```ts
  it("serves the Day page's window from one read, each day with its own Journal", async () => {
    await db.user.upsert({ where: { id: CO }, update: {}, create: { id: CO, email: "day-co@example.test", name: "Day Co" } });
    await db.tripMember.create({ data: { tripId: TRIP_ID, userId: CO, role: "member" } });
    await db.journalEntry.create({ data: { tripId: TRIP_ID, date: "2027-05-02", authorId: CO, body: "IT Custard tarts" } });
    const days = await getDays(TRIP_ID, ["2027-05-02", "2027-05-01", "2027-05-03"], USER);
    expect(days.map((d) => (typeof d === "string" ? d : d.dayNumber))).toEqual([2, 1, 3]);
    const bodies = days.map((d) => (typeof d === "string" ? d : d.journal.others.map((o) => o.body)));
    expect(bodies).toEqual([["IT Custard tarts"], [], []]);
  });
  ```
  Add `const CO = "it-day-co";` beside `USER`. Add `await db.journalEntry.deleteMany({ where: { authorId: CO } });` to `afterAll`, before the Trip delete. The Trip cascade removes the rest. If the membership model is not `tripMember`, use whatever `members: { create }` in this file's `beforeEach` writes to.

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/day-view-loader.test.ts`. Expected: `getDays is not a function` across the file, and once `getDays` exists, the TB-10 case fails with `expected 0 to be 1`.
- [ ] **Step 3: Implement.** In `lib/day-view-loader.ts`:

Header (`:1-12`):

```ts
/**
 * Day view loader (spec 2026-09-27 §C "Data"; card 3.M, NAV-05).
 *
 * `getDays` reads the carousel window — the day shown and its neighbours —
 * once: the shared rows through `readDayRows` (lib/day-reads.ts), plus this
 * view's own Costs (the edit dialogs pre-fill from them) and every
 * Traveller's Journal for the window's dates, in the same wave. Each date is
 * assembled by `buildDayModel` (lib/day-view-model.ts, shared with the
 * Travelling Home) and dressed for the page by `projectDayView`.
 * `getDayWeatherView` is separate so the page can await it inside a Suspense
 * boundary (DAY_VIEW §4) — weather never blocks the day's plan.
 *
 * Policy (not a BND-2 spelling exemption): the dated Day view always shows the
 * real plan and ignores `?plan=` — see architecture-sitrep-2026-09-22.md.
 */
```

Imports (`:14-53`) become exactly these. The five type imports stay on whatever paths 3.N left them:

```ts
import { db } from "@/lib/db";
import { addDays, daysBetween, formatDayLabel } from "@/lib/dates";
import { instantToZonedTime } from "@/lib/tz";
import { tripTodayISO } from "@/lib/trip-today";
import { orderDayEntries, type DayPlan, type OrderedDay } from "@/lib/itinerary";
import type { DayMapModel } from "@/lib/day-map";
import type { NearbyResult } from "@/lib/nearby";
import { flagTightConnections } from "@/lib/flags";
import { daylight, utcHmToZone } from "@/lib/daylight";
import { getDayWeather, type DayWeather } from "@/lib/weather";
import { getWeatherTheme, type WeatherTheme } from "@/lib/weather/theme";
import { zoneLabel } from "@/lib/time-display";
import { computeTripPhase, type TripPhase } from "@/lib/trip-phase";
import { canWriteJournal } from "@/lib/journal-window";
import { groupJournalDayByAuthor } from "@/lib/journal-authors";
import { itemPhotoUrl } from "@/lib/item-photo";
import { readDayRows, type DayReadContext } from "@/lib/day-reads";
import {
  buildDayModel,
  dayHeading,
  dayEyebrow,
  daySubLine,
  nightOfStay,
  tripDays,
  stopLine,
  dayIdeasRows,
  forecastOpensOn as forecastOpensOnFor,
  type DayModel,
  type DayRows,
  type StopLine,
  type SubLineInput,
} from "@/lib/day-view-model";
import { REAL_PLAN } from "@/lib/plan-scope";
import { TRAVELLER_SELECT, type TravellerLike } from "@/lib/traveller";
import type { TransportMode } from "@/lib/enum-values";
import type { DayEntryEditor } from "@/lib/plan-entity-views";     // path per 3.N
import type { AttachmentView } from "@/lib/attachment-view";     // path per 3.N
import type { ItemDirections } from "@/lib/day-map";             // path per 3.N
import type { DaylightView } from "@/lib/daylight";              // path per 3.N
import type { CostRow } from "@/lib/money/cost-row";             // path per 3.N
```

(`cache` from `react` goes: `getDays` is one call per page, so there is nothing left to dedupe.)

Replace `:132-813` with:

```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
type DayResult = DayViewData | "invalid" | "out-of-range" | "dateless";

/** A well-formed date clamped into the Trip, or "out-of-range" beyond the buffer. */
function clampDate(date: string, startDate: string, endDate: string): string | "out-of-range" {
  if (date < addDays(startDate, -BUFFER_DAYS) || date > addDays(endDate, BUFFER_DAYS)) return "out-of-range";
  return date < startDate ? startDate : date > endDate ? endDate : date;
}

/**
 * This view's own reads, in readDayRows's wave: the Costs on the day's
 * editable entities (the edit dialogs pre-fill from them) and every
 * Traveller's Journal entry and photos for the window's dates (ARCH-DAT-6),
 * one `in` list each. Null when the Trip has no end: the Day view needs both.
 */
async function readWindowExtras(ctx: DayReadContext, dates: readonly string[]) {
  if (ctx.trip.endDate === null) return null;
  const shown = [
    ...new Set(
      dates
        .filter((d) => ISO_DATE.test(d))
        .map((d) => clampDate(d, ctx.startDate, ctx.endDate))
        .filter((d) => d !== "out-of-range"),
    ),
  ];
  const [costs, journalEntries, journalPhotos] = await Promise.all([
    db.cost.findMany({
      where: { tripId: ctx.tripId, ...REAL_PLAN, ownerType: { in: ["ITEM", "TRANSPORT", "ACCOMMODATION"] }, ownerId: { not: null }, ...ctx.visibility.where.cost },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, costMinor: true, paidMinor: true, currency: true, rateToHome: true, paidAt: true, dueDate: true,
        ownerType: true, ownerId: true, label: true, category: true, settlement: true,
      },
    }),
    db.journalEntry.findMany({
      where: { tripId: ctx.tripId, date: { in: shown } },
      orderBy: { createdAt: "asc" },
      select: { id: true, body: true, date: true, authorId: true, updatedAt: true, hiddenFromShares: true, author: { select: TRAVELLER_SELECT } },
    }),
    db.attachment.findMany({
      where: { tripId: ctx.tripId, targetType: "JOURNAL", targetId: { in: shown } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, filename: true, title: true, mime: true, size: true, url: true, uploadedById: true, createdAt: true, targetId: true,
        // Attributes a photo-only co-Traveller (no JournalEntry row).
        uploadedBy: { select: TRAVELLER_SELECT },
      },
    }),
  ]);
  return { costs, journalEntries, journalPhotos };
}
type WindowExtras = NonNullable<Awaited<ReturnType<typeof readWindowExtras>>>;

/**
 * The Day view for each of `dates`, in order (NAV-05): the carousel's day
 * shown and its neighbours from one read. A malformed date is "invalid", one
 * beyond the 2-day buffer "out-of-range"; a date just outside the Trip clamps
 * to its end (the page drops a neighbour that clamped onto the day shown).
 */
export async function getDays(tripId: string, dates: readonly string[], viewerId: string): Promise<DayResult[]> {
  const wellFormed = (d: string) => ISO_DATE.test(d);
  if (!dates.some(wellFormed)) return dates.map(() => "invalid" as const);

  const read = await readDayRows(tripId, viewerId, (ctx) => readWindowExtras(ctx, dates));
  if (read === "missing") return dates.map(() => "invalid" as const);
  if (read === "dateless" || read.alongside === null) return dates.map((d) => (wellFormed(d) ? ("dateless" as const) : ("invalid" as const)));

  const { rows, alongside } = read;
  const shared = shareAcrossDays(tripId, rows, alongside.costs);
  return dates.map((d): DayResult => {
    if (!wellFormed(d)) return "invalid";
    const date = clampDate(d, rows.startDate, rows.endDate);
    if (date === "out-of-range") return date;
    const model = buildDayModel(rows, date);
    // Unreachable after the clamp; kept so a projection change can't crash the page.
    if (!model.dayPlan) return "out-of-range";
    return projectDayView(rows, { ...model, dayPlan: model.dayPlan }, shared, {
      viewerId,
      journalEntries: alongside.journalEntries.filter((e) => e.date === date),
      journalPhotos: alongside.journalPhotos.filter((p) => p.targetId === date),
    });
  });
}

/** What every day of one window shares — built once per getDays call. */
function shareAcrossDays(tripId: string, rows: DayRows, costs: CostRow[]) {
  const { trip, stops, items, transports } = rows;
  const stopById = new Map(stops.map((s) => [s.id, s]));
  const costsByOwner: Record<string, CostRow[]> = {};
  for (const c of costs) if (c.ownerId) (costsByOwner[c.ownerId] ??= []).push(c);
  // The strip's dots count what the day shows: the dated Items already read, placeholders included.
  const itemsByDate = new Map<string, number>();
  for (const it of items) if (it.date) itemsByDate.set(it.date, (itemsByDate.get(it.date) ?? 0) + 1);
  const windowDates = tripDays(rows.startDate, rows.endDate);
  const attachmentsById = new Map(rows.attachments.map((a) => [a.id, { url: a.url }]));
  const editorBase: Omit<DayEntryEditor, "accommodations"> = {
    tripId,
    stops: stops.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone, arriveDate: s.arriveDate })),
    homeCurrency: trip.homeCurrency,
    homeBaseName: trip.homeName,
    homeTimezone: trip.homeTimezone,
    items: Object.fromEntries(items.map((i) => [i.id, { ...i, photoUrl: itemPhotoUrl(i, attachmentsById) }])),
    transports: Object.fromEntries(
      transports.map((t) => [
        t.id,
        {
          ...t,
          mode: t.mode as TransportMode,
          fromStopName: t.fromStopId ? (stopById.get(t.fromStopId)?.name ?? null) : null,
          toStopName: t.toStopId ? (stopById.get(t.toStopId)?.name ?? null) : null,
          fromStopTimezone: t.fromStopId ? (stopById.get(t.fromStopId)?.timezone ?? null) : null,
          toStopTimezone: t.toStopId ? (stopById.get(t.toStopId)?.timezone ?? null) : null,
        },
      ]),
    ),
    costsByOwner,
  };
  return {
    today: tripTodayISO(stops),
    stopById,
    itemsByDate,
    windowDates,
    editorBase,
    stopOptions: stops.map((s) => ({ id: s.id, name: s.name, arriveDate: s.arriveDate, departDate: s.departDate, timezone: s.timezone, sortOrder: s.sortOrder })),
    line: stopLine({
      days: windowDates,
      stops: stops.map((s) => ({ id: s.id, name: s.name, arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder })),
      transports: transports.map((t) => ({
        fromStopId: t.fromStopId, toStopId: t.toStopId, depPlace: t.depPlace, arrPlace: t.arrPlace,
        depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, mode: t.mode as TransportMode,
      })),
      homeName: trip.homeName,
      roundTrip: trip.roundTrip ?? true,
    }),
  };
}
type SharedDays = ReturnType<typeof shareAcrossDays>;

/** Pure: the Day view for one date, from its model, the window's shared parts and its Journal rows. */
function projectDayView(
  rows: DayRows,
  model: DayModel & { dayPlan: DayPlan },
  shared: SharedDays,
  day: { viewerId: string; journalEntries: WindowExtras["journalEntries"]; journalPhotos: WindowExtras["journalPhotos"] },
): DayViewData {
  const { trip, startDate, endDate, items, transports } = rows;
  const { date, dayPlan, dayStop, freeForm, hasEntries, accommodations, tonight: bed } = model;
  const { stopById, today } = shared;

  const editor: DayEntryEditor = {
    ...shared.editorBase,
    accommodations: Object.fromEntries(
      accommodations.map((a) => {
        const st = stopById.get(a.stopId);
        return [a.id, { accommodation: a, stopDateRange: { arriveDate: st?.arriveDate ?? a.checkIn, departDate: st?.departDate ?? a.checkOut } }];
      }),
    ),
  };

  const tonightNight = bed ? nightOfStay(date, bed.checkIn, bed.checkOut) : null;
  const tonight =
    bed && tonightNight
      ? {
          id: bed.id, name: bed.name, nightOf: tonightNight, checkOut: bed.checkOut, address: bed.address,
          confirmation: bed.confirmation, checkInTime: bed.checkInTime, checkOutTime: bed.checkOutTime,
          notes: bed.notes, lat: bed.lat, lng: bed.lng,
        }
      : null;

  // ── Phase and the Journal window ──
  const phase = computeTripPhase({ startDate, endDate, today });
  const journalOpen = canWriteJournal({ startDate, endDate, today, date });
  const journalSlots = groupJournalDayByAuthor({
    entries: day.journalEntries,
    photos: day.journalPhotos,
    viewerId: day.viewerId,
    includeViewerSlot: journalOpen,
  });
  // The viewer's slot feeds the editor only when the day is writable; on a
  // day still ahead, any legacy content of theirs shows read-only.
  const mySlot = journalOpen ? journalSlots.find((s) => s.isViewer) : undefined;
  const [myPhoto = null, ...myExtraPhotos] = mySlot?.photos ?? [];
  const journal: DayViewData["journal"] = {
    open: journalOpen,
    mine: journalOpen
      ? {
          body: mySlot?.entry?.body ?? "",
          updatedAt: mySlot?.entry?.updatedAt ?? null,
          photo: myPhoto,
          extraPhotos: myExtraPhotos,
          hiddenFromShares: mySlot?.entry?.hiddenFromShares ?? false,
        }
      : null,
    others: journalSlots
      .filter((s) => s !== mySlot)
      .map((slot) => ({
        authorId: slot.authorId,
        body: slot.entry?.body ?? "",
        updatedAt: slot.entry?.updatedAt ?? slot.photos[0]?.createdAt ?? new Date(0),
        author: slot.entry?.author ?? slot.photos[0]?.uploadedBy ?? null,
        photos: slot.photos,
      })),
  };

  // ── The day's shape ──
  const ordered = orderDayEntries(dayPlan);
  const travelDay = dayPlan.transportEntries.length > 0;

  // ── Day ideas — every phase (ADR 0044 amendment) ──
  const ideas =
    freeForm && dayStop
      ? dayIdeasRows({ stopName: dayStop.name, thingsToDo: model.thingsToDo, wishlist: model.ideasWishlist })
      : { rows: [], all: [], more: 0, eyebrow: null };

  // ── Header: heading, eyebrow, sub line ──
  const eyebrow = dayEyebrow({
    dayNumber: model.dayNumber,
    totalDays: model.totalDays,
    chapterName: model.chapter?.name ?? null,
    country: dayStop?.country ?? null,
    travelDay,
  });
  const dep = dayPlan.transportEntries.find((e) => e.kind === "transport-departure");
  const home = trip.homeName ?? "Home";
  const travel: SubLineInput["travel"] = dep
    ? {
        from: stopById.get(dep.transport.fromStopId ?? "")?.name ?? dep.transport.depPlace ?? home,
        to: stopById.get(dep.transport.toStopId ?? "")?.name ?? dep.transport.arrPlace ?? home,
        // A Home arrival has no toStop of its own (CONTEXT.md "Home base"): its
        // zone is the Trip's own `homeTimezone` when set. Otherwise a leg home
        // has no toStop and so no known zone — no "→ UTC".
        toZone:
          dep.transport.arrIsHome && trip.homeTimezone
            ? zoneLabel(trip.homeTimezone, date)
            : dep.transport.toStopId
              ? zoneLabel(stopById.get(dep.transport.toStopId)?.timezone, date)
              : null,
      }
    : null;
  const subLineBase = {
    stopName: dayStop?.name ?? null,
    country: dayStop?.country ?? null,
    // Only a Stop with a zone set shows one (as the old page did).
    zone: dayStop?.timezone ? zoneLabel(dayStop.timezone, date) : null,
    nightOf: tonight?.nightOf ?? null,
    travel,
  };

  // ── Strip: every day of the Trip (spec 2026-09-28 D1) ──
  // Dots count what the day's plan card counts ("3 things"): the day's Items
  // plus its Transport legs and check-ins/outs from the whole-Trip itinerary.
  const itineraryByDate = new Map(model.itinerary.map((d) => [d.dateISO, d]));
  const nonItemCount = (iso: string) => {
    const d = itineraryByDate.get(iso);
    return d ? d.transportEntries.length + d.accommodationEntries.length : 0;
  };
  const strip: DayViewData["strip"] = {
    dates: shared.windowDates.map((iso) => ({
      iso,
      count: (shared.itemsByDate.get(iso) ?? 0) + nonItemCount(iso),
      isCurrent: iso === date,
      isToday: iso === today,
    })),
    line: shared.line,
  };

  const feasibility = flagTightConnections(
    items
      .filter((it) => it.date === date)
      .map((it) => ({ id: it.id, stopId: it.stopId, date: it.date, startTime: it.startTime, endTime: it.endTime, lat: it.lat, lng: it.lng })),
    transports.map((t) => ({ id: t.id, fromStopId: t.fromStopId, toStopId: t.toStopId, mode: t.mode })),
    { windingFactor: 1.5, avgSpeedKph: 80 },
  ).map((f) => ({ severity: f.severity, message: f.message }));

  const stopTimezone = dayStop?.timezone ?? "UTC";
  const isFirst = date === startDate;
  const isLast = date === endDate;

  return {
    tripId: shared.editorBase.tripId,
    viewerId: day.viewerId,
    trip: { name: trip.name, startDate, endDate, homeCurrency: trip.homeCurrency, homeName: trip.homeName, homeTimezone: trip.homeTimezone },
    date,
    today,
    isToday: today === date,
    phase,
    dayNumber: model.dayNumber,
    totalDays: model.totalDays,
    heading: dayHeading(date, startDate, endDate),
    eyebrow,
    subLine: daySubLine({ ...subLineBase, compact: false }),
    subLineCompact: daySubLine({ ...subLineBase, compact: true }),
    isFirst,
    isLast,
    prevDate: isFirst ? null : addDays(date, -1),
    nextDate: isLast ? null : addDays(date, 1),
    stop: dayStop
      ? {
          id: dayStop.id, name: dayStop.name, country: dayStop.country, countryCode: dayStop.countryCode,
          timezone: stopTimezone, lat: dayStop.lat, lng: dayStop.lng,
          // The read keeps dated Stops only (lib/day-reads.ts).
          arriveDate: dayStop.arriveDate!, departDate: dayStop.departDate!,
        }
      : null,
    travelDay,
    dayTitle: model.dayTitle?.title ?? null,
    dayTitleStopId: model.dayTitle?.stopId ?? dayStop?.id ?? null,
    plan: dayPlan,
    ordered,
    hasEntries,
    freeForm,
    planCount: ordered.entries.length + ordered.anytime.length,
    editor,
    itemDirections: model.itemDirections,
    dayMap: model.dayMap,
    attachmentsByTarget: model.attachmentsByTarget,
    stopOptions: shared.stopOptions,
    ideas,
    nearby: model.nearby,
    tonight,
    strip,
    journal,
    feasibility,
    weatherInput: dayStop?.lat != null && dayStop?.lng != null ? { lat: dayStop.lat, lng: dayStop.lng, timezone: stopTimezone } : null,
  };
}

/** Bridge for the Day page until 3.M.4 moves it onto getDays. */
export const getDay = async (tripId: string, date: string, viewerId: string) => (await getDays(tripId, [date], viewerId))[0];
```

The `BUFFER_DAYS` const (`:55-56`) stays. `DayViewData` stays as it is, including its field types (`OrderedDay`, `DayMapModel`, `NearbyResult`, `StopLine` and `AttachmentView` are still used there). `DayViewData`'s `stop` field (`:78-88`) is unchanged.

Delete `lib/day-view-loader.cache.test.ts`. Its first case is covered by "reads every query once for three dates" above, and its second by `lib/day-reads.test.ts` "selects Day titles and things to do by the Trip". Edit the guard list as described in Files.

- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/day-view-loader.test.ts eslint.config.test.ts "app/(app)/trips/[tripId]/day/[date]/page.test.tsx"`. The page test still mocks `getDay` and passes through the bridge. If the DB is up, also run `npm run test:integration -- test/integration/day-view-loader.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/day-view-loader.ts`, then `npx tsc --noEmit`, then `npx eslint lib/day-view-loader.ts lib/day-view-loader.test.ts test/integration/day-view-loader.test.ts eslint.config.mjs eslint.config.test.ts`.
- [ ] **Step 6: Commit.** `git add lib/day-view-loader.ts lib/day-view-loader.test.ts test/integration/day-view-loader.test.ts eslint.config.mjs eslint.config.test.ts && git rm lib/day-view-loader.cache.test.ts`, with this message:

  ```
  refactor(day): getDays reads the carousel window once (card 3.M, NAV-05)

  One readDayRows wave plus the Day view's Costs and a Journal `in` list,
  assembled per date by buildDayModel. The strip's dots now come from the
  dated Items already read (no groupBy) and from an itinerary built from every
  stay — TB-10: a check-in on a day the shown day's stay did not touch
  showed no dot.
  ```

---

### Task 3.M.4: The Day page asks for its window once

**Files:**
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx:9, 30-36, 43-51`
- Modify: `lib/day-view-loader.ts` (delete the `getDay` bridge at the bottom)
- Test: `app/(app)/trips/[tripId]/day/[date]/page.test.tsx:3-24` (mocks only; every assertion kept)
- Modify: `docs/adr/0065-hard-cut-between-sections-paged-carousel-between-days.md:51-52`

**Interfaces:**
- Consumes: `getDays(tripId, dates, viewerId)` (3.M.3).
- Produces: nothing new. After this task `getDay` no longer exists.

- [ ] **Step 1: Write the failing test.** In `page.test.tsx`, rewrite the mock so the per-day `getDayMock` stays the thing each test configures. `getDays` delegates to it, which keeps every existing `getDayMock.mockImplementation(...)`, `mockResolvedValue(...)` and `getDayMock.mock.calls` assertion as it is (Q10):

```ts
// :6-9 header comment
// The page is a thin Server Component over `getDays` (lib/day-view-loader.ts,
// tested on its own), which it asks once for the day shown and both
// neighbours (NAV-05). Here the loader and every client island are mocked:
// `getDays` answers each date through the per-day `getDayMock`, so each test
// still says what one day looks like. Both the phone and the desktop trees are
// rendered (one hidden by CSS), so most texts appear twice.

// :11-22 — add getDaysMock to the hoisted block
const { getDayMock, getDaysMock, requireTripAccessMock, tripFindUniqueMock, notFoundMock, redirectMock, dayWeatherMock } = vi.hoisted(() => {
  const getDayMock = vi.fn();
  return {
    getDayMock,
    getDaysMock: vi.fn((tripId: string, dates: string[], viewerId: string) => Promise.all(dates.map((d) => getDayMock(tripId, d, viewerId)))),
    requireTripAccessMock: vi.fn(),
    tripFindUniqueMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    redirectMock: vi.fn((to: string) => {
      throw new Error(`NEXT_REDIRECT ${to}`);
    }),
    dayWeatherMock: vi.fn(),
  };
});

// :24
vi.mock("@/lib/day-view-loader", () => ({ getDays: getDaysMock, getDayWeatherView: vi.fn() }));
```

Add one case to `describe("Day page")`:

```ts
it("asks for the day shown and both neighbours in one getDays call (NAV-05)", async () => {
  await renderPage();
  expect(getDaysMock).toHaveBeenCalledTimes(1);
  expect(getDaysMock).toHaveBeenCalledWith("t1", ["2026-12-12", "2026-12-11", "2026-12-13"], "u1");
});

it("a malformed date asks for that date alone", async () => {
  getDayMock.mockResolvedValue("invalid");
  await expect(renderPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  expect(getDaysMock).toHaveBeenCalledWith("t1", ["nope"], "u1");
});
```

(`vi.clearAllMocks()` in `beforeEach` clears calls but keeps `getDaysMock`'s delegating implementation.)

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run "app/(app)/trips/[tripId]/day/[date]/page.test.tsx"`. Expected: `[vitest] No "getDay" export is defined on the "@/lib/day-view-loader" mock`.
- [ ] **Step 3: Implement.** `page.tsx:9`: `import { getDays, type DayViewData } from "@/lib/day-view-loader";`. Comment at `:30-36`: `The Day view (spec 2026-09-27 §C, DAY_VIEW.md; ADR 0065). The day shown and the day either side come from one getDays read (NAV-05), so the carousel has a neighbour to drag into view; weather streams in …` (the rest unchanged). Then `:43-51`:

```ts
  const [days3, unreadCount, recent, shell, slug] = await Promise.all([
    // The day shown first, then its neighbours (ADR 0065).
    getDays(tripId, wellFormed ? [date, addDays(date, -1), addDays(date, 1)] : [date], user.id),
    readUnreadActivityCount(tripId),
    readRecentActivity(tripId, 10),
    readTripShell(tripId),
    tripSlugFor(tripId),
  ]);
  const [data, before = "invalid" as const, after = "invalid" as const] = days3;
```

Lines `:52-58` stay as they are (the `days` dedupe still reads `[before, d, after]`). In `lib/day-view-loader.ts`, delete the `getDay` bridge and its comment.

ADR 0065, Consequences (`:51-52`): replace the first bullet with:

```md
- ~~Three `getDay` loads per Day page, in parallel.~~ *Amended 2026-10-16 (card 3.M,
  NAV-05):* one `getDays(tripId, [shown, before, after], viewer)` reads the window once
  (`lib/day-reads.ts`) and assembles each day with `buildDayModel`.
```

- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run "app/(app)/trips/[tripId]/day/[date]/page.test.tsx" lib/day-view-loader.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run "app/(app)/trips/[tripId]/day/[date]/page.tsx" lib/day-view-loader.ts`, then `npx tsc --noEmit`, then `npx eslint "app/(app)/trips/[tripId]/day/[date]/page.tsx" "app/(app)/trips/[tripId]/day/[date]/page.test.tsx" lib/day-view-loader.ts`. Finally run `grep -rn "getDay\b" app components lib test`, which must return nothing (`getDayWeatherView` does not match `\b`).
- [ ] **Step 6: Commit.** `git add "app/(app)/trips/[tripId]/day/[date]/page.tsx" "app/(app)/trips/[tripId]/day/[date]/page.test.tsx" lib/day-view-loader.ts docs/adr/0065-hard-cut-between-sections-paged-carousel-between-days.md`, with the message `refactor(day): the Day page reads its carousel window with one getDays (NAV-05)`.

---

### Task 3.M.5: Today assembles its day with `buildDayModel`; NAV-05 closed

**Files:**
- Modify: `lib/travelling-home-loader.ts`. The header (`:1-22`) and imports (`:23-52`) change; the body of `loadTravellingHomeUncached` (`:54-567`) is rewritten. `buildTransportLabel` (`:574-592`), the `cache` export (`:569`) and the type exports (`:571-572`) stay.
- Test: `components/trip/home/phase-travelling.test.tsx` (one new case; no existing assertion changes)
- Test: `test/integration/travelling-home-loader.test.ts` (create)
- Modify: `eslint.config.mjs`. Delete the `"lib/travelling-home-loader.ts",` entry from `SURPRISE_VISIBILITY_READERS` and extend the 3.M.3 comment with `lib/travelling-home-loader.ts likewise.`
- Modify: `docs/open-follow-ups.md:452-456` (NAV-05)

**Interfaces:**
- Consumes: `readDayRows` (3.M.2); `buildDayModel` (3.M.1); `getDays` (3.M.3, integration test only).
- Produces: `loadTravellingHome(tripId, userId)` with an unchanged `DatedTravellingHome` field set. Shapes widen in places: `trip` gains the Day read's columns and `currentChapter` gains `sortOrder`. `dayPlan` items now carry `surprise` and `photoUrl` (deviation 4).

- [ ] **Step 1: Write the failing tests.** Append to the `describe` that holds `"a hidden real-plan Item joins the itinerary as a placeholder titled Surprise; a Fork's does not"` in `components/trip/home/phase-travelling.test.tsx` (`:944-960`):

```ts
it("Today's plan carries what the Day view's does: the placeholder's Surprise view and an Item's photo (card 3.M)", async () => {
  const { hiddenVisibility, placeholderItem, SURPRISED_VIEW } = await import("@/test/helpers/surprise-visibility");
  loadSurpriseVisibilityMock.mockResolvedValueOnce(
    hiddenVisibility({ placeholders: [placeholderItem({ id: "i-real", date: "2026-01-05", startTime: "19:30" })] }),
  );
  itemFindManyMock.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    where.date !== null && where.date !== undefined
      ? [{ id: "i-photo", title: "Belvedere", category: "SIGHTSEEING", date: "2026-01-05", startTime: null, endTime: null, sortOrder: 0, stopId: null, lat: null, lng: null, address: null, link: null, booking: null, notes: null, hiddenFromShares: false, photoAttachmentId: "att-1" }]
      : [],
  );
  attachmentFindManyMock.mockResolvedValue([
    { id: "att-1", filename: "b.jpg", title: null, mime: "image/jpeg", size: 1, url: "/api/attachments/att-1", uploadedById: "u-viewer", createdAt: new Date(), targetId: "i-photo" },
  ]);
  await PhaseTravelling({ tripId: "trip-1", userId: "u-viewer" });
  const { items } = buildItineraryMock.mock.calls[0][0];
  expect(items).toEqual([
    expect.objectContaining({ id: "i-photo", photoUrl: "/api/attachments/att-1", surprise: null }),
    expect.objectContaining({ id: "i-real", title: "Surprise", surprise: SURPRISED_VIEW }),
  ]);
  itemFindManyMock.mockResolvedValue([]);
  attachmentFindManyMock.mockResolvedValue([]);
});
```

(The test file's `vi.mock("@/lib/plan-scope", …)` makes `WISHLIST_IDEA_WHERE`/`THINGS_TO_DO_WHERE` empty, so the dated read is the only one with a defined `where.date`. If the enclosing describe's `beforeEach` does not reset these mocks, the two trailing lines restore them.)

`test/integration/travelling-home-loader.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, todayISO } from "@/lib/dates";
import { loadTravellingHome } from "@/lib/travelling-home-loader";
import { getDays } from "@/lib/day-view-loader";

// Real Postgres (npm run test:integration). Card 3.M's promise: Today (the
// Travelling Home) and the Day view assemble the same day from the same read,
// so for one date and one viewer they agree — Surprise included.
const PLANNER = "it-today-planner";
const MEMBER = "it-today-member";
const TRIP_ID = "it-today-trip";
const STOP_ID = "it-today-vienna";

describe.skipIf(process.env.INTEGRATION !== "1")("Today and the Day view agree (real Postgres)", () => {
  // The Trip spans the real today in UTC (the Stop's zone), so Today is "travelling".
  const today = todayISO();
  const start = addDays(today, -1);
  const end = addDays(today, 3);

  beforeAll(async () => {
    await db.user.upsert({ where: { id: PLANNER }, update: {}, create: { id: PLANNER, email: "today-planner@example.test", name: "Pat" } });
    await db.user.upsert({ where: { id: MEMBER }, update: {}, create: { id: MEMBER, email: "today-member@example.test", name: "Viv" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Today", homeCurrency: "AUD", createdById: PLANNER, startDate: start, endDate: end,
        members: { create: [{ userId: PLANNER, role: "owner" }, { userId: MEMBER, role: "member" }] },
      },
    });
    await db.stop.create({
      data: { id: STOP_ID, tripId: TRIP_ID, name: "IT Vienna", timezone: "UTC", arriveDate: start, departDate: end, nights: 4, sortOrder: 0, lat: 48.2, lng: 16.37 },
    });
    await db.item.createMany({
      data: [
        { tripId: TRIP_ID, stopId: STOP_ID, title: "IT Belvedere", category: "SIGHTSEEING", date: today, startTime: "10:00", sortOrder: 0 },
        { tripId: TRIP_ID, stopId: STOP_ID, title: "IT Opera night", category: "NIGHTLIFE", date: today, startTime: "19:30", sortOrder: 1, surprisePlannerId: PLANNER, surpriseForIds: JSON.stringify([MEMBER]) },
      ],
    });
    await db.accommodation.create({ data: { tripId: TRIP_ID, stopId: STOP_ID, name: "IT Hotel Sacher", checkIn: start, checkOut: end } });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it.each([MEMBER, PLANNER])("the same day's plan for %s", async (viewer) => {
    const home = await loadTravellingHome(TRIP_ID, viewer);
    if (home.kind !== "dated") throw new Error(home.kind);
    expect(home.effectiveDate).toBe(today);
    const [day] = await getDays(TRIP_ID, [today], viewer);
    if (typeof day === "string") throw new Error(day);
    expect(home.dayPlan).toEqual(day.plan);
    expect(home.tonightAccom?.name).toBe("IT Hotel Sacher");
    expect(day.tonight?.name).toBe("IT Hotel Sacher");
    const titles = [...day.plan.timedItems, ...day.plan.untimedItems].map((e) => e.item.title);
    expect(titles).toEqual(viewer === MEMBER ? ["IT Belvedere", "Surprise"] : ["IT Belvedere", "IT Opera night"]);
  });
});
```

(If `todayISO` isn't the UTC "today" in `lib/dates`, use `new Date().toISOString().slice(0, 10)`. If importing the loader pulls in a module the integration tier can't load, mock `@/lib/trip-slug-read` the way `components/trip/home/phase-travelling.test.tsx:69` does: `vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }))`.)

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run components/trip/home/phase-travelling.test.tsx`. Expected: the new case fails because `items[1]` lacks `surprise` and `items[0]` lacks `photoUrl` (`expected … to equal …`).
- [ ] **Step 3: Implement.** In `lib/travelling-home-loader.ts`, replace the header's Surprise paragraph (`:12-21`) with:

```ts
 * Its day is read by `readDayRows` (lib/day-reads.ts) and assembled by
 * `buildDayModel` (lib/day-view-model.ts) — the Day view's own read and
 * assembly — so Today and the Day view agree by construction (card 3.M).
 * Surprise (ADR 0051): readDayRows applies the viewer's fragments, masking
 * and placeholders; this loader's own Cost read is whole: money stays in
 * spend so far (CONTEXT.md Surprise), and only the upcoming payment lines
 * drop the Costs owned by hidden Items and Accommodation. The planner's own
 * Surprises whose day has come (the Stop's arrive date or the Item's day on
 * or before the Trip's today) become `revealNudges`, the same nudge the
 * Planning Home's Next steps show.
```

Imports `:23-52` become:

```ts
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { tripTodayISO } from "@/lib/trip-today";
import { effectiveTodayISO, type TransportDepartureEntry } from "@/lib/itinerary";
import { buildDayModel } from "@/lib/day-view-model";
import { readDayRows } from "@/lib/day-reads";
import { buildSpendSoFar, type SpendCost } from "@/lib/spend-so-far";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import { zoneLabel } from "@/lib/time-display";
import type { TransportMode } from "@/lib/enum-values";
import { REAL_PLAN } from "@/lib/plan-scope";
import { buildCostLabelMap } from "@/lib/cost-labels";
import { buildUpcomingPayments } from "@/lib/upcoming-payments";
import { loadTodaysJournal } from "@/lib/journal-loader";
import { surprisesToReveal } from "@/lib/next-steps-builder";
import { revealSurpriseStep } from "@/lib/next-steps";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
```

`loadTravellingHomeUncached` (`:54-567`) becomes:

```ts
async function loadTravellingHomeUncached(tripId: string, userId: string | null) {
  // Reminders are NOT read here: the Reminders card is rendered by the trip
  // Home page in every Phase, not only while Travelling.
  const read = await readDayRows(tripId, userId, async (ctx) => {
    const [costs, todaysJournal, slug] = await Promise.all([
      db.cost.findMany({
        where: { tripId, ...REAL_PLAN },
        select: {
          id: true, costMinor: true, paidMinor: true, currency: true, rateToHome: true, paidAt: true, dueDate: true,
          ownerType: true, ownerId: true, label: true, category: true, settlement: true,
        },
      }),
      // Today's journal (spec K) — never for a day still ahead (CONTEXT.md
      // "Journal"): before day 1 the Trip's real today hasn't arrived, so
      // there's nothing to load or write. The day journaled is today clamped
      // to the Trip's own range — the same day this Phase treats as "today".
      ctx.stopRows.then((rows) => {
        const tripToday = tripTodayISO(rows);
        return userId && tripToday >= ctx.startDate
          ? loadTodaysJournal(tripId, effectiveTodayISO(tripToday, ctx.startDate, ctx.endDate), userId)
          : null;
      }),
      // For the reveal nudges' links; cache()d, so the Phase's own read is free.
      tripSlugFor(tripId),
    ]);
    return { costs, todaysJournal, slug };
  });
  if (read === "missing") notFound();
  // A date-less trip has no calendar to anchor "today" against — the Phase
  // renders its empty treatment.
  if (read === "dateless") return { kind: "no-dates" as const };

  const { rows, visibility: v, alongside: { costs, todaysJournal, slug } } = read;
  const { trip, startDate, endDate, stops, items, transports, accommodations, chapters } = rows;
  const base = tripPath(slug);

  // Trip's reference-timezone "today" (things-to-fix P0-2); every read above
  // is the real plan (dated views follow the real plan — CONTEXT.md).
  const today = tripTodayISO(stops);
  const effectiveDate = effectiveTodayISO(today, startDate, endDate);
  const day = buildDayModel(rows, effectiveDate);

  // Placeholders are hidden from this viewer, so never theirs to reveal.
  const revealNudges = userId
    ? surprisesToReveal({ views: v.views, viewerId: userId, today, stops, items }).map((s) => {
        const { id, title, href } = revealSurpriseStep(s, base);
        return { id, title, href };
      })
    : [];

  const isBeforeTrip = today < startDate;
  const isAfterTrip = today > endDate;
  const isWithinTrip = today >= startDate && today <= endDate;

  // The next departure that hasn't left yet, from today's entries onward.
  const now = new Date();
  const nextTransportDep =
    day.itinerary
      .filter((d) => d.dateISO >= effectiveDate)
      .flatMap((d) => d.transportEntries)
      .filter((e): e is TransportDepartureEntry => e.kind === "transport-departure")
      .filter((e) => e.transport.depAt != null && new Date(e.transport.depAt) > now)
      .sort((a, b) => new Date(a.transport.depAt!).getTime() - new Date(b.transport.depAt!).getTime())[0] ?? null;

  // ── Spend so far ──
  const homeCurrency = trip.homeCurrency;
  const spend = buildSpendSoFar({ costs: costs as SpendCost[], homeCurrency, tripStart: startDate, tripEnd: endDate, today: effectiveDate });

  // ── Upcoming payments ── Owner labels (lib/cost-labels.ts) prefer the
  // linked Stop's current name over the Transport's free text.
  const stopName = new Map(stops.map((s) => [s.id, s.name] as const));
  const ownerNames = buildCostLabelMap({
    items: items.map((i) => ({ id: i.id, title: i.title })),
    accommodations: accommodations.map((a) => ({ id: a.id, name: a.name })),
    transports: transports.map((t) => ({
      id: t.id,
      mode: t.mode,
      depPlace: (t.fromStopId ? stopName.get(t.fromStopId) : null) ?? t.depPlace ?? null,
      arrPlace: (t.toStopId ? stopName.get(t.toStopId) : null) ?? t.arrPlace ?? null,
    })),
  });
  // `today` (trip-timezone "now"), not `effectiveDate` — a due date can fall
  // outside the trip. Surprise: the lines leave out money inside a Surprise
  // hidden from the viewer.
  const hiddenOwners = new Set(v.hiddenOwnerIds);
  const lineCosts = costs.filter((c) => !c.ownerId || !hiddenOwners.has(c.ownerId));
  const upcomingPayments = buildUpcomingPayments({ costs: lineCosts, ownerNames, today });

  // The next departure, resolved for display (TransportCountdown on the
  // phone, the desktop Today tile).
  const nextTransport =
    nextTransportDep && nextTransportDep.transport.depAt
      ? {
          depAt: new Date(nextTransportDep.transport.depAt).toISOString(),
          depTimeLabel: nextTransportDep.depTimeLabel,
          // A Home departure has no fromStop of its own (CONTEXT.md "Home
          // base"): its zone is the Trip's own `homeTimezone` when set —
          // otherwise unchanged (a Stop's own zone, else no "→ UTC").
          depZone: zoneLabel(
            (nextTransportDep.transport.depIsHome && trip.homeTimezone) ||
              stops.find((s) => s.id === nextTransportDep.transport.fromStopId)?.timezone,
            effectiveDate,
          ),
          label: buildTransportLabel(nextTransportDep.transport),
        }
      : null;

  return {
    kind: "dated" as const,
    trip,
    // The desktop countdown tile's "at a glance" row (homeStats): the dated
    // Stops this Phase is built from, and every Chapter — dated and rough.
    glance: { stops: stops.map((s) => ({ countryCode: s.countryCode })), chapterCount: chapters.length },
    startDate,
    endDate,
    today,
    effectiveDate,
    isBeforeTrip,
    isAfterTrip,
    isWithinTrip,
    currentChapter: day.chapter,
    dayNum: day.dayNumber,
    totalDays: day.totalDays,
    // Today's Day title (CONTEXT.md "Day title"; the desktop Today tile's `dayTitle`).
    todaysDayTitle: day.dayTitle?.title ?? null,
    dayPlan: day.dayPlan,
    hasEntries: day.hasEntries,
    attachmentsByTarget: day.attachmentsByTarget,
    tonightAccom: day.tonight,
    nextTransport,
    effectiveStop: day.dayPlan?.stop ?? null,
    stopLocated: day.dayStop ?? undefined,
    spend,
    homeCurrency,
    upcomingPayments,
    dayMapModel: day.dayMap,
    itemDirections: day.itemDirections,
    freeForm: day.freeForm,
    thingsToDo: day.thingsToDo,
    wishlistIdeas: day.ideasWishlist,
    nearby: day.nearby,
    todaysJournal,
    revealNudges,
  };
}
```

Here are the old-to-new correspondences, so the reviewer can check nothing was lost:
- Each `:240-252` mask and placeholder merge is now in `readDayRows`.
- `:273` `chapterForDate` → `day.chapter`.
- `:274`/`:503` `dayNumberInTrip` → `day.dayNumber`/`day.totalDays`. These are the same function, called inside `buildDayModel`, so the test's `dayNumberInTrip` mock still applies.
- `:279-283` titles → `day.dayTitle`.
- `:285-340` itinerary/`pickDayPlan` → `day.itinerary`/`day.dayPlan`.
- `:343-351` → `day.attachmentsByTarget`.
- `:354-356` → `day.tonight`.
- `:417-460` → `day.dayMap`/`day.itemDirections`.
- `:464-484` → `day.nearby`.
- `:488-501` → `day.freeForm`/`day.thingsToDo`/`day.ideasWishlist` (the Wishlist ideas are computed for any day with a Stop, as before).
- `:506-507` → `day.hasEntries`/`day.dayStop`.

`surprisesToReveal` now receives the masked Stops and the merged Items. This is equivalent: masking only nulls notes and adds the view, and a placeholder is by definition hidden from this viewer, so `mine()` never matches it.

Guard: delete `"lib/travelling-home-loader.ts",` from `SURPRISE_VISIBILITY_READERS` in `eslint.config.mjs` and extend the comment as described in Files.

`docs/open-follow-ups.md:452-456`: replace the NAV-05 bullet with:

```md
- **~~NAV-05 · A range loader for the Day view.~~** The Day page loaded three days (the
  day before, shown, after) with three parallel `getDay` calls (ADR 0065).
  **Closed 2026-10-16, card 3.M:** one `getDays(tripId, dates, viewerId)`
  (`lib/day-view-loader.ts`) reads the window once through `readDayRows`
  (`lib/day-reads.ts`) and assembles each day with `buildDayModel`
  (`lib/day-view-model.ts`), which the Travelling Home now uses too, so Day and Today
  agree by construction. Also fixed on the way: TB-10 (strip dots missed check-ins
  and check-outs on days the shown day's stay did not touch). **Still open (watch
  item):** if rapid swiping feels stuck on the phone (a second swipe before the first
  lands meets the end of the scroller), render two neighbours each side.
```

- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run components/trip/home/phase-travelling.test.tsx eslint.config.test.ts`. Every existing case passes unchanged, including the query-order cases (`itemFindManyMock.mock.calls[0..2]` = dated, Wishlist, things to do), "Costs are read whole", the same-wave case and the depZone cases. If the DB is up, also run `npm run test:integration -- test/integration/travelling-home-loader.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/travelling-home-loader.ts`, then `npx tsc --noEmit`, then `npx eslint lib/travelling-home-loader.ts components/trip/home/phase-travelling.test.tsx test/integration/travelling-home-loader.test.ts eslint.config.mjs eslint.config.test.ts`.
- [ ] **Step 6: Commit.** `git add lib/travelling-home-loader.ts components/trip/home/phase-travelling.test.tsx test/integration/travelling-home-loader.test.ts eslint.config.mjs eslint.config.test.ts docs/open-follow-ups.md`, with this message:

  ```
  refactor(home): Today assembles its day with buildDayModel (card 3.M)

  The Travelling Home reads through readDayRows and builds today with
  buildDayModel, the Day view's own read and assembly, so Day and Today agree
  by construction: Today's Timeline now carries the placeholder's Surprise view
  and Item photos, as the Day view does. NAV-05 struck; its swipe half stays a
  watch item.
  ```
## Card 3.P — Hygiene sweep, part A: primitives, helpers, UI, copy

### Notes

**Interfaces this section produces (for other sections / later tasks):**
- `lib/dates.ts`: `export function isRealCalendarDate(s: string): boolean`. It is pure and safe for the client, it returns `false` for anything that does not match `YYYY-MM-DD`, and it is used by both the zod primitives and `lib/reminder-input.ts`.
- `lib/validations/primitives.ts`: `export const isoDate`, `export function isoDateWith(formatMessage: string, realMessage: string)`, `export const hhmm`. All three are `z.ZodString`, so `.optional()`, `.nullable()` and `z.union([isoDate, z.literal("")])` all still work. Part B and 3.O must not move `lib/validations/`.
- `lib/plural.ts`: `export function plural(n: number, one: string, many?: string): string`. `lib/admin-queue.ts` no longer exports `plural`.
- `components/ui/chip.tsx`: a new `touch?: boolean` prop (a cva variant, default `false`).
- `components/ui/badge.tsx`: `success` → `bg-success text-success-foreground` and `warning` → `bg-warning text-warning-foreground`.
- `eslint.config.mjs`: `S.isoDay`, appended to every block by the `rules` helper (Task 3.P.4).

**Deviations from the spec text (decided while drafting):**
- **`isoDate` count:** there are 11 `const` copies, not 10: `lib/validations/{stop,chapter,accommodation,checklist,item}.ts`, `trip.ts`'s `isoDateString`, the 4 MCP tool files and `lib/mcp/prompts.ts`. There are 7 inline zod regexes: `cost.ts:38,51,61`, `journal.ts:14`, `reminder.ts:24`, `mcp/tools/reads.ts:282` and `server/actions/items.ts:489`. There are 6 `hhmm` sites.
- **Two `hhmm` messages exist** ("Time must be in HH:MM format" and "… (24h)"). No test asserts either, so they become one message, "Time must be in HH:MM format (24h)". Date messages that are domain-specific (reminder, paidAt, due date) keep their wording through `isoDateWith`. No test asserts the generic one.
- **A non-format string now gets only the format issue.** The real-calendar refine skips strings that fail the format. Before this, `cost.ts` reported both issues for "abc". This keeps `lib/reminder-input.test.ts`'s parity check (it compares `flattenZodErrors` exactly) valid.
- **Reminder client gate:** `lib/reminder-input.ts` mirrors `reminderSchema` and a test pins the two together. So it also gains the real-date check, through `isRealCalendarDate` from `lib/dates`, which keeps zod out of the client. Otherwise the parity test fails as soon as an impossible date is added to its cases.
- **Non-zod format checks stay format-only, as the spec says:** `lib/dates.ts:18`, `lib/day-view-loader.ts:388`, `lib/plan/plan-hash.ts:8`, `server/actions/trips.ts:399`, `server/actions/attachments.ts:279`, `server/actions/items.ts:844` (`rescheduleItem`) and `app/(app)/trips/[tripId]/day/[date]/page.tsx:23`.
- **`plural`:** there are 8 copies with two signatures, `(n, word)` (adds "s") and `(n, one, many)`. One function, `plural(n, one, many = \`${one}s\`)`, covers both. `app/share/[token]/share-tally.tsx`'s `pluralize` returns the word without the number. It has a different contract, so it is left alone.
- **CHIP_TOUCH has 3 copies, not 2.** `components/trip/wishlist-board.tsx:252` (`chipTouch`, used at :353 and :363) is the third.
- **Badge workaround has 2 sites.** Besides `phase-past.tsx:133`, `components/trip/home/countdown-hero.tsx:51` paints `bg-warning text-warning-foreground` through `className` on a default Badge. Both move to the variant. The token values equal the old hues in both themes (light `--success` = `--teal` = #5BC0BE, `--warning` = `--sun` = #FFD166; dark #6FB8B4 / #E6C57A; `--*-foreground` = `--on-accent` in both). So nothing changes visually, and the contrast audit is unaffected (it measures rendered colours).
- **The test that pinned the hue** is `components/feedback/feedback-launcher.test.tsx:1004,1007` (`bg-teal` on the "Done" badge). It changes to `bg-success`. This is the follow-up's "a test enshrines the hue mapping", so the commit says so (Q10: an assertion changes only because the behaviour it pinned is the bug).
- **Copy:** `scripts/layout-audit/overlays.ts:170` expects the dialog name "Command palette", so it changes to "Search" with the title. `aria-label="Command search"` on the Search input and the Globe's "Current members" (CONTEXT.md **Globe** speaks of "its members") stay as they are. `docs/mobile-pwa-checklist.md:214` is operator documentation that uses the code name, so it also stays.
- **Line numbers are as of `4e6163c1`.** 3.L (the MCP tool files and validations) and 3.N (`lib/money/cost-form-state.ts`) run first and will move some of them. Implementers re-grep with the command each task gives.

**Review Focus candidates:**
1. **An impossible date that matches the format (`2026-02-30`) sent through MCP `set_stop_dates`** must come back as a tool error (`isError: true`, text containing "real calendar date"), and `setStopDates` must never be called. Before this change it reached the action and `new Date` rolled it into March. Test in Task 3.P.2.
2. **The same impossible date typed into a form.** Today the Add a Reminder dialog's client gate lets it through and the server stores the string as-is. With this change both the gate and `reminderSchema` refuse it with "Reminder date must be a real date", and `addReminder` writes nothing. Tests in Task 3.P.1 (the parity case in `reminder-input.test.ts`, plus `server/actions/reminders.test.ts`).
3. **A Cost 99.6 % paid (99 600 of 100 000)** must read "99%" on all three Home surfaces (mobile Budget glance, desktop Trip cost tile, Past-phase Summary), and only exactly-paid reads "100%" (TB-09). Tests in Task 3.P.5.

---

### Task 3.P.1: `isoDate` / `hhmm` zod primitives, and every `lib/validations` copy uses them

**Files:**
- Create: `lib/validations/primitives.ts`, `lib/validations/primitives.test.ts`
- Modify: `lib/dates.ts` (add `isRealCalendarDate` after `formatISODate`, about line 32)
- Modify: `lib/validations/stop.ts:3`, `chapter.ts:6`, `accommodation.ts:6-14`, `checklist.ts:4-7`, `item.ts:8-16`, `trip.ts:5-7,12`, `journal.ts:12-14`, `reminder.ts:22-24`, `cost.ts:16-25,35-40,49-52,59-62`
- Modify: `lib/reminder-input.ts:16`
- Test: `lib/validations/primitives.test.ts`, `lib/dates.test.ts`, `lib/validations/stop.test.ts`, `trip.test.ts`, `chapter.test.ts`, `journal.test.ts`, `accommodation.test.ts`, `lib/reminder-input.test.ts`, `server/actions/reminders.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `isRealCalendarDate(s: string): boolean` in `lib/dates.ts`; `isoDate`, `isoDateWith(formatMessage, realMessage)` and `hhmm` in `lib/validations/primitives.ts`.

- [ ] **Step 1: Write the failing tests**

`lib/validations/primitives.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hhmm, isoDate, isoDateWith } from "./primitives";

const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe("isoDate", () => {
  it.each(["2026-07-01", "2024-02-29", "2026-12-31"])("accepts the real date %s", (s) => {
    expect(isoDate.safeParse(s).success).toBe(true);
  });

  it.each(["2026-02-30", "2027-02-29", "2026-13-01", "2026-04-31", "2026-00-10"])(
    "refuses %s, which matches the format but is not a calendar date",
    (s) => {
      expect(messages(isoDate.safeParse(s))).toEqual(["Date must be a real calendar date"]);
    },
  );

  it.each(["", "5 Dec", "2026-7-1", "2026-07-01T00:00:00Z"])("refuses %o with only the format message", (s) => {
    expect(messages(isoDate.safeParse(s))).toEqual(["Date must be in YYYY-MM-DD format"]);
  });

  it("stays a plain string schema (optional/nullable/union compose)", () => {
    expect(isoDate.optional().safeParse(undefined).success).toBe(true);
    expect(isoDate.nullable().safeParse(null).success).toBe(true);
  });
});

describe("isoDateWith", () => {
  const due = isoDateWith("Due date must be YYYY-MM-DD", "Due date must be a real calendar date");
  it("carries its own messages", () => {
    expect(messages(due.safeParse("soon"))).toEqual(["Due date must be YYYY-MM-DD"]);
    expect(messages(due.safeParse("2026-02-30"))).toEqual(["Due date must be a real calendar date"]);
  });
});

describe("hhmm", () => {
  it.each(["00:00", "09:30", "23:59"])("accepts %s", (s) => expect(hhmm.safeParse(s).success).toBe(true));
  it.each(["24:00", "9:30", "12:60", "12:00:00", ""])("refuses %o", (s) => {
    expect(messages(hhmm.safeParse(s))).toEqual(["Time must be in HH:MM format (24h)"]);
  });
});
```

`lib/dates.test.ts`. Add to the imports, then add:
```ts
describe("isRealCalendarDate", () => {
  it("accepts real dates, including a leap day", () => {
    expect(isRealCalendarDate("2024-02-29")).toBe(true);
    expect(isRealCalendarDate("2026-10-16")).toBe(true);
  });
  it("refuses overflow and non-format strings", () => {
    for (const s of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-7-1", "", "abc"]) {
      expect(isRealCalendarDate(s)).toBe(false);
    }
  });
});
```

Add one impossible-date case to each schema's existing test file, using that file's existing fixture:
```ts
// lib/validations/stop.test.ts (fixture VALID)
it("refuses an arrive date that is not a real calendar date", () => {
  expect(stopSchema.safeParse({ ...VALID, arriveDate: "2026-02-30" }).success).toBe(false);
});
// lib/validations/trip.test.ts (fixture VALID_INPUT)
it("refuses a start date that is not a real calendar date", () => {
  expect(createTripSchema.safeParse({ ...VALID_INPUT, startDate: "2026-02-30" }).success).toBe(false);
});
// lib/validations/chapter.test.ts (fixture VALID)
it("refuses a start date that is not a real calendar date", () => {
  expect(chapterSchema.safeParse({ ...VALID, startDate: "2026-06-31" }).success).toBe(false);
});
// lib/validations/journal.test.ts
it("refuses a date that is not a real calendar date", () => {
  expect(saveJournalEntrySchema.safeParse({ date: "2026-02-30", body: "x" }).success).toBe(false);
});
// lib/validations/accommodation.test.ts (fixture VALID)
it("refuses a check-in that is not a real calendar date", () => {
  expect(accommodationSchema.safeParse({ ...VALID, checkIn: "2026-04-31" }).success).toBe(false);
});
```

`lib/reminder-input.test.ts`. Add `{ title: "Ok", date: "2026-02-30" }` to `CASES`, plus:
```ts
it("refuses an impossible date with the schema's message", () => {
  expect(checkReminderInput({ title: "Ok", date: "2026-02-30" })).toEqual({
    success: false,
    errors: { date: ["Reminder date must be a real date"] },
  });
});
```

`server/actions/reminders.test.ts`, next to "rejects a date that is not YYYY-MM-DD" (about line 167):
```ts
it("rejects a date that matches the format but is not a calendar date", async () => {
  const result = await addReminder(TRIP_ID, { ...VALID_INPUT, date: "2026-02-30" });
  expect(result).toMatchObject({ success: false, errors: { date: ["Reminder date must be a real date"] } });
  expect(reminderCreateMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, expect FAIL.** Run `npx vitest run lib/validations/primitives.test.ts lib/dates.test.ts lib/validations/stop.test.ts lib/validations/trip.test.ts lib/validations/chapter.test.ts lib/validations/journal.test.ts lib/validations/accommodation.test.ts lib/reminder-input.test.ts server/actions/reminders.test.ts`. Expect `primitives.test.ts` to fail with "Failed to resolve import ./primitives", `isRealCalendarDate is not a function`, each impossible-date case to fail with `expected true to be false`, and the reminder parity case to fail because `plain.success` (true) ≠ `zod.success`, which is still true at this point.

- [ ] **Step 3: Implement**

`lib/dates.ts`. Add after `formatISODate`:
```ts
/**
 * True when `s` is a YYYY-MM-DD string naming a real calendar date — rejects
 * overflow like 2026-02-30, which `new Date` would silently roll into March,
 * and anything not in YYYY-MM-DD form. Zod-free so client gates can share it
 * (lib/reminder-input.ts); the zod primitive lives in lib/validations/primitives.ts.
 */
export function isRealCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
```

`lib/validations/primitives.ts`:
```ts
import { z } from "zod";
import { isRealCalendarDate } from "@/lib/dates";

/**
 * Shared zod primitives for calendar dates and wall-clock times. Every zod
 * schema that takes a YYYY-MM-DD date or an HH:MM time uses these, so a date
 * that matches the format but names no real day (2026-02-30) is refused at
 * every door — forms, actions and MCP tools alike.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A YYYY-MM-DD string naming a real calendar date, with the caller's messages.
 * A string that fails the format reports only `formatMessage` — the calendar
 * check runs only on well-formed input, so one bad value yields one message.
 */
export function isoDateWith(formatMessage: string, realMessage: string) {
  return z
    .string()
    .regex(ISO_DATE_RE, formatMessage)
    .refine((s) => !ISO_DATE_RE.test(s) || isRealCalendarDate(s), realMessage);
}

/** A YYYY-MM-DD string naming a real calendar date. */
export const isoDate = isoDateWith("Date must be in YYYY-MM-DD format", "Date must be a real calendar date");

/** An HH:MM 24-hour wall-clock time. */
export const hhmm = z.string().regex(HHMM_RE, "Time must be in HH:MM format (24h)");
```

Change each site as follows:
- `lib/validations/stop.ts:3`: delete the `const isoDate = …` line and add `import { isoDate } from "@/lib/validations/primitives";`.
- `lib/validations/chapter.ts:6`: same change.
- `lib/validations/accommodation.ts:6-14`: delete the two doc comments and the `isoDate` and `hhmm` consts, and add `import { hhmm, isoDate } from "@/lib/validations/primitives";`.
- `lib/validations/item.ts:8-16`: same change as accommodation.
- `lib/validations/checklist.ts:4-7`: delete the comment and the const, and import `isoDate`.
- `lib/validations/trip.ts:5-7`: delete `isoDateString`, import `isoDate`, and at `:12` change `isoDateString.optional()` → `isoDate.optional()`.
- `lib/validations/journal.ts:12-14`: change `date: z.string().regex(/…/, "Date must be in YYYY-MM-DD format"),` → `date: isoDate,`.
- `lib/validations/reminder.ts:22-24`: change `date: z.string().regex(/…/, "Reminder date must be a date (YYYY-MM-DD)"),` → `date: isoDateWith("Reminder date must be a date (YYYY-MM-DD)", "Reminder date must be a real date"),`.
- `lib/validations/cost.ts`:
  - Delete `isRealCalendarDate` (`:16-25`) and import `isoDateWith`.
  - `:37-39` becomes `isoDateWith("paidAt must be YYYY-MM-DD or ISO datetime", "paidAt must be a real calendar date"),` inside `.or(…)`.
  - `paidAtDateOnlySchema` (`:49-52`) becomes `isoDateWith("paidAt must be YYYY-MM-DD", "paidAt must be a real calendar date");`.
  - `dueDateSchema` (`:59-62`) becomes `isoDateWith("Due date must be YYYY-MM-DD", "Due date must be a real calendar date");`.
  - Keep the doc comments above each, updated so they say the primitive owns the calendar check.

`lib/reminder-input.ts:16`:
```ts
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = ["Reminder date must be a date (YYYY-MM-DD)"];
  else if (!isRealCalendarDate(input.date)) errors.date = ["Reminder date must be a real date"];
```
Also add `import { isRealCalendarDate } from "@/lib/dates";`, a value import with no zod, so `client-zod.guard` stays green.

Completeness check (it must print nothing under `lib/validations` except `primitives.ts`):
`grep -rnE "regex\(/\^\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}\\$/|regex\(/\^\(\[01\]" lib/validations`

- [ ] **Step 4: Run it, expect PASS.** Run the same command as Step 2, plus `npx vitest run lib/validations lib/client-zod.guard.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/dates.ts lib/validations/primitives.ts lib/validations/stop.ts lib/validations/chapter.ts lib/validations/accommodation.ts lib/validations/checklist.ts lib/validations/item.ts lib/validations/trip.ts lib/validations/journal.ts lib/validations/reminder.ts lib/validations/cost.ts lib/reminder-input.ts`, then `npx tsc --noEmit`, then `npx eslint` on the same files.
- [ ] **Step 6: Commit.** `git add` the files above and the tests, with the message `feat(validation): shared isoDate/hhmm primitives refuse impossible dates (3.P)`. In the body, say that `2026-02-30` used to pass the format check and then roll into March, and list the schemas.

---

### Task 3.P.2: MCP tools and the schedule action use the primitives

**Files:**
- Modify: `lib/mcp/prompts.ts:15`, `lib/mcp/tools/bookings-write.ts:95-96`, `lib/mcp/tools/plan-write.ts:57-58`, `lib/mcp/tools/trips-stops-write.ts:68`, `lib/mcp/tools/lists-write.ts:88`, `lib/mcp/tools/reads.ts:282`, `server/actions/items.ts:485-497`
- Test: `lib/mcp/tools/trips-stops-write.test.ts`, `lib/mcp/tools/plan-write.test.ts`, `server/actions/items.test.ts`

**Interfaces:**
- Consumes: `isoDate` and `hhmm` from `@/lib/validations/primitives` (Task 3.P.1).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

`lib/mcp/tools/trips-stops-write.test.ts`, next to the existing `set_stop_dates` test (about line 584). This is Review Focus 1:
```ts
it("set_stop_dates refuses a date that matches the format but is not a calendar date, and never calls the action", async () => {
  const c = await connectTestClient();
  const r = await c.callTool({
    name: "set_stop_dates",
    arguments: { stopId: STOP_ID, arriveDate: "2026-02-30", departDate: "2026-03-04" },
  });
  expect(r.isError).toBe(true);
  expect((r.content as { text: string }[])[0].text).toMatch(/real calendar date/);
  expect(setStopDates).not.toHaveBeenCalled();
});
```
(SDK 1.32 turns an input-schema failure into `isError: true` with the text "Input validation error: …", see `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:222`.)

`lib/mcp/tools/plan-write.test.ts`. Use the file's existing hoisted `scheduleItem` mock and `connectTestClient`, and the `schedule_thing_to_do` tool:
```ts
it("the schedule tool refuses 24:00 and an impossible date before calling the action", async () => {
  const c = await connectTestClient();
  const bad = await c.callTool({ name: "schedule_thing_to_do", arguments: { itemId: "i1", date: "2026-04-31" } });
  expect(bad.isError).toBe(true);
  const late = await c.callTool({ name: "schedule_thing_to_do", arguments: { itemId: "i1", date: "2026-04-30", startTime: "24:00" } });
  expect(late.isError).toBe(true);
  expect(scheduleItem).not.toHaveBeenCalled();
});
```
(The tool is `schedule_thing_to_do`, registered at `plan-write.ts:294-300`.)

`server/actions/items.test.ts`, in `describe("scheduleItem")` (about line 823):
```ts
it("refuses a date that matches the format but is not a calendar date", async () => {
  itemFindUniqueMock.mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" });
  const result = await scheduleItem("item-1", { date: "2026-02-30" }, null);
  expect(result).toMatchObject({ success: false, errors: { date: ["Date must be a real calendar date"] } });
  expect(itemCreateMock).not.toHaveBeenCalled();
  expect(itemUpdateMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/mcp/tools/trips-stops-write.test.ts lib/mcp/tools/plan-write.test.ts server/actions/items.test.ts`. Expect `expected undefined to be true` (the tool accepted the date and called the mock), and `expected { success: true … }` / the create mock to have been called.

- [ ] **Step 3: Implement.** At every site below, delete the local const and add `import { isoDate } from "@/lib/validations/primitives";` (or `{ hhmm, isoDate }` where `hhmm` is used). Every existing use (`isoDate`, `isoDate.optional()`, `isoDate.nullable().optional()`, `hhmm.optional()`) stays unchanged.
- `lib/mcp/prompts.ts:15`: delete `const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);`. It is used at `:71` and `:100`.
- `lib/mcp/tools/bookings-write.ts:95-96`: delete `isoDate` and `hhmm`. They are used at `:180-183,193-196,533,544,879`.
- `lib/mcp/tools/plan-write.ts:57-58`: delete `isoDate` and `hhmm`. They are used at `:76-78,90-92,300,380,408-409,424-425`.
- `lib/mcp/tools/trips-stops-write.ts:68`: delete `isoDate`. It is used at `:116-117,130-131,360-362,380-381,398,488,546`. `roughMonth` at `:69` stays.
- `lib/mcp/tools/lists-write.ts:88`: delete `isoDate`. It is used at `:147,166,203,229`.
- `lib/mcp/tools/reads.ts:282`: change `fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()` → `fromDate: isoDate.optional()`.
- `server/actions/items.ts:485-497`: before and after:
  ```ts
  // before
  const scheduleDateSchema = z
    .object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
      startTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format")
        .optional(),
      endTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format")
        .optional(),
    })
  // after
  const scheduleDateSchema = z
    .object({
      date: isoDate,
      startTime: hhmm.optional(),
      endTime: hhmm.optional(),
    })
  ```
  The two `.refine`s after it stay. `ISO_DATE_RE` at `:844` (`rescheduleItem`, which does not use zod) stays. This is a `"use server"` file, but only an import is added, so no export changes and nothing is added to the ALLOWLIST.

Completeness check. Both commands must print nothing:
`grep -rnE "z\.string\(\)\.regex\(/\^\\\\d\{4\}|const (isoDate|hhmm|isoDateString) =" lib server app components | grep -v "lib/validations/primitives.ts"`
`grep -rnE "regex\(/\^\(\[01\]\\\\d\|2\[0-3\]\)" lib server app components | grep -v primitives.ts`

- [ ] **Step 4: Run it, expect PASS.** Run the Step 2 command, plus `npx vitest run lib/mcp`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/mcp/prompts.ts lib/mcp/tools/bookings-write.ts lib/mcp/tools/plan-write.ts lib/mcp/tools/trips-stops-write.ts lib/mcp/tools/lists-write.ts lib/mcp/tools/reads.ts server/actions/items.ts`, then `npx tsc --noEmit`, then `npx eslint` on the same files.
- [ ] **Step 6: Commit.** Use the message `refactor(mcp): MCP tools and scheduleItem take the shared isoDate/hhmm (3.P)`. In the body, say that impossible dates are now refused at the tool boundary and that the HH:MM message is unified to "(24h)".

---

### Task 3.P.3: `plural` once

**Files:**
- Create: `lib/plural.ts`, `lib/plural.test.ts`
- Modify: `lib/admin-queue.ts:28-31`, `components/account/admin-queue-card.tsx:4`, `lib/plan/plan-model.ts:170`, `lib/money/summary-lines.ts:3`, `components/plan/day-section.tsx:78`, `components/plan/stop-open-body.tsx:62`, `components/plan/stay-panel.tsx:35`, `components/plan/mobile/stop-sheet-meta.ts:5`, `components/trips/recently-deleted.tsx:16-18`
- Test: `lib/plural.test.ts`

**Interfaces:**
- Produces: `export function plural(n: number, one: string, many?: string): string` in `lib/plural.ts`.

- [ ] **Step 1: Write the failing test.** `lib/plural.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  it("adds an s by default", () => {
    expect(plural(1, "night")).toBe("1 night");
    expect(plural(0, "night")).toBe("0 nights");
    expect(plural(3, "night")).toBe("3 nights");
  });
  it("takes an explicit plural for irregular nouns and capitalised labels", () => {
    expect(plural(1, "country", "countries")).toBe("1 country");
    expect(plural(2, "country", "countries")).toBe("2 countries");
    expect(plural(2, "Access request", "Access requests")).toBe("2 Access requests");
  });
  it("treats only exactly 1 as singular", () => {
    expect(plural(-1, "night")).toBe("-1 nights");
    expect(plural(1.5, "night")).toBe("1.5 nights");
  });
});
```
(The last case pins what all 8 copies do today: they test `n === 1`.)

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/plural.test.ts` and expect "Failed to resolve import ./plural".

- [ ] **Step 3: Implement.** `lib/plural.ts`:
```ts
/**
 * "1 night" / "3 nights" — the count, a space, then the noun (singular only
 * when n is exactly 1). Pass `many` for irregular plurals ("country" →
 * "countries") or labels that don't take a bare "s".
 */
export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
```
At every site, delete the local copy and add `import { plural } from "@/lib/plural";`. The calls do not change, because both old signatures are call-compatible with this one:
- `lib/admin-queue.ts:28-31`: delete the exported `plural` and its doc comment, and import it. It is used at `:36,38`.
- `components/account/admin-queue-card.tsx:4`: change `import { adminQueueTotal, plural, type AdminQueue } from "@/lib/admin-queue";` → `import { adminQueueTotal, type AdminQueue } from "@/lib/admin-queue";` and add `import { plural } from "@/lib/plural";`.
- `lib/plan/plan-model.ts:170`: `const plural = (n: number, word: string) => …`. It is used at `:72,74,119,174,270,272`.
- `lib/money/summary-lines.ts:3`: `const plural = (n, one, many) => …`. It is used at `:18,20`.
- `components/plan/day-section.tsx:78`, used at `:88`.
- `components/plan/stop-open-body.tsx:62`, used at `:122-124`.
- `components/plan/stay-panel.tsx:35`, used at `:75,104`.
- `components/plan/mobile/stop-sheet-meta.ts:5`, used at `:14,15`.
- `components/trips/recently-deleted.tsx:16-18`: the `function plural(n, noun)`, used at `:23`.

Not touched: `app/share/[token]/share-tally.tsx:7` `pluralize`, which returns the word only.

Completeness check. It must print only `lib/plural.ts`:
`grep -rnE "(const|function) plural\b" lib components app server`

- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/plural.test.ts lib/admin-queue.test.ts lib/money/summary-lines.test.ts lib/plan/plan-model.test.ts components/trips/recently-deleted.test.tsx`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run` on the 9 modified sources plus `lib/plural.ts`, then `npx tsc --noEmit`, then `npx eslint` on the same files. Run `npm run knip -- --include exports` too, if that is quick: `admin-queue`'s removed export must not be flagged elsewhere.
- [ ] **Step 6: Commit.** Use the message `refactor(lib): one plural helper (3.P)`.

---

### Task 3.P.4: `formatISODate` at the seven inline sites, and lint keeps it that way

**Files:**
- Modify: `eslint.config.mjs` (the `S` pieces and the `rules` helper from 3.N.7), `eslint.config.test.ts`, `lib/feedback-inbox.ts:82-84`, `lib/activity.ts:212`, `lib/flags.ts:875`, `lib/mcp/reads/costs.ts:111`, `lib/money/to-pay.ts:73`, `lib/money/cost-form-state.ts:84,198`
- Test: `lib/dates.test.ts` (a characterisation test), plus the lint rule as the red/green gate

**Interfaces:**
- Consumes: `formatISODate(date: Date): string` from `lib/dates.ts:27`. It already exists and formats the date in UTC.
- Produces: the lint rule `no-restricted-syntax` (with a toISOString slice selector) for all non-test `.ts`/`.tsx` files.

UTC check, site by site. `formatISODate` reads `getUTCFullYear/Month/Date`, and `toISOString()` is always UTC, so the calendar date is identical for every valid `Date`. The only differences: (a) an Invalid Date makes `toISOString` throw, while `formatISODate` returns `"NaN-NaN-NaN"`; (b) years before 1000 or after 9999 are padded differently. Neither can happen at these sites. Every input is a Prisma `DateTime` or its serialised ISO string (`flags.ts` `arrAt` comes from a transport row, `to-pay.ts` and `cost-form-state.ts` `paidAt` from a Cost row, `activity.ts` from a diffed Cost row, `feedback-inbox.ts` from `createdAt`/`resolvedAt`). The zod primitives bound years to 4 digits. `flags.ts:875` keeps its `arrIsHome && homeTimezone` branch, so only the UTC fallback changes.

- [ ] **Step 1: Write the failing check.** `eslint.config.mjs` (written by 3.N.7) builds every boundary block through one `rules(imports, syntax)` helper, and ESLint lets the last matching block's `no-restricted-syntax` win outright. So the selector must go **inside that helper**, never in a block of its own (a separate block would silently replace every boundary's `no-restricted-syntax` for the files it matches, or be replaced by them). In `eslint.config.mjs`:
  1. Add a piece to the `S` object, after `noUseServer`:
```js
  // A UTC calendar date is formatISODate (lib/dates.ts) — one spelling (spec 3.P).
  isoDay: [
    {
      selector:
        "CallExpression[callee.property.name=/^(slice|substring|substr|split)$/][callee.object.type='CallExpression'][callee.object.callee.property.name='toISOString']",
      message: "Use formatISODate from @/lib/dates for a YYYY-MM-DD UTC calendar date.",
    },
  ],
```
  2. Change the `rules` helper so every block carries it (tests stay outside: every boundary block already has `ignores: TESTS`):
```js
const rules = (imports, syntax) => ({
  "no-restricted-imports": imports.length ? ["error", { patterns: imports }] : "off",
  "no-restricted-syntax": ["error", ...syntax, ...S.isoDay],
});
```
  3. In `eslint.config.test.ts`, add two probes to `CASES` (before the "Tests sit outside" case):
```ts
  // spec 3.P: one spelling of a UTC calendar date
  ["toISOString().slice in lib", "lib/probe.ts", "export const d = (x: Date) => x.toISOString().slice(0, 10);", true],
  ["toISOString().slice in a narrow zone", "lib/guards.ts", `export const d = (x: Date) => x.toISOString().slice(0, 10);\n${GUARD}`, true],
```
Then add the characterisation test to `lib/dates.test.ts`, in the existing `formatISODate` describe (about line 51):
```ts
it("names the same UTC calendar day toISOString does, at the edges of a day and across offsets", () => {
  for (const iso of [
    "2026-10-01T00:00:00.000Z",
    "2026-10-01T23:59:59.999Z",
    "2026-10-02T09:30:00+10:00", // 23:30 UTC on the 1st
    "2026-09-30T20:00:00-05:00", // 01:00 UTC on the 1st
    "2024-02-29T12:00:00Z",
  ]) {
    const d = new Date(iso);
    expect(formatISODate(d)).toBe(d.toISOString().slice(0, 10));
  }
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run `npx eslint lib/feedback-inbox.ts lib/activity.ts lib/flags.ts lib/mcp/reads/costs.ts lib/money/to-pay.ts lib/money/cost-form-state.ts` and expect **7 errors** "Use formatISODate from @/lib/dates…" (one per site, two in `cost-form-state.ts`). Then run `npx vitest run lib/dates.test.ts`. The characterisation test **passes** at this point; it pins the semantics the swap must keep.

- [ ] **Step 3: Implement.** Add `formatISODate` to each file's `@/lib/dates` import, or add `import { formatISODate } from "@/lib/dates";` where the file has none (`feedback-inbox.ts`, `mcp/reads/costs.ts`, `money/cost-form-state.ts`).
- `lib/feedback-inbox.ts:82-84`: `function day(date: Date): string { return date.toISOString().slice(0, 10); }` becomes `return formatISODate(date);`. Keep `day()` and its comment; it is the inbox's name for the format.
- `lib/activity.ts:212`: change `(v instanceof Date ? v.toISOString().slice(0, 10) : v)` → `(v instanceof Date ? formatISODate(v) : v)`.
- `lib/flags.ts:875`: change `: landDate.toISOString().slice(0, 10);` → `: formatISODate(landDate);`.
- `lib/mcp/reads/costs.ts:111`: change `paidAt instanceof Date ? paidAt.toISOString().slice(0, 10) : String(paidAt).slice(0, 10)` → `paidAt instanceof Date ? formatISODate(paidAt) : String(paidAt).slice(0, 10)`. The string branch is not a `toISOString` call and stays. This is not a query change, so PX-02b does not apply.
- `lib/money/to-pay.ts:73`: change `c.paidAt!.toISOString().slice(0, 10)` → `formatISODate(c.paidAt!)`.
- `lib/money/cost-form-state.ts:84`: change `row.paidAt ? new Date(row.paidAt).toISOString().slice(0, 10) : ""` → `row.paidAt ? formatISODate(new Date(row.paidAt)) : ""`.
- `lib/money/cost-form-state.ts:198`: change `paidAt: new Date(row.paidAt).toISOString().slice(0, 10)` → `paidAt: formatISODate(new Date(row.paidAt))`.

- [ ] **Step 4: Run it, expect PASS.** Run the same eslint command (0 errors), then `npx vitest run eslint.config.test.ts lib/dates.test.ts lib/feedback-inbox.test.ts lib/activity.test.ts lib/flags.test.ts lib/money`, then `npx eslint .`. The rule must be clean repo-wide; the only other `toISOString().slice` hits are in 2 test files, which the rule ignores.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/feedback-inbox.ts lib/activity.ts lib/flags.ts lib/mcp/reads/costs.ts lib/money/to-pay.ts lib/money/cost-form-state.ts`, then `npx tsc --noEmit`, then `npx eslint eslint.config.mjs` plus the 6 files.
- [ ] **Step 6: Commit.** Use the message `refactor(dates): formatISODate at every inline UTC-date site, lint-enforced (3.P)`.

---

### Task 3.P.5: `paidPct` once — fully paid only at 100 % (TB-09)

**Files:**
- Modify: `lib/past-home-loader.ts:237`, `components/trip/home/budget-glance.tsx:18`, `components/trip/home/desktop/trip-cost-tile.tsx:47`
- Test: `components/trip/home/budget-glance.test.tsx`, `components/trip/home/desktop/trip-cost-tile.test.tsx`, `components/trip/home/phase-past.test.tsx`

**Interfaces:**
- Consumes: `paidPct(paidMinor: number, totalMinor: number): number` from `lib/money/summary-lines.ts:35`. It is unchanged: it returns 0 when there is no total, 100 only when `paid >= total`, and is otherwise capped at 99.
- Produces: nothing new. (The spec's "four callers" are these three plus the existing `components/money/paid-bar.tsx:45`.)

- [ ] **Step 1: Write the failing tests.** This is Review Focus 3.

`components/trip/home/budget-glance.test.tsx`:
```ts
it("reads 99, not 100, while money is still owed (TB-09)", () => {
  render(<BudgetGlance costTotalMinor={100000} paidTotalMinor={99600} homeCurrency="AUD" href={"/b" as Route} />);
  expect(screen.getByRole("progressbar", { name: /paid so far/i })).toHaveAttribute("aria-valuenow", "99");
});

it("reads 100 only when fully paid (TB-09)", () => {
  render(<BudgetGlance costTotalMinor={100000} paidTotalMinor={100000} homeCurrency="AUD" href={"/b" as Route} />);
  expect(screen.getByRole("progressbar", { name: /paid so far/i })).toHaveAttribute("aria-valuenow", "100");
});
```

`components/trip/home/desktop/trip-cost-tile.test.tsx` (uses the file's `renderTile`):
```ts
it("reads 99%, not 100%, while money is still owed (TB-09)", () => {
  renderTile({ costTotalMinor: 100_000, paidTotalMinor: 99_600 });
  expect(screen.getByRole("progressbar", { name: "Paid" })).toHaveAttribute("aria-valuenow", "99");
  expect(screen.getByText(/paid · 99%/)).toBeInTheDocument();
});
```

`components/trip/home/phase-past.test.tsx`, inside `describe("PhasePast Playground kit restyle (Task 10b)")`. Use its `dom()` and `buildSpendSoFarMock`:
```ts
it("reads 99%, not 100%, while money is still owed (TB-09)", async () => {
  buildSpendSoFarMock.mockReturnValue({
    costTotalMinor: 100000, paidSoFarMinor: 99600, paidCostMinor: 99600,
    varianceMinor: -400, costRemainingMinor: 400, tripElapsedPct: 100,
  });
  const div = await dom();
  expect(div.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("99");
  expect(div.textContent).toContain("99% of");
  expect(div.textContent).not.toContain("100% of");
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run components/trip/home/budget-glance.test.tsx components/trip/home/desktop/trip-cost-tile.test.tsx components/trip/home/phase-past.test.tsx`. Expect `expected "100" to be "99"` in all three (Math.round(99.6) = 100). The fully-paid case already passes.

- [ ] **Step 3: Implement.** Before and after, at each of the 3 sites, with `import { paidPct } from "@/lib/money/summary-lines";` added:
- `lib/past-home-loader.ts:237`: `const pct = costTotalMinor > 0 ? Math.min(100, Math.round((paidSoFarMinor / costTotalMinor) * 100)) : 0;` becomes `const pct = paidPct(paidSoFarMinor, costTotalMinor);`.
- `components/trip/home/budget-glance.tsx:18`: `const pct = costTotalMinor > 0 ? Math.min(100, Math.round((paidTotalMinor / costTotalMinor) * 100)) : 0;` becomes `const pct = paidPct(paidTotalMinor, costTotalMinor);`.
- `components/trip/home/desktop/trip-cost-tile.tsx:47`: `const pct = costed ? Math.min(100, Math.round((paidTotalMinor / costTotalMinor) * 100)) : 0;` becomes `const pct = paidPct(paidTotalMinor, costTotalMinor);`. `costed` stays because it is used at `:48` and in the JSX.

Completeness check. It must print only `lib/plan/plan-model.ts:304-305` (night fractions, not money) and `components/ui/progress-bar.tsx:15`:
`grep -rn "Math.min(100" lib components app`

- [ ] **Step 4: Run it, expect PASS.** Run the Step 2 command, plus `npx vitest run lib/money/summary-lines.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/past-home-loader.ts components/trip/home/budget-glance.tsx components/trip/home/desktop/trip-cost-tile.tsx`, then `npx tsc --noEmit`, then `npx eslint` on the same files.
- [ ] **Step 6: Commit.** Use the message `fix(money): Home paid percentage uses the shared paidPct — never 100% while owed (TB-09)`. In the body, give the Q15 rule.

---

### Task 3.P.6: `Chip` `touch` prop replaces the three `CHIP_TOUCH` copies

**Files:**
- Modify: `components/ui/chip.tsx:11-28,30-32,34-41`, `components/globe/marker-filters.tsx:17-18,58,70`, `components/trip/globe-suggestions-strip.tsx:60-61,88,97`, `components/trip/wishlist-board.tsx:252,353,363`
- Test: `components/ui/chip.test.tsx`

**Interfaces:**
- Produces: `Chip` takes `touch?: boolean` (default `false`). When it is true, the chip adds `relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']`, which turns the 28px pill into a 44px hit area on coarse pointers.

- [ ] **Step 1: Write the failing test.** Add to `components/ui/chip.test.tsx`:
```ts
it("grows its hit area to 44px on touch when asked", () => {
  const { rerender } = render(<Chip>Food</Chip>);
  expect(screen.getByRole("button").className).not.toContain("pointer-coarse:after:-inset-2");
  rerender(<Chip touch>Food</Chip>);
  const cls = screen.getByRole("button").className;
  expect(cls).toMatch(/(^|\s)relative(\s|$)/);
  expect(cls).toContain("pointer-coarse:after:absolute");
  expect(cls).toContain("pointer-coarse:after:-inset-2");
  expect(cls).toContain("pointer-coarse:after:content-['']");
});

it("does not pass touch through to the DOM", () => {
  render(<Chip touch>Food</Chip>);
  expect(screen.getByRole("button")).not.toHaveAttribute("touch");
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run components/ui/chip.test.tsx`. Expect the class assertions to fail, and `tsc` to report that `touch` does not exist on `ChipProps`.

- [ ] **Step 3: Implement.** In `components/ui/chip.tsx`, add the variant and destructure it:
```ts
      dashed: { true: "border-dashed border-border-soft bg-transparent text-muted-foreground", false: "" },
      /** Kit chips are 28px; on a coarse pointer the hit area grows to 44px (ADR 0029). */
      touch: { true: "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']", false: "" },
    },
    defaultVariants: { tone: "white", size: "m", dashed: false, touch: false },
```
```tsx
const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(({ className, tone, size, dashed, touch, selected, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-pressed={selected}
    className={cn(chipVariants({ tone, size, dashed, touch }), selected && "-translate-x-px -translate-y-px shadow-hard-1", className)}
    {...props}
  />
));
```
Then update the sites:
- `components/globe/marker-filters.tsx`: delete `:17-18` (the doc comment and the `CHIP_TOUCH` const), and at `:58` and `:70` change `className={CHIP_TOUCH}` → `touch`.
- `components/trip/globe-suggestions-strip.tsx`: delete `:60-61` (the comment and `const touch = …`), and at `:88` and `:97` change `className={touch}` → `touch`.
- `components/trip/wishlist-board.tsx`: delete `:252` (`const chipTouch = …`, plus its comment line if there is one), and at `:353` and `:363` change `className={chipTouch}` → `touch`.

Completeness check. It must print nothing:
`grep -rn "CHIP_TOUCH\|chipTouch\|const touch = \"relative" components app`

- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run components/ui/chip.test.tsx components/trip/globe-suggestions-strip.test.tsx components/trip/wishlist-board.test.tsx components/globe/marker-list.test.tsx components/globe/globe-view.test.tsx`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run components/ui/chip.tsx components/globe/marker-filters.tsx components/trip/globe-suggestions-strip.tsx components/trip/wishlist-board.tsx`, then `npx tsc --noEmit`, then `npx eslint` on the same files.
- [ ] **Step 6: Commit.** Use the message `refactor(ui): Chip touch prop replaces three CHIP_TOUCH copies (3.P)`.

---

### Task 3.P.7: Badge `success`/`warning` on status tokens; drop the call-site workarounds

**Files:**
- Create: `components/ui/badge.test.tsx`
- Modify: `components/ui/badge.tsx:19-20`, `components/trip/home/phase-past.tsx:130-135`, `components/trip/home/countdown-hero.tsx:51`
- Test: `components/ui/badge.test.tsx`, `components/feedback/feedback-launcher.test.tsx:1004,1007`, `components/trip/home/phase-past.test.tsx:399-412`, `components/trip/home/countdown-hero.test.tsx:36-48`

**Interfaces:**
- Produces: `<Badge variant="success">` renders `bg-success text-success-foreground`, and `<Badge variant="warning">` renders `bg-warning text-warning-foreground`. The `teal`/`sun` tones keep the hue fills.

Token check (`app/globals.css:117-127,168` light and `:239-249,287` dark). `--success` equals `--teal`, `--warning` equals `--sun`, and both `--*-foreground` equal `--on-accent` in both themes. So the rendered colours do not change. The contrast audit and the playground see identical pixels.

- [ ] **Step 1: Write the failing tests.** `components/ui/badge.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge status variants", () => {
  it("success is the success status token, not the teal hue", () => {
    render(<Badge variant="success">Added</Badge>);
    const cls = screen.getByText("Added").className;
    expect(cls).toMatch(/\bbg-success\b/);
    expect(cls).toMatch(/\btext-success-foreground\b/);
    expect(cls).not.toMatch(/\bbg-teal\b/);
  });

  it("warning is the warning status token, not the sun hue", () => {
    render(<Badge variant="warning">Pending</Badge>);
    const cls = screen.getByText("Pending").className;
    expect(cls).toMatch(/\bbg-warning\b/);
    expect(cls).toMatch(/\btext-warning-foreground\b/);
    expect(cls).not.toMatch(/\bbg-sun\b/);
  });

  it("keeps the hue tones as hues", () => {
    render(<><Badge variant="teal">T</Badge><Badge variant="sun">S</Badge></>);
    expect(screen.getByText("T").className).toMatch(/\bbg-teal\b/);
    expect(screen.getByText("S").className).toMatch(/\bbg-sun\b/);
  });
});
```
`components/feedback/feedback-launcher.test.tsx:1004,1007`: change `bg-teal` → `bg-success` in both lines. These assertions pinned the hue mapping, which the follow-up names as the defect.
`components/trip/home/phase-past.test.tsx:402`: delete the stale comment ("Badge variant="success" still resolves to bg-teal"). The three assertions stay as they are; they now hold through the variant instead of the `className` workaround.

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run components/ui/badge.test.tsx components/feedback/feedback-launcher.test.tsx`. Expect the `bg-success` and `bg-warning` matches to fail (the classes are `bg-teal` and `bg-sun`).

- [ ] **Step 3: Implement.** `components/ui/badge.tsx:19-20`:
```ts
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
```
`components/trip/home/phase-past.tsx:130-135`:
```tsx
          {/* Under/over is a state: status tokens, not an accent hue. */}
          <Badge variant={underBudget ? "success" : "destructive"}>
```
(This replaces `variant={underBudget ? undefined : "destructive"}` and `className={underBudget ? "bg-success text-success-foreground" : undefined}`.)
`components/trip/home/countdown-hero.tsx:51`: `<Badge caps className={cn(urgent && "bg-warning text-warning-foreground")}>` becomes `<Badge caps variant={urgent ? "warning" : undefined}>`. `cn` has no other use in that file, so remove `import { cn } from "@/lib/cn";` at `:1`.

Completeness check. It must print nothing:
`grep -rn "<Badge[^>]*className=[^>]*bg-\(success\|warning\)" components app`

- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run components/ui/badge.test.tsx components/feedback/feedback-launcher.test.tsx components/trip/home/phase-past.test.tsx components/trip/home/countdown-hero.test.tsx components/booking-import components/trip/settings/invite-panel.test.tsx`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run components/ui/badge.tsx components/trip/home/phase-past.tsx components/trip/home/countdown-hero.tsx`, then `npx tsc --noEmit`, then `npx eslint` on the same files.
- [ ] **Step 6: Commit.** Use the message `fix(ui): Badge success/warning use status tokens; call-site workarounds removed (3.P)`. In the body, say that the colours are identical by token, and that `feedback-launcher.test` changes from `bg-teal` to `bg-success` because it enshrined the hue mapping (Q10).

---

### Task 3.P.8: `timeline.tsx` imports — one `@/lib/categories` import, no code between imports

**Files:**
- Modify: `components/trip/timeline.tsx:15,29,33`
- Test: `components/trip/timeline.test.tsx` (existing, unchanged), plus a one-file lint gate

**Interfaces:**
- Consumes and produces nothing. There is no behaviour change.

- [ ] **Step 1: Write the failing check.** Run `npx eslint --rule '{"import/first":"error"}' components/trip/timeline.tsx` and `grep -c '"@/lib/categories"' components/trip/timeline.tsx`.
- [ ] **Step 2: Run it, expect FAIL.** Expect 7 `import/first` errors (lines 34-40, "Import in body of module; reorder to top") and a grep count of `2`. (`import/first` stays a one-file check. Repo-wide it flags 639 places, mostly `vi.mock`-first tests, so it is not turned on.)
- [ ] **Step 3: Implement.** In `components/trip/timeline.tsx`:
  - Merge `:15` `import { categoryClasses } from "@/lib/categories";` and `:29` `import { CATEGORIES, type Category } from "@/lib/categories";` into `import { CATEGORIES, categoryClasses, type Category } from "@/lib/categories";` at `:15`, and delete `:29`.
  - Move `:33` `const CATEGORIES_BY_VALUE = new Map<…>(…);` to just below the last import (after `import { SurpriseBadge } from "@/components/plan/surprise-badge";`), so that imports `:34-40` follow the other imports directly.
- [ ] **Step 4: Run it, expect PASS.** The eslint command reports 0 problems, the grep count is `1`, and `npx vitest run components/trip/timeline.test.tsx` passes.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run components/trip/timeline.tsx`, then `npx tsc --noEmit`, then `npx eslint components/trip/timeline.tsx`.
- [ ] **Step 6: Commit.** Use the message `style(timeline): one categories import, constants after imports (3.P)`.

---

### Task 3.P.9: Copy — "Travellers (N)", "Traveller avatars", and the Search dialog title (ARCH-ADR-4, -5)

**Files:**
- Modify: `app/(app)/trips/[tripId]/layout.tsx:185`, `components/trip/day/day-header.tsx:122`, `components/trip/home/desktop/home-header.tsx:68`, `components/trip/help-guide.tsx:1504`, `components/command-palette.tsx:108`, `scripts/layout-audit/overlays.ts:170`
- Test: `app/(app)/trips/[tripId]/layout.test.tsx:285-296`, `components/trip/day/day-header.test.tsx:44`, `components/trip/home/desktop/home-header.test.tsx:73,81`, `components/trip/help-guide.test.tsx` (about line 196), `components/command-palette.test.tsx`

**Interfaces:**
- Consumes and produces nothing (copy only). CONTEXT.md **Traveller** (*Avoid*: Member) and **Search** (*Avoid*: Command palette) are the rule.

- [ ] **Step 1: Write the failing tests.** Change the assertions. Their intent stays the same; only the name each one asserts changes:
  - `app/(app)/trips/[tripId]/layout.test.tsx:285`: rename the test to `"Traveller avatars are one 44px link to the travellers settings"`, and at `:294` change `{ name: /trip members \(2\)/i }` → `{ name: "Travellers (2)" }`.
  - `components/trip/day/day-header.test.tsx:44`: change `{ name: "Trip members (1)" }` → `{ name: "Travellers (1)" }`.
  - `components/trip/home/desktop/home-header.test.tsx:73`: change `/Trip members \(2\)/` → `/^Travellers \(2\)/`. At `:81` change `"Trip members (2)"` → `"Travellers (2)"`. Also add the Owner case, using the file's `renderHeader` defaults, which are the Owner:
    ```ts
    it("names the people link 'Travellers' for the Owner too, with the invite hint", () => {
      renderHeader({ isOwner: true });
      expect(screen.getByRole("link", { name: "Travellers (2), invite people" })).toBeInTheDocument();
    });
    ```
  - `components/trip/help-guide.test.tsx`, after "never calls Search a command palette":
    ```ts
    it("calls the header's people 'Traveller avatars', never 'member avatars'", () => {
      const { container } = render(<HelpGuide tripId="t1" />);
      const text = container.textContent ?? "";
      expect(text).toContain("Traveller avatars");
      expect(text.toLowerCase()).not.toContain("member avatars");
    });
    ```
  - `components/command-palette.test.tsx`. Use the file's `renderPalette()`:
    ```ts
    it("is announced as Search, never by its code name", async () => {
      renderPalette();
      expect(await screen.findByRole("dialog", { name: "Search" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: /command palette/i })).toBeNull();
    });
    ```
- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run "app/(app)/trips/[tripId]/layout.test.tsx" components/trip/day/day-header.test.tsx components/trip/home/desktop/home-header.test.tsx components/trip/help-guide.test.tsx components/command-palette.test.tsx`. Expect "Unable to find an accessible element with the role "link" and name "Travellers (…)"", "Unable to find role="dialog" and name "Search"", and `expected … to contain "Traveller avatars"`.
- [ ] **Step 3: Implement**
  - `app/(app)/trips/[tripId]/layout.tsx:185`: change ``aria-label={`Trip members (${trip.members.length})`}`` → ``aria-label={`Travellers (${trip.members.length})`}``. At `:180`, also change the JSX comment `{/* Member avatars + fork switcher + notification bell */}` → `{/* Traveller avatars + fork switcher + notification bell */}`.
  - `components/trip/day/day-header.tsx:122`: change ``aria-label={`Trip members (${members.length})`}`` → ``aria-label={`Travellers (${members.length})`}``.
  - `components/trip/home/desktop/home-header.tsx:68`: change ``const peopleLabel = `Trip members (${members.length})${isOwner ? ", invite people" : ""}`;`` → ``const peopleLabel = `Travellers (${members.length})${isOwner ? ", invite people" : ""}`;``.
  - `components/trip/help-guide.tsx:1504`: change `to the member avatars and the notification bell` → `to the Traveller avatars and the notification bell`.
  - `components/command-palette.tsx:108`: change `<DialogTitle className="sr-only">Command palette</DialogTitle>` → `<DialogTitle className="sr-only">Search</DialogTitle>`.
  - `scripts/layout-audit/overlays.ts:170`: change `expect: { role: "dialog", name: "Command palette" },` → `expect: { role: "dialog", name: "Search" },`.

  Completeness check. It must print nothing outside tests and code comments:
  `grep -rn "Trip members\|member avatars\|Command palette" app components lib scripts | grep -v "\.test\."`
  Left alone on purpose: `aria-label="Command search"` (`command-palette.tsx:84`), the Globe's "Current members" (`globe-invite-button.tsx:67`, CONTEXT.md **Globe** "its members"), `components/ui/dock.tsx:35` (a code comment) and `docs/mobile-pwa-checklist.md:214` (operator documentation).
- [ ] **Step 4: Run it, expect PASS.** Run the Step 2 command, plus `npx vitest run scripts/layout-audit/run.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run "app/(app)/trips/[tripId]/layout.tsx" components/trip/day/day-header.tsx components/trip/home/desktop/home-header.tsx components/trip/help-guide.tsx components/command-palette.tsx scripts/layout-audit/overlays.ts`, then `npx tsc --noEmit`, then `npx eslint` on the same files.
- [ ] **Step 6: Commit.** Use the message `fix(copy): Travellers, not Trip members; Search, not Command palette (ARCH-ADR-4, ARCH-ADR-5)`.
## Card 3.P — Hygiene sweep, part B: tests, scripts, BI items, deps

### Notes

**Line numbers** are as of `4e6163c1` (branch head when drafted). 3.N rewrites
`eslint.config.mjs`, so 3.P.13 names the edit by anchor (the `globalIgnores([...])`
list), not by line. Nothing else in this section touches a file 3.L/3.M/3.N edit.

**Interfaces this section produces**
- `test/helpers/css.ts` (3.P.10): `globalsCss(): Root`, `selectorsOf(rule): string[]`,
  `findRules(selector, scope?): Rule[]`, `rule(selectors, scope?): Rule` (throws),
  `atRules(name, params?, scope?): AtRule[]`, `atRule(name, params, scope?): AtRule` (throws),
  `utility(name)`, `keyframes(name)`, `reducedMotion(scope?)`, `lightTheme(): Rule`,
  `decls(node): Record<string, string>`, `declValues(prop, scope?): string[]`,
  `allSelectors(scope?)`, `mentions(text, scope?)`, `commentText(scope?)`.
  `scope` is `Container | readonly Container[]`. 3.O moving `lib/og-card.*` into
  `lib/share/` needs no change here: the test imports the helper by `@/` path.
- `AiUsageOutcome` (`lib/ai-usage.ts`, still module-private) gains `"error"` (3.P.15).
- `scripts/archive/` is outside `tsc`, ESLint, Vitest and knip from 3.P.13 on. **3.O must
  not update imports under `scripts/archive/`.** The archived files import `lib/db`,
  `lib/geocode`, `lib/storage`, `lib/image-size` and `lib/cover`, and those paths may
  go stale when 3.O moves folders. The archive README says so.
- `postcss` becomes a direct devDependency (3.P.10). It was already in the tree at
  8.5.28 as a transitive dependency.

**Deviations from the spec text (decided while drafting)**
1. **`lib/cover-small-image.ts` (+ its test) is archived with the cover backfill.** Its
   only non-test consumer is `scripts/backfill-cover-small-run.ts`. Its own doc
   comment says it exists "for the one-off operator backfill". Left in `lib/`, its
   `isGif` export would become a knip unused export. `sharp` stays in
   devDependencies, because removing dependencies is out of scope.
2. **BI-13 adds an AiUsage outcome `error`**: "billed, then the import failed on our
   side". `AiUsage.outcome` is a `String` column, so no migration is needed. The thrown
   error still propagates as it does today. Only the row is new. The booking-import
   spec's outcome list gets the new value.
3. **BI-14's country check is lenient, like the existing Stop check.** A country that is
   unknown on either side counts as agreement. That is the same rule as `compatible`
   in `resolvePlace` (`match.ts:158`). The Stop path already has the check (`:160`),
   so the actual gap is `matchesHome` (`:144`). `sameCity` itself is unchanged: country
   agreement stays the caller's job. `build.ts:227, 249` compare two drafts from the
   same booking and stay as they are.
4. **The dependency work is two tasks, not one.** 3.P.20 does the in-range caret bumps
   plus `@types/node` 22. 3.P.21 does the exact-pinned packages within their majors
   (next, react, prisma, better-auth, aws-sdk, …) plus the TD-01 refresh. **Both run
   `npm test` + `npx eslint .` + `npm run knip`**, which breaks the per-task
   verification tier on purpose. A lockfile change has no "related" source files, and
   these are the only tasks where the whole graph moves. `next build` is still left to
   the final gate.
5. **The archived npm entries** are `backfill:geocode`, `backfill:cover-aspect`,
   `backfill:cover-small` and `sweep:orphaned-costs` (`package.json:17-20`).
   `backfill-cover-small-run.ts` never had an npm entry.
6. **knip's `entry` lists the recurring scripts by name** instead of using
   `scripts/*.ts` + `scripts/**/*.ts`. `scripts/archive/**` is added to `ignore`.
7. **ADRs 0011, 0028 and 0039** name the archived scripts by their old paths and are
   left alone, because they are decision records. So are dated audits, plans and specs.
   Living docs are updated: `docs/DEPLOY.md`, `docs/maps-overview.md`,
   `docs/open-follow-ups.md`, and the `lib/cover.ts` and `lib/blob-retention.ts` comments.
8. **BI items are tracked only in `docs/follow-ups/2026-10-14-booking-import.md`.**
   Nothing in `docs/open-follow-ups.md` carries a BI id. Each fix records itself there
   in that file's own "**BI-nn · Fixed, date.**" form, the same as BI-04 and BI-12.
9. The spec's tech list says Vitest 3. The repo is on Vitest 4.1.9.

**Review Focus candidates**
1. **A successful import writes exactly one AiUsage row.** Moving the write into a
   `finally` must not double it on the success path, and must not add one for the
   `nothing_usable` return. 3.P.15 tests both with `toHaveBeenCalledOnce()`.
2. **BI-14: a Home with no `countryCode`, or a booking with no country, still matches
   Home by city.** Leniency must not turn into "never matches". 3.P.16 tests both.
3. **The archive really is out of every tool.** Running `npx vitest list --filesOnly`
   and `npx tsc --noEmit --listFilesOnly` must name no `scripts/archive/` file, and
   `npx eslint scripts` must report nothing from it. 3.P.13, Step 4 checks this.

---

### Task 3.P.10: A PostCSS helper for globals.css, and the nine `app/globals*.test.ts` files on it

**Files:**
- Create: `test/helpers/css.ts`
- Create: `test/helpers/css.test.ts`
- Modify: `package.json` (devDependencies: add `"postcss": "^8.5.28"`), `package-lock.json`
- Modify (full rewrite, same `describe`/`it` titles, same assertions' meaning): `app/globals-cursor.test.ts:1-13`, `app/globals-tokens.test.ts:1-42`, `app/globals.attention-motion.test.ts:1-15`, `app/globals.landing-motion.test.ts:1-38`, `app/globals.money.test.ts:1-23`, `app/globals.new-trip-motion.test.ts:1-30`, `app/globals.share-motion.test.ts:1-77`, `app/globals.test.ts:1-20`, `app/globals.view-transition.test.ts:1-50`
- Test: `test/helpers/css.test.ts` and the nine files above

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `test/helpers/css.ts`, with the exports listed in the Notes. 3.P.11 uses `decls`, `lightTheme`, `utility`, `rule`, `atRule`, `atRules`, `findRules`.

- [ ] **Step 1: Write the failing test.** Run `npm install -D postcss@^8.5.28` first. The tree already holds 8.5.28, so only `package.json` and the lockfile's root entry change. Then create `test/helpers/css.test.ts`:
```ts
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { atRule, commentText, declValues, decls, findRules, globalsCss, lightTheme, mentions, reducedMotion, rule, selectorsOf } from "./css";

const SHEET = postcss.parse(`
[data-theme="light"],
:root { --a: 1; color-scheme: light; }
/* a comment naming tp-ghost */
.x:is(.a, .b), .y { animation: tp-x 1s  linear; animation-delay: 0s !important; }
@layer base { @media (prefers-reduced-motion: reduce) { .x { animation: none !important; } } }
@utility pad { padding: 1rem; &::before { content: ""; } }
`);

describe("test/helpers/css", () => {
  it("splits a selector list on top-level commas only, whitespace collapsed", () => {
    expect(selectorsOf(findRules(".y", SHEET)[0])).toEqual([".x:is(.a, .b)", ".y"]);
  });

  it("rule() matches a whole selector list and names what it could not find", () => {
    expect(decls(rule([".x:is(.a, .b)", ".y"], SHEET))).toEqual({ animation: "tp-x 1s linear", "animation-delay": "0s !important" });
    expect(() => rule(".y", SHEET)).toThrow('no rule ".y"');
    expect(() => atRule("utility", "nope", SHEET)).toThrow("no @utility nope");
  });

  it("finds reduced-motion blocks at any depth", () => {
    expect(decls(rule(".x", reducedMotion(SHEET)))).toEqual({ animation: "none !important" });
  });

  it("decls() reads direct children only; declValues() reads every depth", () => {
    const pad = atRule("utility", "pad", SHEET);
    expect(decls(pad)).toEqual({ padding: "1rem" });
    expect(declValues("content", pad)).toEqual(['""']);
  });

  it("mentions() ignores comments; commentText() reads them", () => {
    expect(mentions("tp-ghost", SHEET)).toBe(false);
    expect(commentText(SHEET)).toContain("tp-ghost");
    expect(mentions("tp-x", SHEET)).toBe(true);
  });

  it("parses app/globals.css and finds the light palette rule", () => {
    expect(globalsCss().nodes.length).toBeGreaterThan(0);
    expect(decls(lightTheme())["--background"]).toBe("40 100% 98%");
  });
});
```
- [ ] **Step 2: Run it, expect FAIL.** Command: `npx vitest run test/helpers/css.test.ts`. Expected: `Failed to resolve import "./css"`.
- [ ] **Step 3: Implement.** Create `test/helpers/css.ts`:
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import postcss, { type AtRule, type Container, type Root, type Rule } from "postcss";

/**
 * app/globals.css as a PostCSS tree, so a test pins a rule's meaning
 * (selector, at-rule, declarations) rather than its spacing (spec
 * 2026-10-14 card 3.P). Plain `postcss.parse`, no Tailwind pass: `@utility`,
 * `@theme`, `@layer` and `@custom-variant` stay the at-rules written in the
 * file. Every lookup walks at any depth, in document order.
 */
const GLOBALS = path.join(process.cwd(), "app/globals.css");

let parsed: Root | null = null;
export function globalsCss(): Root {
  parsed ??= postcss.parse(readFileSync(GLOBALS, "utf8"), { from: GLOBALS });
  return parsed;
}

type Scope = Container | readonly Container[];
const list = (scope: Scope): readonly Container[] => ("walk" in scope ? [scope] : scope);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const valueOf = (d: { value: string; important: boolean }) => squash(d.important ? `${d.value} !important` : d.value);

/** A rule's selector list (split on top-level commas), each selector whitespace-collapsed. */
export function selectorsOf(r: Rule): string[] {
  return r.selectors.map(squash);
}

/** Every rule under `scope` whose selector list includes `selector`. */
export function findRules(selector: string, scope: Scope = globalsCss()): Rule[] {
  const want = squash(selector);
  const out: Rule[] = [];
  for (const s of list(scope)) s.walkRules((r) => { if (selectorsOf(r).includes(want)) out.push(r); });
  return out;
}

/** The first rule under `scope` whose selector list is exactly `selectors`. Throws, naming it, when there is none. */
export function rule(selectors: string | readonly string[], scope: Scope = globalsCss()): Rule {
  const want = (typeof selectors === "string" ? [selectors] : selectors).map(squash);
  for (const s of list(scope)) {
    const hits: Rule[] = [];
    s.walkRules((r) => {
      const got = selectorsOf(r);
      if (got.length === want.length && got.every((g, i) => g === want[i])) {
        hits.push(r);
        return false;
      }
    });
    if (hits[0]) return hits[0];
  }
  throw new Error(`no rule "${want.join(", ")}"`);
}

/** Every `@name` at-rule under `scope`, optionally only those whose prelude is `params` (whitespace-collapsed). */
export function atRules(name: string, params?: string, scope: Scope = globalsCss()): AtRule[] {
  const want = params === undefined ? undefined : squash(params);
  const out: AtRule[] = [];
  for (const s of list(scope)) s.walkAtRules(name, (a) => { if (want === undefined || squash(a.params) === want) out.push(a); });
  return out;
}

/** The first `@name params` under `scope`. Throws, naming it, when there is none. */
export function atRule(name: string, params: string, scope: Scope = globalsCss()): AtRule {
  const hit = atRules(name, params, scope)[0];
  if (!hit) throw new Error(`no @${name} ${params}`);
  return hit;
}

export const utility = (name: string): AtRule => atRule("utility", name);
export const keyframes = (name: string): AtRule => atRule("keyframes", name);

/** Every `@media (prefers-reduced-motion: reduce)` block, at any depth (one sits inside `@layer base`). */
export const reducedMotion = (scope: Scope = globalsCss()): AtRule[] => atRules("media", "(prefers-reduced-motion: reduce)", scope);

/** The light palette: `[data-theme="light"], :root`, which the light-locked surfaces re-declare. */
export const lightTheme = (): Rule => rule(['[data-theme="light"]', ":root"]);

/** A node's own declarations (direct children only), prop → value, with `!important` kept on the value. A later declaration wins. */
export function decls(node: Container): Record<string, string> {
  const out: Record<string, string> = {};
  node.each((child) => { if (child.type === "decl") out[child.prop] = valueOf(child); });
  return out;
}

/** The value of every declaration of `prop` (an exact name or a pattern) under `scope`, at any depth. */
export function declValues(prop: string | RegExp, scope: Scope = globalsCss()): string[] {
  const out: string[] = [];
  for (const s of list(scope)) s.walkDecls(prop, (d) => { out.push(valueOf(d)); });
  return out;
}

/** Every selector of every rule under `scope`. */
export function allSelectors(scope: Scope = globalsCss()): string[] {
  const out: string[] = [];
  for (const s of list(scope)) s.walkRules((r) => { out.push(...selectorsOf(r)); });
  return out;
}

/** True when a selector, at-rule prelude, declaration name or value under `scope` contains `text`. Comments don't count. */
export function mentions(text: string, scope: Scope = globalsCss()): boolean {
  let found = false;
  for (const s of list(scope)) {
    s.walk((n) => {
      const parts = n.type === "rule" ? [n.selector] : n.type === "atrule" ? [n.params] : n.type === "decl" ? [n.prop, n.value] : [];
      if (parts.some((p) => p.includes(text))) {
        found = true;
        return false;
      }
    });
  }
  return found;
}

/** The text of every comment under `scope`, newline-joined. */
export function commentText(scope: Scope = globalsCss()): string {
  const out: string[] = [];
  for (const s of list(scope)) s.walkComments((c) => { out.push(c.text); });
  return out.join("\n");
}
```
  Then rewrite the nine files in full. Each one drops `readFileSync`/`path` and imports from `@/test/helpers/css`. Every one of these assertions was checked against the current `app/globals.css` while drafting.

  `app/globals-cursor.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { atRule, decls, rule } from "@/test/helpers/css";

describe("pointer cursor (Feedback cmumcrjs1000304l71nj6l4fk)", () => {
  it("gives every enabled button, role=button and summary a pointer cursor in one base rule", () => {
    const pointer = rule(':where(button, [role="button"], summary):not(:disabled, [aria-disabled="true"])', atRule("layer", "base"));
    expect(decls(pointer)).toEqual({ cursor: "pointer" });
  });
});
```
  `app/globals-tokens.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { atRule, decls, lightTheme, rule, utility } from "@/test/helpers/css";

describe("layout primitives in globals.css", () => {
  it("defines the three shared page widths as container tokens", () => {
    expect(decls(atRule("theme", "inline"))).toMatchObject({
      "--container-page-wide": "100rem",
      "--container-reading": "38em",
      "--container-dialog": "30rem",
    });
  });

  it("defines a tap-target utility that expands the hit area to 44px", () => {
    const tap = utility("tap-target");
    expect(decls(tap).position).toBe("relative");
    expect(decls(rule("&::before", tap))).toMatchObject({ "min-width": "2.75rem", "min-height": "2.75rem" });
  });

  it("defines the range band colour once, from coral (NEW_TRIP.md §3)", () => {
    expect(decls(atRule("theme", "inline"))["--color-range"]).toBe("hsl(var(--coral) / 0.25)");
  });

  it("publishes the Feedback launcher's footprint as --tp-fab-clearance beside --tp-tab-bar-h (spec 2026-10-12 W2)", () => {
    // size-11 button (2.75rem) + the gap it keeps: 1.5rem above the tab bar below md, 1rem corner inset from md.
    expect(decls(rule(":root"))).toMatchObject({ "--tp-tab-bar-h": "4.75rem", "--tp-fab-clearance": "4.25rem" });
    expect(decls(rule(":root", atRule("media", "(min-width: 48rem)")))["--tp-fab-clearance"]).toBe("3.75rem");
  });

  it("switches native controls to the dark scheme wherever the dark palette applies (LA-143)", () => {
    expect(decls(rule(".dark"))["color-scheme"]).toBe("dark");
  });

  it("locks native controls to the light scheme on light-locked surfaces ([data-theme=\"light\"])", () => {
    expect(decls(lightTheme())["color-scheme"]).toBe("light");
  });
});
```
  `app/globals.attention-motion.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { decls, keyframes, reducedMotion, rule, utility } from "@/test/helpers/css";

describe("Feedback launcher attention pulse (spec 2026-10-01 §G)", () => {
  it("defines a two-beat scale pulse on the bounce ease", () => {
    const pulse = keyframes("tp-attention");
    expect(pulse.nodes?.filter((n) => n.type === "rule")).toHaveLength(2);
    expect(decls(rule(["0%", "100%"], pulse))).toEqual({ transform: "scale(1)" });
    expect(decls(rule("50%", pulse))).toEqual({ transform: "scale(1.12)" });
    expect(decls(utility("tp-attention"))).toEqual({ animation: "tp-attention 360ms var(--ease-bounce) 2" });
  });
  it("is nothing at all under reduced motion — a pointer, not information", () => {
    expect(decls(rule(".tp-attention", reducedMotion()))).toEqual({ animation: "none !important" });
  });
});
```
  `app/globals.landing-motion.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { atRules, commentText, declValues, decls, findRules, keyframes, reducedMotion, rule } from "@/test/helpers/css";

const STAGGER = "var(--tp-delay, calc(var(--tp-i) * 80ms))";

describe("Landing entrance motion (spec 2026-09-29 §1.4)", () => {
  it("defines the tilted-card keyframe from an overshot tilt, and the class rests at --tp-tilt", () => {
    expect(decls(rule("from", keyframes("tp-card-in")))).toEqual({ opacity: "0", transform: "translateY(24px) rotate(calc(var(--tp-tilt) * 1.8))" });
    expect(decls(rule(".tp-card-in")).transform).toBe("rotate(var(--tp-tilt))");
  });
  it("staggers by --tp-i at 80ms on --ease-bounce and fills backwards only, so :hover can move the card afterwards", () => {
    expect(decls(rule(".tp-card-in"))).toMatchObject({ animation: "tp-card-in 420ms var(--ease-bounce) backwards", "animation-delay": STAGGER });
    expect(decls(rule(".tp-card-pop-in"))).toMatchObject({ animation: "tp-zoom-in 320ms var(--ease-bounce) backwards", "animation-delay": STAGGER });
    expect(declValues("animation").some((v) => v.includes("tp-card-in 420ms var(--ease-bounce) both"))).toBe(false);
  });
  it("lifts and straightens a card on hover, only on hover-capable devices without reduced motion (Minor #4)", () => {
    const hoverOnly = atRules("media", "(hover: hover) and (prefers-reduced-motion: no-preference)");
    expect(findRules(".tp-card-in:hover", hoverOnly).map(decls)).toEqual([{ transform: "translateY(-4px) rotate(calc(var(--tp-tilt) * 0.8))" }]);
  });
  it("zeroes the stagger delay under prefers-reduced-motion (Review Focus 1)", () => {
    const reset = rule([".tp-card-in", ".tp-card-pop-in", ".tp-pin-pop", ".tp-drop-in", ".tp-band-fill"], reducedMotion());
    expect(decls(reset)).toEqual({ "animation-delay": "0s !important" });
  });
});

describe("Landing route ribbon (handoff LANDING.md §5.4)", () => {
  it("defines the tp-marquee keyframe to -50% and loops it linearly on --tp-marquee-dur", () => {
    expect(decls(rule("to", keyframes("tp-marquee")))).toEqual({ transform: "translateX(-50%)" });
    expect(decls(rule(".tp-marquee"))).toEqual({ animation: "tp-marquee var(--tp-marquee-dur, 22s) linear infinite" });
  });
  it("pauses on press and is switched off, not run once, under reduced motion", () => {
    expect(decls(rule(".tp-marquee:active"))).toEqual({ "animation-play-state": "paused" });
    expect(decls(rule(".tp-marquee", reducedMotion()))).toEqual({ animation: "none" });
  });
  it("the card comment no longer claims nothing loops — the ribbon does", () => {
    expect(commentText()).not.toContain("nothing loops");
    expect(commentText()).toMatch(/ribbon/);
  });
});
```
  `app/globals.money.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { decls, reducedMotion, rule, utility } from "@/test/helpers/css";

describe("globals.css Money utilities (MONEY.md §1)", () => {
  it("defines bg-unpaid-stripe as a card / teal-12% repeating stripe, from tokens", () => {
    const block = Object.values(decls(utility("bg-unpaid-stripe"))).join("; ");
    expect(block).toContain("repeating-linear-gradient");
    expect(block).toContain("hsl(var(--card))");
    expect(block).toContain("hsl(var(--teal) / 0.12)");
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("zeroes tp-rise-in's stagger delay under prefers-reduced-motion (Task 15 review MINOR 2)", () => {
    // The global reduced-motion rule shortens animation-duration but not
    // animation-delay, so the Money page's M1 stagger (inline
    // animation-delay: 60/120/180ms) would otherwise sit invisible for that
    // whole delay before its now-instant animation played.
    expect(decls(rule(".tp-rise-in", reducedMotion()))).toEqual({ "animation-delay": "0s !important" });
  });
});
```
  `app/globals.new-trip-motion.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { decls, findRules, keyframes, reducedMotion, rule, selectorsOf, utility } from "@/test/helpers/css";

/** Selectors of the reduced-motion rule that zeroes the entrance delays (the one that lists .tp-card-in). */
const reducedDelayReset = () =>
  findRules(".tp-card-in", reducedMotion())
    .filter((r) => decls(r)["animation-delay"] === "0s !important")
    .flatMap(selectorsOf);

describe("New trip + Globe arrival motion utilities", () => {
  it("defines the Globe pin pop and settles its delay under reduced motion", () => {
    expect(keyframes("tp-pin-pop").nodes?.length).toBeGreaterThan(0);
    expect(decls(utility("tp-pin-pop"))).toEqual({ animation: "tp-pin-pop var(--dur-slow) var(--ease-bounce) both" });
    expect(reducedDelayReset()).toContain(".tp-pin-pop");
  });

  it("defines the flow's bar drop and card drop-in (MOTION N1)", () => {
    expect(decls(rule("from", keyframes("tp-bar-drop")))).toEqual({ transform: "translateY(-84px)" });
    expect(decls(rule("from", keyframes("tp-drop-in")))).toEqual({ opacity: "0", transform: "translateY(24px) rotate(-4deg) scale(0.96)" });
    expect(decls(utility("tp-bar-drop"))).toEqual({ animation: "tp-bar-drop var(--dur-slow) var(--ease-pop) both" });
    expect(decls(utility("tp-drop-in"))).toEqual({ animation: "tp-drop-in 420ms var(--ease-bounce) 120ms both" });
    expect(reducedDelayReset()).toContain(".tp-drop-in");
  });

  it("defines the stamp thunk and the range band fill (MOTION N6, N8)", () => {
    expect(keyframes("tp-stamp-thunk").nodes?.length).toBeGreaterThan(0);
    expect(decls(utility("tp-stamp-thunk"))).toEqual({ animation: "tp-stamp-thunk 360ms var(--ease-bounce) both" });
    expect(decls(rule("from", keyframes("tp-band-fill")))).toEqual({ transform: "scaleX(0)" });
    expect(decls(utility("tp-band-fill"))).toEqual({ animation: "tp-band-fill var(--dur-base) var(--ease-pop) both" });
    expect(reducedDelayReset()).toContain(".tp-band-fill");
  });
});
```
  `app/globals.share-motion.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { allSelectors, declValues, decls, findRules, keyframes, mentions, reducedMotion, rule, selectorsOf, utility } from "@/test/helpers/css";

describe("share motion (MOTION.md S1–S10)", () => {
  it.each(["tp-share-hero-in", "tp-share-polaroid-in", "tp-live-ring", "tp-progress-fill", "tp-strike", "tp-reveal", "tp-leg-draw", "tp-tag-drop"])(
    "defines %s",
    (name) => {
      expect(mentions(name)).toBe(true);
    },
  );
  it("only the live ring loops (S2)", () => {
    const infinite = declValues("animation").filter((a) => a.includes("infinite"));
    const shareInfinite = infinite.filter((a) => /tp-(share|live|progress|strike|reveal|leg|tag)/.test(a));
    expect(shareInfinite).toHaveLength(1);
    expect(shareInfinite[0]).toContain("tp-live-ring");
  });
  it("hero drop-in is 420ms bounce; progress fill is 700ms pop after 200ms", () => {
    expect(decls(utility("tp-share-hero-in")).animation).toContain("420ms var(--ease-bounce)");
    expect(decls(utility("tp-progress-fill")).animation).toContain("700ms var(--ease-pop) 200ms");
  });
  it("reduced motion stops the ring, shows unrevealed sections and draws legs solid", () => {
    const reduced = reducedMotion();
    expect(decls(rule(".tp-live-ring", reduced)).animation).toBe("none !important");
    expect(decls(rule(".tp-reveal", reduced)).opacity).toBe("1");
    expect(decls(rule(".tp-leg-draw", reduced))).toMatchObject({ animation: "none", "stroke-dasharray": "none" });
  });
  it("reduced motion settles every delayed share entrance at once", () => {
    const settled: string[] = [];
    for (const block of reducedMotion()) {
      block.walkRules((r) => { if (decls(r)["animation-delay"] === "0s !important") settled.push(...selectorsOf(r)); });
    }
    for (const cls of [".tp-share-polaroid-in", ".tp-progress-fill", "[data-revealed] .tp-strike", ".tp-reveal[data-revealed]", ".tp-tag-drop"]) {
      expect(settled).toContain(cls);
    }
  });
  it("entrances inside an armed, unrevealed section wait for the reveal", () => {
    const armed = rule(".tp-reveal[data-reveal-armed]:not([data-revealed]) :is(.tp-leg-draw, .tp-pin-pop, .tp-tag-drop)");
    expect(decls(armed)).toEqual({ "animation-play-state": "paused" });
    expect(allSelectors().filter((s) => s.startsWith(".tp-reveal:not([data-revealed]) :is("))).toEqual([]);
  });
  it("only a section JS hasn't armed unhides after 3s", () => {
    expect(decls(rule("to", keyframes("tp-unhide")))).toEqual({ opacity: "1" });
    expect(decls(rule(".tp-reveal:not([data-revealed]):not([data-reveal-armed])"))).toEqual({ animation: "tp-unhide 0s 3s forwards" });
    expect(findRules(".tp-reveal:not([data-revealed])").filter((r) => decls(r).animation?.startsWith("tp-unhide"))).toEqual([]);
  });
  it("a pending countdown hides its digits until the count starts, with the same failsafe", () => {
    expect(decls(rule("[data-count-pending] > [aria-hidden]"))).toEqual({ opacity: "0", animation: "tp-unhide 0s 3s forwards" });
  });
  it("a strike is drawn at rest and only animates once its section has revealed (S6)", () => {
    const strike = utility("tp-strike");
    expect(decls(strike).background).toContain("100% 2px");
    expect(declValues(/animation/, strike)).toEqual([]);
    expect(decls(rule("[data-revealed] .tp-strike"))).toEqual({
      animation: "tp-strike var(--dur-base) var(--ease-pop) backwards",
      "animation-delay": "calc(var(--tp-i, 0) * 60ms)",
    });
    expect(allSelectors().filter((s) => /:is\([^)]*tp-strike/.test(s))).toEqual([]);
  });
});
```
  `app/globals.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { declValues } from "@/test/helpers/css";

const NAMES = ["sunny", "partly", "overcast", "fog", "rain", "snow", "storm", "wind", "heat", "night", "sun-disc", "cloud", "cloud-back", "cloud-storm", "night-track", "night-text"];

describe("weather tokens (WEATHER_CARD §2)", () => {
  it.each(NAMES)("--wx-%s is defined twice (light + dark) and exposed as --color-wx-*", (n) => {
    expect(declValues(`--wx-${n}`)).toHaveLength(2);
    expect(declValues(`--color-wx-${n}`)).toContain(`hsl(var(--wx-${n}))`);
  });
  it("uses the same HSL in light and dark", () => {
    for (const n of NAMES) expect(new Set(declValues(`--wx-${n}`)).size).toBe(1);
  });
});
```
  `app/globals.view-transition.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { decls, findRules, mentions, reducedMotion, rule, utility } from "@/test/helpers/css";

describe("globals.css view-transition rules (ADR 0063)", () => {
  it.each(["::view-transition-old(.day-forward)", "::view-transition-new(.day-forward)", "::view-transition-old(.day-back)", "::view-transition-new(.day-back)", "::view-transition-old(.day-text)", "::view-transition-new(.day-text)"])("defines %s", (selector) => {
    expect(findRules(selector)).not.toHaveLength(0);
  });
  it("switches off the browser's default root crossfade, so only the named boundaries animate", () => {
    expect(decls(rule(["::view-transition-old(root)", "::view-transition-new(root)"]))).toEqual({ animation: "none" });
  });
  it("lets clicks through while a transition runs", () => {
    expect(decls(rule("::view-transition"))).toEqual({ "pointer-events": "none" });
  });
  it("collapses every view transition to a cut under prefers-reduced-motion", () => {
    const groups = findRules("::view-transition-group(*)", reducedMotion());
    expect(groups).toHaveLength(1);
    expect(decls(groups[0])["animation-duration"]).toBe("0s !important");
  });
  it("has no section crossfade: a section switch is a cut (ADR 0065)", () => {
    expect(mentions("tp-crossfade")).toBe(false);
  });
  it("layers the phone bars' transition groups above every section group", () => {
    expect(decls(rule(["::view-transition-group(tp-tab-bar)", "::view-transition-group(tp-top-bar)"]))["z-index"]).toMatch(/^\d+$/);
  });
  it("defines the navigation progress utility", () => {
    expect(utility("tp-nav-progress").nodes?.length).toBeGreaterThan(0);
  });
  it("day heading text crossfades in 150ms, in step with the body slide (spec 2026-09-29 D4)", () => {
    expect(decls(rule("::view-transition-old(.day-text)")).animation).toMatch(/^150ms/);
    expect(decls(rule("::view-transition-new(.day-text)")).animation).toMatch(/^150ms/);
  });
  it("day page-turn: a far jump slides full-width with no fade, clipped to the body (ADR 0065)", () => {
    for (const cls of ["day-forward", "day-back"]) {
      for (const side of ["old", "new"]) {
        const block = Object.values(decls(rule(`::view-transition-${side}(.${cls})`))).join("; ");
        expect(block).not.toContain("tp-vt-fade");
        expect(block).toContain("100%");
        expect(block).toContain("300ms");
      }
    }
    expect(decls(rule(["::view-transition-image-pair(.day-forward)", "::view-transition-image-pair(.day-back)"]))).toEqual({ overflow: "clip" });
    expect(mentions("tp-vt-slide")).toBe(false);
  });
});
```
- [ ] **Step 4: Run it, expect PASS.** Command: `npx vitest run test/helpers/css.test.ts app/globals-cursor.test.ts app/globals-tokens.test.ts app/globals.attention-motion.test.ts app/globals.landing-motion.test.ts app/globals.money.test.ts app/globals.new-trip-motion.test.ts app/globals.share-motion.test.ts app/globals.test.ts app/globals.view-transition.test.ts`. Expect the same test count per file as before (`it.each` rows included). **Mutation check:** in `app/globals.css:609`, change `.tp-attention { animation: none !important; }` to `.tp-attention { animation: none; }`. Then `globals.attention-motion.test.ts` must fail. Restore the file with `git checkout app/globals.css`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run test/helpers/css.ts` + `npx tsc --noEmit` + `npx eslint test/helpers/css.ts test/helpers/css.test.ts app/globals*.test.ts`.
- [ ] **Step 6: Commit.** Run `git add test/helpers/css.ts test/helpers/css.test.ts package.json package-lock.json app/globals-cursor.test.ts app/globals-tokens.test.ts app/globals.attention-motion.test.ts app/globals.landing-motion.test.ts app/globals.money.test.ts app/globals.new-trip-motion.test.ts app/globals.share-motion.test.ts app/globals.test.ts app/globals.view-transition.test.ts` with the message `test(css): globals.css tests read a PostCSS tree, not its text`.

---

### Task 3.P.11: The six other globals.css readers on the helper

**Files:**
- Modify: `app/global-error.test.tsx:36-48` (+ helper import at the top)
- Modify: `app/landing/landing.test.tsx:1-2, 67-68`
- Modify: `app/(app)/trips/[tripId]/print/page.test.tsx:53, 57-63` (+ helper import)
- Modify: `components/ui/card.test.tsx:18-29` (+ helper import)
- Modify: `components/trips/tally-card.test.tsx:71-91` (+ helper import)
- Modify: `lib/og-card.test.ts:1, 17-23`
- Test: the same six files

**Interfaces:**
- Consumes: `decls`, `lightTheme`, `utility`, `rule`, `atRule`, `atRules`, `findRules` from `@/test/helpers/css` (3.P.10).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test.** Nothing new should fail: this is a re-expression with the same meaning. Rewrite these sites, keeping every assertion:
  - `app/global-error.test.tsx`. Add `import { decls, lightTheme } from "@/test/helpers/css";`. Delete `:38` (`const globals = readFileSync("app/globals.css", "utf8");`). Change `:48` from `const rootLight = vars(block(globals, ":root {"));` to `const rootLight = decls(lightTheme());`. `block`, `vars` and `localLight` stay, because they still parse `global-error.tsx`'s inline `:root{…}`. `readFileSync` stays for the same reason.
  - `app/landing/landing.test.tsx`. Delete `:1-2` (the `readFileSync` and `join` imports, used only at `:67`). Add `import { decls, lightTheme } from "@/test/helpers/css";`. Replace `:67-68` with:
    ```ts
    expect(decls(lightTheme())["--background"]).toBe("40 100% 98%");
    ```
  - `app/(app)/trips/[tripId]/print/page.test.tsx`. Add `import { decls, lightTheme } from "@/test/helpers/css";`. Delete `:53` (`const globals = …`). Replace `lightTokens` at `:57-63` with:
    ```ts
    /** `--name: h s% l%` pairs declared on globals.css's light palette rule. */
    function lightTokens(): Map<string, string> {
      return new Map(Object.entries(decls(lightTheme())).filter(([k]) => k.startsWith("--")));
    }
    ```
  - `components/ui/card.test.tsx`. Add `import { decls, lightTheme, utility } from "@/test/helpers/css";`. Replace the body of `:19-28`, which drops the async and the dynamic `fs`/`path` imports:
    ```ts
    it("re-scopes --primary-foreground to the light-theme ink-button text, so a primary Button inside a toned Card reads light-on-ink in both themes", () => {
      const island = decls(utility("island"));
      const lightPrimaryFg = decls(lightTheme())["--primary-foreground"];
      expect(island["--primary"]).toBe("var(--on-accent)");
      expect(island["--primary-foreground"]).toBe(lightPrimaryFg);
    });
    ```
  - `components/trips/tally-card.test.tsx`. Add `import type { AtRule } from "postcss";` and `import { atRule, atRules, decls, findRules, rule } from "@/test/helpers/css";`. Replace `:71-91` (the second `it`), keeping its title and comment:
    ```ts
    it("steps the headline down, then drops the second cell row, as the card's own box shrinks (Resolves-Feedback cmutai0m4000604l8mtbi92xt)", () => {
      expect(decls(rule(".tally-card"))).toEqual({ "container-type": "size" });

      const shrinkHeadline = atRule("container", "(max-height: 260px)");
      expect(decls(rule(".tally-headline-num", shrinkHeadline))).toEqual({ "font-size": "32px" });
      expect(decls(rule(".tally-headline-label", shrinkHeadline))).toEqual({ "font-size": "14px" });

      const dropRow2 = atRule("container", "(max-height: 217px)");
      expect(decls(rule(".tally-cell-row2", dropRow2))).toEqual({ display: "none" });

      // The drop-row2 threshold must be below the shrink-headline one — it's a
      // second, deeper step down, not an alternative.
      const maxHeight = (a: AtRule) => Number(/max-height: (\d+)px/.exec(a.params)?.[1]);
      const steps = atRules("container").filter((a) => a.params.includes("max-height"));
      const shrinkAt = maxHeight(steps.find((a) => findRules(".tally-headline-num", a).length > 0)!);
      const dropAt = maxHeight(steps.find((a) => findRules(".tally-cell-row2", a).length > 0)!);
      expect(dropAt).toBeLessThan(shrinkAt);
    });
    ```
  - `lib/og-card.test.ts`. Replace `:1` (`import { readFileSync } …`) with `import { decls, lightTheme } from "@/test/helpers/css";`. Replace `rootToken` at `:17-23` with:
    ```ts
    function rootToken(name: string): string {
      const value = decls(lightTheme())[`--${name}`];
      if (!value) throw new Error(`token --${name} not found in the light palette`);
      return hslToHex(value);
    }
    ```
- [ ] **Step 2: Run it, expect PASS.** Command: `npx vitest run app/global-error.test.tsx app/landing/landing.test.tsx "app/(app)/trips/[tripId]/print/page.test.tsx" components/ui/card.test.tsx components/trips/tally-card.test.tsx lib/og-card.test.ts`. The test count per file must be unchanged. `global-error`'s `it.each(Object.keys(localLight))` rows must all still pass, which shows that `decls(lightTheme())` holds every name `vars(block(globals, ":root {"))` did.
- [ ] **Step 3: Implement (mutation check).** In `app/globals.css:531`, change the island's `--primary-foreground: 40 100% 98%;` to `40 100% 97%`. Then `components/ui/card.test.tsx` must fail. In `app/globals.css:99`, change `--background: 40 100% 98%;` to `40 100% 97%`. Then `landing.test.tsx`, `og-card.test.ts` (`paper`) and `global-error.test.tsx` (`--background`) must all fail. Restore with `git checkout app/globals.css`.
- [ ] **Step 4: Run it, expect PASS.** Rerun the Step 2 command after the restore.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run test/helpers/css.ts` + `npx tsc --noEmit` + `npx eslint app/global-error.test.tsx app/landing/landing.test.tsx "app/(app)/trips/[tripId]/print/page.test.tsx" components/ui/card.test.tsx components/trips/tally-card.test.tsx lib/og-card.test.ts`. Then confirm that `grep -rln 'globals.css", "utf' --include=*.test.ts --include=*.test.tsx app components lib test` prints nothing, meaning no test reads globals.css as text any more.
- [ ] **Step 6: Commit.** Run `git add` on the six files with the message `test(css): the remaining globals.css readers use the PostCSS helper`.

---

### Task 3.P.12: `page-widths.test` stops shelling out

**Files:**
- Modify: `app/page-widths.test.ts:1-12` (full rewrite)
- Test: `app/page-widths.test.ts`

**Interfaces:**
- Consumes: `walkSources(dir, { exts })` from `test/helpers/walk-sources.ts` (exists today and is kept by 3.N).
- Produces: nothing.

- [ ] **Step 1: Write the failing test.** Rewrite the whole file:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { walkSources } from "@/test/helpers/walk-sources";

describe("page widths", () => {
  it("no page or layout uses the old shell widths", () => {
    const offenders = ["app", "components"]
      .flatMap((dir) => walkSources(dir, { exts: [".tsx"] }))
      .filter((file) => /max-w-(5xl|6xl|7xl)/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
```
- [ ] **Step 2: Run it, expect FAIL (mutation).** Create a throwaway `components/zz-probe.tsx` containing `export const P = () => <div className="max-w-6xl" />;`. Run `npx vitest run app/page-widths.test.ts`. Expected: FAIL with `expected [ 'components/zz-probe.tsx' ] to deeply equal []`. Delete the probe.
- [ ] **Step 3: Implement.** Nothing beyond Step 1. `walkSources` skips dot-directories, which `grep -r` did not. No `.tsx` lives under a dot-directory in `app/` or `components/` today: `find app components -path '*/.*' -name '*.tsx'` prints nothing.
- [ ] **Step 4: Run it, expect PASS.** Command: `npx vitest run app/page-widths.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run app/page-widths.test.ts` + `npx tsc --noEmit` + `npx eslint app/page-widths.test.ts`. Then confirm that `grep -n child_process app/page-widths.test.ts` prints nothing.
- [ ] **Step 6: Commit.** Run `git add app/page-widths.test.ts` with the message `test(layout): page-widths reads files in-process instead of shelling out to grep`.

---

### Task 3.P.13: One-off scripts move to `scripts/archive/`

**Files:**
- Move (`git mv`): `scripts/backfill-geocode.ts`, `scripts/backfill-cover-aspect.ts`, `scripts/backfill-cover-small.ts`, `scripts/backfill-cover-small-run.ts`, `scripts/backfill-cover-small-run.test.ts`, `scripts/sweep-orphaned-costs.ts`, `lib/cover-small-image.ts`, `lib/cover-small-image.test.ts`, all into `scripts/archive/`
- Create: `scripts/archive/README.md`
- Modify: `package.json:17-20` (delete four npm entries)
- Modify: `knip.json:3-12`, `tsconfig.json:33`, `vitest.config.ts:32`, `eslint.config.mjs` (`globalIgnores([...])` list)
- Modify: `scripts/lib/script-guards.test.ts:46`
- Modify (docs/comments): `docs/DEPLOY.md:688-697`, `docs/maps-overview.md:92, 388`, `docs/open-follow-ups.md:2829-2834`, `lib/cover.ts:7`, `lib/blob-retention.ts:17`
- Test: `scripts/lib/script-guards.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `scripts/archive/**` is excluded from `tsc`, ESLint, Vitest and knip. Later tasks (3.O) must not edit files under it.

- [ ] **Step 1: Write the failing test.** Move the files first:
```bash
mkdir -p scripts/archive
git mv scripts/backfill-geocode.ts scripts/backfill-cover-aspect.ts scripts/backfill-cover-small.ts \
       scripts/backfill-cover-small-run.ts scripts/backfill-cover-small-run.test.ts \
       scripts/sweep-orphaned-costs.ts scripts/archive/
git mv lib/cover-small-image.ts lib/cover-small-image.test.ts scripts/archive/
```
- [ ] **Step 2: Run it, expect FAIL.** Command: `npx vitest run scripts/lib/script-guards.test.ts`. Expected: `ENOENT: no such file or directory, open 'scripts/backfill-geocode.ts'` (and the same for `sweep-orphaned-costs.ts`), from "operator scripts import load-env first".
- [ ] **Step 3: Implement.**
  1. `scripts/lib/script-guards.test.ts:46`. Change the list from `["scripts/backfill-geocode.ts", "scripts/sweep-orphaned-costs.ts", "scripts/sweep-deleted-blobs.ts"]` to the maintained operator scripts that load the env: `["scripts/sweep-deleted-blobs.ts", "scripts/feedback-pull.ts", "scripts/feedback-resolve.ts", "scripts/feedback-accept.ts"]`. All four start with `import "./load-env";` today.
  2. **Fix the moved files' relative imports** so each one still runs from its new home, even though no tool checks it any more:
     - `scripts/archive/backfill-geocode.ts:41-44`: `"./load-env"` → `"../load-env"`; `"../lib/db"` → `"../../lib/db"`; `"../lib/geocode"` → `"../../lib/geocode"`; `"./lib/script-guards"` → `"../lib/script-guards"`.
     - `scripts/archive/backfill-cover-aspect.ts:43, 45-48`: `"./load-env"` → `"../load-env"`; `"../lib/db"`, `"../lib/storage"`, `"../lib/image-size"` → `"../../lib/…"`; `"./lib/storage-target"` → `"../lib/storage-target"`.
     - `scripts/archive/backfill-cover-small.ts:46, 48-51`: `"./load-env"` → `"../load-env"`; `"../lib/db"`, `"../lib/storage"` → `"../../lib/…"`; `"./lib/storage-target"` → `"../lib/storage-target"`. `"./backfill-cover-small-run"` is unchanged.
     - `scripts/archive/backfill-cover-small-run.ts:1-4`: `"../lib/db"`, `"../lib/storage"`, `"../lib/cover"` → `"../../lib/…"`; `"../lib/cover-small-image"` → `"./cover-small-image"`.
     - `scripts/archive/backfill-cover-small-run.test.ts:4`: `"../lib/cover"` → `"../../lib/cover"`.
     - `scripts/archive/cover-small-image.ts:2`: `"./cover"` → `"../../lib/cover"`. In its doc comment (`:14`), change `` `scripts/backfill-cover-small-run.ts` `` to `` `scripts/archive/backfill-cover-small-run.ts` ``.
     - `scripts/archive/sweep-orphaned-costs.ts:13, 15`: `"./load-env"` → `"../load-env"`; `"./lib/script-guards"` → `"../lib/script-guards"`. `"@/lib/db"` is unchanged.
     - Headers. In `backfill-geocode.ts:5`, `backfill-cover-aspect.ts:5` and `backfill-cover-small.ts:5`, change `npx tsx scripts/<name>.ts` to `npx tsx --conditions=react-server scripts/archive/<name>.ts`, and delete `:7-9` (the "Or via the npm script" pair and the ` *` after it). In `sweep-orphaned-costs.ts:7-8`, change `scripts/sweep-orphaned-costs.ts` to `scripts/archive/sweep-orphaned-costs.ts`.
  3. `package.json`. Delete lines 17-20: `"backfill:geocode"`, `"backfill:cover-aspect"`, `"backfill:cover-small"`, `"sweep:orphaned-costs"`.
  4. `tsconfig.json:33`. Change `"exclude": ["node_modules", "design_handoff"]` to `"exclude": ["node_modules", "design_handoff", "scripts/archive"]`.
  5. `vitest.config.ts:32`. Change `exclude: ['node_modules', '.next', 'test/integration/**'],` to `exclude: ['node_modules', '.next', 'test/integration/**', 'scripts/archive/**'],`.
  6. `eslint.config.mjs`. In the `globalIgnores([...])` list, add the following after the `"design_handoff/**",` entry:
     ```js
     // One-off operator scripts kept for reference, unmaintained (scripts/archive/README.md).
     "scripts/archive/**",
     ```
  7. `knip.json`. Replace the file with:
     ```json
     {
       "$schema": "https://unpkg.com/knip@latest/schema.json",
       "entry": [
         "scripts/booking-import-smoke.ts",
         "scripts/contrast-audit.ts",
         "scripts/feedback-accept.ts",
         "scripts/feedback-pull.ts",
         "scripts/feedback-resolve.ts",
         "scripts/layout-audit.ts",
         "scripts/layout-audit/crops.ts",
         "scripts/nav-audit.ts",
         "scripts/sweep-deleted-blobs.ts",
         "scripts/verify-r2-presign.ts",
         "prisma/seed*.ts",
         "vitest.integration.config.ts"
       ],
       "project": ["**/*.{ts,tsx,css,prisma}"],
       "ignore": [
         "design_handoff/**",
         "scripts/archive/**",
         "test/server-only-stub.ts"
       ]
     }
     ```
  8. `scripts/archive/README.md`:
     ```markdown
     # Archived one-off scripts

     Kept for reference only — **unmaintained**. Each ran once against production
     and is not expected to run again. This folder is excluded from `tsc`
     (`tsconfig.json`), ESLint (`eslint.config.mjs`), Vitest (`vitest.config.ts`)
     and knip (`knip.json`), so imports of `lib/` here may go stale as `lib/`
     moves; fix them before running one again.

     | Script | What it did | Why |
     |---|---|---|
     | `backfill-geocode.ts` | Geocoded Items, Accommodation and Transport saved before coordinates were stored | ADR 0011 |
     | `backfill-cover-aspect.ts` | Filled `Trip.coverAspect` for covers uploaded before it existed | spec F (cmuj4l1d9) |
     | `backfill-cover-small.ts` (+ `backfill-cover-small-run.ts`, `cover-small-image.ts`) | Made ~480w WebP copies of covers uploaded before small copies existed | spec 2026-10-06 §H, PX-01 |
     | `sweep-orphaned-costs.ts` | Cleared Cost rows orphaned before ADR 0039 | ADR 0039 |

     Run one with `npx tsx --conditions=react-server scripts/archive/<name>.ts`;
     each file's header gives its flags (`--dry-run` / `--execute`).
     ```
  9. Docs and comments that name the old paths or npm entries:
     - `docs/DEPLOY.md:688`. Change the heading to `### One-off: sweep orphaned costs (after the ADR 0039 deploy — done; archived)`. At `:693-694`, change `scripts/sweep-orphaned-costs.ts` to `scripts/archive/sweep-orphaned-costs.ts` (twice).
     - `docs/maps-overview.md:92`. Change `│  scripts/backfill-geocode.ts throttled one-off backfill             │` to `│  scripts/archive/backfill-geocode.ts  one-off backfill (archived)   │`, which keeps the box 71 columns wide. At `:388`, change `` `scripts/backfill-geocode.ts` `` to `` `scripts/archive/backfill-geocode.ts` (archived) ``.
     - `docs/open-follow-ups.md:2829-2832`. Change `` `npm run backfill:cover-small [-- --dry-run]` (`scripts/backfill-cover-small.ts`, shaped like `scripts/backfill-cover-aspect.ts`; its loop is `scripts/ backfill-cover-small-run.ts` `` to `` `npx tsx --conditions=react-server scripts/archive/backfill-cover-small.ts [--dry-run]` (archived 2026-10-16; shaped like `scripts/archive/backfill-cover-aspect.ts`; its loop is `scripts/archive/backfill-cover-small-run.ts` ``. At `:2834`, change `` `lib/cover-small-image.ts` `` to `` `scripts/archive/cover-small-image.ts` ``.
     - `lib/cover.ts:7`. Change `` `scripts/backfill-cover-aspect.ts` `` to `` `scripts/archive/backfill-cover-aspect.ts` ``.
     - `lib/blob-retention.ts:17`. Change `scripts/sweep-orphaned-costs.ts` to `scripts/archive/sweep-orphaned-costs.ts`.
     - ADRs 0011, 0028 and 0039, `docs/architecture-sitrep-2026-09-22.md`, and `docs/superpowers/plans/**` / `docs/specs/**` are records, so they stay as they are.
- [ ] **Step 4: Run it, expect PASS.** Command: `npx vitest run scripts/lib/script-guards.test.ts`. Then check the archive is out of every tool (Review Focus 3):
  - `npx vitest list --filesOnly | grep -c scripts/archive` → `0`
  - `npx tsc --noEmit --listFilesOnly | grep -c scripts/archive` → `0`
  - `npx eslint scripts` → reports nothing from `scripts/archive/`
  - `grep -rn "backfill:\|sweep:orphaned" package.json docs/DEPLOY.md docs/open-follow-ups.md` → nothing
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run scripts/lib/script-guards.ts lib/cover.ts lib/blob-retention.ts` + `npx tsc --noEmit` + `npx eslint scripts/lib/script-guards.test.ts lib/cover.ts lib/blob-retention.ts eslint.config.mjs vitest.config.ts`. Also run `npm run knip`, because this task changes knip's config: it must report nothing. If knip names an export that only the archived files used, drop the `export` keyword or delete it, and list it in the commit body. The draft check found none, because every other import has a live caller or a test.
- [ ] **Step 6: Commit.** Run `git add -A scripts/ lib/cover-small-image.ts lib/cover-small-image.test.ts package.json knip.json tsconfig.json vitest.config.ts eslint.config.mjs docs/DEPLOY.md docs/maps-overview.md docs/open-follow-ups.md lib/cover.ts lib/blob-retention.ts` with the message `chore(scripts): archive the one-off backfills and the orphaned-costs sweep`. The commit body names the four removed npm entries and says that `lib/cover-small-image.ts` went with its only consumer.

---

### Task 3.P.14: BI-10 — `lib/fx.ts` calls Frankfurter's current host

**Files:**
- Modify: `lib/fx.ts:64`
- Modify: `docs/follow-ups/2026-10-14-booking-import.md:44-48` (BI-10), `docs/HANDOFF.md:219`
- Test: `lib/fx.test.ts` (append after `:401`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `fetchRate`'s signature is unchanged.

- [ ] **Step 1: Write the failing test.** Append to `lib/fx.test.ts`:
```ts
describe("fetchRate base URL (BI-10)", () => {
  it("asks Frankfurter's current host directly, not the redirecting api.frankfurter.app", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { AUD: 1.6 } }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchRate("EUR", "AUD")).toBe(1.6);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=AUD");
    vi.unstubAllGlobals();
  });
});
```
- [ ] **Step 2: Run it, expect FAIL.** Command: `npx vitest run lib/fx.test.ts`. Expected: `expected 'https://api.frankfurter.app/latest?base=EUR&symbols=AUD' to be 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=AUD'`.
- [ ] **Step 3: Implement.** In `lib/fx.ts`, add a module constant above `fetchRate` (not exported, so knip stays quiet):
```ts
/** Frankfurter's v1 API. api.frankfurter.app 301-redirects here (BI-10); call it directly. */
const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";
```
  At `:64`, change
  `` const url = `https://api.frankfurter.app/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`; ``
  to
  `` const url = `${FRANKFURTER_BASE}/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`; ``.
  In `docs/HANDOFF.md:219`, change `` (`https://api.frankfurter.dev`) `` to `` (`https://api.frankfurter.dev/v1`) ``.
  In `docs/follow-ups/2026-10-14-booking-import.md:44-48`, replace the BI-10 entry with:
  `` - **BI-10 · Fixed, 2026-10-16, tidy-up batch 3.** `lib/fx.ts` requested `https://api.frankfurter.app`, which 301-redirects to `https://api.frankfurter.dev/v1`; it now calls `https://api.frankfurter.dev/v1` directly (`lib/fx.test.ts` pins the URL). ``
  Optional, if there is network: `curl -s "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=AUD"` returns `{"amount":1.0,"base":"EUR",…,"rates":{"AUD":…}}`.
- [ ] **Step 4: Run it, expect PASS.** Command: `npx vitest run lib/fx.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/fx.ts` + `npx tsc --noEmit` + `npx eslint lib/fx.ts lib/fx.test.ts`.
- [ ] **Step 6: Commit.** Run `git add lib/fx.ts lib/fx.test.ts docs/HANDOFF.md docs/follow-ups/2026-10-14-booking-import.md` with the message `fix(fx): call api.frankfurter.dev/v1 directly instead of via the redirect (BI-10)`.

---

### Task 3.P.15: BI-13 — the AiUsage row is written in a `finally` after a paid call

**Files:**
- Modify: `server/actions/booking-import.ts:97-101`
- Modify: `lib/ai-usage.ts:6-7`
- Modify: `docs/specs/2026-10-14-booking-import.md:140-141`, `docs/follow-ups/2026-10-14-booking-import.md:59-61` (BI-13)
- Test: `server/actions/booking-import.test.ts` (inside `describe("importBooking")`, before `:136`'s closing `});`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `AiUsageOutcome` (module-private in `lib/ai-usage.ts`) = `"ok" | "not_booking" | "unreadable" | "api_error" | "rate_limited" | "error"`. No new exports, so the `"use server"` allowlist is untouched.

- [ ] **Step 1: Write the failing test.** Add:
```ts
  it("still writes the usage row when the Trip can't be read after a paid call (BI-13)", async () => {
    m.load.mockRejectedValue(new Error("connection reset"));
    await expect(importBooking(form({ tripId: "trip-1", text: "x" }))).rejects.toThrow("connection reset");
    expect(m.record).toHaveBeenCalledOnce();
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "trip-1", userId: `u${user}`, model: "claude-haiku-5-5", usage: USAGE, proposalCount: 0, outcome: "error" }),
    );
  });

  it("writes exactly one usage row on success and on nothing-usable (Review Focus 1)", async () => {
    await importBooking(form({ tripId: "trip-1", text: "x" }));
    expect(m.record).toHaveBeenCalledOnce();
    m.record.mockClear();
    m.extract.mockResolvedValue({ kind: "ok", model: "claude-haiku-5-5", usage: USAGE, extraction: { ...SAMPLE_EXTRACTION, proposals: [] } });
    await importBooking(form({ tripId: "trip-1", text: "x" }));
    expect(m.record).toHaveBeenCalledOnce();
  });
```
- [ ] **Step 2: Run it, expect FAIL.** Command: `npx vitest run server/actions/booking-import.test.ts`. Expected: the BI-13 test fails with `expected "spy" to be called once, but got 0 times`. The Review Focus test passes, because it pins the existing behaviour.
- [ ] **Step 3: Implement.** In `lib/ai-usage.ts:6-7`:
```ts
/**
 * AiUsage.outcome (spec 2026-10-14 "Spend"). `error`: the API call was made
 * (and billed), then the import failed on our side before Proposals were
 * built (BI-13).
 */
type AiUsageOutcome = "ok" | "not_booking" | "unreadable" | "api_error" | "rate_limited" | "error";
```
  In `server/actions/booking-import.ts`, replace `:97-101`:
```ts
  const { match, context } = await loadImportContext(tripId, plan, user.id);
  const { proposals, dropped } = buildProposals(outcome.extraction, match);
  await recordAiUsage({ ...spent, proposalCount: proposals.length, outcome: "ok" });
  if (proposals.length === 0) return importFail(M.nothingUsable, "nothing_usable");
  return { success: true, proposals, partial: dropped > 0, context };
```
  with:
```ts
  // The call is already billed: its row is written whatever happens next
  // (BI-13). A throw still propagates, unchanged.
  let proposalCount = 0;
  let usageOutcome: "ok" | "error" = "error";
  try {
    const { match, context } = await loadImportContext(tripId, plan, user.id);
    const { proposals, dropped } = buildProposals(outcome.extraction, match);
    proposalCount = proposals.length;
    usageOutcome = "ok";
    if (proposals.length === 0) return importFail(M.nothingUsable, "nothing_usable");
    return { success: true, proposals, partial: dropped > 0, context };
  } finally {
    await recordAiUsage({ ...spent, proposalCount, outcome: usageOutcome });
  }
```
  Update the `importBooking` doc comment's last line (`:49`) to read: "logs one AiUsage row for every call that reached (or was refused before) the API, including one whose import then failed".
  In `docs/specs/2026-10-14-booking-import.md:140-141`, change the outcome list to `` (`ok` / `not_booking` / `unreadable` / `api_error` / `rate_limited` / `error` — billed, then failed on our side, BI-13) ``.
  In `docs/follow-ups/2026-10-14-booking-import.md:59-61`, replace BI-13 with:
  `` - **BI-13 · Fixed, 2026-10-16, tidy-up batch 3.** An `AiUsage` row wasn't written if `loadImportContext` threw after a paid call. `importBooking` now writes the row in a `finally` around reading the Trip and building Proposals — outcome `error`, Proposal count 0, the tokens spent — and the error still propagates. ``
- [ ] **Step 4: Run it, expect PASS.** Command: `npx vitest run server/actions/booking-import.test.ts`. All existing `importBooking` tests must also still pass: the `ok`, `nothing_usable` and rate-limit rows are unchanged.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run server/actions/booking-import.ts lib/ai-usage.ts` + `npx tsc --noEmit` + `npx eslint server/actions/booking-import.ts server/actions/booking-import.test.ts lib/ai-usage.ts`.
- [ ] **Step 6: Commit.** Run `git add server/actions/booking-import.ts server/actions/booking-import.test.ts lib/ai-usage.ts docs/specs/2026-10-14-booking-import.md docs/follow-ups/2026-10-14-booking-import.md` with the message `fix(booking-import): write the AiUsage row in a finally after a paid call (BI-13)`.

---

### Task 3.P.16: BI-14 — a Home city match needs the countries to agree

**Files:**
- Modify: `lib/booking-import/match.ts:58, 142-147`
- Modify: `docs/follow-ups/2026-10-14-booking-import.md:62-68` (BI-14)
- Test: `lib/booking-import/match.test.ts` (inside `describe("resolvePlace")`, after `:39`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `sameCity`, `resolvePlace` and `countryCodeOf` keep their signatures.

- [ ] **Step 1: Write the failing test.** Add after the first `resolvePlace` test:
```ts
  it("matches Home by city only when the countries agree (BI-14)", () => {
    // Brisbane, California is not the Home base in Brisbane, Australia.
    expect(resolvePlace(q("Brisbane", "United States"), { from: "2026-12-01", to: null }, CTX, END)).toEqual({
      kind: "new",
      key: "brisbane|us",
      name: "Brisbane",
      country: "United States",
      countryCode: "us",
    });
    // An unknown country on either side is no disagreement (Review Focus 2).
    expect(resolvePlace(q("Brisbane", null, "Brisbane (BNE)"), { from: "2026-12-01", to: null }, CTX, END)).toEqual({ kind: "home" });
    expect(resolvePlace(q("Brisbane", "United States"), { from: null, to: null }, { ...CTX, home: { ...HOME, countryCode: null } }, END)).toEqual({ kind: "home" });
  });

  it("matches a Stop by contained city name only when the countries agree (BI-14, already true)", () => {
    const YORK: MatchStop = { id: "s-york", name: "York", country: "United Kingdom", countryCode: "gb", timezone: "Europe/London", arriveDate: "2026-12-15", departDate: "2026-12-18", sortOrder: 2 };
    expect(resolvePlace(q("New York City", "United States"), { from: "2026-12-16", to: null }, { home: HOME, stops: [YORK] }, STAY)).toMatchObject({ kind: "new", countryCode: "us" });
    expect(resolvePlace(q("Porto Alegre", "Brazil"), { from: "2026-12-09", to: null }, CTX, STAY)).toMatchObject({ kind: "new", countryCode: "br" });
  });
```
- [ ] **Step 2: Run it, expect FAIL.** Command: `npx vitest run lib/booking-import/match.test.ts`. Expected: the first new test fails with `expected { kind: 'home' } to deeply equal { kind: 'new', key: 'brisbane|us', … }`. The second passes, because it pins the Stop path that `:158-160` already guards.
- [ ] **Step 3: Implement.** Replace `matchesHome` (`:142-147`):
```ts
function matchesHome(q: PlaceQuery, home: MatchHome): boolean {
  if (!home.name) return false;
  const cc = countryCodeOf(q.country);
  const homeCc = home.countryCode?.toLowerCase() || null;
  // BI-14: a city match counts only when the countries agree. An unknown
  // country on either side is no disagreement, the same rule as a Stop's
  // `compatible` in resolvePlace.
  const agrees = !cc || !homeCc || cc === homeCc;
  if (agrees && (sameCity(q.city, home.name) || sameCity(q.place, home.name))) return true;
  return !q.city && !q.place && cc !== null && cc === homeCc;
}
```
  Extend `sameCity`'s doc comment (`:58`) with: `` Country agreement is the caller's: `compatible` for Stops and `matchesHome` for Home (BI-14). ``
  In `docs/follow-ups/2026-10-14-booking-import.md:62-68`, replace BI-14 with:
  `` - **BI-14 · Fixed, 2026-10-16, tidy-up batch 3.** City matching now needs the countries to agree for Home as it already did for Stops (`matchesHome` in `match.ts`): Brisbane, United States no longer matches a Brisbane, Australia Home base. A country unknown on either side still counts as agreement, and whole-word containment still needs the shorter name to be at least 4 characters, so "York" and "New York City" still match each other when neither country is known. ``
- [ ] **Step 4: Run it, expect PASS.** Command: `npx vitest run lib/booking-import/match.test.ts lib/booking-import/build.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/booking-import/match.ts` + `npx tsc --noEmit` + `npx eslint lib/booking-import/match.ts lib/booking-import/match.test.ts`.
- [ ] **Step 6: Commit.** Run `git add lib/booking-import/match.ts lib/booking-import/match.test.ts docs/follow-ups/2026-10-14-booking-import.md` with the message `fix(booking-import): Home city match needs the countries to agree (BI-14)`.

---

### Task 3.P.17: BI-16 — DESIGN-BRIEF's Checklists tabs

**Files:**
- Modify: `DESIGN-BRIEF.md:311`
- Modify: `docs/follow-ups/2026-10-14-booking-import.md:73-75` (BI-16)
- Test: none (docs only). The check is a grep.

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Write the failing test.** Docs only, so there is no unit test. The red check is `grep -n "Booking parser" DESIGN-BRIEF.md`, which prints `311:` today.
- [ ] **Step 2: Run it, expect FAIL.** The grep finds the stale tab.
- [ ] **Step 3: Implement.** `DESIGN-BRIEF.md:311`. Change `**Tabs**: Pre-trip · Packing · Booking parser.` to `**Tabs**: Pre-trip · Packing · Shopping.`. At the end of the same paragraph, after `Packing adds a **templates bar** (apply/save template).`, add: `Shopping holds Packing items marked **Need to buy** plus standalone items (CONTEXT.md **Shopping list**).` The tabs are `pretrip` / `packing` / `shopping` in `app/(app)/trips/[tripId]/checklists/checklists-layout.tsx:81`. In `docs/follow-ups/2026-10-14-booking-import.md:73-75`, replace BI-16 with:
  `` - **BI-16 · Fixed, 2026-10-16, tidy-up batch 3.** `DESIGN-BRIEF.md`'s Checklists tabs now read Pre-trip · Packing · Shopping, matching the page; "Booking parser" is gone (the Booking import lives on the Plan header). ``
- [ ] **Step 4: Run it, expect PASS.** `grep -n "Booking parser" DESIGN-BRIEF.md` prints nothing.
- [ ] **Step 5: Task-done check.** No source changed, so no vitest, tsc or eslint run is needed. Run `git diff --stat` to confirm that only the two docs changed.
- [ ] **Step 6: Commit.** Run `git add DESIGN-BRIEF.md docs/follow-ups/2026-10-14-booking-import.md` with the message `docs(design-brief): Checklists tabs are Pre-trip · Packing · Shopping (BI-16)`.

---

### Task 3.P.18: `invites.test` asserts the Invite an admin creates; strike the two already-tested minors

**Files:**
- Modify: `server/actions/invites.test.ts:228-243`
- Modify: `docs/open-follow-ups.md:377-386` (three entries)
- Test: `server/actions/invites.test.ts`

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Write the failing test.** Replace the "allows an admin who is not the owner" test (`:228-243`):
```ts
  it("allows an admin who is not the owner, and creates the same Invite an owner would", async () => {
    requireTripAccessMock.mockResolvedValue({
      user: { id: "u3", email: "admin@example.com" },
      membership: { role: "member" },
    });
    isAdminEmailMock.mockReturnValue(true);
    tripMemberFindManyMock.mockResolvedValue([]);
    inviteUpsertMock.mockResolvedValue({ id: "admin-invite-id" });

    const result = await inviteToTrip("trip1", "New@Example.com");

    expect(result).toEqual({ success: true, inviteId: "admin-invite-id" });
    expect(inviteUpsertMock).toHaveBeenCalledWith({
      where: { tripId_email: { tripId: "trip1", email: "new@example.com" } },
      update: {},
      create: { tripId: "trip1", email: "new@example.com", token: expect.any(String), role: "member", expiresAt: expect.any(Date) },
      select: { id: true },
    });
  });
```
- [ ] **Step 2: Run it, expect FAIL (mutation).** This is coverage of shipped behaviour, so it passes as written. To prove it bites, temporarily change `role: "member"` to `role: "owner"` at `server/actions/invites.ts:81`. Run `npx vitest run server/actions/invites.test.ts`. Expected: the new test fails on `create.role`. Revert the change.
- [ ] **Step 3: Implement.** In `docs/open-follow-ups.md` ("Deferred minors from the 2026-09-21 close-out"), strike three entries:
  - `:377-378` → `` - ~~**`server/actions/invites.test.ts`** — the admin-bypass test asserts only `success === true`, not the created Invite's shape.~~ **Fixed 2026-10-16** (tidy-up batch 3): the admin case asserts the returned `inviteId` and the whole `upsert` call — `tripId`, normalised `email`, `role: "member"`, a token and an expiry. ``
  - `:379-382` → wrap the existing text in `~~…~~` and append `` **Already covered** — `components/account/push-subscribe.test.ts` ("on a conflict, drops the endpoint and retries with a FRESH one", `:93`) pins the retry; struck 2026-10-16 (tidy-up batch 3), nothing rebuilt. ``
  - `:383-386` → wrap the existing text in `~~…~~` and append `` **Already covered** — `lib/digest-dispatch.test.ts:284-291` asserts the cooldown `where` equals `{ userId, tripId, slot, createdAt }` and has no `localDate`; struck 2026-10-16 (tidy-up batch 3). ``
- [ ] **Step 4: Run it, expect PASS.** Command: `npx vitest run server/actions/invites.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run server/actions/invites.ts` + `npx tsc --noEmit` + `npx eslint server/actions/invites.test.ts`.
- [ ] **Step 6: Commit.** Run `git add server/actions/invites.test.ts docs/open-follow-ups.md` with the message `test(invites): the admin bypass creates the same Invite an owner would`.

---

### Task 3.P.19: ADR 0055's `offset < 0` re-file is tested

**Files:**
- Modify: `docs/open-follow-ups.md:392-394`
- Test: `lib/payload-shift.test.ts` (inside `describe("shiftItemDates")`, after `:111`)

**Interfaces:**
- Consumes: `shiftItemDates` (unchanged). Produces: nothing.

- [ ] **Step 1: Write the failing test.** Add:
```ts
  it("re-files an Item dated before the Stop's arrive date onto the Stop covering that day (ADR 0055, offset < 0)", () => {
    // Salzburg 5-2..5-5, Munich 5-5..5-10. A breakfast on the 4th sits on
    // Munich (stranded: before Munich's arrive). Shorten Munich to 5-5..5-9:
    // its arrive date is unmoved, so ADR 0055 applies to a before-arrive day
    // too, and Salzburg still covers the 4th.
    const salzburg = { id: "salzburg", arriveDate: "2026-05-02", departDate: "2026-05-05" };
    const munich = { id: "munich", arriveDate: "2026-05-05", departDate: "2026-05-09" };
    expect(
      shiftItemDates([{ id: "breakfast", date: "2026-05-04", stopId: "munich" }], "2026-05-05", "2026-05-05", "2026-05-09", [salzburg, munich]),
    ).toEqual([{ id: "breakfast", date: "2026-05-04", prevDate: "2026-05-04", stopId: "salzburg", prevStopId: "munich" }]);
    // With no Stop covering the 4th, the same Item un-slots.
    expect(shiftItemDates([{ id: "breakfast", date: "2026-05-04" }], "2026-05-05", "2026-05-05", "2026-05-09", [munich])).toEqual([
      { id: "breakfast", date: null, prevDate: "2026-05-04" },
    ]);
  });
```
- [ ] **Step 2: Run it, expect FAIL (mutation).** This pins shipped behaviour, so it passes as written. To prove it bites, temporarily change `lib/payload-shift.ts:66` from `if (next === null && dateIsUnmoved) {` to `if (next === null && dateIsUnmoved && offset > maxOffset) {`. Run `npx vitest run lib/payload-shift.test.ts`. Expected: the new test's first `toEqual` fails with `date: null` in place of the re-file. Revert the change.
- [ ] **Step 3: Implement.** In `docs/open-follow-ups.md:392-394`, wrap the "ADR 0055's re-file also fires for Items dated *before* the Stop's arrive date" entry in `~~…~~` and append `` **Tested 2026-10-16** (tidy-up batch 3): `lib/payload-shift.test.ts` pins the re-file onto the covering Stop, and the un-slot when none covers the day. ``
- [ ] **Step 4: Run it, expect PASS.** Command: `npx vitest run lib/payload-shift.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/payload-shift.ts` + `npx tsc --noEmit` + `npx eslint lib/payload-shift.test.ts`.
- [ ] **Step 6: Commit.** Run `git add lib/payload-shift.test.ts docs/open-follow-ups.md` with the message `test(payload-shift): ADR 0055 re-files an Item dated before the arrive date`.

---

### Task 3.P.20: Dependencies, part 1 — in-range minor/patch bumps and `@types/node` 22 (Q11)

**Files:**
- Modify: `package.json` (devDependencies and dependency ranges), `package-lock.json`
- Test: the whole suite (deviation 4 in the Notes)

**Interfaces:**
- Consumes: nothing. Produces: nothing. The repo's public types must not change.

- [ ] **Step 1: Write the failing test.** There is no new test. Record the baseline first: `npm test 2>&1 | tail -5` → note the passed and skipped counts, then `npm outdated > "$SCRATCH/outdated-before.txt"` (read-only). This was the snapshot on 2026-10-16. **Re-run `npm outdated` and use what it says today.** In-range ("Wanted" > "Current") on the snapshot: `@radix-ui/*` (avatar 1.3.1, dialog 1.3.1, dropdown-menu 2.2.1, label 2.1.17, popover 1.3.1, select 2.4.1, slot 1.5.0, tabs 1.2.1, toast 1.3.1, toggle-group 1.2.1), `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.8, `@types/leaflet` 1.9.22, `@types/pg` 8.23.1, `@types/react` / `@types/react-dom` 19.3.0, `@vitejs/plugin-react` 6.1.2, `eslint` 9.39.5, `knip` 6.41.0, `lucide-react` 1.57.0, `motion` 12.43.0, `pg` 8.23.1, `postal-mime` 4.0.7, `tailwind-merge` 3.7.0, `tsx` 4.23.15, `unpdf` 1.9.0, `vitest` 4.1.12, `zod` 4.6.7.
- [ ] **Step 2: Run it, expect FAIL.** No red step: a bump is not test-first. Go straight to Step 3.
- [ ] **Step 3: Implement.**
```bash
npm update --save                 # every caret/tilde range to its newest in-range release, floors raised in package.json
npm install -D @types/node@^22    # Q11: match "engines": { "node": ">=22" }
```
  Do not bump anything across a major. `npm update` cannot cross one, and the exact-pinned packages are 3.P.21's job. **Known-risky packages in this step. Verify each before moving on:**
  - `vitest` 4.1.9 → 4.1.12. The runner itself changes. `npm test` must report the same passed and skipped counts as the Step 1 baseline.
  - `@types/node` 20 → 22. Expect type errors at `Buffer` / `ArrayBuffer` / `fetch` call sites (storage, image size, attachments). Fix the types without changing behaviour.
  - `lucide-react` 1.21 → 1.57. Icons get renamed or removed across minors. `tsc` names any missing import. Swap it for the documented replacement.
  - `motion` 12.40 → 12.43. Covers the `LazyMotion` / `m.*` setup. Run the dom project, which holds the motion component tests.
  - `@radix-ui/*` minors (dialog and popover 1.1 → 1.3). Focus, `aria-*` and portal behaviour can shift. These are dom tests over dialogs, sheets and selects.
  - `knip` 6.41. It may report findings 6.40 missed. Fix them or ignore them with a reason.
  - `@types/react` 19.3 runs ahead of `react` 19.2.4 until 3.P.21. That is fine as long as no code uses a 19.3-only API.
  If a bump breaks behaviour and the fix is not mechanical, pin that one package back (`npm install <pkg>@<previous> --save-exact`) and add it to TD-01 in 3.P.21 with the failure. Don't fix behaviour here.
- [ ] **Step 4: Run it, expect PASS.** Run `npx tsc --noEmit` + `npx eslint .` + `npm test` (same counts as the baseline) + `npm run knip`.
- [ ] **Step 5: Task-done check.** This is the same as Step 4. Then `npm outdated` must show "Current" = "Wanted" for every caret-ranged package, and `@types/node` must be 22.x.
- [ ] **Step 6: Commit.** Run `git add package.json package-lock.json` (plus any type-fix files, each listed in the body) with the message `chore(deps): minor and patch bumps within range; @types/node 22 (Q11)`. The body lists each package and its from → to versions.

---

### Task 3.P.21: Dependencies, part 2 — exact-pinned packages within their major, and TD-01

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `docs/open-follow-ups.md:539-555` (TD-01)
- Test: the whole suite (deviation 4)

**Interfaces:**
- Consumes: 3.P.20's lockfile. Produces: nothing.

- [ ] **Step 1: Write the failing test.** There is no new test. Re-run `npm outdated` and record the baseline counts from 3.P.20's Step 4. This was the exact-pinned snapshot on 2026-10-16, newest within the current major: `next` 16.3.4 → 16.4.2 with `eslint-config-next` 16.3.4 → 16.4.2; `react` / `react-dom` 19.2.4 → 19.3.1; `prisma`, `@prisma/client`, `@prisma/adapter-pg` 7.10.0 → 7.10.1 (`npm view prisma@7 version`; `latest` is an 8.0 release candidate, so don't take it); `better-auth`, `@better-auth/mcp`, `@better-auth/oauth-provider`, `@better-auth/prisma-adapter` 1.7.7 → 1.7.10; `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` 3.1073.0 → 3.1152.0; `happy-dom` 20.14.5 → 20.14.6 (`npm view happy-dom@20 version`); `playwright` 1.63.0 → 1.64.1; `sharp` 0.35.4 → 0.35.5.
- [ ] **Step 2: Run it, expect FAIL.** No red step. Before bumping, read `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`, and read it again after the install for any 16.4 notes.
- [ ] **Step 3: Implement.** Move each family together, keeping exact pins:
```bash
npm install --save-exact next@16.4.2 react@19.3.1 react-dom@19.3.1 \
  prisma@7.10.1 @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 \
  better-auth@1.7.10 @better-auth/mcp@1.7.10 @better-auth/oauth-provider@1.7.10 @better-auth/prisma-adapter@1.7.10 \
  @aws-sdk/client-s3@3.1152.0 @aws-sdk/s3-request-presigner@3.1152.0
npm install --save-exact -D eslint-config-next@16.4.2 happy-dom@20.14.6 playwright@1.64.1 sharp@0.35.5
```
  `postinstall` re-runs `prisma generate`. **Known-risky packages. Verify each:**
  - `next` 16.4. Check the upgrade notes for changed defaults (caching, `revalidatePath`, `next/navigation`, `next.config` keys) and heed any deprecation notice. `tsc` covers the type surface. The final gate's `npm run build` is the first build on 16.4, so the gate must not be skipped.
  - `eslint-config-next` 16.4 may add rules. `npx eslint .` must stay clean, including 3.N's boundary rules.
  - `prisma` 7.10.1. Run `npx prisma validate` and `npx prisma generate`. Run `npm run test:integration` now if the local DB is up (`docker compose up -d`); otherwise the final gate runs it.
  - `react` / `react-dom` 19.3. The React Compiler runs over `"use client"` modules in tests (`vitest.config.ts`). The dom project must pass at baseline counts.
  - `better-auth` 1.7.10. All four packages must be at one version. Run `npx vitest related --run lib/auth.ts lib/auth-mcp-access.ts lib/auth-prisma.ts` (pre-3.O paths, correct here since 3.O lands after).
  - `happy-dom` 20.14.6 is the dom test environment, so there must be no count change.
  - `playwright` 1.64. Only the audit scripts use it. Run `npx playwright install chromium` before the next `npm run audit:layout`. The suite doesn't depend on it.
  As in 3.P.20: a package whose fix isn't mechanical goes back to its previous pin and into TD-01 with its failure.
  Then refresh TD-01 at `docs/open-follow-ups.md:539-555`:
  - **Source:** append `` Done 2026-10-16 on `chore/tidy-up-3-shape-hygiene` (tasks 3.P.20–3.P.21): every package is at its newest release within its current major, and `@types/node` is on 22. ``
  - **Owed:** keep the existing list (`motion` 12 → 14, ESLint 9 → 10, `@testing-library/jest-dom` 6 → 7, `happy-dom` 20 → 21, `jsdom` 29 → 30, `@anthropic-ai/sdk` 0.105 → latest, `dotenv` 17 → 18, `@babel/core` 7 → 8). Add three entries: `typescript` 5 → 7 (the compiler rewrite — its own branch); `vitest` 4 → 5 (with `@vitejs/plugin-react` and the React Compiler preset in `vitest.config.ts`); and `prisma` / `@prisma/client` / `@prisma/adapter-pg` 7 → 8 (8.0 was a release candidate on 2026-10-16 — wait for stable). Also add any package pinned back in 3.P.20 or here, with its failure. End with "Re-run `npm outdated` first; this list is a snapshot of 2026-10-16."
- [ ] **Step 4: Run it, expect PASS.** Run `npx tsc --noEmit` + `npx eslint .` + `npm test` (baseline counts) + `npm run knip`.
- [ ] **Step 5: Task-done check.** This is the same as Step 4. Then `npm outdated` must show only cross-major entries, each named in TD-01.
- [ ] **Step 6: Commit.** Run `git add package.json package-lock.json docs/open-follow-ups.md` (plus any fix files, listed in the body) with the message `chore(deps): exact-pinned packages to their newest in-major release; TD-01 refreshed`. The body lists from → to versions per family.
## Card 3.O — `lib` folders (last; Q9)

### Notes

**What this section produces for the rest of the plan:** nothing that an earlier task uses. It runs last and moves files under whatever 3.N, 3.L, 3.M and 3.P left. After 3.O.5 these are the import paths (no barrels, so a bare `@/lib/auth`, `@/lib/money`, `@/lib/feedback`, `@/lib/map` or `@/lib/share` does not resolve):

| Old | New |
|---|---|
| `@/lib/auth`, `auth-client`, `auth-dev-login`, `auth-mcp-access`, `auth-prisma` | `@/lib/auth/auth`, `auth/client`, `auth/dev-login`, `auth/mcp-access`, `auth/prisma` |
| `@/lib/sign-in-{door,email,href,redirect}` | `@/lib/auth/sign-in-{door,email,href,redirect}` |
| `@/lib/money`, `budget`, `budget-loader`, `cost-labels`, `currencies`, `currency-for-country`, `fx`, `spend-so-far`, `upcoming-payments` | `@/lib/money/<same name>` (`money` → `money/money`) |
| `@/lib/money-due-count` | `@/lib/money/due-count` |
| `@/lib/feedback-{context,device,inbox,queue,site,trip-store,view}` | `@/lib/feedback/{context,device,…}` |
| `@/lib/feedback-{accept-args,resolve-args,resolve-site}` | `@/lib/feedback/cli/{accept-args,resolve-args,resolve-site}` |
| `@/lib/map-{icons,overlap,palette,pins,tiles}`, `@/lib/maps` | `@/lib/map/{icons,overlap,palette,pins,tiles}`, `@/lib/map/maps` |
| `@/lib/share-{lookup,og,ref,view}` | `@/lib/share/{lookup,og,ref,view}` |
| `@/lib/share-traveller`, `@/lib/share-url` | `@/lib/share/share-traveller`, `@/lib/share/share-url` |

The two test-only files move as well: `lib/auth-magic-link.test.ts` → `lib/auth/magic-link.test.ts` and `lib/auth-sign-in-link.test.ts` → `lib/auth/sign-in-link.test.ts`.

**The final gate task** runs the full suite, `next build`, the integration tier, `npm run knip` and `npx eslint .` once. Nothing here runs the full suite.

**Deviations from the spec text (decided while drafting):**
- **Naming rule (the spec doesn't give one).** Inside `lib/<folder>/` a module drops a leading `<folder>-` prefix (`share-lookup` → `share/lookup`, `money-due-count` → `money/due-count`). A module named after the folder keeps its name (`auth/auth.ts`, which is also Better Auth's own conventional file name; `money/money.ts`; `map/maps.ts`). The prefix stays when the shorter name would repeat the basename of another `lib` module, which makes two exceptions: `share/share-traveller.ts` (`lib/traveller.ts` exists) and `share/share-url.ts` (`lib/url.ts` exists). `sign-in-*` and the money modules that don't start with `money-` keep their names. The rule is written down once, in the codemod's header (`scripts/codemods/lib-moves.ts`).
- **No frozen site list.** The moves go through a small committed codemod (`scripts/codemods/move-lib-modules.ts` + its pure, tested core `scripts/codemods/lib-moves.ts`). It reads `git ls-files` when it runs, so imports that 3.L–3.P add are covered. It rewrites every quoted `@/…`/`./…`/`../…` string that resolves to a moved file: static and dynamic imports, `typeof import()`, `vi.mock`, `vi.importActual`, and relative imports in `scripts/*`. It also recomputes the relative imports inside the moved files, and rewrites `lib/<old>.ts` path mentions in code, `schema.prisma` comments and living docs. It then runs `git mv`. The site lists in each task below are what it printed against `4e6163c1` with `--dry-run`. They are for review, not for hand-editing.
- **Evidence it works:** in a throwaway clone at `4e6163c1` the five runs in order (share, auth, feedback, map, money) moved 82 files and wrote 290. After that, `tsc --noEmit` was clean, the full `npx vitest run` passed (776 files, 10,315 tests), `eslint` over the touched folders was clean, and `npm run knip` was clean.
- **A new guard test, `lib/lib-folders.test.ts`.** Q9 has no check of its own, and "no barrel" and "nothing left flat" are about the filesystem, which ESLint can't express. It is the red test of every task here. Each task adds its folder's row.
- **History is left alone.** Dated docs (`docs/specs`, `docs/superpowers`, `docs/adr`, `docs/audits`, `docs/follow-ups`, the generated `docs/feedback/inbox.md`, `docs/architecture-sitrep-2026-09-22.md`, `docs/things-to-fix.md`), `design_handoff/**` and `prisma/migrations/**` are skipped. Prisma checksums applied migrations, so they can't change anyway. Living docs that name moved paths are updated: `COMPONENTS.md`, `ONBOARDING.md`, `docs/HANDOFF.md`, `docs/maps-overview.md`, `docs/open-follow-ups.md`, `docs/resendDeploy.md`. `CLAUDE.md`, `CONTEXT.md` and `docs/DEPLOY.md` name none of these paths. Extensionless prose such as "lib/auth" or "lib/money" now names the folder and stays as written.
- **Nothing outside the source tree names these files.** There is no Better Auth CLI config or script, and `next.config.ts`, `knip.json`, `tsconfig.json` (`@/*` only), `vitest*.config.ts`, `vercel.json` and `.github/workflows/*` all name none of them. `proxy.ts` imports `@/lib/sign-in-href` through the alias, and the codemod rewrites that.

**Review Focus candidates:**
1. **A `vi.mock("@/lib/<old>")` that survives the move is a silent no-op.** `tsc` doesn't check mock paths, and the test would then run against the real module. Expected: no quoted old specifier survives anywhere. Tested in 3.O.1 (`lib-moves.test.ts` "re-points … a vi.mock string"), and each task's leftover grep has to come back empty apart from the listed prose.
2. **An area-prefixed module added flat by an earlier batch-3 task must move too.** Examples would be a `lib/feedback-reads.ts`, `lib/budget-reads.ts` or `lib/share-reads.ts` created by 3.N's "pure reads move to `lib/*-reads.ts`". Expected: `lib/lib-folders.test.ts` fails on it, and the task adds a stem pair to `STEMS` under the naming rule (`feedback-reads` → `feedback/reads`) before running the codemod. Test: the guard's "leaves no module of its area flat" row, every task.
3. **The feedback inbox's copy-scan exclusion follows the file.** If `test/helpers/copy-scan.ts:183` still said `lib/feedback-inbox.ts`, the operator CLI's console strings would be scanned as Traveller copy. Expected: the prefix reads `lib/feedback/inbox.ts`, and `test/copy-style.test.ts` passes. This runs in 3.O.3 (Step 4 names that test explicitly).

---

### Task 3.O.1: The codemod, the folder guard, and `lib/share/`

**Files:**
- Create: `scripts/codemods/lib-moves.ts`, `scripts/codemods/lib-moves.test.ts`, `scripts/codemods/move-lib-modules.ts`, `lib/lib-folders.test.ts`
- Move (by the codemod): `lib/share-{lookup,og,ref,traveller,url,view}.ts` and each one's `.test.ts` → `lib/share/{lookup,og,ref,share-traveller,share-url,view}{,.test}.ts`
- Modify (by the codemod, as printed at `4e6163c1`): `app/share/[token]/day-by-day.tsx:6`, `app/share/[token]/journal-photo/[attachmentId]/route.test.ts:56`, `app/share/[token]/journal-photo/[attachmentId]/route.ts:3,49`, `app/share/[token]/journal-polaroids.tsx:3,4`, `app/share/[token]/opengraph-image.tsx:3,4,5`, `app/share/[token]/page.test.tsx:83`, `app/share/[token]/page.tsx:5,18,33,36,37`, `app/share/[token]/share-cta.tsx:2,3`, `app/share/[token]/share-hero.tsx:4,5,6`, `app/share/[token]/share-route-list.tsx:5`, `app/share/[token]/share-rows.tsx:6`, `app/share/[token]/share-top-bar.tsx:10`, `app/share/[token]/traveller-photo/[userId]/route.ts:3,42`, `components/trip/settings/share-links-panel.tsx:14,19`, `components/trip/share-chooser.tsx:10`, `lib/share-lookup.test.ts:6`, `lib/share-og.test.ts:2`, `lib/share-og.ts:4,8`, `lib/share-ref.test.ts:2`, `lib/share-traveller.test.ts:3`, `lib/share-view.test.ts:2,7`, `lib/share-view.ts:12`, `server/actions/copy-route-from-share.test.ts:6`, `server/actions/copy-route-from-share.ts:1,2`
- Test: `scripts/codemods/lib-moves.test.ts`, `lib/lib-folders.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. The codemod lives in `scripts/codemods/` while 3.O runs, because 3.P.13 takes `scripts/archive/` out of tsc, ESLint, Vitest and knip — its tests must run. 3.O.5 archives it.
- Produces: `movesFor(folder, files)`, `rewriteSource(src, oldFile, moves, files)`, `rewritePathMentions(src, moves)` and `STEMS` in `scripts/codemods/lib-moves.ts`. The CLI `npx tsx scripts/codemods/move-lib-modules.ts <auth|money|feedback|map|share> [--dry-run]`. `lib/lib-folders.test.ts` with its `FOLDERS` table (3.O.2–3.O.5 each add a row). The `@/lib/share/*` paths in the table above.

- [ ] **Step 1: Write the failing tests.** Write `scripts/codemods/lib-moves.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { movesFor, rewritePathMentions, rewriteSource } from "./lib-moves";

const files = new Set([
  "lib/share-url.ts",
  "lib/share-url.test.ts",
  "lib/share-traveller.ts",
  "lib/traveller.ts",
  "lib/url.ts",
  "lib/money.ts",
  "lib/money/to-pay.ts",
  "lib/demo/index.ts",
  "lib/feedback-inbox.ts",
  "app/x/page.tsx",
  "app/(app)/admin/feedback-review.tsx",
  "scripts/feedback-pull.ts",
]);
const moves = {
  "lib/share-url.ts": "lib/share/share-url.ts",
  "lib/share-url.test.ts": "lib/share/share-url.test.ts",
  "lib/share-traveller.ts": "lib/share/share-traveller.ts",
  "lib/money.ts": "lib/money/money.ts",
  "lib/feedback-inbox.ts": "lib/feedback/inbox.ts",
};

describe("rewriteSource", () => {
  it("re-points an import, a vi.mock string, a dynamic import and a typeof import", () => {
    const src = [
      `import { shareUrl } from "@/lib/share-url";`,
      `vi.mock("@/lib/share-url", () => ({}));`,
      `const m = await import('@/lib/share-url');`,
      "type M = typeof import(`@/lib/share-url`);",
    ].join("\n");
    expect(rewriteSource(src, "app/x/page.tsx", moves, files)).toBe(
      [
        `import { shareUrl } from "@/lib/share/share-url";`,
        `vi.mock("@/lib/share/share-url", () => ({}));`,
        `const m = await import('@/lib/share/share-url');`,
        "type M = typeof import(`@/lib/share/share-url`);",
      ].join("\n"),
    );
  });

  it("re-points a moved file's relative imports at its unmoved and moved neighbours", () => {
    const src = `import { a } from "./traveller";\nimport { b } from "./share-url";\nimport { c } from "@/lib/url";`;
    expect(rewriteSource(src, "lib/share-traveller.ts", moves, files)).toBe(
      `import { a } from "../traveller";\nimport { b } from "./share-url";\nimport { c } from "@/lib/url";`,
    );
  });

  it("re-points a relative import from outside lib", () => {
    expect(rewriteSource(`import { renderInbox } from "../lib/feedback-inbox";`, "scripts/feedback-pull.ts", moves, files)).toBe(
      `import { renderInbox } from "../lib/feedback/inbox";`,
    );
  });

  it("resolves @/lib/money to the flat file, not the folder, and leaves the folder's modules alone", () => {
    const src = `import { convertMinor } from "@/lib/money";\nimport { mergeToPay } from "@/lib/money/to-pay";`;
    expect(rewriteSource(src, "app/x/page.tsx", moves, files)).toBe(
      `import { convertMinor } from "@/lib/money/money";\nimport { mergeToPay } from "@/lib/money/to-pay";`,
    );
  });

  it("leaves unrelated, same-named, index and package specifiers alone", () => {
    const src = `import "server-only";\nimport { d } from "@/lib/demo";\nimport { P } from "./feedback-review";`;
    expect(rewriteSource(src, "app/(app)/admin/page.tsx", moves, files)).toBe(src);
  });
});

describe("rewritePathMentions", () => {
  it("rewrites exact repo paths, with or without a line number, and nothing longer", () => {
    expect(rewritePathMentions(`see lib/share-url.ts:4 and "lib/share-url.test.ts"; not lib/share-url.tsx or lib/money.tsx`, moves)).toBe(
      `see lib/share/share-url.ts:4 and "lib/share/share-url.test.ts"; not lib/share-url.tsx or lib/money.tsx`,
    );
  });

  it("is idempotent", () => {
    const once = rewritePathMentions("lib/money.ts and lib/feedback-inbox.ts", moves);
    expect(rewritePathMentions(once, moves)).toBe(once);
  });
});

describe("movesFor", () => {
  it("takes every sibling of a stem and applies the naming rule", () => {
    const tracked = new Set(["lib/share-url.ts", "lib/share-url.test.ts", "lib/share-lookup.ts", "lib/share-lookup.cache.test.ts", "lib/share-og.ts", "lib/share-ref.ts", "lib/share-traveller.ts", "lib/share-view.ts"]);
    expect(movesFor("share", tracked)).toMatchObject({
      "lib/share-url.ts": "lib/share/share-url.ts",
      "lib/share-url.test.ts": "lib/share/share-url.test.ts",
      "lib/share-lookup.cache.test.ts": "lib/share/lookup.cache.test.ts",
      "lib/share-og.ts": "lib/share/og.ts",
    });
  });

  it("refuses an unknown folder and a stem with no file", () => {
    expect(() => movesFor("nope", files)).toThrow(/Unknown folder/);
    expect(() => movesFor("share", files)).toThrow(/lib\/share-lookup\.ts not found/);
  });
});
```
Then write `lib/lib-folders.test.ts` with the `share` row only. Later tasks add one row each, in the order share, auth, feedback, map, money:
```ts
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Spec 2026-10-14 Q9 (card 3.O): five lib areas live in folders and are
 * imported directly, module by module — no barrel. A module added back flat
 * with an area's prefix, or an index file in one of the folders, fails here.
 * Naming inside a folder: scripts/codemods/lib-moves.ts.
 */
const LIB = path.join(process.cwd(), "lib");
const flat = readdirSync(LIB).filter((f) => /\.tsx?$/.test(f));

const FOLDERS: Record<string, RegExp> = {
  share: /^share-/,
};

describe.each(Object.entries(FOLDERS))("lib/%s/", (folder, flatName) => {
  it("exists and has no barrel", () => {
    const dir = path.join(LIB, folder);
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir).filter((f) => /^index\.tsx?$/.test(f))).toEqual([]);
  });

  it("leaves no module of its area flat in lib/", () => {
    expect(flat.filter((f) => flatName.test(f))).toEqual([]);
  });
});
```
- [ ] **Step 2: Run them, expect FAIL.** Run `npx vitest run scripts/codemods/lib-moves.test.ts lib/lib-folders.test.ts`. Expected: `lib-moves.test.ts` fails to import `./lib-moves`. In `lib-folders.test.ts`, `lib/share/ > exists and has no barrel` fails with `expected false to be true`, and `leaves no module of its area flat` fails, listing the twelve `share-*.ts` files.
- [ ] **Step 3: Implement the codemod, then run it for `share`.** Write `scripts/codemods/lib-moves.ts`:
```ts
import path from "node:path";

/**
 * Spec 2026-10-14 card 3.O (Q9): the pure half of the one-off codemod that
 * moves flat `lib/` modules into `lib/<folder>/` and re-points every
 * reference. No I/O — `move-lib-modules.ts` feeds it `git ls-files` and file
 * contents. Run once per folder; re-running after a folder has moved throws
 * (its stems are gone), so it can never move a file twice.
 *
 * Naming rule: inside `lib/<folder>/` a module drops a leading `<folder>-`
 * prefix (`share-lookup` → `share/lookup`); a module named after the folder
 * keeps its name (`auth/auth`, `money/money`); and the prefix stays when the
 * shorter name would repeat the basename of another `lib` module
 * (`share-traveller`, `share-url` — `lib/traveller.ts` and `lib/url.ts` exist).
 */

/** Repo-relative old file → new file, both with their extension. */
export type Moves = Record<string, string>;

export const STEMS = {
  auth: [
    ["auth", "auth/auth"],
    ["auth-client", "auth/client"],
    ["auth-dev-login", "auth/dev-login"],
    ["auth-magic-link", "auth/magic-link"],
    ["auth-mcp-access", "auth/mcp-access"],
    ["auth-prisma", "auth/prisma"],
    ["auth-sign-in-link", "auth/sign-in-link"],
    ["sign-in-door", "auth/sign-in-door"],
    ["sign-in-email", "auth/sign-in-email"],
    ["sign-in-href", "auth/sign-in-href"],
    ["sign-in-redirect", "auth/sign-in-redirect"],
  ],
  money: [
    ["money", "money/money"],
    ["budget", "money/budget"],
    ["budget-loader", "money/budget-loader"],
    ["cost-labels", "money/cost-labels"],
    ["currencies", "money/currencies"],
    ["currency-for-country", "money/currency-for-country"],
    ["fx", "money/fx"],
    ["money-due-count", "money/due-count"],
    ["spend-so-far", "money/spend-so-far"],
    ["upcoming-payments", "money/upcoming-payments"],
  ],
  feedback: [
    ["feedback-context", "feedback/context"],
    ["feedback-device", "feedback/device"],
    ["feedback-inbox", "feedback/inbox"],
    ["feedback-queue", "feedback/queue"],
    ["feedback-site", "feedback/site"],
    ["feedback-trip-store", "feedback/trip-store"],
    ["feedback-view", "feedback/view"],
    ["feedback-accept-args", "feedback/cli/accept-args"],
    ["feedback-resolve-args", "feedback/cli/resolve-args"],
    ["feedback-resolve-site", "feedback/cli/resolve-site"],
  ],
  map: [
    ["map-icons", "map/icons"],
    ["map-overlap", "map/overlap"],
    ["map-palette", "map/palette"],
    ["map-pins", "map/pins"],
    ["map-tiles", "map/tiles"],
    ["maps", "map/maps"],
  ],
  share: [
    ["share-lookup", "share/lookup"],
    ["share-og", "share/og"],
    ["share-ref", "share/ref"],
    ["share-traveller", "share/share-traveller"],
    ["share-url", "share/share-url"],
    ["share-view", "share/view"],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [string, string]>>;

export type Folder = keyof typeof STEMS;

/**
 * Every tracked file of each stem — `lib/<stem>.ts` and any `lib/<stem>.<x>.ts(x)`
 * sibling (`.test.ts`, `.cache.test.ts`, …) — mapped to its new home.
 * Throws when a stem has no file (already moved, or renamed since the plan)
 * or a destination is taken.
 */
export function movesFor(folder: string, files: ReadonlySet<string>): Moves {
  if (!(folder in STEMS)) throw new Error(`Unknown folder "${folder}"; one of: ${Object.keys(STEMS).join(", ")}`);
  const moves: Moves = {};
  for (const [from, to] of STEMS[folder as Folder]) {
    const prefix = `lib/${from}.`;
    const found = [...files].filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/") && /\.tsx?$/.test(f));
    if (found.length === 0) throw new Error(`lib/${from}.ts not found: already moved, or renamed since the plan?`);
    for (const f of found) {
      const dest = `lib/${to}${f.slice(`lib/${from}`.length)}`;
      if (files.has(dest)) throw new Error(`${dest} already exists`);
      moves[f] = dest;
    }
  }
  return moves;
}

const EXTS = [".ts", ".tsx", ".mts", ".js", ".mjs"];
const EXT_RE = /\.(tsx?|mts|m?js)$/;

/** The tracked file an `@/` or relative specifier names (TS bundler resolution order), or null. */
export function resolveSpecifier(spec: string, fromFile: string, files: ReadonlySet<string>): string | null {
  const joined = spec.startsWith("@/") ? spec.slice(2) : path.posix.join(path.posix.dirname(fromFile), spec);
  const base = path.posix.normalize(joined);
  if (base.startsWith("..")) return null;
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)];
  return candidates.find((c) => files.has(c)) ?? null;
}

function relativeSpec(fromFile: string, to: string): string {
  const rel = path.posix.relative(path.posix.dirname(fromFile), to);
  return rel.startsWith(".") ? rel : `./${rel}`;
}

// A quoted `@/…`, `./…` or `../…` string with no interpolation: static and
// dynamic imports, `export … from`, `typeof import(…)`, `vi.mock`,
// `vi.importActual`, `require` alike.
const SPECIFIER = /(["'`])((?:@\/|\.\.?\/)[^"'`\s$]*)\1/g;

/**
 * `src` (the contents of `oldFile`) with every specifier that names a moved
 * file re-pointed, and — when `oldFile` itself moves — its relative
 * specifiers recomputed from the new location. Alias stays alias, relative
 * stays relative, an explicit extension is kept.
 */
export function rewriteSource(src: string, oldFile: string, moves: Moves, files: ReadonlySet<string>): string {
  const newFile = moves[oldFile] ?? oldFile;
  return src.replace(SPECIFIER, (whole: string, quote: string, spec: string) => {
    const target = resolveSpecifier(spec, oldFile, files);
    if (!target) return whole;
    const newTarget = moves[target] ?? target;
    if (newTarget === target && newFile === oldFile) return whole;
    const viaIndex = /\/index\.[a-z]+$/.test(target) && !/\/index(\.[a-z]+)?$/.test(spec);
    const out = EXT_RE.test(spec) ? newTarget : viaIndex ? path.posix.dirname(newTarget) : newTarget.replace(EXT_RE, "");
    const next = spec.startsWith("@/") ? `@/${out}` : relativeSpec(newFile, out);
    return next === spec ? whole : `${quote}${next}${quote}`;
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Repo-path mentions (`lib/share-url.ts`, `lib/share-url.test.ts:4`) in code strings, comments and living docs. */
export function rewritePathMentions(src: string, moves: Moves): string {
  let out = src;
  for (const [from, to] of Object.entries(moves).sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(`(^|[^\\w.-])${escapeRe(from)}(?![\\w-])`, "g"), `$1${to}`);
  }
  return out;
}
```
Write `scripts/codemods/move-lib-modules.ts`:
```ts
/**
 * One-off codemod, spec 2026-10-14 card 3.O (Q9): move one lib area into its
 * folder and re-point every reference, then `git mv` so history follows.
 *
 *   npx tsx scripts/codemods/move-lib-modules.ts <auth|money|feedback|map|share> [--dry-run]
 *
 * Reads the tracked file list at run time, so imports added after the plan
 * was written are covered. --dry-run prints what would change and writes
 * nothing. The pure logic and the naming rule live in ./lib-moves.ts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { movesFor, rewritePathMentions, rewriteSource } from "./lib-moves";

const CODE = /\.(tsx?|mts|cts|m?js|cjs)$/;
const TEXT = /\.(md|json|ya?ml|css|prisma)$/;
// Never rewritten: generated output, vendored design exports, applied
// migrations (Prisma checksums them), this codemod, and dated history docs
// (specs, plans, ADRs, audits, follow-ups) that record paths as they were.
const SKIP = [
  /^design_handoff\//,
  /^prisma\/migrations\//,
  /^scripts\/(archive|codemods)\//,
  /^docs\/(specs|superpowers|adr|audits|follow-ups|feedback|plans)\//,
  /^docs\/architecture-sitrep-[\d-]+\.md$/,
  /^docs\/things-to-fix\.md$/,
  /(^|\/)package-lock\.json$/,
];

const folder = process.argv[2] ?? "";
const dryRun = process.argv.includes("--dry-run");
const files = new Set(execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean));
const moves = movesFor(folder, files);

const changed = new Map<string, string>();
for (const file of files) {
  if (SKIP.some((re) => re.test(file))) continue;
  if (!CODE.test(file) && !TEXT.test(file)) continue;
  const src = readFileSync(file, "utf8");
  const out = rewritePathMentions(rewriteSource(src, file, moves, files), moves);
  if (out !== src || file in moves) changed.set(file, out);
}

for (const [from, to] of Object.entries(moves)) console.log(`move  ${from} -> ${to}`);
for (const [file, out] of changed) {
  const before = readFileSync(file, "utf8").split("\n");
  const lines = out.split("\n").flatMap((l, i) => (l !== before[i] ? [i + 1] : []));
  if (lines.length > 0) console.log(`edit  ${file}:${lines.join(",")}`);
}
if (dryRun) process.exit(0);

for (const [from, to] of Object.entries(moves)) {
  mkdirSync(path.dirname(to), { recursive: true });
  execFileSync("git", ["mv", from, to]);
}
for (const [file, out] of changed) writeFileSync(moves[file] ?? file, out);
console.log(`${Object.keys(moves).length} files moved, ${changed.size} files written.`);
```
Run `npx vitest run scripts/codemods/lib-moves.test.ts` and expect PASS (9 tests). Then:
  1. `ls lib | grep -E '^share-'`. If anything shows up that isn't one of the six stems (an earlier task added it), add a `[old, new]` pair to `STEMS.share` under the naming rule in the header first.
  2. `npx tsx scripts/codemods/move-lib-modules.ts share --dry-run`. Check that the `move` lines are the twelve files and the `edit` lines match the Modify list above, plus anything 3.L–3.P added.
  3. `npx tsx scripts/codemods/move-lib-modules.ts share`.
- [ ] **Step 4: Run them, expect PASS.** Run `npx vitest run scripts/codemods/lib-moves.test.ts lib/lib-folders.test.ts lib/share/`.
- [ ] **Step 5: Task-done check.**
  - `git diff HEAD --name-only --diff-filter=d -M -- '*.ts' '*.tsx' | xargs -r npx vitest related --run`
  - `npx tsc --noEmit`
  - `git diff HEAD --name-only --diff-filter=d -M -- '*.ts' '*.tsx' | xargs -r npx eslint`
  - Leftovers, which must print nothing:
    ```bash
    X=(':!docs/specs' ':!docs/superpowers' ':!docs/adr' ':!docs/audits' ':!docs/follow-ups' ':!docs/feedback' ':!docs/architecture-sitrep-2026-09-22.md' ':!docs/things-to-fix.md' ':!design_handoff' ':!prisma/migrations' ':!scripts/archive')
    git grep -nP "lib/share-(lookup|og|ref|traveller|url|view)\b" -- . "${X[@]}"
    ```
  - If 3.N's rules in `eslint.config.mjs` name a share module by glob (for example `lib/share-*.ts`), update that glob by hand. The codemod rewrites exact paths and specifiers only.
- [ ] **Step 6: Commit.** Run `git status` first. It should show only the moves, the printed edits and the four new files, and never `next dev`'s CLAUDE.md block. Then `git add -A` and commit with:
```
refactor(lib): share modules live in lib/share (card 3.O, Q9)

One-off codemod in scripts/codemods (lib-moves.ts holds the naming rule and
is unit-tested); lib/lib-folders.test.ts pins "folder, no barrel, nothing
left flat". share-traveller and share-url keep their prefix: lib/traveller.ts
and lib/url.ts exist.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

---

### Task 3.O.2: `lib/auth/`

**Files:**
- Move (by the codemod): `lib/auth.ts` → `lib/auth/auth.ts`, `lib/auth-client.ts` → `lib/auth/client.ts`, `lib/auth-dev-login.ts` → `lib/auth/dev-login.ts`, `lib/auth-mcp-access.ts` → `lib/auth/mcp-access.ts`, `lib/auth-prisma.ts` → `lib/auth/prisma.ts`, `lib/sign-in-{door,email,href,redirect}.ts` → `lib/auth/sign-in-{door,email,href,redirect}.ts`, each with its `.test.ts`. The test-only `lib/auth-magic-link.test.ts` → `lib/auth/magic-link.test.ts` and `lib/auth-sign-in-link.test.ts` → `lib/auth/sign-in-link.test.ts`. That's 19 files.
- Modify (by the codemod, as printed at `4e6163c1`): `app/(app)/account/page.test.tsx:51,68`, `app/(app)/layout.test.tsx:6,66,115`, `app/(app)/layout.tsx:2,5`, `app/(focus)/layout.test.tsx:13`, `app/(focus)/layout.tsx:1,2`, `app/.well-known/discovery.test.ts:16,17`, `app/.well-known/oauth-authorization-server/api/auth/route.ts:2`, `app/.well-known/oauth-authorization-server/route.ts:2`, `app/api/auth/[...all]/route.ts:2`, `app/api/client-error/route.test.ts:8`, `app/api/client-error/route.ts:3`, `app/api/mcp/route.test.ts:13`, `app/api/mcp/route.ts:8,9`, `app/connect/consent-form.tsx:3`, `app/connect/page.test.tsx:13,16`, `app/connect/page.tsx:3,54,61`, `app/landing/access-denied.ts:2,5`, `app/landing/email-sign-in.test.tsx:7`, `app/landing/email-sign-in.tsx:4,12`, `app/landing/landing.test.tsx:8`, `app/landing/sign-in-controls.test.tsx:9`, `app/landing/sign-in-controls.tsx:12`, `app/landing/sign-in-panel.tsx:14,18`, `app/landing/signin-buttons.test.tsx:7`, `app/landing/signin-buttons.tsx:4`, `app/page.test.tsx:13,16`, `app/page.tsx:4,26`, `components/app-rail.test.tsx:6`, `components/shell/app-shell-rail.test.tsx:18`, `components/shell/sidebar.test.tsx:22`, `components/trip/trip-nav.test.tsx:19`, `components/ui/sign-out-button.test.tsx:5`, `components/ui/sign-out-button.tsx:3`, `docs/HANDOFF.md:146,159`, `docs/open-follow-ups.md:2631,2674`, `docs/resendDeploy.md:8`, `lib/access-requests.test.ts:7`, `lib/access-requests.ts:39`, `lib/access.ts:36`, `lib/admin-notify.test.ts:260`, `lib/admin-notify.ts:24,25`, `lib/allowlist.ts:9,81,95`, `lib/approval-email.ts:1`, `lib/auth-dev-login.test.ts:5,29,30,46`, `lib/auth-dev-login.ts:11,14,15`, `lib/auth-magic-link.test.ts:5,28,29,46`, `lib/auth-mcp-access.test.ts:18,38,39,54`, `lib/auth-mcp-access.ts:25`, `lib/auth-prisma.test.ts:3`, `lib/auth-prisma.ts:13,19`, `lib/auth-sign-in-link.test.ts:17,18,30`, `lib/auth.test.ts:4,17,26,33,64`, `lib/auth.ts:10,12,15,17,18,28,141`, `lib/guards.test.ts:54`, `lib/guards.ts:3,4,19`, `lib/mail.ts:3`, `lib/mcp/oauth.ts:4,9,12`, `lib/mcp/redirect-allowlist.ts:6`, `lib/oauth-continuation.ts:5`, `lib/server-only-boundary.test.ts:7`, `lib/sign-in-door.test.ts:8,13`, `lib/sign-in-door.ts:47,60`, `lib/sign-in-email.ts:5`, `lib/sign-in-redirect.ts:3`, `lib/trip-ref.ts:20,57`, `prisma/schema.prisma:42`, `proxy.test.ts:5`, `proxy.ts:2,7`, `scripts/layout-audit/run.test.ts:278`, `server/actions/connected-apps.test.ts:30`, `server/actions/connected-apps.ts:6,81`, `test/helpers/auth-memory-store.ts:2,6`, `test/integration/auth-dev-login.test.ts:4,10,20,26`, `test/integration/connected-apps.test.ts:11,20,58`, `test/integration/helpers/oauth-flow.ts:10`, `test/integration/locking.test.ts:15`, `test/integration/lone-stop-rule.test.ts:12`, `test/integration/mcp.test.ts:18,22,61,66,108`
- Notable sites in that list: `proxy.ts:2,7` (`REQUEST_PATH_HEADER`, through the alias); `lib/server-only-boundary.test.ts:7` (`"lib/auth.ts"` → `"lib/auth/auth.ts"`, a path the test reads); `prisma/schema.prisma:42` (a `///` comment, so no migration); `app/api/auth/[...all]/route.ts:2`; `test/integration/*` (the integration tier doesn't run here, but `tsc` covers its imports and the leftover grep covers its `vi.mock` strings).
- Test: `lib/lib-folders.test.ts`

**Interfaces:**
- Consumes: `npx tsx scripts/codemods/move-lib-modules.ts` and `STEMS.auth` (3.O.1).
- Produces: `@/lib/auth/auth` (`authServer`, `auth`, …), `@/lib/auth/client` (`authClient`), `@/lib/auth/dev-login`, `@/lib/auth/mcp-access`, `@/lib/auth/prisma` (`withBetterAuthLists`), `@/lib/auth/sign-in-door` (`decideSignIn`), `@/lib/auth/sign-in-email`, `@/lib/auth/sign-in-href` (`REQUEST_PATH_HEADER`, `signInHref`), `@/lib/auth/sign-in-redirect`. Export names are unchanged.

- [ ] **Step 1: Write the failing test.** Add the row to `FOLDERS` in `lib/lib-folders.test.ts`:
```ts
  auth: /^(auth|sign-in)[.-]/,
```
- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/lib-folders.test.ts`. `lib/auth/ > exists and has no barrel` fails with `expected false to be true`, and `leaves no module of its area flat` lists the 19 files.
- [ ] **Step 3: Implement.**
  1. `ls lib | grep -E '^(auth|sign-in)[.-]'`. Add a `STEMS.auth` pair for any file that isn't one of the eleven stems.
  2. `npx tsx scripts/codemods/move-lib-modules.ts auth --dry-run`, and review it against the list above.
  3. `npx tsx scripts/codemods/move-lib-modules.ts auth`.

  A representative site, from `lib/auth/magic-link.test.ts`:
```ts
// before (lib/auth-magic-link.test.ts)
vi.mock("@/lib/auth-prisma", () => ({ withBetterAuthLists: (db: unknown) => db }));
vi.mock("@/lib/sign-in-door", () => ({ decideSignIn: decideSignInMock }));
    return await import("@/lib/auth");
// after (lib/auth/magic-link.test.ts)
vi.mock("@/lib/auth/prisma", () => ({ withBetterAuthLists: (db: unknown) => db }));
vi.mock("@/lib/auth/sign-in-door", () => ({ decideSignIn: decideSignInMock }));
    return await import("@/lib/auth/auth");
```
- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/lib-folders.test.ts lib/auth/ lib/server-only-boundary.test.ts proxy.test.ts`.
- [ ] **Step 5: Task-done check.** Run the same four commands as 3.O.1 Step 5. The leftover grep is:
```bash
X=(':!docs/specs' ':!docs/superpowers' ':!docs/adr' ':!docs/audits' ':!docs/follow-ups' ':!docs/feedback' ':!docs/architecture-sitrep-2026-09-22.md' ':!docs/things-to-fix.md' ':!design_handoff' ':!prisma/migrations' ':!scripts/archive')
git grep -nP "lib/(auth(-client|-dev-login|-mcp-access|-prisma|-magic-link|-sign-in-link)?|sign-in-(door|email|href|redirect))\b(?![/-])" -- . "${X[@]}"
```
  It is expected to print exactly these prose lines and nothing else. Each one uses "lib/auth" to name the module graph, which is now the folder, so leave them: `components/trip/item-card.test.tsx:8`, `scripts/layout-audit/run.test.ts:278` (the comment half; its fixture string is already `@/lib/auth/auth`), `server/actions/forks.test.ts:232`, `server/actions/invites.test.ts:37`, `server/actions/stops.test.ts:175`, `server/actions/trips.test.ts:147`, `vitest.integration.config.ts:21`. A `"…"`/`'…'` specifier in the output is a miss: fix it.
- [ ] **Step 6: Commit.** Stage what `git status` shows (the moves plus the printed edits) and commit:
```
refactor(lib): auth and sign-in modules live in lib/auth (card 3.O, Q9)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

---

### Task 3.O.3: `lib/feedback/` and `lib/feedback/cli/`

**Files:**
- Move (by the codemod): `lib/feedback-{context,device,inbox,queue,site,trip-store,view}.ts` → `lib/feedback/{context,device,inbox,queue,site,trip-store,view}.ts`; `lib/feedback-{accept-args,resolve-args,resolve-site}.ts` → `lib/feedback/cli/{accept-args,resolve-args,resolve-site}.ts`. Each moves with its `.test.ts` (`feedback-trip-store` has none), 19 files in all.
- Modify (by the codemod, as printed at `4e6163c1`): `components/feedback/feedback-launcher.test.tsx:139,546`, `components/feedback/feedback-launcher.tsx:22,31,36,44,196,231`, `components/feedback/feedback-trip-marker.tsx:4`, `docs/open-follow-ups.md:1377,1398,1470,1490,1981,1984,2207`, `lib/attention.ts:7`, `lib/feedback-accept-args.test.ts:2`, `lib/feedback-context.test.ts:6`, `lib/feedback-device.test.ts:2`, `lib/feedback-inbox.test.ts:2,3`, `lib/feedback-inbox.ts:2,3,4`, `lib/feedback-queue.test.ts:10`, `lib/feedback-resolve-args.test.ts:2`, `lib/feedback-resolve-site.test.ts:2`, `lib/feedback-resolve-site.ts:1`, `lib/feedback-site.test.ts:2`, `lib/feedback-view.test.ts:8`, `lib/feedback-view.ts:2,14,21`, `lib/offline-status.ts:7`, `prisma/schema.prisma:1223`, `scripts/feedback-accept.ts:22`, `scripts/feedback-pull.ts:38`, `scripts/feedback-resolve.ts:27,28,29`, `server/actions/feedback.test.ts:52`, `server/actions/feedback.ts:6,17,27`, `test/helpers/copy-scan.ts:183`
- Notable sites: `scripts/feedback-{accept,pull,resolve}.ts`, where the relative `../lib/feedback-*` imports become `../lib/feedback/…` and `../lib/feedback/cli/…`; `test/helpers/copy-scan.ts:183` (`prefix: "lib/feedback-inbox.ts"` → `"lib/feedback/inbox.ts"`); `lib/feedback/trip-store.ts` and `components/feedback/feedback-launcher.tsx` (`"use client"`, path only); `prisma/schema.prisma:1223` (comment).
- Test: `lib/lib-folders.test.ts`

**Interfaces:**
- Consumes: the codemod and `STEMS.feedback` (3.O.1).
- Produces: `@/lib/feedback/{context,device,inbox,queue,site,trip-store,view}` and `@/lib/feedback/cli/{accept-args,resolve-args,resolve-site}`. Export names are unchanged (`parseAcceptArgs`, `parseResolveArgs`, `siteMismatchWarning`, `siteOf`, `siteLabel`, `renderInbox`, `toInboxNote`, …).

- [ ] **Step 1: Write the failing test.** Add to `FOLDERS`:
```ts
  feedback: /^feedback-/,
```
- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/lib-folders.test.ts`. The two `lib/feedback/` rows fail (the folder is missing, and 19 files are still flat).
- [ ] **Step 3: Implement.**
  1. `ls lib | grep -E '^feedback-'`. A file that isn't one of the ten stems gets a `STEMS.feedback` pair: a CLI argument parser goes to `feedback/cli/<name>`, anything else to `feedback/<name>`.
  2. `npx tsx scripts/codemods/move-lib-modules.ts feedback --dry-run`, then the same without `--dry-run`.

  A representative site, `scripts/feedback-resolve.ts:27-29`:
```ts
// before
import { parseResolveArgs } from "../lib/feedback-resolve-args";
import { siteMismatchWarning } from "../lib/feedback-resolve-site";
import { siteLabel, siteOf } from "../lib/feedback-site";
// after
import { parseResolveArgs } from "../lib/feedback/cli/resolve-args";
import { siteMismatchWarning } from "../lib/feedback/cli/resolve-site";
import { siteLabel, siteOf } from "../lib/feedback/site";
```
  Do **not** run any `feedback:*` npm script to "check" the CLIs. `feedback:pull` reads production, and `feedback:resolve`/`feedback:accept` write it. `tsc` covers `scripts/*.ts`.
- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/lib-folders.test.ts lib/feedback/ test/copy-style.test.ts test/helpers/copy-scan.test.ts`. `copy-style` is Review Focus 3: the inbox's exclusion has to have followed the file.
- [ ] **Step 5: Task-done check.** Run the same four commands as 3.O.1 Step 5. The leftover grep must print nothing:
```bash
X=(':!docs/specs' ':!docs/superpowers' ':!docs/adr' ':!docs/audits' ':!docs/follow-ups' ':!docs/feedback' ':!docs/architecture-sitrep-2026-09-22.md' ':!docs/things-to-fix.md' ':!design_handoff' ':!prisma/migrations' ':!scripts/archive')
git grep -nP "lib/feedback-(context|device|inbox|queue|site|trip-store|view|accept-args|resolve-args|resolve-site)\b" -- . "${X[@]}"
```
- [ ] **Step 6: Commit.**
```
refactor(lib): feedback modules live in lib/feedback, CLI parsers in lib/feedback/cli (card 3.O, Q9)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

---

### Task 3.O.4: `lib/map/`

**Files:**
- Move (by the codemod): `lib/map-{icons,overlap,palette,pins,tiles}.ts` → `lib/map/{icons,overlap,palette,pins,tiles}.ts` and `lib/maps.ts` → `lib/map/maps.ts`, each with its `.test.ts` (12 files).
- Modify (by the codemod, as printed at `4e6163c1`): `COMPONENTS.md:32,33`, `app/privacy/page.tsx:25`, `app/share/[token]/page.tsx:27`, `components/globe/globe-map.test.tsx:4`, `components/globe/globe-map.tsx:16,18,19,20`, `components/trip/day-map.test.tsx:4`, `components/trip/day-map.tsx:25,27,29,30,31`, `components/trip/day/tonight-card.tsx:8`, `components/trip/home/desktop/route-map-tile-canvas.tsx:17,18,19,20`, `components/trip/map-link.tsx:4`, `components/trip/route-map.test.tsx:4,5`, `components/trip/route-map.tsx:25,27,28,29`, `components/trip/wishlist-map.test.tsx:4`, `components/trip/wishlist-map.tsx:19,21,22`, `components/trips/travel-map.test.tsx:5`, `components/trips/travel-map.tsx:22,23,24,25`, `docs/maps-overview.md:35,37,50,82,87,181,186,247,395,539`, `docs/open-follow-ups.md:1443,2382`, `lib/chapter-colours.ts:2`, `lib/day-map.ts:12`, `lib/hues.ts:6`, `lib/map-icons.test.ts:2`, `lib/map-overlap.test.ts:2`, `lib/map-palette.test.ts:2`, `lib/map-pins.test.ts:2,3`, `lib/map-pins.ts:2`, `lib/map-tiles.test.ts:2,21`, `lib/stop-colours.test.ts:3`, `lib/stop-colours.ts:2`
- Modify (by hand): the extensionless comments at `app/share/[token]/page.tsx:68` ("lib/map-palette's MAP_INK" → "lib/map/palette's MAP_INK") and `components/trip/home/desktop/route-map-tile-canvas.tsx:10-11` ("lib/map-palette hex" → "lib/map/palette hex", "(lib/map-overlap)" → "(lib/map/overlap)"). Also `docs/maps-overview.md:82,87`: the box-drawing diagram's rows get four characters longer, so take four spaces out of each row's padding to put the right-hand `│` back in its column.
- Test: `lib/lib-folders.test.ts`

**Interfaces:**
- Consumes: the codemod and `STEMS.map` (3.O.1).
- Produces: `@/lib/map/{icons,overlap,palette,pins,tiles,maps}`, with export names unchanged (`applyLeafletIconDefaults`, `pinHex`, `pinHtml`, `CATEGORY_PIN_HEX`, `hueHex`, `mapInk`, `mapsUrl`, `googleDirectionsUrl`, …). `lib/map/palette.ts` is still the only lib file allowed hex literals. Its header comment says so, and nothing checks it by path.

- [ ] **Step 1: Write the failing test.** Add to `FOLDERS`:
```ts
  map: /^(map-|maps\.)/,
```
- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/lib-folders.test.ts`. The two `lib/map/` rows fail.
- [ ] **Step 3: Implement.**
  1. `ls lib | grep -E '^(map-|maps\.)'`. Add a `STEMS.map` pair for anything new.
  2. `npx tsx scripts/codemods/move-lib-modules.ts map --dry-run`, then the same without `--dry-run`.
  3. Make the hand edits listed under Files.

  A representative site, a moved test whose relative import points at a module that didn't move (`lib/map/pins.test.ts:2-3`):
```ts
// before (lib/map-pins.test.ts)
import { CATEGORIES } from "./categories";
import { CATEGORY_PIN_HEX, pinHex, pinHtml } from "./map-pins";
// after (lib/map/pins.test.ts)
import { CATEGORIES } from "../categories";
import { CATEGORY_PIN_HEX, pinHex, pinHtml } from "./pins";
```
- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/lib-folders.test.ts lib/map/`.
- [ ] **Step 5: Task-done check.** Run the same four commands as 3.O.1 Step 5. After the hand edits, the leftover grep must print nothing:
```bash
X=(':!docs/specs' ':!docs/superpowers' ':!docs/adr' ':!docs/audits' ':!docs/follow-ups' ':!docs/feedback' ':!docs/architecture-sitrep-2026-09-22.md' ':!docs/things-to-fix.md' ':!design_handoff' ':!prisma/migrations' ':!scripts/archive')
git grep -nP "lib/(map-(icons|overlap|palette|pins|tiles)|maps)\b" -- . "${X[@]}"
```
- [ ] **Step 6: Commit.**
```
refactor(lib): map modules live in lib/map (card 3.O, Q9)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

---

### Task 3.O.5: `lib/money/` finished, and the card's closing checks

**Files:**
- Move (by the codemod): `lib/money.ts` → `lib/money/money.ts`, `lib/money-due-count.ts` → `lib/money/due-count.ts`, and `lib/{budget,budget-loader,cost-labels,currencies,currency-for-country,fx,spend-so-far,upcoming-payments}.ts` → `lib/money/<same>.ts`, each with its `.test.ts` (20 files). The six modules already in `lib/money/` (`breakdown`, `cost-form-state`, `format-parts`, `other-cost-defaults`, `summary-lines`, `to-pay`) stay where they are. Their `@/lib/money` imports become `@/lib/money/money`.
- Modify (by the codemod, as printed at `4e6163c1`): `ONBOARDING.md:61`, `app/(app)/trips/[tripId]/budget/budget-page.test.tsx:35,38,39,72`, `app/(app)/trips/[tripId]/budget/page.tsx:11,12,14,15,16,21,137,163`, `app/(app)/trips/[tripId]/print/page.test.tsx:35,36`, `app/(app)/trips/[tripId]/print/page.tsx:14,18,21`, `app/(app)/trips/[tripId]/summary/page.test.tsx:46,47,79`, `app/(app)/trips/[tripId]/summary/page.tsx:14,17,30`, `app/api/fx/route.ts:3`, `app/privacy/page.tsx:26`, `components/booking-import/proposal-card.tsx:13`, `components/money/cost-fields/inline-cost-fields.tsx:7`, `components/money/cost-tile.tsx:5`, `components/money/money-count-up.tsx:5`, `components/money/paid-confirm.tsx:7`, `components/new-trip/step-from.tsx:7`, `components/plan/day-section.test.tsx:17`, `components/plan/day-section.tsx:15`, `components/plan/stay-dialog.test.tsx:11`, `components/plan/stay-panel.test.tsx:5`, `components/shell/sidebar-nav-counts.test.tsx:7`, `components/shell/sidebar-nav-counts.tsx:3`, `components/trip/compare-table.tsx:5`, `components/trip/cost-amounts.tsx:1`, `components/trip/cost-summary.tsx:3`, `components/trip/delete-stop-dialog.test.tsx:19`, `components/trip/home/budget-glance.tsx:3`, `components/trip/home/countdown-hero.tsx:5`, `components/trip/home/desktop/spend-so-far-tile.tsx:3,11`, `components/trip/home/desktop/trip-cost-tile.tsx:4`, `components/trip/home/phase-past.test.tsx:59,60,63,64,68,369,427,428,429,555`, `components/trip/home/phase-past.tsx:4`, `components/trip/home/phase-planning.test.tsx:64,910`, `components/trip/home/phase-planning.tsx:19`, `components/trip/home/phase-travelling.test.tsx:73,94,735,897`, `components/trip/other-cost-editor.test.tsx:138`, `components/trip/other-cost-editor.tsx:28`, `components/trip/promote-fork-dialog.test.tsx:23`, `components/trip/promote-fork-dialog.tsx:8`, `components/trip/settings/trip-details-form.tsx:9`, `components/trip/spend-so-far-card.test.tsx:4`, `components/trip/spend-so-far-card.tsx:2,5`, `components/trip/stop-deletion-preview.tsx:7`, `components/trip/upcoming-payments-card.test.tsx:4`, `components/trip/upcoming-payments-card.tsx:4,6`, `components/ui/currency-row.tsx:7`, `components/ui/money-input.test.tsx:6`, `components/ui/money-input.tsx:12,13`, `docs/HANDOFF.md:452`, `lib/activity.ts:11`, `lib/booking-import/build.ts:8,10`, `lib/budget-loader.test.ts:18,23`, `lib/budget-loader.ts:16,31`, `lib/budget.test.ts:2`, `lib/budget.ts:10`, `lib/compare.ts:27`, `lib/currency-for-country.ts:2`, `lib/desktop-home-loader.ts:41,48,49,262`, `lib/digest-dispatch.ts:55,56,393`, `lib/mcp/reads/costs.test.ts:2`, `lib/mcp/reads/costs.ts:13,14,93`, `lib/mcp/tools/bookings-write.ts:86`, `lib/mcp/tools/reads.test.ts:59`, `lib/mcp/tools/reads.ts:34`, `lib/mcp/tools/trips-stops-write.ts:60`, `lib/money-due-count.test.ts:13,17`, `lib/money-due-count.ts:19`, `lib/money/breakdown.ts:1`, `lib/money/cost-form-state.ts:25`, `lib/money/format-parts.ts:1`, `lib/money/other-cost-defaults.ts:10`, `lib/money/to-pay.ts:1`, `lib/new-trip/draft.ts:1,2`, `lib/past-home-loader.ts:29,30`, `lib/plan/plan-model.test.ts:8`, `lib/plan/plan-model.ts:9`, `lib/real-trip/christmas-europe-2026.test.ts:299`, `lib/real-trip/christmas-europe-2026.ts:145`, `lib/spend-so-far.ts:1`, `lib/stop-days.ts:14,88`, `lib/surprise-readers.guard.test.ts:31,32`, `lib/travelling-home-loader.ts:40,45,46,394`, `lib/upcoming-payments.ts:2`, `lib/validations/accommodation.ts:2`, `lib/validations/cost.ts:3`, `lib/validations/item.ts:4`, `lib/validations/transport.ts:3`, `lib/validations/trip.test.ts:3`, `lib/validations/trip.ts:2`, `server/actions/accommodation.test.ts:136`, `server/actions/accommodation.ts:14`, `server/actions/costs.test.ts:66`, `server/actions/costs.ts:5`, `server/actions/forks.test.ts:303`, `server/actions/forks.ts:5`, `server/actions/items.test.ts:147`, `server/actions/items.ts:14`, `server/actions/rates.test.ts:42`, `server/actions/rates.ts:5`, `server/actions/transport.test.ts:141`, `server/actions/transport.ts:12`
- Notable sites: `eslint.config.mjs` `SURPRISE_VISIBILITY_READERS` (`"lib/budget-loader.ts"`, `"lib/money-due-count.ts"`; 3.N.7 moved them there from the deleted guard test; the codemod rewrites `.mjs` path mentions, and `eslint.config.test.ts` fails if one is missed); `components/trip/home/phase-past.test.tsx:59-68,369,427-429,555` (the `vi.mock` / `importOriginal` / `vi.importActual` / `typeof import` forms all in one file); `ONBOARDING.md:61`.
- Modify (by hand): the extensionless "lib/fx" in the header comments at `server/actions/costs.test.ts:7`, `server/actions/rates.test.ts:7` and `server/actions/transport.test.ts:7` becomes "lib/money/fx".
- Test: `lib/lib-folders.test.ts`

**Interfaces:**
- Consumes: the codemod and `STEMS.money` (3.O.1). Also whatever 3.P left in these files: the BI-10 `lib/fx.ts` base URL, the TB-09 `paidPct`. The codemod moves the files as they are.
- Produces: `@/lib/money/{money,budget,budget-loader,cost-labels,currencies,currency-for-country,fx,due-count,spend-so-far,upcoming-payments}`, with export names unchanged. A bare `@/lib/money` no longer resolves.

- [ ] **Step 1: Write the failing test.** Add to `FOLDERS`:
```ts
  money: /^(money|budget|fx|spend-so-far|upcoming-payments|cost-labels|currencies|currency-for-country)[.-]/,
```
- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/lib-folders.test.ts`. `lib/money/ > exists and has no barrel` already passes. `leaves no module of its area flat` fails, listing the 20 files.
- [ ] **Step 3: Implement.**
  1. `ls lib | grep -E '^(money|budget|fx|spend-so-far|upcoming-payments|cost-labels|currencies|currency-for-country)[.-]'`. A new file (for example a `lib/budget-reads.ts` from 3.N) gets a `STEMS.money` pair: `money-x` → `money/x`, anything else → `money/<same>`.
  2. `npx tsx scripts/codemods/move-lib-modules.ts money --dry-run`, then the same without `--dry-run`.
  3. Make the three hand edits.

  A representative site, `lib/money/to-pay.ts:1` (a module already in the folder):
```ts
// before
import { convertMinor } from "@/lib/money";
// after
import { convertMinor } from "@/lib/money/money";
```
- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/lib-folders.test.ts lib/money/ eslint.config.test.ts`.
- [ ] **Step 5: Task-done check, and the card's closing checks.**
  - The same four commands as 3.O.1 Step 5. The leftover grep is:
    ```bash
    X=(':!docs/specs' ':!docs/superpowers' ':!docs/adr' ':!docs/audits' ':!docs/follow-ups' ':!docs/feedback' ':!docs/architecture-sitrep-2026-09-22.md' ':!docs/things-to-fix.md' ':!design_handoff' ':!prisma/migrations' ':!scripts/archive')
    git grep -nP "lib/(money|budget|budget-loader|fx|spend-so-far|upcoming-payments|cost-labels|money-due-count|currencies|currency-for-country)\b(?![/-])" -- . "${X[@]}"
    ```
    It is expected to print only `components/ui/money-input.tsx:42` ("Parsing lives in `lib/money`", which now names the folder, so leave it).
  - All five leftover greps from 3.O.1–3.O.5 again, together. Each should print only the prose lines its task allows.
  - `git grep -nE "from \"@/lib/(auth|money|feedback|map|share)\"" -- '*.ts' '*.tsx'` must print nothing: no barrel imports.
  - Archive the codemod, now that its last run is done: `git mv scripts/codemods/lib-moves.ts scripts/codemods/lib-moves.test.ts scripts/codemods/move-lib-modules.ts scripts/archive/` and remove the empty `scripts/codemods/`. Add one line for it to `scripts/archive/README.md` (created by 3.P.13).
  - `npm run knip`. It must be clean (`scripts/archive/**` is in knip's `ignore` since 3.P.13). Don't widen anything else.
  - `npx vitest run eslint.config.test.ts` — every listed Surprise reader still exists after the moves.
  - `npx eslint .`. It must be clean (`scripts/archive/` is in `globalIgnores` since 3.P.13).
  - `npx tsc --noEmit`.
- [ ] **Step 6: Commit.**
```
refactor(lib): money modules finish moving into lib/money (card 3.O, Q9)

money-due-count becomes money/due-count; money.ts is money/money.ts. No
barrel: a bare @/lib/money no longer resolves. The one-off codemod is
archived now its last run is done.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

---

## Task 3.Z: The batch gate, and the spec says what was built

**Files:**
- Modify: `docs/specs/2026-10-14-tidy-up-pass.md`: the status line, "Batch 3 drift" (append "As built (2026-10-16)" notes), and the *Bugs* table (TB-10).
- Modify: `docs/open-follow-ups.md`: new follow-ups (below), with NAV-05 and the deferred minors as the earlier tasks left them.
- Test: none new. This task runs the whole gate.

- [ ] **Step 1: The gate.** Run each of these and fix whatever fails, in its own `fix(...)` commit that names the task the failure came from:
  - `npm test`
  - `npm run build`
  - `docker compose up -d && npx prisma migrate deploy && npm run test:integration`. If Docker isn't available, say so; don't skip silently.
  - `npm run knip`
  - `npx eslint .`
  - `npx tsc --noEmit`
- [ ] **Step 2: Bugs table.** Add TB-10 to the spec's *Bugs* table:
  `| TB-10 | lib/day-view-loader.ts:409 (projectDay) | The Day strip's check-in/check-out dots ignored every stay that did not touch the shown day (from 2026-12-04 a check-in on 2026-12-10 showed 0 dots). Found while planning 3.M; buildDayModel builds the itinerary from every stay. | M |`
- [ ] **Step 3: As-built notes.** Under "Batch 3 drift", add an **"As built (2026-10-16)"** list. It holds every deviation recorded in the five section Notes (3.N 1–8, 3.L 1–9, 3.M 1–5, 3.P part A, 3.P part B 1–9, 3.O), each as one line, plus anything an implementer reported as a deviation during execution. Call out the Traveller-visible ones:
  - Today now shows the Surprise badge and Item photos the Day view already showed (3.M).
  - Paid shows 99% until fully paid (TB-09).
  - `updateStop` resolves a sent `"UTC"` from the country (3.L).
  - The aria label "Travellers (N)" and the dialog name "Search".
- [ ] **Step 4: Status line.** Change the spec's status line so batch 3 reads: **"Batch 3 is built** on `chore/tidy-up-3-shape-hygiene` (2026-10-16); awaiting Cam's review, merge and deploy."
- [ ] **Step 5: Follow-ups.** Add these to `docs/open-follow-ups.md` (*Open items*), in its own entry format:
  - The Chapter form's "Set dates now" switched off on an edit keeps the dates (found in 3.L).
  - NAV-05's second half ("render two neighbours each side if rapid swiping sticks"), if 3.M.5 has not already left it as a watch item.
  - TD-01 as 3.P.21 refreshed it.
- [ ] **Step 6: Commit.** `docs: tidy-up batch 3 built — spec status, as-built notes, TB-10, follow-ups`
