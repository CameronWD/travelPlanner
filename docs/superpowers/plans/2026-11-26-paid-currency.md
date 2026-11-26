# Paying in a different currency, and a currency list that fits the trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cost's paid amount can be in the Trip's Home currency while its cost amount stays in its own currency, every amount field offers the trip's currencies first in a list that never outgrows its dialog, and cards show what was actually paid, without any Cost recorded before this work changing a total.

**Architecture:** One nullable column, `Cost.paidCurrency` (null = the Cost's own currency, which is every Cost that exists today). One pure module, `lib/money/paid-currency.ts`, owns the rule: the effective paid currency, how it is stored, which choices the form offers, how it follows a change of the Cost's currency, and what a writer may accept. `convertCostToHome` in `lib/money/budget.ts` stays the single roll-up: a guard clause at its top handles a Cost paid in another currency, and the existing body is the unchanged fall-through for every other Cost. The trip's currency list is built by a pure function, loaded once by the trip layout (Surprise-masked), and handed to `MoneyInput` through a React context, so no host form gains a prop.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching the layout, server components or server actions), React 19, TypeScript, Tailwind 4, Radix Select, Prisma (one additive migration), zod, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-26-paid-currency.md`. ADR 0079 (`docs/adr/0079-a-refund-belongs-to-the-cost-and-totals-count-it-once-received.md`) for the Refund rules this extends.

## Global Constraints

- **No existing Cost changes** (the spec's binding rule). The migration is additive and backfills nothing. Every Cost whose `paidCurrency` is null (or absent from an in-memory shape, or equal to its own currency) must total, show, sort and read through the Claude connection exactly as before, at every reader.
- **The one permitted exception** (coordinator, 2026-11-26, from Cam's report "On the actual card too, it seems that it's using the cost and not the actual you paid value"): a card or row that shows what a thing costs shows the **current number** (CONTEXT.md **Cost**: the paid amount once Paid, in its paid currency, less a received Refund; else the cost amount). This changes, for an existing paid Cost whose paid amount differs from its cost amount, exactly these surfaces and no others: the Accommodation total on the stay panel and stay dialog (`lib/plan/plan-model.ts` `stayCostLabel`), the "… so far" figure on a Plan day header and the amount on a Plan day row (`components/plan/day-section.tsx`). The day row also stops adding mixed currencies as if they were one (it uses the same mixed-currency rule as the stay total). No stored value changes. Every estimate total (Budget's cost totals, "paid against estimate", Spend so far's estimate) keeps using the cost amount.
- One migration only: `20261126180000_cost_paid_currency`, `ALTER TABLE "Cost" ADD COLUMN "paidCurrency" TEXT;`. No other schema change, no new dependency.
- In every in-memory shape (`BudgetCost`, `RawCostInput`, `CostRow`, `ToPayInput`, `OwnedCostRow`, `CostPatchRow`, `RefundBearing`, `RefundTagCost`, the test builder's `CostRow`) the field is **optional**: `paidCurrency?: string | null`. Absent reads as null. This keeps every existing fixture and test compiling untouched.
- Write-time rule (every writer): the stored value is `storedPaidCurrency(next, currency)` (null when absent or equal to the Cost's currency). A non-null value is accepted only when it is the Trip's Home currency, or exactly the value already stored (a Cost left in an old Home currency by a Home change must stay editable). Anything else is refused with `PAID_CURRENCY_MESSAGE`. A paid currency is written only together with a paid amount.
- A Refund is in the paid currency. Its rules (`refundProblem`) compare it with the paid amount, which is in the same currency, so they do not change.
- Copy is exact: "More currencies"; field labels stay "Cost" and "You paid"; the paid currency picker's accessible name is "You paid currency"; the refusal `PAID_CURRENCY_MESSAGE` = "What you paid can only be in the cost’s currency or your trip’s home currency."; a single Cost paid in another currency reads `${formatMoney(costMinor, currency)} · paid ${formatMoney(netPaid, paidCurrency)}` (the spec's "€550 · paid A$905.12"); the activity field label "Paid in". Tests build expected money strings with `formatMoney(...)`, never a hard-coded symbol. No em dashes in user-facing strings.
- Glossary words (CONTEXT.md): **Cost**, **cost amount**, **paid amount**, **Paid**, **Home currency**, **Refund**, **Spend so far**, **Traveller**. "paid currency" is the new term.
- The public shared page (`app/share/[token]/`) selects, passes and renders nothing about a Cost; it gains nothing here.
- A Traveller surprised by a Stop must learn nothing new: the trip's currency list leaves out a hidden Stop's country and the Costs `v.where.cost` hides (`lib/surprise-visibility`).
- Zero comments by default (only a non-obvious WHY); no JSDoc; no defensive checks for impossible cases; nothing beyond the task.
- Never run a migration against anything but the local docker database, with `DATABASE_URL` and `DIRECT_URL` set explicitly to it on localhost. Do not read `.env.production.local` or `.env.vercel-prod`. Do not run `feedback:pull`, `feedback:resolve` or `feedback:accept`.
- Commits are path-scoped: `git add <paths>` then `git commit -m "…" -- <paths>`; confirm with `git show --stat HEAD`. No attribution or co-author lines.
- Verification per task: inner loop `TZ=UTC npx vitest run <test files>`; task done `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never `npm test`, `npm run build` or `npm run test:integration` in a task.

## Review Focus

1. **Every Cost that exists today, everywhere.** A null-paid-currency Cost (paid, unpaid, legacy paid-without-date, expected and received Refund, refunded in full, foreign with and without a rate) gives byte-identical `convertCostToHome`, `buildBudget`, `buildSpendSoFar`, `mergeToPay`, MCP `list_costs` (apart from the added `currency` fields) and form seeding (Tasks 2, 4, 10, 11, 9).
2. **Decimals.** A JPY Cost paid in AUD: every parse and format of the paid amount and of a Refund uses the paid currency's decimals, in the form seed, the payload, the Mark paid confirm, the Refund dialog, the delete dialog and the To pay one-tap (Tasks 9, 10).
3. **Deleting a thing paid in Home.** The Other cost it leaves has cost amount = the paid amount **in the paid currency**, and a Refund answered in the delete dialog is entered and checked in that currency (Tasks 6, 10).
4. **A Home currency change after paying in Home** (EUR cost paid in AUD, Home now GBP): the Cost still shows "€550.00 · paid A$905.12"; with an AUD→GBP rate on the Trip it converts at that rate; without one it is left out of the Home totals, named in the missing-rate line as an AUD cost, offered in the Rates strip, never counted as zero, and its form still saves when only its label changes (Tasks 2, 4, 5).
5. **A Cost read that forgets the column** silently shows a Home-paid Cost as paid in its own currency. After Task 4, `git grep -nE "paidMinor: true" -- lib server app components` lists only selects that also carry `paidCurrency: true`, or ones named in Task 4 as not needing it (Task 4).
6. **The permitted display change** (Global Constraints): on each surface listed there, a paid Cost whose paid amount differs from its cost amount shows the paid amount; an unpaid one shows the cost; one paid in Home shows that amount in Home. Nothing else on the Plan, Day view, Today, Trip home, Wishlist, print or summary changes for an existing Cost (Task 7).

## Lanes

**First, concurrently:** 1 ∥ 2 (no common file). **Then, concurrently:** 3 (after 1); 4, 5, 6, 7 (after 2). **Then, concurrently:** 8 (after 5, and only once the layover work on `server/actions/transport.ts` and `components/trip/transport-form-dialog.tsx` is committed: this plan never touches the form dialog, but Task 8 edits the action); 9 (after 3, 5 and 6); 10 (after 5); 11 (after 5). **Last:** 12.

Files per task are disjoint within each wave. `lib/money/cost-row.ts`, `lib/money/budget.ts`, `lib/money/refund.ts` and `test/builders/index.ts` belong to Task 2 only; later tasks consume them.

---

### Task 1: The trip's currencies, loaded once and offered through a context

**Files:**
- Create: `lib/money/trip-currencies.ts`, `lib/money/trip-currencies.test.ts`, `lib/money/trip-currencies-loader.ts`, `lib/money/trip-currencies-loader.test.ts`, `components/money/trip-currencies-context.tsx`, `components/money/trip-currencies-context.test.tsx`
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (wrap the tree in the provider, beside `DaysHrefProvider`)
- Test: `app/(app)/trips/[tripId]/layout.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // lib/money/trip-currencies.ts (pure)
  export function tripCurrencies(input: {
    homeCurrency: string;
    stopCountryCodes: readonly (string | null)[];   // the Stops' countryCode in route order
    costCurrencies: readonly string[];              // first-use order
  }): string[];   // Home, then currencyForCountry(code) per Stop, then each Cost currency; upper-cased, no repeats, unknown countries skipped
  export const MORE_CURRENCIES = "More currencies";
  export function currencyChoices(trip: readonly string[], current: string, expanded: boolean): string[];
  // not expanded: trip, plus `current` appended when absent
  // expanded: trip first, then every other CURRENCY_CODES entry in its own order, plus `current` if still absent

  // lib/money/trip-currencies-loader.ts (server)
  export async function loadTripCurrencies(tripId: string, homeCurrency: string, v: SurpriseVisibility): Promise<string[]>;

  // components/money/trip-currencies-context.tsx ("use client")
  export function TripCurrenciesProvider(props: { homeCurrency: string; currencies: readonly string[]; children: React.ReactNode }): JSX.Element;
  export function useTripCurrencies(): { homeCurrency: string; currencies: readonly string[] } | null;   // null outside a provider
  ```
  Follow `components/trip/days-href-context.tsx` for the provider's shape.

Rules (spec §1): `loadTripCurrencies` reads the real plan's Stops (`REAL_PLAN`, rough ones included) whose id is not in `v.hiddenStopIds`, selecting `{ id, countryCode, arriveDate, departDate, sortOrder }` and ordering them with `orderPlanStops` (`lib/plan-order.ts`); and the Trip's Costs of every Plan (no plan filter: the real plan and What-if plans alike) with `...v.where.cost`, `distinct: ["currency"]`, `orderBy: { createdAt: "asc" }`, `select: { currency: true }`. A Transport's place end is not a Stop, so a layover adds nothing. The layout starts it from the existing `visibilityPromise` and the shell's `homeCurrency`, in the same `Promise.all` wave. A Cost saved in a new currency joins the list when the layout next renders: every Cost action's `revalidateTrip` refreshes the current route, layout included; a plain client navigation between sections does not re-run the layout, which is acceptable (the field's own currency is always listed anyway).

- [ ] **Step 1: Failing tests:**
  - `tripCurrencies`: `Home first, then each Stop's country in route order, then Cost currencies, without repeats` (Home "AUD", Stops "fr", "de", "th", "fr", Costs "EUR", "JPY" → `["AUD", "EUR", "THB", "JPY"]`); `a country with no currency Teepee offers adds nothing`; `a Stop with no country adds nothing`; `lower-case input is upper-cased`.
  - `currencyChoices`: `the field's own currency is added when the trip does not use it` (`["AUD","EUR"]`, current "GBP" → `["AUD","EUR","GBP"]`); `…not added twice`; `expanded lists the trip's first, then every other currency once` (length equals `CURRENCY_CODES.length`, first two "AUD","EUR").
  - loader (mock `@/lib/db` as the other loader tests do): `a Stop hidden by a Surprise adds no currency` (a hidden Stop in "jp" → no "JPY"); `the Cost read is masked with v.where.cost and spans every Plan` (assert the `where` passed); `a Transport ending at Bangkok adds no THB` (no Transport read at all).
  - context: `useTripCurrencies is null with no provider`; `…returns what the provider was given`.
  - layout test: `the trip layout provides Home and the trip's currencies to the page` (render a client child that prints `useTripCurrencies()`).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(money): the trip's currencies, loaded once and offered through a context`.

---

### Task 2: The paid currency, stored and counted

**Files:**
- Create: `prisma/migrations/20261126180000_cost_paid_currency/migration.sql`, `lib/money/paid-currency.ts`, `lib/money/paid-currency.test.ts`
- Modify: `prisma/schema.prisma` (model `Cost`, after `paidAt`, ~line 927), `lib/money/refund.ts`, `lib/money/budget.ts` (`BudgetCost` ~23, `convertCostToHome` ~208, `RawCostInput` ~243, `applyFxRatesToCosts` ~262, the missing-rate add in `buildBudget` ~571), `lib/money/cost-row.ts`, `test/builders/index.ts` (`CostRow` ~62 and `cost()` ~123: add `paidCurrency: null`)
- Test: `lib/money/budget.test.ts`, `lib/money/refund.test.ts`, `lib/money/cost-row.test.ts` (create if absent)

**Interfaces:**
- Produces:
  ```ts
  // lib/money/paid-currency.ts (pure; imports only lib/money/money.ts and lib/money/currencies.ts)
  export interface PaidCurrencyFields { currency: string; paidCurrency?: string | null }
  export function paidCurrencyOf(c: PaidCurrencyFields): string;              // (paidCurrency ?? currency), upper-cased
  export function paysInOwnCurrency(c: PaidCurrencyFields): boolean;          // paidCurrencyOf(c) === currency upper-cased
  export function storedPaidCurrency(paid: string | null | undefined, currency: string): string | null; // null when absent or equal ignoring case
  export function paidCurrencyChoices(c: PaidCurrencyFields, homeCurrency: string | null): string[];   // [currency, home, the recorded paid currency], upper-cased, no repeats, in that order
  export function followCurrencyChange(paid: string, from: string, to: string, homeCurrency: string | null, hasPaidAmount: boolean): string;
  // `paid` is kept only when a paid amount is recorded AND (`paid` is Home or `paid` is not `from`); otherwise `to`.
  // With no paid amount the paid currency always follows the Cost's, so an unpaid Cost never gains a stored paid currency.
  export function paidCurrencyProblem(next: string | null, c: { currency: string; storedPaidCurrency: string | null }, homeCurrency: string): string | null;
  // null when next is null, equals currency, equals homeCurrency, or equals the stored value; else PAID_CURRENCY_MESSAGE
  export const PAID_CURRENCY_MESSAGE = "What you paid can only be in the cost’s currency or your trip’s home currency.";
  export function toHome(minor: number, from: string, homeCurrency: string, rate: number | null | undefined): number | null; // from === home → minor; a numeric rate → convertMinor; else null

  // lib/money/refund.ts
  // RefundBearing gains `currency?: string; paidCurrency?: string | null`.
  // netCostMinor subtracts a received Refund only when `currency` is absent or paysInOwnCurrency(c); otherwise returns costMinor (the Refund is not in this currency).
  // receivedRefundMinor, netPaidMinor, refundProblem, REFUND_MESSAGES: unchanged.

  // lib/money/budget.ts
  // BudgetCost and RawCostInput gain `paidCurrency?: string | null`; BudgetCost also `paidRateToHome?: number | null` (1 unit of the paid currency = this many Home units; used only when the paid currency is neither the Cost's nor Home).
  export function withPaidRates<T extends PaidCurrencyFields>(costs: readonly T[], exchangeRates: readonly ExchangeRateInput[], homeCurrency: string): (T & { paidRateToHome: number | null })[];
  // paidRateToHome = the Trip's table rate paid:home (inverse rows count, as applyFxRatesToCosts builds them) only when the paid currency is neither own nor Home; else null
  export function missingRateCurrency(cost: BudgetCost, homeCurrency: string): string | null;
  // the Cost's currency when its own rate is missing (as today); else the paid currency when convertCostToHome needed a paid rate it lacked; else null
  // applyFxRatesToCosts: unchanged for the cost rate; its output also carries paidRateToHome (via withPaidRates).

  // lib/money/cost-row.ts
  // CostRow gains `paidCurrency?: string | null`.
  export function shownCost(c: Amounts & { currency: string; paidCurrency?: string | null }): { minor: number; currency: string };
  // paid with a paid amount → { netPaid, paidCurrencyOf(c) }; paid with none (legacy) → { netCost, currency }; unpaid → { costMinor, currency }
  // shownCostMinor(c) stays and equals shownCost(c).minor.
  ```

Rules (spec §2 "Totals", "Refunds", "Changing the Trip's Home currency"): `convertCostToHome` gains one guard clause **at its top** for `!paysInOwnCurrency(cost)`; the existing body below it stays byte-for-byte and is the path every other Cost takes. In the guard, with `P = paidCurrencyOf(cost)` and `refund = receivedRefundMinor(cost)`:
- the cost amount converts as today (`from === home` → as is; a numeric `rateToHome` → `convertMinor`; else both null);
- when `P !== home` and the Cost is paid or has a received Refund, it needs `paidRateToHome`; without it both are null (the Cost joins the missing rates, never counts as zero);
- `costHome = max(0, convertedCost − toHome(refund, P, home, paidRate))`;
- `paidHome = paidAt != null && netPaidMinor(cost) != null ? toHome(netPaidMinor(cost), P, home, paidRate) : null` (a Home paid amount is taken at face value; no rate touches it).
`buildBudget` adds `missingRateCurrency(cost, homeCurrency)` to `missingRateSet` where it adds `cost.currency.toUpperCase()` today.
A Home-paid Cost whose own currency has no rate stays out of every total (cost and paid stay paired), as a foreign Cost with no rate does today.

- [ ] **Step 1: Migration.** Write the SQL above by hand at the exact path and the optional field `paidCurrency String? // ISO 4217 of paidMinor/refundMinor when not the Cost's own (only ever the Trip's Home currency when written; lib/money/paid-currency.ts); null = currency` in the schema's existing comment style. With `DATABASE_URL` / `DIRECT_URL` set to the local docker database on localhost: `npx prisma migrate deploy`, `npx prisma generate`, `npx prisma migrate status` (no drift).
- [ ] **Step 2: Failing tests** in `paid-currency.test.ts`: one test per export, including `storedPaidCurrency("eur", "EUR")` → null; `paidCurrencyChoices({ currency: "EUR" }, "AUD")` → `["EUR","AUD"]`; `…({ currency: "AUD" }, "AUD")` → `["AUD"]`; `…({ currency: "EUR", paidCurrency: "AUD" }, "GBP")` → `["EUR","GBP","AUD"]`; `followCurrencyChange("AUD","EUR","JPY","AUD",true)` → "AUD"; `followCurrencyChange("EUR","EUR","JPY","AUD",true)` → "JPY"; `followCurrencyChange("AUD","AUD","EUR","AUD",true)` → "AUD" (a Cost in Home with a paid amount in Home keeps Home); `followCurrencyChange("AUD","AUD","EUR","AUD",false)` → "EUR" (an unpaid Cost in Home follows); `followCurrencyChange("AUD","EUR","JPY","AUD",false)` → "JPY"; `paidCurrencyProblem("GBP", { currency: "EUR", storedPaidCurrency: null }, "AUD")` → the message; `…("AUD", { currency: "EUR", storedPaidCurrency: "AUD" }, "GBP")` → null.
- [ ] **Step 3: Failing tests** in `budget.test.ts`:
  - `a Cost with no paid currency converts exactly as before`: copy today's `convertCostToHome` body into the test as `legacyConvertCostToHome`; over the cross product of currency {"AUD" (= home), "EUR" with rate 1.65, "EUR" with no rate, "JPY" with rate 0.0102} × paid {unpaid, paid 55000 on a 55000 cost, paid 52000, paid 61000, legacy paidMinor without paidAt} × Refund {none, expected 10000, received 10000, received equal to paid} × paidCurrency {absent, null, the Cost's own currency, its lower-case spelling}: `toEqual(legacyConvertCostToHome(c, "AUD"))`.
  - `a budget of existing Costs is identical with paidCurrency null on every one` (an existing multi-cost fixture of the file: `buildBudget` result deep-equal with and without `paidCurrency: null` added to each Cost).
  - `a EUR cost paid in Home counts the typed amount`: EUR 55000, `rateToHome` 1.65, paid AUD 90512, home AUD → `{ costHome: 90750, paidHome: 90512 }`; `buildSpendSoFar` → `paidSoFarMinor` 90512, `paidCostMinor` 90750, `varianceMinor` −238.
  - `a received Refund in Home comes off both at face value`: the same with a received Refund of 10000 → `{ costHome: 80750, paidHome: 80512 }`.
  - `a Refund larger than the converted cost leaves the cost at zero`.
  - `paid in an old Home currency converts at the Trip's rate for it`: home GBP, EUR cost 55000 `rateToHome` 0.85, paid AUD 90512, `paidRateToHome` 0.5 → `paidHome` 45256.
  - `…with no rate for it, the Cost is left out and AUD is the missing rate` (`costHome` null, `buildBudget(...).missingRates` contains "AUD", not "EUR"); `…unpaid with no Refund, it needs no rate` (counts as an estimate only).
  - `a Home-paid Cost whose own currency has no rate is left out like any Cost with no rate` (missing "EUR").
  - `withPaidRates fills a rate only for a third currency` (and uses an inverse table row).
- [ ] **Step 4: Failing tests:** in `refund.test.ts`, `netCostMinor leaves the cost amount alone when the Refund is in another currency` and `…subtracts as before when no currency is given`. In `cost-row.test.ts`, `shownCost of a Cost paid in Home is the paid amount less a received Refund, in Home`; `…of an unpaid Cost is its cost amount in its currency`; `…of a legacy paid Cost with no amount is the cost amount`; `shownCostMinor equals shownCost().minor`.
- [ ] **Step 5:** run → FAIL. **Step 6:** implement. **Step 7:** task-done verification. `npx tsc --noEmit` should pass with no fixture changed except `test/builders/index.ts` (the only Prisma `Cost` type use found is `Pick<Cost, "id">`); if a test does build a full Prisma `Cost`, add `paidCurrency: null` there and name the file in the report.
- [ ] **Step 8: Commit** `feat(money): a Cost's paid amount can be in the Home currency, counted at face value`.

---

### Task 3: An amount field offers the trip's currencies

**Files:**
- Modify: `components/ui/money-input.tsx`
- Test: `components/ui/money-input.test.tsx`

**Interfaces:**
- Consumes: `useTripCurrencies`, `currencyChoices`, `MORE_CURRENCIES` (Task 1).
- Produces: `MoneyInputProps` gains `currencyLabel?: string` (the picker's accessible name; default "Currency"). Behaviour of `currencies`:
  - **given**: exactly that list, no "More currencies"; a one-entry list renders the code as plain text (the static box `paid-confirm.tsx` draws today: `flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-input bg-muted text-sm text-muted-foreground sm:w-24`), not a picker;
  - **absent, inside a provider**: `currencyChoices(trip, currency, expanded)` plus, while not expanded, a last item "More currencies";
  - **absent, no provider** (the new-trip flow and tests): every currency, as today, with no "More currencies".

Rules (spec §1): "More currencies" is a `SelectItem` with value `"__more__"`; choosing it sets `expanded` and keeps the list open (the Select's `open` is controlled, since Radix closes on select); `onCurrencyChange` and `onValueChange` never receive `"__more__"`. Picking a currency from the expanded list sets it as any pick does. `expanded` resets when the list closes. The currency `SelectContent` gets `className="max-h-[min(18rem,var(--radix-select-content-available-height))]"` (about seven rows; `cn` is tailwind-merge, so it replaces the base `max-h-(…)`), and its viewport scrolls.

- [ ] **Step 1: Failing tests** (wrap in `TripCurrenciesProvider` with Home "AUD", currencies `["AUD","EUR","THB"]`):
  - `the list shows the trip's currencies and More currencies`; `the field's own currency is listed when the trip does not use it` (currency "GBP" → AUD, EUR, THB, GBP).
  - `More currencies swaps to every currency, the trip's first, without changing the value` (`onCurrencyChange` not called; the list is still open; first options AUD, EUR, THB; option count `CURRENCY_CODES.length`).
  - `picking from the full list sets it`.
  - `with no provider every currency is listed and there is no More currencies`.
  - `a given list is used as is`; `a one-entry list is plain text, not a combobox` (no `role="combobox"`, the code is visible).
  - `the list is capped and scrolls` (the content element's class contains `max-h-[min(18rem`).
  - `the picker takes its accessible name from currencyLabel`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(money): an amount field offers the trip's currencies, with More currencies for the rest`.

---

### Task 4: Every Cost read carries the paid currency, and Home totals name a missing paid rate

**Files:**
- Modify (add `paidCurrency: true` to the select): `lib/plan-reads.ts` (`COST_SELECT` ~156), `lib/money/budget-loader.ts` (`COST_SELECT` ~34), `lib/desktop-home-loader.ts` (~62), `lib/past-home-loader.ts` (~37), `lib/travelling-home-loader.ts` (~62), `lib/day-view-loader.ts` (~196), `app/(app)/trips/[tripId]/wishlist/page.tsx` (~179), `server/actions/forks.ts` (both preview selects ~616 and ~621)
- Modify (behaviour): `lib/money/budget-loader.ts` (`RawCostRow`, `buildBudgetFromRows`, `loadBudget`), `app/(app)/trips/[tripId]/budget/page.tsx` (the `spendCosts` mapping ~187, `foreignCurrencies` ~214, `categoriesWithMissingRates` ~269, the `buildBudgetFromRows` call ~170), `lib/money/summary-lines.ts` (`missingRatesLine`), `server/actions/forks.ts` (the PAID_COST loss label ~672)
- Test: `lib/money/budget-loader.test.ts`, `lib/money/summary-lines.test.ts`, `app/(app)/trips/[tripId]/budget/page.test.tsx`, `server/actions/forks.test.ts`, and the existing test beside each loader whose select changed where it asserts the select

**Interfaces:**
- Consumes: `withPaidRates`, `paidCurrencyOf`, `shownCost` (Task 2).
- Produces: `BudgetAssemblyInput.exchangeRates?: readonly ExchangeRateInput[]`, used **only** through `withPaidRates` (the cost rate keeps its "snapshot only, no table fallback" rule on the Budget page and in `get_budget`). `missingRatesLine(costs: { currency: string; paidCurrency?: string | null }[], missing: string[])`: a Cost counts under a missing code when its `currency` or its `paidCurrency` is that code.

Rules: `buildBudgetFromRows` maps `paidCurrency` through and fills `paidRateToHome` from `exchangeRates` (absent → null). The Budget page passes `planRows.exchangeRates`; `loadBudget` reads `db.exchangeRate.findMany({ where: { tripId }, select: { base: true, quote: true, rate: true } })` in its existing wave and passes it. The Budget page's `spendCosts` carries `paidCurrency` and `paidRateToHome` (build it with `withPaidRates`). `lib/travelling-home-loader.ts` (~145) builds Today's Spend so far from raw Costs while already holding `exchangeRates`: pass those Costs through `withPaidRates` too, so Today and the Budget agree. `foreignCurrencies` also takes each non-null `paidCurrency` that is not Home, so the Rates strip offers the rate the missing-rate line asks for; `categoriesWithMissingRates` matches on either currency. The fork loss label is `${label} · ${formatMoney(shownCost(cost).minor, shownCost(cost).currency)}` for a paid Cost (same minor as today for every existing Cost).

Not changed, and why (write one line each in the report): `server/actions/costs.ts` selects (Task 5's), `server/actions/owned-costs.ts` (Task 6's), `server/actions/stops.ts` ~666 (lists unpaid Costs' cost amounts only), `lib/mcp/reads/costs.ts` (Task 11's), `lib/money/cost-patch.ts` `OWNED_COST_SELECT` (Task 5's), `lib/digest-dispatch.ts` (reads unpaid due Costs and nulls the paid fields), `app/(app)/trips/[tripId]/summary/page.tsx` and `print/page.tsx` and `lib/compare.ts` (they take `readPlan`/forks rows through `applyFxRatesToCosts`, which now carries the paid rate), `prisma/demo/persist.ts`, `prisma/real/persist.ts` (they create Costs paid in their own currency; the column defaults to null).

- [ ] **Step 1: Failing tests:**
  - `budget-loader`: `a Cost paid in an old Home currency converts at the Trip's rate for that currency on the Budget`; `…the Cost's own rate still comes only from its snapshot` (a table rate for the Cost's currency is ignored, as today); `loadBudget reads the exchange rates`.
  - `summary-lines`: `a Cost whose paid currency has no rate is counted under that currency` ("1 AUD cost left out of totals until you set a rate."); `an existing Cost is counted as before`.
  - Budget page: `the Rates strip offers a paid currency that has no rate`; `Spend so far counts a Cost paid in Home at the typed amount` (EUR 55000 at 1.65 paid AUD 90512 → the paid figure is 90512 minor, asserted through the same formatter the card uses).
  - forks: `the promotion loss list names a Cost paid in Home in Home`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run `git grep -nE "paidMinor: true" -- lib server app components` and account for every hit in the report (carries `paidCurrency: true`, or listed above with its reason). **Step 5:** task-done verification.
- [ ] **Step 6: Commit** `feat(money): every Cost read carries its paid currency, and a missing paid rate is named`.

---

### Task 5: Writing a standalone Cost's paid currency

**Files:**
- Modify: `lib/validations/cost.ts`, `lib/money/cost-patch.ts`, `server/actions/costs.ts` (`createCost` ~118, `updateCost` ~200 including the P3-3 clear ~268 and `currencyBlocked` ~214, `markCostPaid` ~307, `loadRefundable` is unchanged)
- Test: `lib/validations/cost.test.ts`, `lib/money/cost-patch.test.ts`, `server/actions/costs.test.ts`, `server/actions/trips.test.ts` (one test only; `server/actions/trips.ts` does not change)

**Interfaces:**
- Consumes: `storedPaidCurrency`, `paidCurrencyOf`, `followCurrencyChange`, `paidCurrencyProblem`, `PAID_CURRENCY_MESSAGE` (Task 2).
- Produces:
  ```ts
  // lib/validations/cost.ts
  export const paidCurrencySchema: z.ZodType<string | null | undefined>;  // 3 letters, upper-cased, in CURRENCY_CODES, nullable, optional; used by costSchema and Task 8's three schemas
  // costSchema gains `paidCurrency: paidCurrencySchema`

  // lib/money/cost-patch.ts
  // CostPatchRow and OwnedCostRow gain `paidCurrency?: string | null`; OWNED_COST_SELECT gains `paidCurrency: true`;
  // InlineCostPatch and InlineCost gain `paidCurrency?: string | null`.
  export function mergeCostPatch(current: CostPatchRow, patch: Patch<CostRawInput>, homeCurrency: string): CostRawInput | ActionFailure;
  export function completeInlineCost(patch: InlineCostPatch, owned: readonly OwnedCostRow[], homeCurrency?: string): InlineCost | ActionFailure | null;
  // homeCurrency is optional so Task 5 does not touch the three entity actions (one is being edited by the layover work); absent behaves as today for every Cost paid in its own currency, and Task 8 passes it
  // merged paidCurrency = storedPaidCurrency(patch.paidCurrency !== undefined ? (patch.paidCurrency ?? mergedCurrency) : followCurrencyChange(paidCurrencyOf(current), current.currency, mergedCurrency, homeCurrency, mergedPaidMinor != null), mergedCurrency)
  // where mergedPaidMinor is the paid amount the Cost holds after the merge (the patch's, else the row's, history included)
  // currencyBlocked (both functions): only when the Cost holds a Refund and paidCurrencyOf(before) !== paidCurrencyOf(after)

  // server/actions/costs.ts
  export async function markCostPaid(costId: string, paidMinor: number, paidAt: string, paidCurrency?: string | null): Promise<CostActionResult>;
  // omitted = keep the stored value; null = the Cost's own currency; refused with { paidCurrency: [PAID_CURRENCY_MESSAGE] } by paidCurrencyProblem; a change of paid currency while a Refund exists is REFUND_MESSAGES.currencyBlocked
  ```

Rules (spec §2 "Changing things later"): every write path stores `storedPaidCurrency(...)` and validates with `paidCurrencyProblem(next, { currency, storedPaidCurrency: before?.paidCurrency ?? null }, trip.homeCurrency)` (the Trip is already read for its rate), returning the field error `{ paidCurrency: [PAID_CURRENCY_MESSAGE] }`. `createCost` writes `paidCurrency` only when the input carries a paid amount. In `updateCost`, the P3-3 clear of a history paid amount fires only when the **effective paid currency** changed (`paidCurrencyOf(before) !== paidCurrencyOf(after)`) with no payment in the patch: identical to today for a null-paid-currency Cost, and a Home paid amount survives a change of the Cost's currency. A Cost whose currency becomes Home stores null. Marking unpaid keeps the paid amount and its currency (no change to `markCostUnpaid`). `updateTrip` writes nothing to Costs.

- [ ] **Step 1: Failing tests:**
  - validation: `paidCurrency accepts a supported code, upper-cases it, and accepts null`; `…refuses an unknown code`.
  - cost-patch: `a patch that changes the currency keeps a Home paid currency` (EUR→JPY, paid AUD, Home AUD → "AUD"); `…of a Cost paid in its own currency, the paid currency follows (stored null)`; `a Cost in Home with a paid amount in Home keeps Home when its currency changes` (AUD→EUR, paidMinor 55000, Home AUD → "AUD"); `an unpaid Cost in Home with no paid amount stores null when its currency changes` (AUD→EUR, paidMinor null); `changing the currency to Home stores null`; `a patch naming paidCurrency null means the Cost's own`; `with a Refund, changing the Cost's currency is allowed when it is paid in Home`; `…refused when it is paid in its own currency` (as today); `…changing the paid currency is refused`; and the same three for `completeInlineCost`.
  - costs actions: `createCost stores a Home paid currency`; `…stores null when it equals the Cost's currency`; `…refuses a third currency with the message`; `updateCost keeps a Home paid amount when the currency changes and nothing is paid in the patch` (the P3-3 clear does not fire); `…still clears a history paid amount in the Cost's own currency, as before`; `…accepts an unchanged old-Home paid currency when only the label changes` (Home now GBP, stored "AUD"); `an existing unpaid AUD Cost changed to EUR through updateCost stores no paid currency, and a later markCostPaid with none records the payment in EUR` (Home AUD); `markCostPaid with no paid currency keeps the stored one`; `markCostPaid in Home stores it`; `markCostPaid refuses a third currency`; `markCostUnpaid keeps the paid amount and its currency`.
  - trips: `changing the Home currency leaves every Cost's paid currency and paid amount as they were`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. `updateCost` passes the Trip's Home currency to `mergeCostPatch` (read the Trip before the merge; it is read later today). Do **not** edit `server/actions/transport.ts`, `items.ts` or `accommodation.ts`: their `completeInlineCost` calls keep compiling without the optional argument. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(costs): a Cost's paid currency is written, kept and checked on every Cost action`.

---

### Task 6: Copies and conversions carry the paid currency

**Files:**
- Modify: `lib/fork-plan.ts` (the `costs` data type ~330 and the copy ~415; the header's DROP line), `lib/booking-import/types.ts` (`ProposalCostFields`), `server/actions/owned-costs.ts` (`deleteOwnedCostsTx` select ~77 and the conversion ~89-110)
- Test: `lib/fork-plan.test.ts`, `lib/booking-import/confirm.test.ts`, `server/actions/owned-costs.test.ts`

**Interfaces:**
- Consumes: `paidCurrencyOf`, `paysInOwnCurrency` (Task 2).
- Produces: `ProposalCostFields.paidCurrency?: string | null` (Task 9 seeds the proposal editor from it; `confirm.ts` passes the input through unchanged).

Rules (spec §2 "Copies"): a What-if plan copies no payment (ADR 0079 Consequences), so its Cost data carries `paidCurrency: null` with the other dropped paid fields; promoting a What-if plan moves rows with `updateMany` and needs nothing. A duplicated Trip copies no Costs (ADR 0018), so there is nothing to carry. A booking extraction has one currency, so `lib/booking-import/build.ts` does not set it; only a proposal edited in the form can, and confirm passes it on. When a paid thing is deleted and its Cost becomes an Other cost ("the money that left"), a Cost paid in another currency gets `{ costMinor: paidMinor, currency: paidCurrency, paidCurrency: null, rateToHome: null }`; a Cost paid in its own currency gets exactly today's `{ costMinor: paidMinor }`. A Refund answered for it is already in that currency.

- [ ] **Step 1: Failing tests:**
  - fork-plan: `a What-if plan's Cost carries no paid currency` (source paid in AUD → copy `paidCurrency: null`, `paidMinor: null`).
  - confirm: `a proposal's paid currency reaches the create action` (`paidCurrency: "AUD"` on a EUR proposal is in the input the mocked create action receives).
  - owned-costs: `deleting a thing paid in Home leaves an Other cost of the paid amount in Home` (EUR 55000 paid AUD 90512 → `costMinor` 90512, `currency` "AUD", `paidCurrency` null, `rateToHome` null); `…with a Refund answer, the Refund is kept as given`; `deleting a thing paid in its own currency converts exactly as before`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(costs): copies, imports and a deleted thing's Other cost carry the paid currency`.

---

### Task 7: Cards show the current number, in its currency

**Files:**
- Modify: `lib/plan/plan-model.ts` (`stayCostLabel` ~139), `components/plan/day-section.tsx` (`daySummary` ~89-104, the row's `rowCost` ~224), `lib/details-view.ts` (`costSummary` ~60), `components/trip/cost-summary.tsx`
- Test: `lib/plan/plan-model.test.ts`, `components/plan/day-section.test.tsx`, `lib/details-view.test.ts`, `components/trip/cost-summary.test.tsx`

**Interfaces:**
- Consumes: `shownCost`, `paysInOwnCurrency`, `paidCurrencyOf` (Task 2).
- `stayCostLabel(costs, homeCurrency?)` keeps its signature and its mixed-currency rule (one currency → summed in it; mixed with Home → `sumMinorToHome` into Home, a currency with no rate dropping out; mixed with no Home → each currency joined with " + "), applied to `shownCost(c)` instead of `costNetMinor(c)`.

Audit (the coordinator's list, from `git grep -n "costNetMinor\|shownCostMinor\|costMinor" -- components lib/plan lib/money/cost-labels.ts app`). Prints the **cost amount** for a paid Cost today, and changes here: `lib/plan/plan-model.ts:145,149` `stayCostLabel` (used by `components/plan/stay-panel.tsx:105` and `components/plan/stay-dialog.tsx:85`); `components/plan/day-section.tsx:98` (the day header's "… so far"); `components/plan/day-section.tsx:224` (the row amount, which also sums mixed currencies in `costs[0].currency`: route it through `stayCostLabel(costs, homeCurrency)`). Already prints the current number but in the Cost's currency, and changes here only for a Cost paid in another currency: `lib/details-view.ts:64`, `components/trip/cost-summary.tsx:36`. Prints a cost amount on purpose and stays: `components/trip/stop-deletion-preview.tsx:108` (unpaid Costs only), `app/(app)/trips/[tripId]/page.tsx:494` (the next unpaid payment), `components/money/breakdown-card.tsx:103` and the summary/print totals (estimate totals). Transport, Item and Accommodation cards print a Cost through `CostEditor` → `CostSummary`, and the Wishlist and Day view through the same, so they follow `cost-summary.tsx`. `lib/money/to-pay.ts` is Task 10's; `server/actions/forks.ts:672` is Task 4's. Re-run the grep at the end and account for every hit in the report.

Rules: `details-view` sums `shownCost` per **shown** currency. `CostSummary`, for a Cost paid in another currency, shows `${formatMoney(costMinor, currency)} · paid ${formatMoney(shown.minor, shown.currency)}` with the existing check icon and no "≈" equivalent; for every other Cost it is unchanged (its "≈ Home" line still converts the shown amount at `rateToHome`).

- [ ] **Step 1: Failing tests** for each changed surface:
  - `stayCostLabel`: `a paid Cost shows what was paid, not its cost` (cost 30000 EUR, paid 27500 EUR → `formatMoney(27500, "EUR")`); `an unpaid Cost shows its cost`; `a Cost paid in Home shows that amount in Home` (EUR 55000 paid AUD 90512, Home AUD → `formatMoney(90512, "AUD")`); `two Costs, one paid in Home and one unpaid in EUR, total in Home` (the EUR one at its rate).
  - day-section: the same three for the day header's "so far" and for the row amount; `a row with Costs in two currencies is not summed as one`.
  - details-view: `a Cost paid in Home is summed in Home`.
  - cost-summary: `a Cost paid in Home reads cost · paid` (`${formatMoney(55000,"EUR")} · paid ${formatMoney(90512,"AUD")}`); `a Cost paid in its own currency reads as before`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `fix(plan): a card shows what was paid once a Cost is paid, in the currency it was paid in`.

---

### Task 8: The inline Cost on a Transport, Accommodation or thing to do

**Files:**
- Modify: `lib/validations/transport.ts` (~89-130), `lib/validations/item.ts`, `lib/validations/accommodation.ts` (each schema's inline cost fields), `server/actions/transport.ts` (`InlineCostFields` ~333, `writeInlineCostTx` ~347, the update path ~270), `server/actions/items.ts` (create ~251, update ~385 and ~566-596), `server/actions/accommodation.ts` (create ~129, update ~171 and ~259-290)
- Test: `server/actions/transport.test.ts`, `server/actions/items.test.ts`, `server/actions/accommodation.test.ts`, `lib/validations/item.test.ts`, `lib/validations/accommodation.test.ts`

**Interfaces:**
- Consumes: `paidCurrencySchema` (Task 5), `completeInlineCost(patch, owned, homeCurrency)` and `InlineCost.paidCurrency` (Task 5), `storedPaidCurrency`, `paidCurrencyProblem` (Task 2).

Rules: each update path passes the Trip's Home currency as `completeInlineCost`'s third argument. Each of the three schemas gains `paidCurrency: paidCurrencySchema`. Each create writes `paidCurrency: storedPaidCurrency(data.paidCurrency, data.currency)` only when it writes a paid amount; each update writes it when the completed inline Cost carries it (key omitted otherwise, so an unpaid save keeps it as history, exactly like `paidMinor`). Each validates with `paidCurrencyProblem` against the Trip's Home currency and the stored value, returning `{ paidCurrency: [PAID_CURRENCY_MESSAGE] }`. Start from the branch head after the layover work (`saveTransportWithLayover` also calls `writeInlineCostTx`; it inherits the change).

- [ ] **Step 1: Failing tests**, the same four in each action's test file: `creating it with a Cost paid in Home stores the paid currency`; `…a paid currency equal to the Cost's is stored as null`; `…a third currency is refused with the message`; `editing it with Paid unticked keeps the paid amount and its currency`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(costs): the Cost on a Transport, Accommodation or thing to do can be paid in Home`.

---

### Task 9: "You paid" has its own currency in every Cost form

**Files:**
- Modify: `lib/money/cost-form-state.ts`, `components/money/cost-fields/use-cost-fields.ts`, `components/money/cost-fields/inline-cost-fields.tsx`, `components/trip/cost-editor.tsx` (the hand-wired `InlineCostFields` ~132 and `parseOwnedFormToInput` ~205), `components/trip/other-cost-editor.tsx` (~205-285), `components/money/paid-confirm.tsx`
- Test: `lib/money/cost-form-state.test.ts`, `components/money/cost-fields/inline-cost-fields.test.tsx`, `components/money/cost-fields/use-cost-fields.test.tsx`, `components/trip/cost-editor.test.tsx`, `components/trip/other-cost-editor.test.tsx`, `components/money/paid-confirm.test.tsx`

**Interfaces:**
- Consumes: `useTripCurrencies` (Task 1); `MoneyInput`'s list rules and `currencyLabel` (Task 3); `paidCurrencyOf`, `paidCurrencyChoices`, `followCurrencyChange`, `storedPaidCurrency` (Task 2); `markCostPaid(…, paidCurrency?)` (Task 5); `ProposalCostFields.paidCurrency` (Task 6).
- Produces:
  ```ts
  // lib/money/cost-form-state.ts
  // CostFormState gains `paidCurrency: string` (always concrete; seeded paidCurrencyOf(row), the proposal's, or the Cost's currency)
  // CostPayloadFields gains `paidCurrency?: string | null` (storedPaidCurrency(s.paidCurrency, s.currency) when paid; omitted when unpaid)
  export function setCostCurrency<S extends CostFormState>(s: S, next: string, homeCurrency: string | null): S;   // paidCurrency = followCurrencyChange(s.paidCurrency, s.currency, next, homeCurrency, s.paidAmount.trim() !== "")
  export function setPaidCurrency<S extends CostFormState>(s: S, next: string): S;                                // a change clears paidAmount; the app does not convert
  // setPaid: ticking with a blank paid amount sets paidCurrency to the Cost's currency and pre-fills the cost amount (today's one gesture);
  //   ticking with an amount already there leaves both as they are
  // costToFormState / proposalToFormState format the paid amount, and toCostPayload parses it, in paidCurrency's decimals

  // InlineCostFieldsProps (and CostFieldProps) gain `paidCurrency: string; onPaidCurrencyChange: (v: string) => void`
  // PaidConfirmRow gains `paidCurrency?: string | null`
  ```

Rules (spec §2 form): the Home currency comes from `useTripCurrencies()?.homeCurrency ?? null` inside the components, so no host form gains a prop (`transport-form-dialog.tsx`, `item-form-dialog.tsx`, `accommodation-form-dialog.tsx` spread `fieldProps` and `payload().fields` and stay untouched). "Cost" passes **no** `currencies` prop (that is what turns on Task 3's trip list). "You paid" passes `currencies={paidCurrencyChoices({ currency, paidCurrency }, home)}` and `currencyLabel="You paid currency"`: one entry renders as plain text. Changing the Cost's currency goes through `setCostCurrency`; changing "You paid"'s through `setPaidCurrency`; neither handler touches the other field. Field errors under "You paid" show `errors.paidMinor ?? errors.paidCurrency`. In `other-cost-editor.tsx` a change of paid currency also sets `paidFollowsCost: false`. `use-cost-fields` adds `paidCurrency` to `dirtyValues`. `PaidConfirm` ("Mark partly paid") replaces its static currency box with `MoneyInput` over `paidCurrencyChoices(row, home)`, pre-fills `row.paidMinor ?? row.costMinor` formatted in `paidCurrencyOf(row)` (the cost amount only when no paid amount is recorded, in the Cost's currency), clears on a switch, parses in the chosen currency and calls `markCostPaid(row.id, minor, date, storedPaidCurrency(chosen, row.currency))`.

- [ ] **Step 1: Failing tests:**
  - cost-form-state: `a Cost paid in Home seeds You paid in Home with its decimals` (JPY 12000 paid AUD 15050 → paidCurrency "AUD", paidAmount "150.50"); `the payload parses the paid amount in the paid currency` (AUD "150.50" on a JPY Cost → `paidMinor` 15050, `paidCurrency` "AUD"); `…sends null when paid in the Cost's currency`; `…sends no paid currency when unpaid`; `setPaidCurrency clears the amount`; `setCostCurrency keeps a Home paid currency that has an amount and moves an own one`; `a new Cost switched from Home to EUR, then Paid ticked, offers the cost pre-filled in EUR` (Home AUD, type "550", switch to EUR, tick → paidCurrency "EUR", paidAmount "550"); `ticking Paid with an amount already typed in Home leaves it in Home`; `an existing Cost seeds and pays back exactly as before` (a null-paid-currency row round-trips to the same payload as today).
  - inline-cost-fields (inside a provider, Home "AUD"): `You paid offers the Cost's currency and Home`; `…is plain text when they are the same`; `changing You paid's currency does not change the Cost's, and clears the amount`; `changing the Cost's currency does not change a Home You paid`; `Cost offers the trip's currencies and More currencies`.
  - cost-editor and other-cost-editor: `saving a Cost paid in Home sends paidCurrency` (assert the action's input); `a Cost left in an old Home currency opens with that currency offered and saves unchanged`.
  - paid-confirm: `Mark partly paid in Home sends the amount in Home` (JPY Cost, switch to AUD, type "150.50" → `markCostPaid(id, 15050, date, "AUD")`); `…in the Cost's currency sends null`; `switching currency clears the amount`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(money): You paid has its own currency, the Cost's or Home`.

---

### Task 10: Money lists, Refunds and history show the paid currency

**Files:**
- Modify: `lib/money/to-pay.ts`, `components/money/to-pay-row.tsx`, `components/money/to-pay-panel.tsx` (the one-tap ~57, amounts ~242-245), `components/money/refunds-waiting-card.tsx` (~33-35), `components/money/refund-dialog.tsx` (~30, ~55), `lib/money/refund-tag-text.ts`, `components/money/delete-paid-dialog.tsx` (~24-36, 66-82, 121, 156), `lib/activity.ts` (`moneyFormat` ~224, COST fields ~296-310)
- Test: `lib/money/to-pay.test.ts`, `components/money/to-pay.test.tsx`, `components/money/to-pay-refund.test.tsx`, `components/money/refunds-waiting-card.test.tsx`, `components/money/refund-dialog.test.tsx`, `components/money/refund-tag.test.tsx`, `components/money/delete-paid-dialog.test.tsx`, `lib/activity.test.ts`

**Interfaces:**
- Consumes: `shownCost`, `paidCurrencyOf`, `toHome` (Task 2); `markCostPaid(…, paidCurrency?)` (Task 5).
- Produces:
  ```ts
  // lib/money/to-pay.ts
  // ToPayInput gains `paidCurrency?: string | null`.
  // ToPayRow gains `shownCurrency: string` (the currency of originalMinor), `paidCurrency: string | null` (as stored);
  //   `foreign` = shownCurrency !== Home; `homeMinor` = toHome(originalMinor, shownCurrency, home, shownCurrency === currency ? rateToHome : null);
  //   `refund` gains `currency: string` (the paid currency) and its homeMinor converts from it the same way.
  // RefundTagCost and RefundDialogCost gain `paidCurrency?: string | null`; both format/parse in paidCurrencyOf(cost).
  // PaidCostForDelete's `currency` is the paid currency.
  ```

Rules: the To pay one-tap sends `markCostPaid(row.id, row.paidMinor ?? row.costMinor, today, row.paidMinor != null ? undefined : null)` (a recorded paid amount re-pays in its own stored currency; the cost amount is in the Cost's). Amount columns format `originalMinor` in `shownCurrency`. The Refund tag and the waiting card print the Refund in `refund.currency` when there is no Home figure. The delete dialog formats, parses and checks each Refund in the Cost's paid currency, and its "You’ve paid {total}" sentence only appears when every Cost shares one paid currency. Activity: `moneyFormat` formats `paidMinor` and `refundMinor` in `paidCurrency ?? currency`, and the COST fields gain `{ key: "paidCurrency", label: "Paid in" }` (an empty value shows nothing).

- [ ] **Step 1: Failing tests:**
  - to-pay: `a Cost paid in Home is a Home amount, not converted again` (EUR 55000 at 1.65 paid AUD 90512, Home AUD → `originalMinor` 90512, `shownCurrency` "AUD", `homeMinor` 90512, `foreign` false); `its Refund is in Home`; `every row of an existing Cost is as before` (deep-equal on the existing fixtures apart from the two added fields).
  - to-pay panel: `the one-tap re-pays a recorded Home amount in Home` (`markCostPaid(id, 90512, today, undefined)`); `…an unpaid Cost with no history pays its cost in its own currency` (`…, null`).
  - refund-dialog: `a Refund on a JPY Cost paid in AUD is entered in AUD` (pre-filled "905.12"; typed "100.50" → `recordRefund(id, 10050, …)`).
  - refund-tag / waiting card: `a Refund on a Cost paid in Home reads in Home`.
  - delete-paid-dialog: `a Cost paid in Home asks for the Refund in Home`; `a Refund more than the Home paid amount is refused`.
  - activity: `a paid amount in Home is shown in Home in the history`; `a change of paid currency is listed as Paid in`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(money): To pay, Refunds and history show a paid amount in the currency it was paid in`.

---

### Task 11: The Claude connection

**Files:**
- Modify: `lib/mcp/reads/costs.ts` (select ~76, `McpCost`, the mapping ~124-150), `lib/mcp/tools/bookings-write.ts` (`mark_cost_paid` ~500, `record_refund` ~535), `lib/mcp/refund-fields.ts` (`REFUND_RULES_NOTE`), `lib/mcp/server.ts` (the Refund line ~37)
- Test: `lib/mcp/reads/costs.test.ts`, `lib/mcp/tools/bookings-write.test.ts`, and any test that pins the instructions or tool descriptions

**Interfaces:**
- Consumes: `shownCost`, `paidCurrencyOf` (Task 2); `markCostPaid(…, paidCurrency?)` (Task 5).
- Produces:
  ```ts
  paid: { minor: number; currency: string; formatted: string; on: string } | null;
  refund: { minor: number; currency: string; formatted: string; state: "expected" | "received"; on: string | null } | null;
  net: { minor: number; currency: string; formatted: string };   // shownCost
  // amount and home unchanged. mark_cost_paid's inputSchema gains `paidCurrency: currencySchema.optional()`.
  ```

Copy (exact): `mark_cost_paid`'s `paidCurrency` is described "The currency the money left the account in: the Cost's own currency (the default) or the Trip's Home currency. Nothing else is accepted."; the tool description gains " paidMinor is in paidCurrency.". `REFUND_RULES_NOTE` gains " A Refund is in the currency the Cost was paid in." The server instructions' Refund line gains, after its first sentence: "A Cost's paid amount is in its own currency or the Trip's Home currency (paid.currency), and its Refund is in the same currency." The `net` doc comment says "In the currency it is shown in (net.currency)".

- [ ] **Step 1: Failing tests:** `an existing Cost reads as before, with currency added to paid, refund and net` (each `currency` equals the Cost's; every other field equal to the existing fixture's expectation); `a Cost paid in Home reports paid, refund and net in Home` (EUR 55000 paid AUD 90512 → `paid.currency` "AUD", `paid.formatted` `formatMoney(90512,"AUD")`, `net.minor` 90512, `home.minor` 90750); `mark_cost_paid passes paidCurrency to markCostPaid`; `…without it, passes undefined`; `a third currency is refused with the app's message`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(mcp): a Cost's paid amount and Refund carry their currency, and a payment may be in Home`.

---

### Task 12: Documents

**Files:**
- Create: `docs/adr/0080-a-costs-paid-amount-has-its-own-currency-the-costs-or-home.md`
- Modify: `CONTEXT.md` (**Home currency** ~105, **Cost** ~109, **Paid** ~117, **Refund** ~121), `components/trip/help-guide.tsx` (the Cost / Paid list ~932-950 and the paragraph after it), `lib/help-guide.ts` only if its string list requires

- [ ] **Step 1: ADR 0080**, in 0079's format (`# 0080. …`, `Date: 2026-11-26`, `## Status` Accepted, `## Context`, `## Decision`, `## Alternatives`, `## Consequences`). Context: Cam's report (a cost of €550 paid as A$905.12; the shared picker changed both). Decision: a nullable `paidCurrency` on the Cost, null meaning its own currency; written only as the Cost's currency (stored null) or the Trip's Home currency; a Home paid amount and its Refund count at face value; the cost amount still converts at the Cost's rate; one module owns the rule (`lib/money/paid-currency.ts`) and one function the roll-up (`convertCostToHome`). Alternatives: **any third currency by choice** (rejected: needs a rate per payment, and for a third currency the "real charge" is not what left a Home account anyway); **converting the paid amount for the Traveller** (rejected: the point is the real number from the statement); **a second Cost row for the payment** (rejected, as in 0079: one payment, one row). Consequences: a Home currency change can leave a paid amount in a currency that is neither (shown as recorded, converted at the Trip's rate for it, or left out with the missing-rate line); a Refund's currency is the paid currency, so changing the Cost's currency is no longer blocked by a Refund on a Cost paid in Home; a deleted thing paid in Home leaves an Other cost in Home; a What-if plan still copies no payment.
- [ ] **Step 2: CONTEXT.md.** **Cost**: replace "recorded in its own currency" with "a cost amount in its own currency and, once money has moved, a paid amount in its **paid currency**: its own currency or the **Home currency**, nothing else"; add to the "one current number" paragraph that a Cost paid in another currency shows both, "€550 · paid A$905.12", because the two are in different currencies, and that cards and rows show the current number. **Paid**: one sentence that "You paid" may be in the Home currency, typed as it left the account and never converted by the app. **Home currency**: one sentence that a paid amount may be in it and then counts at face value; changing it leaves such amounts in the old currency. **Refund**: "in the Cost's own currency" becomes "in the paid currency"; "nor change currency" becomes "nor change its paid currency".
- [ ] **Step 3: Help guide.** In the **Paid** item: after "one tap.", add that **You paid** has its own currency, the cost's or your home currency, so a €550 room paid from your card in dollars is entered as the dollars that left your account, and changing it clears the amount rather than converting it. In the paragraph that starts "Enter each amount in the currency you were charged in.", add that the currency list shows the trip's own currencies first and **More currencies** has the rest. Match the surrounding voice and markup.
- [ ] **Step 4:** `TZ=UTC npx vitest run lib/help-guide.test.ts components/trip/help-guide.test.tsx`. **Commit** `docs: a Cost's paid currency (ADR 0080), the glossary and the help guide`.

---

## Once, at the end of the branch

`npm test`, `npm run build` (stop the dev server first), and `npm run test:integration` against the local database (after `npx prisma migrate deploy` there, with `DATABASE_URL` / `DIRECT_URL` pointing at localhost).

This branch has a migration. It goes to `main` first; push `main:beta` only after Cam confirms `main` is live, because beta shares the production database and does not migrate.
