# Pre-trip hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nine small fixes so the app behaves on weak signal, across two phones and on the last day of a trip.

**Architecture:** Each task is an isolated change to one existing module plus its test. The only shared piece is `lib/trip-refresh.ts` (Task 4), which Task 5 calls. No schema changes, no new dependencies.

**Tech Stack:** Next.js (this repo's version has breaking changes: read the relevant page in `node_modules/next/dist/docs/` before using a framework API), React, Vitest, Better Auth, `@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-11-25-pre-trip-hardening.md`

## Global Constraints

- Branch `fix/pre-trip-hardening-2026-11-25`. Commit per task. Never push, never touch `main` or `beta`.
- Never run `npm run feedback:pull`, `feedback:resolve`, `feedback:accept`, or anything reading `.env.production.local`.
- No new dependencies. No schema or migration changes. No changes to `public/sw.js`.
- Traveller-facing copy never uses an em-dash (`test/copy-style.test.ts`) and uses the typographic apostrophe where the neighbouring strings do.
- Zero comments unless the why is non-obvious. No JSDoc on new code beyond what neighbouring exports carry.
- Do not add features beyond the task. No "while I'm here" cleanup.
- Inner loop: `TZ=UTC npx vitest run <test file>`. Task done: `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never the full suite or `next build` per task.
- Existing tests that assert the old behaviour a task deliberately reverses are updated in that task; say which in the report. Any other failing test is a regression to fix.
- Commit messages follow the repo's conventional style and end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

- A dialog with a half-typed form open when a refresh is due: the typed text must survive (Task 4).
- A navigation that settles at 5.9 s, or is superseded by another tap, must not trigger a full load (Task 6).
- An amount in a zero-decimal currency, a negative amount and "1,234,567" must parse as before (Task 3).
- A Home zone behind the last Stop (New York from Rome) must behave exactly as before (Task 1).
- Next's own control-flow errors (redirect, not-found) must not page the Admin (Task 9).

---

### Task 1: Trip today on the last day

**Files:**
- Modify: `lib/tz.ts` (`currentTripTimezone`, ~485-505)
- Test: `lib/tz.test.ts`
- Modify: `docs/open.md` (delete the **Trip today** line under "On the trip")

- [ ] **Step 1: Failing tests** in the `currentTripTimezone` describe, using fake timers. Stops: Paris (arrive 2026-12-01, depart 2026-12-20), Rome (arrive 2026-12-20, depart 2027-01-05).
  - `2027-01-05T14:30:00Z`, Home `Australia/Brisbane` → `"Europe/Rome"`, and `todayISOInZone(result)` is `"2027-01-05"`.
  - `2027-01-05T23:30:00Z` (00:30 on the 6th in Rome), Home `Australia/Brisbane` → `"Australia/Brisbane"`.
  - `2027-01-06T02:00:00Z`, Home `America/New_York` (still the 5th there) → `"Europe/Rome"` (unchanged behaviour).
  - `2026-11-30T12:00:00Z`, Home `Australia/Brisbane` → `"Australia/Brisbane"` (before the trip, unchanged).
- [ ] **Step 2:** Run `TZ=UTC npx vitest run lib/tz.test.ts`; the first test fails.
- [ ] **Step 3:** In `currentTripTimezone`, return Home after the trip only when `homeToday > last.departDate && todayISOInZone(last.timezone) > last.departDate`. Rewrite the doc comment's "(not the last stop's own date)" sentence to state the new rule.
- [ ] **Step 4:** Tests pass. Update any existing test that pinned the reversed rule and list it in the report.
- [ ] **Step 5:** Delete the **Trip today** line from `docs/open.md`. Task-done checks. Commit `fix(tz): the Trip stays in the last Stop's zone until its own date has passed`.

### Task 2: Sign-in links last 24 hours

**Files:**
- Modify: `lib/auth/auth.ts:229`
- Test: `lib/auth/auth.test.ts` (or `lib/auth/sign-in-link.test.ts` if that is where the magic-link plugin's options are already reached)

- [ ] **Step 1: Failing test:** the magic-link plugin's `expiresIn` is `24 * 60 * 60`.
- [ ] **Step 2:** Run it; fails with 3600.
- [ ] **Step 3:** Set `expiresIn: 24 * 60 * 60`.
- [ ] **Step 4:** Passes. Task-done checks. Commit `fix(auth): a Sign-in link lasts the 24 hours its email says`.

### Task 3: Comma decimals

**Files:**
- Modify: `lib/money/money.ts` (`parseAmountToMinor`, ~63-80)
- Test: `lib/money/money.test.ts`

- [ ] **Step 1: Failing tests** for `parseAmountToMinor`:
  - `("12,50","EUR")` → `1250`; `("12,5","EUR")` → `1250`; `("1.250,50","EUR")` → `125050`; `("-12,50","EUR")` → `-1250`.
  - Unchanged: `("1,250","EUR")` → `125000`; `("1,250.50","EUR")` → `125050`; `("1,234,567","EUR")` → `123456700`; `("12.50","EUR")` → `1250`; `("1,25","JPY")` → `125`.
- [ ] **Step 2:** Run; the first group fails.
- [ ] **Step 3:** Before the existing strip, when the currency has one or more decimal places and the trimmed input matches `/,\d{1,2}$/`: remove every `.` and every other `,`, and turn that last `,` into `.`. Otherwise the existing path. Update the doc comment's first sentence to say so.
- [ ] **Step 4:** Passes. Task-done checks (this runs `MoneyInput` and `paid-confirm` tests via `related`). Commit `fix(money): "12,50" is twelve fifty, not twelve hundred and fifty`.

### Task 4: Refresh on resume

**Files:**
- Create: `lib/trip-refresh.ts`
- Create: `components/trip/trip-refresher.tsx`
- Test: `components/trip/trip-refresher.test.tsx`
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (mount `<TripRefresher />` beside `<SavedCopyLine>`), and `layout.test.tsx` only if it enumerates children

**Interfaces:**
- Produces, in `lib/trip-refresh.ts`:
  - `export const TRIP_REFRESH_EVENT = "teepee:trip-refresh"`
  - `export const RESUME_REFRESH_AFTER_MS = 5 * 60 * 1000`
  - `export function requestTripRefresh(): void` — dispatches `TRIP_REFRESH_EVENT` on `window`; does nothing when `window` is undefined.
- Produces: `export function TripRefresher(): null` (client component).

Behaviour of `TripRefresher`:
- Remembers when it last refreshed (mount counts as a refresh).
- Wants a refresh when: the document becomes visible or `pageshow` fires and more than `RESUME_REFRESH_AFTER_MS` has passed; `online` fires; `TRIP_REFRESH_EVENT` fires.
- A wanted refresh runs `router.refresh()` unless `navigator.onLine === false` (dropped) or `document.querySelector('[role="dialog"],[role="alertdialog"]')` matches (kept: re-checked once a second and run when no dialog remains). Use the repo's router hook if lint requires it over `next/navigation`'s.
- Cleans up listeners and the timer on unmount.

- [ ] **Step 1: Failing tests** (mock the router; fake timers):
  - visible after 6 minutes → `refresh` called once; visible after 4 minutes → not called.
  - `online` event → called.
  - `requestTripRefresh()` → called.
  - offline (`navigator.onLine` false) + `requestTripRefresh()` → not called.
  - a `role="dialog"` element in the document + `requestTripRefresh()` → not called; remove the element, advance 1 s → called once.
  - unmount, then events → not called.
- [ ] **Step 2:** Run; fails (module missing).
- [ ] **Step 3:** Implement both files; mount in the layout.
- [ ] **Step 4:** Passes. Task-done checks. Commit `feat(trip): a Trip's pages refresh when the app comes back`.

### Task 5: Honest failed-save copy

**Files:**
- Modify: `components/ui/action-failure.ts`, `components/ui/use-server-action.ts`, `components/ui/use-undoable-action.ts`
- Test: their existing test files; `components/ui/use-entity-form.test.tsx` and others that pin the old strings

**Interfaces:**
- Consumes: `requestTripRefresh()` from `lib/trip-refresh.ts` (Task 4).

- [ ] **Step 1: Failing tests:**
  - `SOMETHING_WENT_WRONG` is `"Couldn’t confirm that. Check it saved before trying again."`
  - `UNDO_FAILED` is `"Couldn’t confirm the undo. Check it before trying again."`
  - `useServerAction`: a rejecting action sets `errors._[0]` to `SOMETHING_WENT_WRONG` when online, and `requestTripRefresh` is called once; offline it is `OFFLINE_MESSAGE`.
  - `toastRejected()` calls `requestTripRefresh` once; `toastRefused()` does not.
- [ ] **Step 2:** Run; fail.
- [ ] **Step 3:** Change the two constants; `useServerAction`'s catch uses `failureMessage(SOMETHING_WENT_WRONG)` and calls `requestTripRefresh()`; `toastRejected` calls `requestTripRefresh()`.
- [ ] **Step 4:** `grep -rn "Nothing changed\|Check your connection and try again" components app lib --include='*.ts' --include='*.tsx'`. For each literal used on a **rejection** path (a `catch`, a rejected promise), replace it with the matching constant's wording. Leave literals on refusal paths (the server answered `success: false`), where "Nothing changed" is true. List every site touched and every site left in the report.
- [ ] **Step 5:** Update tests pinning the old strings. Task-done checks plus `TZ=UTC npx vitest run test/copy-style.test.ts`. Commit `fix(ui): a save that could not be confirmed says so, and the page refreshes`.

### Task 6: Weak-signal navigation falls back to a full load

**Files:**
- Modify: `components/navigation/navigation-pending.tsx`
- Test: `components/navigation/navigation-pending.test.tsx`

**Interfaces:**
- Produces: `export const SLOW_NAVIGATION_FALLBACK_MS = 6_000`

Behaviour: while a navigation is pending, a timer of `SLOW_NAVIGATION_FALLBACK_MS` from when it began. If that same navigation is still pending when it fires **and** `navigator.serviceWorker?.controller` is truthy, call `window.location.assign(pending.href)`. A settle, a URL change or a newer `begin` cancels it. The existing 15-second backstop is unchanged.

- [ ] **Step 1: Failing tests** (fake timers; stub `navigator.serviceWorker.controller` and `window.location.assign`):
  - begin `/trips/x/plan`, advance 6 s, controller present → `assign` called once with `/trips/x/plan`.
  - same, controller absent → not called.
  - begin, settle at 5.9 s, advance to 7 s → not called.
  - begin A, begin B at 3 s, advance to 6.5 s → not called; advance to 9 s → called once with B.
- [ ] **Step 2:** Run; fail.
- [ ] **Step 3:** Implement in `NavigationPendingProvider`. Update the provider's doc comment to list the new backstop.
- [ ] **Step 4:** Passes. Task-done checks. Commit `fix(navigation): a tap that waits six seconds becomes a full load, so the saved copy can answer`.

### Task 7: Offline save order and re-save after a change

**Files:**
- Modify: `lib/offline.ts` (`tripOfflinePaths`), `lib/offline-status.ts`, `components/offline-warmer.tsx`, `app/(app)/trips/[tripId]/layout.tsx`
- Test: `lib/offline.test.ts`, `lib/offline-status.test.ts`, `components/offline-warmer.test.tsx`

**Interfaces:**
- Produces, in `lib/offline-status.ts`: `OfflineStatus.pagesStale: boolean` (persisted wherever `pagesFailed` is persisted, default `false`); `export function markPagesStale(tripId: string): void`; `finishWarm` clears it.
- Produces, in `lib/offline.ts`: `export const STALE_WARM_DELAY_MS = 30_000`.
- Changes: `OfflineWarmer` props become `{ tripId: string; paths: string[]; changeStamp: string | null }`.

Order returned by `tripOfflinePaths`: the Trip home (`base`) first; then, when `dayWindow.today` is a warmed day, that Day page and the next day's if it is warmed too; then attachments (same sort and caps as now); then the remaining section pages in their current order; then the remaining Day pages in their current order; then the cover entries. No path is added or dropped.

Warmer: the layout passes `changeStamp` = the newest recent Activity row's id (`recent[0]`; read `readRecentActivity`'s row type and use its id, or its `createdAt` as an ISO string if it has no id), else `null`. When `changeStamp` differs from the value at mount, call `markPagesStale(tripId)` and, `STALE_WARM_DELAY_MS` after the latest such change, re-run the warm (a state counter in the main effect's deps). In the warm, `saved.pagesStale` joins the reasons that make `warmPages` true. This run is not "forced": the data-saver check still applies.

- [ ] **Step 1: Failing tests:**
  - `tripOfflinePaths` for a Travelling trip with `today` inside it and two attachments: index 0 is the Trip home, 1 is today's Day page, 2 is tomorrow's, 3-4 are the attachments, and the set of paths equals the set before the change (compare against a sorted copy).
  - `markPagesStale` sets `pagesStale` true and it survives `resetOfflineStatus()` + re-read from storage the way `pagesFailed` does; `finishWarm` clears it.
  - Warmer: mount with `changeStamp="a"` and a fresh save → pages not fetched; rerender with `"b"` → nothing before 30 s, pages fetched after 30 s; rerender `"b"`→`"c"` at 20 s → fetched at 50 s, once.
  - Warmer: a save with `pagesStale: true` on mount warms pages even though `savedAt` is fresh.
- [ ] **Step 2:** Run; fail.
- [ ] **Step 3:** Implement. Update the warmer's doc comment for the new trigger. Update existing order-dependent tests and say which.
- [ ] **Step 4:** Passes. Task-done checks. Commit `feat(offline): tickets and today are saved first, and a change re-saves the Trip`.

### Task 8: Booking import timeout and connection message

**Files:**
- Modify: `lib/booking-import/extract.ts` (~66), `lib/booking-import/messages.ts`, `components/booking-import/booking-import-sheet.tsx` (~128-133)
- Test: `lib/booking-import/extract.test.ts`, `components/booking-import/booking-import-sheet.test.tsx`

**Interfaces:**
- Produces: `export const BOOKING_EXTRACT_TIMEOUT_MS = 45_000` in `extract.ts`; `BOOKING_IMPORT_MESSAGES.unreachable = "Couldn't reach Teepee. Check your connection and try again."`

- [ ] **Step 1: Failing tests:**
  - `extract`: `client.messages.parse` is called with a second argument `{ timeout: 45_000, maxRetries: 0 }`.
  - `extract`: when `parse` rejects with the SDK's `APIConnectionTimeoutError`, the outcome kind is `"busy"`.
  - Sheet: when `importBooking` rejects, the failed phase shows `BOOKING_IMPORT_MESSAGES.unreachable` and the Try again control is present.
- [ ] **Step 2:** Run; fail.
- [ ] **Step 3:** Pass the request options; add the message; the sheet's catch uses it with the same `"busy"` code so retry stays on. Confirm in `node_modules/@anthropic-ai/sdk` that `APIConnectionTimeoutError` extends `APIConnectionError`; if not, handle it explicitly as busy.
- [ ] **Step 4:** Passes. Task-done checks. Commit `fix(booking-import): a slow read ends inside the time limit, and a dropped connection says so`.

### Task 9: Server errors reach the Admin

**Files:**
- Create: `instrumentation.ts` (repo root, beside `proxy.ts`)
- Test: `instrumentation.test.ts`

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` first and use the `onRequestError` signature it documents. Read `lib/error-sink.ts` for `reportError` and `ReportErrorContext`.

Behaviour: `onRequestError` does nothing unless `process.env.NEXT_RUNTIME === "nodejs"`. It ignores Next's control-flow errors (redirect, not-found and the other digests the docs or `next/dist/client/components` mark as non-errors). Otherwise it dynamically imports `@/lib/error-sink` and calls `reportError` with the error, `source: "server"`, the route path from the hook's context and the error's `digest` when present, using the context field names `ReportErrorContext` already has. It never throws: a failing sink is caught and `console.error`ed.

- [ ] **Step 1: Failing tests** (mock `@/lib/error-sink`):
  - nodejs runtime, a plain `Error` → `reportError` called once with `source: "server"` and the route path.
  - an error whose digest marks a redirect, and one that marks not-found → not called.
  - `NEXT_RUNTIME` `"edge"` → not called.
  - `reportError` rejecting → `onRequestError` resolves.
- [ ] **Step 2:** Run; fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Passes. Task-done checks. If `knip.json` or `eslint.config.mjs` need the new entry file listed, add it. Commit `feat(errors): a server error is recorded on the server, so the Admin's phone hears about it`.

### Task 10: Records

**Files:**
- Modify: `docs/open.md`, `lib/release-notes.ts` (and its test if it pins entries)

- [ ] **Step 1:** Add to `docs/open.md`, one line each in the file's existing style, under the fitting heading:
  - Correctness: edit forms (`item-form-dialog`, `stop-form-dialog`, the other `useEntityForm` forms) send every field, and `updateItem` / `updateStop` / `updateCost` have no version check, so a stale form overwrites another Traveller's change; fix is to send only fields that differ from the form's initial values.
  - Correctness: creates (`createCost`, `createItem`, `addReminder`, `addChecklistItem`, `addNote`) have no idempotency key; a retry after a lost reply duplicates.
  - Correctness: `createItem` writes the Item and its inline Cost in separate transactions (`server/actions/items.ts` ~200, ~243).
  - Correctness: every Cost edit re-snapshots `rateToHome` even when the currency is unchanged (`server/actions/costs.ts` ~228).
  - Correctness: `delete-stop-dialog`, `day-ideas-rows`, `schedule-item-dialog`, `make-it-fit` do not catch a rejected action; `applyTrim` runs `setStopNights` per Stop with no transaction.
  - Offline: the service worker deletes static stores older than the previous build without copying cross-store hits forward (`public/sw.js` ~276, ~379), so a deploy can remove chunks saved pages still need.
  - Offline: large files are streamed through the function for the offline save with no `maxDuration` (`lib/attachment-serve.ts` ~93).
  - Auth and access: a Sign-in link opens in Safari, not the installed app, and there is no code entry; a lookup failure at the door reads as "sent" or "no spot" (`lib/auth/sign-in-door.ts` ~79).
  - Ops: Booking import billing errors (non-401/403 4xx) show the generic message with no Admin push; each confirmed Proposal re-uploads the original file; closing the sheet mid-read drops the Proposals.
  - Ops: the restore runbook has no whole-database procedure; R2 files have no backup; cron partial failures return 200.
  - On the trip: if a Trip's start date is the first Stop's arrive date and the outbound flight leaves the day before, departure day is not a Trip day (`lib/trip-phase.ts` ~31); the calendar feed reads a timed Item with no Stop as UTC (`lib/ics.ts` ~180).
- [ ] **Step 2:** Read `lib/release-notes.ts` and add one entry in its existing shape and voice, dated 2026-11-25, covering what a Traveller would notice: pages refresh when the app is reopened; a slow tap falls back to the saved copy; tickets and today are saved for offline first and edits are re-saved; "12,50" is read as twelve fifty; Sign-in links last a day. Plain words, no em-dash.
- [ ] **Step 3:** Task-done checks on changed files. Commit `docs: what the pre-trip review left open, and the release note`.

### Final: branch verification (orchestrator)

- [ ] `npm test`, `npm run build`, and `npm run test:integration` if the local DB is up.
