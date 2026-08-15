# Things to fix

An audited backlog of real defects and gaps in TEEPEE, written to be handed to an
agent one item at a time. Compiled 2026-08-14 from: a full verification run (all
green — see baseline below), a code audit of the high-risk areas (timezone handling,
money, fork scoping, auth guards, revalidation), and the reviewed-but-deferred
findings in `docs/follow-ups/2026-08-12-cost-paid-remodel.md` (each re-verified
against current `main` before inclusion — nothing here is stale).

## Baseline at time of audit

| Check | Result |
|---|---|
| `npx vitest run` | **2677 passed** (236 files), 0 failed |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |

So nothing below is a build/test failure. These are logic, UX, and operational
defects the suite doesn't catch — mostly because unit tests mock `@/lib/db` and run
in a fixed timezone.

**Verification status (2026-08-14).** Every item carries one of:

- **Verified: executable repro** — proven by running the app's real modules in a
  scratch test under pinned timezones (`TZ=Australia/Sydney` and `TZ=UTC`). The
  exact repro snippets are in the appendix; a fix must flip its snippet's
  assertions.
- **Verified: code read** — confirmed by direct reading of the cited lines on
  current `main`; unambiguous from the source (e.g. a hardcoded `forkId: null`).

Decisions the owner has signed off (2026-08-14): the **P0-2 "today" semantics
split**, the **P1-3 "Firm up" UI rename**, and the **P1-2 fork-aware Budget**
approach. Items marked *decision approved* need no further confirmation — build
as prescribed.

## How to work on an item (read this first, agent)

1. **Read `CONTEXT.md` before touching anything.** It is the vocabulary contract.
   Never introduce a term its *Avoid* lists forbid.
2. **Branch per fix** (`fix/<slug>`), never commit to `main`, never deploy. Merging
   is the owner's call.
3. **Every fix lands with a test that fails before and passes after.** The suite
   mocks `@/lib/db` (no real DB); logic-level tests are the norm. Timezone-sensitive
   tests must pin `TZ` (see FIX-1/FIX-2 verify steps) — the bug class here is
   exactly "passes in the dev machine's timezone."
4. **This sandbox has no Postgres.** Anything marked *manual verify (needs DB)*
   means: state in your report that it needs a manual pass with `docker compose up`
   + `npm run db:seed:demo`, and describe the exact steps. Do not claim it verified.
5. Re-run the full baseline (`vitest`, `tsc`, `lint`) before reporting done.
6. Some current behaviour is **deliberate**. The last section lists traps — things
   that look like bugs and must not be "fixed."

Severity: **P0** = wrong data/behaviour for real users in production ·
**P1** = a promised capability is missing or a workflow silently misleads ·
**P2** = quality defects worth fixing soon · **P3** = polish / doc drift.

---

## P0-1 · Transport times are stored in the *server's* timezone, shown in the *Stop's*, edited in the *device's*

**Severity:** P0 — every Transport time entered in production is displayed shifted.
**Area:** plan editor / transport. **Effort:** M.
**Verified: executable repro** (appendix A1). Measured: under `TZ=Australia/Sydney`
the typed string `"2026-07-01T08:00"` is stored as `2026-06-30T22:00:00Z`; under
`TZ=UTC` as `2026-07-01T08:00:00Z`. Displaying the UTC-parsed instant for a
`Europe/Paris` stop renders **10:00**, and the Sydney-parsed one renders
**00:00** — the user typed **08:00** in both cases.

**Symptom.** In production (Vercel servers run UTC), a Traveller types a departure
of `08:00` for a Paris → Rome train. The transport card then shows `10:00 CEST`.
Re-opening the edit dialog on a Sydney device shows `18:00`. Three different
wall-clocks for one field. Invisible in local dev because server tz = device tz =
(usually) the tz you're planning in — the classic works-on-my-machine timezone bug.

**Root cause.** Three links in the chain disagree about what the typed string means:

- **Write** — `components/trip/transport-form-dialog.tsx:408-409` submits the raw
  `datetime-local` string (e.g. `"2026-07-01T08:00"`) to the server action. The zod
  preprocess at `lib/validations/transport.ts:12-19` does `new Date(val)` — an
  offset-less string is parsed in the **server's** timezone.
- **Read** — `lib/time-display.ts:28-50` (`transportTimeDisplay`) renders the stored
  instant in the **from/to Stop's IANA timezone** (`instantToZonedTime`). This is
  the intended semantic: the typed time is the Stop's wall clock.
- **Edit** — `toDatetimeLocal` (`components/trip/transport-form-dialog.tsx:244-252`)
  re-renders the instant with **device-local** getters.

The correct machinery already exists and is used elsewhere:
`zonedWallTimeToInstant` in `lib/tz.ts:307` (Items/ICS already go through it —
`lib/ics.ts:145-147`). Transport is the one entity that skips it.

**Fix.**

1. Make the write path interpret each endpoint's wall time **in that endpoint's
   Stop timezone**: in `createTransport`/`updateTransport`
   (`server/actions/transport.ts`), after resolving `fromStopId`/`toStopId`, convert
   the raw `YYYY-MM-DDTHH:mm` string via
   `zonedWallTimeToInstant(dateISO, hhmm, stopTz)`. Timezone resolution order:
   linked Stop's `timezone` → the other endpoint's Stop timezone → UTC (Home-base
   endpoints have no tz of their own — document the fallback in a comment).
   Keep accepting `Date` instances for programmatic callers.
2. Make the edit dialog render initial values in the **same** timezone the card
   displays: replace `toDatetimeLocal`'s local getters with composition of
   `instantToZonedDateISO` + `instantToZonedTime` (both in `lib/tz.ts`) using the
   from/to Stop tz, so what you saved is what you reopen.
3. The client-side sanity check `depAt >= arrAt` at
   `components/trip/transport-form-dialog.tsx:538` compares wall-clock strings —
   wrong for cross-zone legs (a Sydney → LA flight legitimately "lands before it
   takes off"). Either compare the resolved instants server-side or demote the
   client check to a soft hint. The Summary's "times don't line up" Flag already
   covers the real validation.
4. **Do not migrate existing rows.** Stored instants were entered under the old
   interpretation; there is no way to recover intent. Note it in the PR
   description; owners can re-touch times that matter.

**Verify.**
- New unit tests in `server/actions/transport.test.ts` and a tz round-trip test:
  create a transport for a stop with `timezone: "Europe/Paris"` passing
  `"2026-07-01T08:00"`, assert the stored instant is `2026-07-01T06:00:00Z` —
  and run the suite with the process pinned to a *non*-UTC zone
  (`TZ=Australia/Sydney npx vitest run <files>`) as well as
  `TZ=UTC` to prove server-tz independence.
- Assert `transportTimeDisplay` on that instant returns `08:00` / zone `CEST`.
- Test the edit-dialog formatting helper: instant → `"2026-07-01T08:00"` given the
  Paris tz, regardless of `TZ`.
- Manual verify (needs DB): create a transport, confirm card + reopened dialog +
  ICS feed all show the typed time. **This manual verify (needs DB) is still
  owed — run after the next deploy rehearsal.**

**Status: FIXED** (fix/audit-backlog, c46bfb1+321c5f7 server; 29b449c dialog).

---

## P0-2 · "Today" is the UTC calendar day — wrong every morning in the home timezone

**Severity:** P0 — the Travelling Home ("what's happening now") targets the wrong
day until ~10–11 am for AU users. **Area:** dates, app-wide. **Effort:** M–L.
**Verified: executable repro** (appendix A2). Measured: with the clock at
`2026-08-14T22:00:00Z` — which is 8 am on **15 Aug** in Sydney — `todayISO()`
returns `2026-08-14`.

**Symptom.** `todayISO()` (`lib/dates.ts:176`) formats `new Date()` with **UTC**
getters. TEEPEE defaults to en-AU; in UTC+10/11 it returns *yesterday* until
10/11 am local. Every "today" surface lands a day behind all morning: the
Travelling **Home** / Today view (`components/trip/home/phase-travelling.tsx:58`),
Agenda highlight (`components/trip/agenda-view.tsx:15`), day page
(`app/(app)/trips/[tripId]/day/[date]/page.tsx:361`), Phase derivation
(trips list `app/(app)/trips/page.tsx:77`, trip layout
`app/(app)/trips/[tripId]/layout.tsx:73`, so a trip "starts" a morning late),
checklist due-dates (`components/trip/checklist.tsx:115`), Budget day maths
(`app/(app)/trips/[tripId]/budget/page.tsx:229`), and the **Date paid** prefill
(`components/trip/inline-cost-fields.tsx:58`,
`components/trip/other-cost-editor.tsx:263`,
`components/trip/cost-checklist.tsx:141`) — tick a cost paid at 8 am Sydney and
the recorded date is yesterday.

This was flagged in `docs/follow-ups/2026-08-12-cost-paid-remodel.md` as "wants
its own plan" — this entry is that plan.

**Decision (approved 2026-08-14):** "today" is a *viewer-context* question,
answered per surface. There is no single correct timezone for "today" in a travel
app — the traveller's device, the trip's current stop, and the server can all be
on different days at once — so each surface uses the timezone of the question it
answers:

- **Travelling surfaces** (Today view, agenda highlight, day nav): today in the
  **current Stop's timezone** — the stop whose arrive/depart covers now; fall back
  to next-stop tz, then device. `instantToZonedDateISO(new Date(), tz)`
  (`lib/tz.ts`) already computes this.
- **Client-side prefills and highlights** (paid dates, checklist due, agenda):
  today in the **device's** timezone — add `todayLocalISO()` using local getters,
  client-only.
- **Server-rendered Phase** (trips list, trip layout): today in the trip's
  reference timezone (first/current Stop, else UTC as now). A day's fuzz only
  matters at phase boundaries, but Travelling↔Past is exactly where users look.

Keep `parseISODate`/`formatISODate`'s midnight-UTC *storage* convention — that
part is correct and deliberate. Only the "what day is it now" call sites change.

**Fix.** Add the two helpers to `lib/dates.ts` / `lib/tz.ts`, then sweep the
`todayISO()` call sites above to the right helper. Leave server-only aggregation
(e.g. reminders cron) on UTC unless the owner says otherwise.

**Verify.** Unit tests with `vi.setSystemTime(new Date("2026-08-14T22:00:00Z"))`:
assert Sydney-context helpers return `2026-08-15` while UTC returns `2026-08-14`;
component tests for agenda highlight and paid-date prefill under that clock.
Manual verify (needs DB): set system tz to `Australia/Sydney`, morning hours, and
confirm the Travelling Home shows the correct day.

**Status: FIXED** (fix/audit-backlog, 0b7ba83 helpers; 761ef3c+3d494a0 server sweep; 7e4ec41 client sweep).

---

## P0-3 · The cost/paid column-rename migration has never run, and the deploy pipeline guarantees a downtime window

**Severity:** P0 — operational, blocks the next deploy. **Area:** deployment.
**Effort:** S (procedure), not code.

**Verified: code read** (`vercel.json:4` + the migration SQL; nothing here is
executable without a database — that is the finding).

`prisma/migrations/20260812000000_cost_and_paid_amounts` renames columns and has
**never executed** anywhere (no Postgres in the dev sandbox; verified only by
reading against the `0_init` DDL). `vercel.json:4` runs
`prisma migrate deploy && next build`, so on deploy the old columns disappear
while the previous build is still serving — **every cost read 500s for the length
of the build**, indefinitely if the build fails. Rollback needs a hand-written
reverse migration.

**Fix (procedure, not code — write it into `docs/DEPLOY.md`):**
1. Run the migration against a staging/local Postgres restored from a prod
   snapshot first; record row counts touched by the backfill.
2. Deploy at a quiet moment; watch the build; have the reverse migration written
   *before* deploying.
3. Check afterwards how many legacy paid-with-no-date rows exist (see P2-8).

**Verify.** Migration applied on a snapshot DB without error; app reads costs
correctly; the reverse migration also applies cleanly on a copy.

**Status: DONE as procedure** (fix/audit-backlog, e0606e1 — docs/DEPLOY.md
section 4b). The migration itself still needs the rehearsal run against a
staging/local Postgres restored from a prod snapshot — this sandbox has no
Postgres, so that step remains outstanding.

---

## P1-1 · The active variant silently evaporates on every tab switch

**Severity:** P1 — work lands in the wrong Plan. **Area:** forks / navigation.
**Effort:** M.

**Verified: executable repro** (appendix A3) — every href `primaryNav`/`moreNav`
emits is query-string-free — plus code read of the switcher's param-based state.

**Symptom.** `ForkSwitcher` activates a variant by pushing
`/trips/{id}/plan?plan=<forkId>` (`components/trip/fork-switcher.tsx:265-275`).
But every nav link is a bare path — `primaryNav`/`moreNav` in
`components/trip/trip-nav.tsx:14-34` and the mobile tabs in
`components/trip/mobile-tab-bar.tsx:29-40` — so tapping **any** tab drops
`?plan=` and snaps you back to the real plan with no announcement. Concretely: a
Traveller activates the "+Switzerland" variant, taps **Wishlist** (which *does*
support `?plan=` — `app/(app)/trips/[tripId]/wishlist/page.tsx`), schedules an
idea — and the copy lands in the **real plan**, because `activeForkId` resolved to
`null`. The variant they believe is active isn't.

**Fix.** Make the active plan sticky across the plan-scoped surfaces:
- In `TripNav` and `MobileTabBar`, read `useSearchParams()` and append the current
  `plan` param to the hrefs of surfaces that honour it — **Plan** and **Wishlist**
  today, **Budget** after P1-2.
- **Deliberately do not** propagate it to Calendar, Summary, Home, Day, Today —
  those are the dated views that always follow the real plan (CONTEXT.md's Fork
  entry; this is by design, see the traps section).
- The `VariantBanner` already renders on plan/wishlist when a fork is active; the
  banner appearing/disappearing plus the ForkSwitcher label is the state signal —
  no new UI needed once the param survives navigation.

**Verify.** Component tests: with `?plan=abc`, `TripNav` renders
`/trips/t1/plan?plan=abc` and `/trips/t1/wishlist?plan=abc` but a bare
`/trips/t1/calendar`; same for `MobileTabBar`. Manual verify (needs DB): activate
a variant → tab to Wishlist → banner still shows the variant → schedule an idea →
it lands in the variant, real plan untouched.

**Status: FIXED** (fix/audit-backlog, b312ad5).

---

## P1-2 · The Budget page can't show a Fork's budget at all — contradicting the documented model

**Severity:** P1 — CONTEXT.md promises it ("a Fork … has its own projected end,
Flags and Budget", CONTEXT.md:192). **Area:** budget / forks. **Effort:** M.
**Verified: code read** (the hardcoded `forkId: null` block below is unambiguous).
**Decision approved:** implement `?plan=` support on Budget as prescribed — do
not amend CONTEXT.md instead.

**Symptom.** `app/(app)/trips/[tripId]/budget/page.tsx:85-114` hardcodes
`forkId: null` in every query and never reads the `?plan=` search param. The only
place a Fork's money is visible is the single Budget-total row in Compare. You
cannot see a variant's per-category / per-chapter / per-stop breakdown anywhere,
even though the plan editor happily records costs into that variant.

**Fix.** Mirror the plan page's pattern
(`app/(app)/trips/[tripId]/plan/page.tsx:33-43`): read `searchParams.plan`,
validate the fork, thread `planScope(activeForkId)` through the page's queries,
and render `VariantBanner` when a fork is active. Costs, stops, transports,
chapters, items are all plan-scoped entities; exchange rates and home currency are
trip-wide and need no change. The **paid checklist** (`CostChecklist`) and **Spend
so far** should render for the real plan only — money that actually moved belongs
to the real plan; hide them (with a one-line note in the banner) when a fork is
active rather than showing fork-scoped "spend". Do P1-1 first or in the same
branch so the tab keeps the param.

**Verify.** Page-level test with mocked db: `?plan=<fork>` produces fork-scoped
where-clauses and the banner; no param produces `forkId: null` and shows the
checklist. Manual verify (needs DB): add a cost in a variant → Budget tab (with
variant active) shows it; real plan's Budget doesn't.

**Status: FIXED** (fix/audit-backlog, 5f51406+dec4efb).

---

## P1-4 · Fork entities leaked into the Travelling Home / Today view

**Severity:** P1 — dated "real plan only" views showed variant data as if it were
committed. **Area:** forks / dates. **Effort:** S. **Verified: code read**
(discovered during this build's Task 5 review, re-verified against current code).

**Symptom.** The Travelling **Home** phase query and the **Today** view's
current-Stop timezone lookup (`components/trip/home/phase-travelling.tsx`) were
fork-blind: they selected Stops without excluding `forkId`, so a fork's stops —
which should never surface outside Plan/Wishlist/Budget (CONTEXT.md Fork entry)
— could be picked as "the current stop" and leak fork data (including its
timezone) into a dated, real-plan-only surface.

**Root cause.** The query building "what stop covers now" didn't scope on
`forkId: null`, unlike Calendar/Summary/Day/Today/ICS which deliberately hardcode
it (see the *Deliberate behaviour* table above).

**Fix applied.** Scope the phase-travelling / current-stop lookup to the real
plan (`forkId: null`); `3d494a0` added an interim guard excluding fork stops from
the timezone lookup specifically, ahead of the fuller fix.

**Verify.** Unit test: a fork stop whose date range covers "now" is not selected
as the current stop / does not affect the reported timezone; real-plan stops
still resolve correctly.

**Status: FIXED** (fix/audit-backlog, cf62e41, plus 3d494a0's interim clock guard).

---

## P1-3 · "Firm up" is canonical in the glossary but appears nowhere in the UI

**Severity:** P1 — the drift ADR 0037 was written to prevent. **Area:** copy.
**Effort:** S.

CONTEXT.md defines **Firm up** as *the* name of the rough → scheduled transition;
every visible control says "Set dates" ("Set dates for all stops"
`components/trip/itinerary-manager.tsx:1559`, per-leg "Set dates" at 1610/1685/
1786/1863, "Set dates / firm up →" on the sketching Home). ADR 0037 chose a full
rename over a glossary→UI mapping table precisely because this kind of drift
compounds; the same argument applies to the model's most central verb.

**Fix (decision approved: adopt "Firm up" in the UI).** "Firm up this leg" /
"Firm up all stops" / "Firm up from start date". Sweep `itinerary-manager.tsx`,
`stop-form-dialog`, `phase-sketching.tsx`, `next-steps-card`, and any toasts;
keep "Set dates" only where it's literally a date input. Update `COMPONENTS.md`
copy references.

**Verify.** `grep -rn "Set dates" components app` returns only date-field labels;
component tests updated; CONTEXT.md and UI agree.

**Status: FIXED** (fix/audit-backlog, fd9fb5c).

---

*All P2 and P3 items below are **Verified: code read** at the cited lines on
current `main` (re-checked 2026-08-14, not carried blindly from the follow-ups
doc); P2-3 additionally has an executable repro.*

## P2-1 · `handleFirmUp`'s `try/finally` swallows rejections — a pending nudge marker leaks

**Area:** plan editor. **Effort:** S.
`components/trip/itinerary-manager.tsx:691-753` — `try { … } finally { … }` with
no `catch`. If `firmUpSegment` *rejects* (network error) rather than resolving
`success: false`, the accommodation nudge's pending marker leaks and the
accommodation form can open unprompted later. Same shape at the other transition
sites (lines ~579, 588, 597, 614, 797, 835, 853).

**Fix.** Add `catch` blocks that clear the pending marker and toast the unified
error (ADR 0027 result shape); factor the repeated pattern into a small helper if
it stays readable. **Verify.** Component test: mock the action to reject → no
dialog opens on the next render, an error toast fires, marker state is clean.

**Status: FIXED** (fix/audit-backlog, 2ff3db7+91f390d).

## P2-2 · `markCostPaid` accepts amounts above the DB int cap → unhandled throw

**Area:** costs. **Effort:** S.
`server/actions/costs.ts:290` checks `Number.isInteger(paidMinor) && paidMinor >= 0`
but has no upper bound; `costSchema` caps at `2_147_483_647`
(`lib/validations/cost.ts:47`). An over-cap paid amount reaches Prisma, throws on
the int4 column, and surfaces as a generic toast.

**Fix.** Apply the same `.max(2_147_483_647)` bound (share the constant with
`costSchema`) and return `{ success: false, errors: { paidMinor: ["Amount is too large"] } }`.
**Verify.** Unit test: `markCostPaid(..., 2_147_483_648, ...)` returns the field
error and never calls `db.cost.update`.

**Status: FIXED** (fix/audit-backlog, d595b2e).

## P2-3 · Un-marking a cost paid writes an activity entry with an empty change list

**Area:** activity feed. **Effort:** S. **Verified: executable repro**
(appendix A4) — a paidAt-only change returns `[]` while a costMinor control
change returns one entry.
`describeChanges`'s COST field list (`lib/activity.ts:200-205`) covers
`costMinor`/`paidMinor`/`currency`/`category` but not `paidAt` — so
`markCostUnpaid` (which only changes `paidAt`) records an Activity whose changes
array is empty, and the partner's notification says nothing moved.

**Fix.** Add `{ key: "paidAt", label: "Paid", format: dateFormat-ish }` to the
COST list (format `null` as "not paid"). **Verify.** Unit test on
`describeChanges("COST", { paidAt: [date, null] })` returns one change; feed
renders "Paid: 14 Aug → not paid".

**Status: FIXED** (fix/audit-backlog, cd75a72+a58218c). Note: the landed fix
formats via `dateFormat` on an ISO-sliced string (`v.toISOString().slice(0, 10)`)
rather than the appendix's `dateFormat`-as-written, which was wrong for a
`DateTime` value — `dateFormat` expects a date-only string.

## P2-4 · Marking paid from a Stop dialog leaves the Budget page stale

**Area:** caching. **Effort:** S.
`server/actions/costs.ts:101-102` was fixed to revalidate `/budget`, but the
inline cost fields on the accommodation and item forms save through
`updateAccommodation` / item actions, which revalidate only
`/trips/{id}` (+ wishlist/calendar/plan for items) —
`server/actions/accommodation.ts:143,272,290`, `server/actions/items.ts:55-58`.
Transport is covered because it revalidates with `"layout"`
(`server/actions/transport.ts:202`). Result: tick a cost paid inside an
accommodation dialog, open Budget → checklist and totals are stale.

**Fix.** Either add `revalidatePath(`/trips/${tripId}`, "layout")` (matching
transport) or append the explicit `/budget` path in both files.
**Verify.** Unit test asserting the revalidate calls; manual (needs DB): mark
paid in an accommodation dialog → Budget shows it without a hard refresh.

**Status: FIXED** (fix/audit-backlog, bf3b40b).

## P2-5 · `convertCostToHome` still speaks the pre-ADR-0037 vocabulary in its exported shape

**Area:** budget lib. **Effort:** S–M (mechanical, wide).
`lib/budget.ts:178-197` returns `{ estimatedHome, actualHome }` and `buildBudget`
accumulates `grandEstimated`/`grandActual`/`dayEstimated`/`dayActual`
(`lib/budget.ts:492-493` etc.). ADR 0037 renamed estimated/actual →
cost/paid *everywhere* specifically so exported API shapes wouldn't drift; this is
exported API shape.

**Fix.** Rename to `costHome`/`paidHome`, `grandCost`/`grandPaid`, etc., updating
all consumers (`budget/page.tsx`, `cost-summary`, `budget-hero-row`,
`spend-so-far`, compare). Pure rename, no behaviour change — typecheck is the
safety net. **Verify.** `tsc` clean; `grep -rn "estimatedHome\|actualHome\|grandEstimated\|grandActual" lib app components` → 0 hits; suite green.

**Status: FIXED** (fix/audit-backlog, 0ac6f34).

## P2-6 · The paid-checklist confirm popover shows a currency picker that discards your choice

**Area:** budget UI. **Effort:** S.
`components/trip/cost-checklist.tsx:180-183` renders `MoneyInput` with
`currencies={CURRENCY_CODES}` — a fully interactive dropdown — but the submit path
only ever uses `row.currency`; a changed selection is silently ignored.

**Fix.** Pass `currencies={[row.currency]}` (renders as a static suffix) — the
checklist confirms a payment in the cost's own currency by design.
**Verify.** Component test: the popover's currency control is not interactive /
shows only the row currency.

**Status: FIXED** (fix/audit-backlog, 9a7f04e). Note: implemented as a plain
`Input` plus a static currency span rather than `MoneyInput` with a
single-entry `currencies` list — `MoneyInput` has no read-only mode.

## P2-7 · Checklist "Paid how much?" prefills the cost amount; the five dialogs prefill the preserved paid amount

**Area:** budget UX consistency. **Effort:** S.
`components/trip/cost-checklist.tsx:139` prefills `row.costMinor`; the
inline-cost dialogs offer back `row.paidMinor` when it exists (the preserved
history after un-ticking). Two answers to "how much did I pay?" on adjacent
screens.

**Fix.** One rule everywhere: prefill **`paidMinor` when non-null, else
`costMinor`** (history beats guess). Apply to the checklist; audit the dialogs
already match. **Verify.** Component test: a row with preserved `paidMinor`
prefills it; a never-paid row prefills the cost amount.

**Status: FIXED** (fix/audit-backlog, 9a7f04e).

## P2-8 · Legacy paid-without-date rows silently read as unpaid (production data)

**Area:** data / decision. **Effort:** decision + S.
Making `paidAt` the sole paid signal (`9e65276`) means pre-remodel rows that have
a `paidMinor` but no date drop out of every paid total. Deliberately not
backfilled (inventing payment dates was refused — right call). But nobody knows
**how many** such rows production has, and the remediation path (re-tick in the
Budget checklist, which offers the preserved amount back) is undiscoverable.

**Fix.** (a) After the migration runs (P0-3), count affected rows
(`SELECT count(*) FROM "Cost" WHERE "paidMinor" IS NOT NULL AND "paidAt" IS NULL`).
(b) If >0, add a one-time dismissible notice on the Budget page: "N costs have a
recorded payment but no date — confirm them in the checklist," filtering the
checklist to those rows. **Verify.** Notice renders when mocked rows match the
predicate, links to the checklist, dismisses persistently.

**Status:** (b) notice **FIXED** (fix/audit-backlog, bd03a2f+d361a73). (a) row
count: **Status: NOT DONE — needs prod DB / running app / condition not met**
(see Global Constraints) — the count query can only be run against production
data.

## P2-9 · Un-marking paid from the checklist strands keyboard focus on `<body>`

**Area:** a11y. **Effort:** S.
The row checkbox gets `disabled` while the un-mark action is pending
(`components/trip/cost-checklist.tsx:73,91`); disabling the focused element moves
focus to `<body>`, so a keyboard user ticking down a long list loses their place —
on the screen built for rapid ticking.

**Fix.** Keep the checkbox enabled but inert during the transition (`aria-busy`
on the row + ignore clicks while pending), or restore focus after settle.
**Verify.** Component test: after toggling, `document.activeElement` is still the
checkbox (jsdom supports this); axe-style manual pass.

**Status: FIXED** (fix/audit-backlog, 9a7f04e).

## P2-10 · Server-side `paidMinor` field errors are flattened into a generic toast

**Area:** budget UX. **Effort:** S.
The checklist popover submit maps every failure to
"Couldn't mark that paid." (`components/trip/cost-checklist.tsx:164,169`),
discarding `errors.paidMinor` — unlike `other-cost-editor.tsx`, which surfaces
field errors inline.

**Fix.** Thread `result.errors.paidMinor?.[0]` into the popover's field error
state (it already renders one for local validation). **Verify.** Component test:
action resolves `{ success:false, errors:{ paidMinor:["Amount is too large"] } }`
→ that text appears at the field, no generic toast.

**Status: FIXED** (fix/audit-backlog, 9a7f04e).

---

## P3 · Small / docs

- **P3-1 `docs/HANDOFF.md` says local dev runs SQLite.** The overview table
  ("Database | SQLite (`file:./dev.db`) via better-sqlite3") predates ADR 0005,
  which dropped SQLite for local Postgres; `package.json` no longer ships a
  sqlite adapter and `docker-compose.yml` provides the DB. Update the table (and
  delete the stale `dev.db` at the repo root — it's gitignored, just confusing).
  *Verify:* doc matches README's quickstart; fresh-clone steps work.
  **Status: FIXED** (fix/audit-backlog, 87e5b72).
- **P3-2 `paidAtStringSchema` accepts impossible dates.** `"2026-02-30"` passes
  the shape regex and becomes `Invalid Date` (fails safe into a toast; unreachable
  from a native date input). Tighten with a real calendar-validity check if
  touching that file anyway. *Verify:* unit test rejects `2026-02-30`.
  **Status: FIXED** (fix/audit-backlog, e42ba70).
- **P3-3 Preserved `paidMinor` isn't currency-tagged.** Un-tick a paid cost, then
  change the cost's currency → the historic amount silently re-reads in the new
  currency. Low value; fix opportunistically by clearing preserved `paidMinor`
  on currency change. *Verify:* unit test on the update action.
  **Status: FIXED** (fix/audit-backlog, e42ba70).
- **P3-4 `cost-amounts.tsx` gates labels on `paidTotalMinor > 0`** — a truthiness
  gate in a codebase whose stated rule is "zero is legal." Harmless for
  aggregates today; switch to a null-check if the component ever receives
  per-cost values.
  **Status: NOT DONE — needs prod DB / running app / condition not met**
  (see Global Constraints) — the component only ever receives aggregate values
  today, so the condition that would trigger the bug hasn't occurred.
- **P3-5 The `.verify/` screenshot set predates the current design** (June–July
  captures; the Bold-Modular/D3 pass landed in August). Re-run
  `.verify/shoot.mjs` against a seeded dev DB and re-check
  `docs/mobile-pwa-checklist.md` — its checklist is the acceptance list for any
  UI-affecting fix above. *(needs DB)*
  **Status: NOT DONE — needs prod DB / running app / condition not met**
  (see Global Constraints) — needs a running app with a seeded dev DB, which
  this sandbox does not have.

---

## Deliberate behaviour — do NOT "fix" these

Recorded so an agent doesn't helpfully regress a decision. Sources: CONTEXT.md,
ADRs, and in-code documentation.

| Looks like a bug | Actually |
|---|---|
| `proxy.ts` doesn't guard the `?callbackUrl=` query param, and its matcher only covers `/api/auth/*` | Both gaps are documented as deliberate *in the file*, with the failed alternative recorded ("Do not fix this with a rewrite — it has already been tried"). Leave it. |
| Notes and Attachments aren't fork-scoped | Trip-wide by design (CONTEXT.md: Plan entry lists what's shared across Plans). |
| Calendar, Summary, Day, Today, share, ICS hardcode `forkId: null` | Dated views always follow the real plan (CONTEXT.md Fork entry, ADR 0004/0020). Only Plan, Wishlist — and Budget after P1-2 — honour `?plan=`. |
| Budget has no target/cap and overspend never raises a Flag | By design (CONTEXT.md: Budget, Spend so far — "pure awareness signals are not Flags"). |
| Un-marking paid leaves the paid amount in place | Deliberate history preservation (CONTEXT.md: Paid). P2-7 standardises the prefill; don't null the amount. |
| A cost card shows a paid amount without a green tick | Consequence of the above; consistent with the glossary. |
| Calendar dates parse as midnight **UTC** (`parseISODate`) | Correct storage convention for calendar dates. P0-2 is about *"what day is now"*, not about storage. |
| Firming up refuses to move a Pinned stop and just raises a Flag | The pin contract (CONTEXT.md: Pinned). |
| `markCostPaid`/`markCostUnpaid` re-implement the cost access check inline | Deliberate — they return a result where `requireCostAccess` throws `notFound()`. |
| The dev-login provider exists in `lib/auth.ts` | Env-gated behind `ALLOW_DEV_LOGIN === "true"`; verified off unless explicitly enabled. Not a backdoor. |

## Appendix — executable repros

These snippets were run against current `main` (2026-08-14) with the app's real
modules and **passed** — i.e. they assert the *buggy* behaviour. Recreate the
relevant one as a scratch test before fixing; your fix is done when the
assertion **flips** (then rewrite it as the correct-behaviour test that lands
with the fix). Run tz-sensitive ones under both `TZ=Australia/Sydney` and
`TZ=UTC`:

```bash
TZ=Australia/Sydney npx vitest run test/<scratch>.test.ts
TZ=UTC              npx vitest run test/<scratch>.test.ts
```

### A1 · P0-1 — transport times

```ts
import { transportSchema } from "@/lib/validations/transport";
import { transportTimeDisplay } from "@/lib/time-display";

const parsed = transportSchema.parse({ mode: "TRAIN", depAt: "2026-07-01T08:00" });
// TZ=Australia/Sydney → "2026-06-30T22:00:00.000Z"
// TZ=UTC              → "2026-07-01T08:00:00.000Z"   ← proves server-tz parse

const td = transportTimeDisplay({
  depAt: parsed.depAt!, arrAt: null,
  fromTimezone: "Europe/Paris", toTimezone: null,
});
// User typed 08:00. Card shows:
//   TZ=UTC              → "10:00"  (prod scenario: Vercel)
//   TZ=Australia/Sydney → "00:00"
// After the fix, td.dep.time === "08:00" under BOTH TZ values.
```

### A2 · P0-2 — todayISO

```ts
import { todayISO } from "@/lib/dates";
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-08-14T22:00:00Z")); // = 8am 15 Aug in Sydney
expect(todayISO()).toBe("2026-08-14"); // BUG — Sydney's today is the 15th
// After the fix, the Sydney-context helper returns "2026-08-15" here.
```

### A3 · P1-1 — nav drops ?plan=

```ts
import { primaryNav, moreNav } from "@/components/trip/trip-nav";
for (const item of [...primaryNav("t1"), ...moreNav("t1")])
  expect(item.href).not.toContain("?"); // BUG — passes today
// After the fix, Plan/Wishlist/Budget hrefs carry ?plan=<forkId> when active.
```

### A4 · P2-3 — activity blind to paidAt

```ts
import { describeChanges } from "@/lib/activity";
expect(
  describeChanges("COST", { paidAt: new Date("2026-08-01T00:00:00Z") }, { paidAt: null }),
).toEqual([]); // BUG — un-marking paid describes no change
expect(describeChanges("COST", { costMinor: 1000 }, { costMinor: 2000 }).length).toBe(1); // control
```

## Suggested order

1. **P0-3** (deploy procedure — unblocks everything touching prod data)
2. **P0-1** (transport timezones; biggest correctness payoff, self-contained)
3. **P1-1 + P1-2** together (sticky variant + fork-aware Budget share a branch well)
4. **P0-2** (today-timezone; semantics approved — see the decision block)
5. The P2 block — each is a small, independent branch; P2-5 (rename) last of the
   P2s so it doesn't conflict with the others' diffs.
6. P1-3 (copy sweep) and P3s whenever convenient.
