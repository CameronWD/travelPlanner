# Upcoming payments in Home currency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every upcoming payment's amount in the Trip's Home currency, with the Cost's own currency in brackets when it differs.

**Architecture:** `lib/money/upcoming-payments.ts` gains a Home-currency amount on each row and one pure label helper, `paymentAmountLabel`, that every surface calls with its own existing formatter. The two Home loaders feed it FX-resolved costs; the Digest resolves rates the same way (`applyFxRatesToCosts`) and calls the same helper.

**Tech Stack:** Next.js (App Router, RSC), TypeScript, Prisma, Vitest + Testing Library.

**Spec:** `docs/specs/2026-11-13-upcoming-payments-home-currency.md`

## Global Constraints

- Foreign + rate known: `<home amount> (<original amount>)`, e.g. `$212.00 (EUR 120.00)` with `formatMoney`. Each surface keeps its current formatter (`formatMoneyNarrow` on the desktop tile, `formatMoney` on the card and Digest, `formatMoneyCompact` on the planning stat tile).
- Foreign + no rate (`rateToHome` null after `applyFxRatesToCosts`): original amount alone, exactly as today.
- Same currency as Home: exactly as today, no brackets.
- Rate source is only `applyFxRatesToCosts` (snapshot `rateToHome`, else the Trip's ExchangeRate rows) + `convertMinor`. No fetching, no "≈".
- No em-dashes in Traveller-facing strings (`test/copy-style.test.ts`).
- Never run `npm run feedback:*`. Commit trailer must be exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verification per task: `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`.

## Review Focus

- A JPY (0-decimal) cost into AUD Home: home minor units must come from `convertMinor`, not a raw multiply. Pinned in Task 1.
- Currency code case (`eur` vs `EUR`) must not produce brackets for a same-currency cost. Pinned in Task 1.
- Desktop loader currently feeds `buildUpcomingPayments` the raw `costs`, not `costsWithRates`: forgetting the swap silently leaves table-rate costs unconverted. Task 1's Files line names the swap; reviewers check it (no loader unit test exists).
- Travelling Home loader loads no ExchangeRate rows today, so a cost without a snapshot rate would never convert mid-trip. Task 1 adds the read.
- Digest on a MORNING slot must still not query costs or rates (Neon CU-hours, ADR 0047). Pinned in Task 3.

---

### Task 1: Home-currency amount on upcoming payments + loaders

**Files:**
- Modify: `lib/money/upcoming-payments.ts`
- Modify: `lib/desktop-home-loader.ts:330-331` (feed `costsWithRates`, pass `homeCurrency`)
- Modify: `lib/travelling-home-loader.ts:52-73,138-139` (add `db.exchangeRate.findMany({ where: { tripId }, select: { base: true, quote: true, rate: true } })` to the `alongside` Promise.all; run costs through `applyFxRatesToCosts` before `buildUpcomingPayments`)
- Test: `lib/money/upcoming-payments.test.ts`

**Interfaces:**
- Produces:
  - `UpcomingPayment` gains `homeMinor: number | null` and `homeCurrency: string`. (`costMinor`/`currency` keep meaning the Cost's own amount.)
  - `UpcomingPaymentsInput` gains `homeCurrency: string`; each cost gains `rateToHome?: number | null`.
  - `export function paymentAmountLabel(p: { costMinor: number; currency: string; homeMinor: number | null; homeCurrency: string }, format: (amountMinor: number, currency: string) => string): string`
    - same currency (case-insensitive) or `homeMinor === null` → `format(costMinor, currency)`
    - otherwise → `` `${format(homeMinor, homeCurrency)} (${format(costMinor, currency)})` ``
  - `export function upcomingHomeMinor(cost: { costMinor: number; currency: string; rateToHome?: number | null }, homeCurrency: string): number | null`: same currency (case-insensitive) → `costMinor`; `rateToHome` number → `convertMinor(costMinor, currency, homeCurrency, rateToHome)`; else `null`. `buildUpcomingPayments` uses it for `homeMinor`.

- [ ] **Step 1: Write failing tests** in `lib/money/upcoming-payments.test.ts` (add `homeCurrency: "AUD"` to existing calls):
  - `"converts a foreign cost to the Home currency with its rate"`: `cost({ id: "e", currency: "EUR", costMinor: 12000, rateToHome: 1.65, dueDate: "2026-12-03" })` → `homeMinor === 19800`, `homeCurrency === "AUD"`, `costMinor === 12000`, `currency === "EUR"`.
  - `"leaves homeMinor null for a foreign cost with no rate"`: EUR, `rateToHome: null` → `homeMinor === null`.
  - `"converts a zero-decimal currency through minor units"`: JPY `costMinor: 10000`, `rateToHome: 0.011` → `homeMinor === 11000`.
  - `"treats a lower-case same currency as Home"`: `currency: "aud"`, no rate → `homeMinor === 10000`.
  - `describe("paymentAmountLabel")` with `fmt = (m, c) => \`${c} ${m}\``:
    - foreign with home → `"AUD 19800 (EUR 12000)"`
    - foreign, `homeMinor: null` → `"EUR 12000"`
    - same currency (`"aud"` vs `"AUD"`, homeMinor 10000) → `"aud 10000"`

- [ ] **Step 2:** `TZ=UTC npx vitest run lib/money/upcoming-payments.test.ts` → FAIL (missing fields / export).
- [ ] **Step 3:** Implement in `lib/money/upcoming-payments.ts` per Interfaces. Then update both loaders as listed under Files so `npx tsc --noEmit` passes (desktop: `costsWithRates.filter(...)` replaces `costs.filter(...)` for `lineCosts`; travelling: `homeCurrency` is `trip.homeCurrency`, already in scope at line 118).
- [ ] **Step 4:** `TZ=UTC npx vitest run lib/money/upcoming-payments.test.ts` → PASS; then the task-done tier on the three changed files.
- [ ] **Step 5: Commit** `feat(money): upcoming payments carry a Home-currency amount`.

---

### Task 2: Home surfaces show `home (original)`

**Files:**
- Modify: `components/trip/home/desktop/trip-cost-tile.tsx` (`TripCostNextPayment` gains `homeMinor: number | null`; both layouts use `paymentAmountLabel(..., formatMoneyNarrow)` with the tile's `currency` prop as `homeCurrency`)
- Modify: `app/(app)/trips/[tripId]/page.tsx:472-480` (pass `homeMinor: nextPayment.homeMinor`)
- Modify: `components/trip/upcoming-payments-card.tsx:56` (`paymentAmountLabel(payment, formatMoney)`)
- Modify: `components/trip/home/phase-planning.tsx:204` (`paymentAmountLabel(nextPayment, formatMoneyCompact)`)
- Test: `components/trip/home/desktop/trip-cost-tile.test.tsx`, `components/trip/upcoming-payments-card.test.tsx`, `components/trip/home/phase-planning.test.tsx`, `app/(app)/trips/[tripId]/page.test.tsx` (fix fixtures for the new fields)

**Interfaces:**
- Consumes: `paymentAmountLabel`, `UpcomingPayment.homeMinor/homeCurrency` from Task 1.

- [ ] **Step 1: Write failing tests**
  - Tile (AUD tile, next payment `{ amountMinor: 12000, currency: "EUR", homeMinor: 19800, label: "Hotel Kaiser", dueDate: "2026-12-03" }`):
    - `"shows a foreign next payment in Home currency with the original in brackets"` for both `hasCover` true and false: text contains `$198.00 (€120.00)` (match the existing narrow-symbol test's normalisation of non-breaking spaces); due line is still `Due ` + day label, with no `€` in it.
    - `"shows a foreign next payment in its own currency when there is no rate"`: `homeMinor: null` → `€120.00`, and no `(`.
    - Existing same-currency tests pass with `homeMinor` equal to `amountMinor`.
  - Card: `"shows a foreign payment as Home amount with the original in brackets"`: payment `{ costMinor: 12000, currency: "EUR", homeMinor: 19800, homeCurrency: "AUD", ... }` → row text contains `formatMoney(19800, "AUD") + " (" + formatMoney(12000, "EUR") + ")"`.
- [ ] **Step 2:** `TZ=UTC npx vitest run <the two test files>` → FAIL.
- [ ] **Step 3:** Implement per Files. In the cover layout the line is `` `${paymentAmountLabel(...)} · ${label}` ``; keep the existing truncation classes.
- [ ] **Step 4:** Tests pass; task-done tier on the changed files.
- [ ] **Step 5: Commit** `feat(home): upcoming payments in Home currency with the original in brackets`.

---

### Task 3: Digest payment line in Home currency

**Files:**
- Modify: `lib/digest-dispatch.ts` — trip select gains `homeCurrency: true`; `dueCosts` select gains `rateToHome: true`; when `needEveningContent` and there are due costs, read `db.exchangeRate.findMany({ where: { tripId }, select: { base: true, quote: true, rate: true } })`; in `buildPaymentLines` resolve each cost through `applyFxRatesToCosts` (supply `paidMinor: null`, `paidAt: null`, `category: null`), compute `homeMinor` with `upcomingHomeMinor`, and set `amountLabel: paymentAmountLabel({ costMinor, currency, homeMinor, homeCurrency }, formatMoney)`.
- Test: `lib/digest-dispatch.test.ts` (add `exchangeRate: { findMany }` to the db mock backed by `dbData.exchangeRate`; give trip fixtures `homeCurrency: "AUD"`).

**Interfaces:**
- Consumes: `paymentAmountLabel`, `upcomingHomeMinor` (Task 1), `applyFxRatesToCosts` (`lib/money/budget.ts`).

- [ ] **Step 1: Write failing tests** in `lib/digest-dispatch.test.ts`, alongside the existing `"GBP 240.00"` test:
  - `"prices a foreign payment in Home currency with the original in brackets"`: GBP 24000 cost, `dbData.exchangeRate = [{ base: "GBP", quote: "AUD", rate: 1.95 }]` → `amountLabel` (nbsp-normalised) is `"$468.00 (GBP 240.00)"`.
  - `"uses the cost's snapshot rate before the trip's table"`: `rateToHome: 2` on the cost and a table rate of 1.95 → `"$480.00 (GBP 240.00)"`.
  - The existing `"GBP 240.00"` test (no rate anywhere) keeps passing unchanged.
  - `"does not read exchange rates on a MORNING slot"`: exchangeRate `findMany` spy not called.
- [ ] **Step 2:** `TZ=UTC npx vitest run lib/digest-dispatch.test.ts` → FAIL.
- [ ] **Step 3:** Implement per Files.
- [ ] **Step 4:** Tests pass; task-done tier on changed files.
- [ ] **Step 5: Commit** `feat(digest): upcoming payment lines in Home currency`, body ending with:

```
Resolves-Feedback: cmwdagfzt000108l323mrgv7v
```
