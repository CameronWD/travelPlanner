# Tidy-up & Hardening Implementation Plan

> **Status:** ✅ Completed and merged to `main` via `b7008be` (commits `c67e4d8`…`d8fe6b8`) on 2026-06-24.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the four tidy-up points surfaced by the post-feature audit — extract the duplicated FX/budget assembly, fix two stale renames, give the desktop "More" nav active-underline parity, clean genuinely-improvable non-null assertions, and add focused tests to the highest-risk interactive components.

**Architecture:** A pure helper extraction in `lib/budget.ts` (keeps the PURE, no-Prisma/React contract) swapped into the four call sites; small targeted edits for the renames/underline/assertions; new co-located `*.test.tsx` files following the existing RTL + `vi.mock` convention.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript, Vitest + jsdom + @testing-library/react + user-event, Tailwind v4.

**Scope guardrails:**
- Keep behaviour identical everywhere except the two intentional copy/URL changes.
- Do **NOT** touch the documented date-narrowing `!` pattern (`s.arriveDate!` / `s.departDate!` / `c.startDate!` etc.) in `summary`, `print`, `phase-planning`, `phase-past`, `phase-travelling`. It is query-guaranteed and consistent across files; changing it piecemeal would be inconsistent and is out of scope.
- Tests are **focused / high-risk only** — not blanket coverage of the 1000-line components.

---

### Task 1: Extract `applyFxRatesToCosts` and swap the 4 call sites

**Files:**
- Modify: `lib/budget.ts` (add the helper near the other exported helpers, after `convertCostToHome`)
- Test: `lib/budget.test.ts` (add a `describe("applyFxRatesToCosts")` block)
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx` (~lines 187–211)
- Modify: `app/(app)/trips/[tripId]/print/page.tsx` (~lines 154–169)
- Modify: `components/trip/home/phase-planning.tsx` (~lines 154–175)
- Modify: `components/trip/home/phase-past.tsx` (~lines 142–165)

**Context:** All four files build an identical bidirectional rate map from `exchangeRates` (`{base, quote, rate}[]`) then map raw cost rows (the `COST_SELECT` shape) to `BudgetCost[]`, filling `rateToHome` from a snapshot or an FX lookup. `buildBudget` and `BudgetCost` already live in `lib/budget.ts`; this prep step belongs there too.

- [x] **Step 1: Write the failing test**

Add to `lib/budget.test.ts`:

```ts
import { applyFxRatesToCosts } from "./budget";

describe("applyFxRatesToCosts", () => {
  const raw = (over: Partial<Parameters<typeof applyFxRatesToCosts>[0]["costs"][number]> = {}) => ({
    id: "c1",
    estimatedMinor: 1000,
    actualMinor: null,
    currency: "EUR",
    rateToHome: null,
    ownerType: "OTHER",
    ownerId: null,
    label: "x",
    category: null,
    ...over,
  });

  it("keeps an existing snapshot rateToHome untouched", () => {
    const [c] = applyFxRatesToCosts({
      costs: [raw({ rateToHome: 1.7 })],
      exchangeRates: [{ base: "EUR", quote: "AUD", rate: 1.6 }],
      homeCurrency: "AUD",
    });
    expect(c.rateToHome).toBe(1.7);
  });

  it("leaves a home-currency cost's rate null (no lookup needed)", () => {
    const [c] = applyFxRatesToCosts({
      costs: [raw({ currency: "AUD" })],
      exchangeRates: [],
      homeCurrency: "AUD",
    });
    expect(c.rateToHome).toBeNull();
  });

  it("fills a missing rate from a direct exchange-rate row", () => {
    const [c] = applyFxRatesToCosts({
      costs: [raw()],
      exchangeRates: [{ base: "EUR", quote: "AUD", rate: 1.6 }],
      homeCurrency: "AUD",
    });
    expect(c.rateToHome).toBe(1.6);
  });

  it("fills a missing rate via the inverse of a reverse row", () => {
    const [c] = applyFxRatesToCosts({
      costs: [raw()],
      exchangeRates: [{ base: "AUD", quote: "EUR", rate: 0.625 }],
      homeCurrency: "AUD",
    });
    expect(c.rateToHome).toBeCloseTo(1 / 0.625);
  });

  it("leaves rate null when no rate is available", () => {
    const [c] = applyFxRatesToCosts({
      costs: [raw()],
      exchangeRates: [],
      homeCurrency: "AUD",
    });
    expect(c.rateToHome).toBeNull();
  });

  it("does not create an inverse entry for a zero rate", () => {
    const [c] = applyFxRatesToCosts({
      costs: [raw({ currency: "AUD", rateToHome: null })],
      exchangeRates: [{ base: "EUR", quote: "AUD", rate: 0 }],
      homeCurrency: "EUR",
    });
    // EUR is home here, AUD cost would look up "AUD:EUR" which must not be Infinity
    expect(c.rateToHome).toBeNull();
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/budget.test.ts -t applyFxRatesToCosts`
Expected: FAIL — `applyFxRatesToCosts is not a function` / no export.

- [x] **Step 3: Add the helper to `lib/budget.ts`**

Insert after `convertCostToHome` (around line 188):

```ts
// ---------------------------------------------------------------------------
// Helper: applyFxRatesToCosts
// ---------------------------------------------------------------------------

export interface ExchangeRateInput {
  base: string;
  quote: string;
  rate: number;
}

/**
 * Raw cost row as selected from the DB (COST_SELECT shape). `ownerType` is a
 * free string here; it is narrowed to BudgetCost's union on the way out.
 */
export interface RawCostInput {
  id: string;
  estimatedMinor: number;
  actualMinor: number | null;
  currency: string;
  rateToHome: number | null;
  ownerType: string;
  ownerId: string | null;
  label: string | null;
  category: string | null;
}

/**
 * Resolve each cost's home-currency rate, producing BudgetCost[] ready for
 * buildBudget. A cost keeps its snapshot rateToHome when present; otherwise, for
 * a foreign-currency cost, the rate is looked up from the trip's exchange-rate
 * table (built bidirectionally — a base:quote row also yields its quote:base
 * inverse, skipping zero rates to avoid division by zero). Home-currency costs
 * and unresolved foreign costs are left with a null rate.
 *
 * PURE — no Prisma, no network. This is the single source of truth for the FX
 * assembly that previously lived (duplicated) in summary/print/phase-planning/
 * phase-past.
 */
export function applyFxRatesToCosts({
  costs,
  exchangeRates,
  homeCurrency,
}: {
  costs: RawCostInput[];
  exchangeRates: ExchangeRateInput[];
  homeCurrency: string;
}): BudgetCost[] {
  const rateMap = new Map<string, number>();
  for (const r of exchangeRates) {
    rateMap.set(`${r.base}:${r.quote}`, r.rate);
    if (r.rate !== 0) rateMap.set(`${r.quote}:${r.base}`, 1 / r.rate);
  }

  const home = homeCurrency.toUpperCase();
  return costs.map((c) => {
    let rateToHome = c.rateToHome ?? null;
    if (rateToHome === null && c.currency.toUpperCase() !== home) {
      rateToHome = rateMap.get(`${c.currency.toUpperCase()}:${home}`) ?? null;
    }
    return { ...c, rateToHome } as BudgetCost;
  });
}
```

- [x] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run lib/budget.test.ts -t applyFxRatesToCosts`
Expected: PASS (6 tests).

- [x] **Step 5: Swap all four call sites onto the helper**

In each file, delete the local `const rateMap = …` loop and the `const costsWithRates: BudgetCost[] = costs.map(…)` block, and replace with:

```ts
const costsWithRates = applyFxRatesToCosts({ costs, exchangeRates, homeCurrency });
```

Add `applyFxRatesToCosts` to the existing `@/lib/budget` import in each file (alongside `buildBudget`, `BudgetCost`, etc.). Leave everything else (date narrowing, `buildBudget` call, `detectFlags`) untouched.

- [x] **Step 6: Typecheck, lint, full test run**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 0 type errors, 0 lint errors/warnings, all tests pass.

- [x] **Step 7: Commit**

```bash
git add lib/budget.ts lib/budget.test.ts "app/(app)/trips/[tripId]/summary/page.tsx" "app/(app)/trips/[tripId]/print/page.tsx" components/trip/home/phase-planning.tsx components/trip/home/phase-past.tsx
git commit -m "refactor(budget): extract applyFxRatesToCosts; drop 4-way FX duplication"
```

---

### Task 2: Repoint the push-notification URL off the deprecated `/today`

**Files:**
- Modify: `app/api/cron/reminders/route.ts:112`
- Test: `lib/reminders.test.ts` and/or `lib/push.test.ts` (only if one asserts the `/today` URL)

**Context:** Line 112 builds the push payload `url` as `/trips/${reminder.tripId}/today`. `/today` now only redirects to Home; point the notification straight at `/trips/${reminder.tripId}` to drop the extra hop.

- [x] **Step 1: Check for a test that asserts the URL**

Run: `grep -rn "/today" lib server app --include=*.ts --include=*.tsx`
Note any test asserting the reminder URL.

- [x] **Step 2: Change the URL**

In `app/api/cron/reminders/route.ts:112`:

```ts
        url: `/trips/${reminder.tripId}`,
```

- [x] **Step 3: Update any asserting test** to expect `/trips/${id}` (no `/today`). If none exists, skip.

- [x] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: green.

- [x] **Step 5: Commit**

```bash
git add app/api/cron/reminders/route.ts
git commit -m "fix(reminders): point push notifications at trip Home, not deprecated /today"
```

---

### Task 3: Relabel the stale "Route Overview" copy in the print page

**Files:**
- Modify: `app/(app)/trips/[tripId]/print/page.tsx:316,319`

**Context:** "Overview" was the old name for the landing tab (now "Home"/"Plan"). The print section is the stops/route list. Rename to `Route` to drop the stale word.

- [x] **Step 1: Edit the comment and heading**

Line 316 comment → `{/* ── Route (stops list) ── */}`
Line 319 heading → `<h2 className="font-display text-2xl font-semibold mb-4">Route</h2>`

- [x] **Step 2: Confirm no other stale "Overview" copy in this file**

Run: `grep -n "Overview" "app/(app)/trips/[tripId]/print/page.tsx"`
Expected: no matches.

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: green.

- [x] **Step 4: Commit**

```bash
git add "app/(app)/trips/[tripId]/print/page.tsx"
git commit -m "docs(print): rename stale 'Route Overview' heading to 'Route'"
```

---

### Task 4: Give the desktop "More" menu active-underline parity

**Files:**
- Modify: `components/trip/nav-more-menu.tsx`

**Context:** Primary tabs (`trip-nav.tsx`) render a coral underline `<span>` (`absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary`) when active. The "More" trigger only changes text colour when a child route is active. Add the same underline for parity.

- [x] **Step 1: Add `relative` to the trigger and the underline span**

In `components/trip/nav-more-menu.tsx`, update the `DropdownMenuTrigger`:

```tsx
      <DropdownMenuTrigger
        className={cn(
          "relative flex shrink-0 items-center gap-1 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          anyActive
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground/80",
        )}
      >
        More
        <ChevronDown className="size-4" aria-hidden="true" />
        {anyActive && (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary"
          />
        )}
      </DropdownMenuTrigger>
```

- [x] **Step 2: Typecheck + lint + build sanity**

Run: `npx tsc --noEmit && npm run lint`
Expected: green.

- [x] **Step 3: Commit**

```bash
git add components/trip/nav-more-menu.tsx
git commit -m "fix(nav): active-underline parity for the desktop More menu"
```

---

### Task 5: Clean the genuinely-improvable non-null assertions

**Files:**
- Modify: `components/trip/timeline.tsx` (lines ~141, 185)
- Modify: `components/trip/route-map.tsx` (lines ~139–190)
- Modify: `components/trip/cost-summary.tsx` (lines ~38–58, 76, 96)
- Modify: `components/trip/home/phase-travelling.tsx` (lines ~217–220)

**Context:** Each `!` below is currently safe but obscures the guard. Replace with proper narrowing. **Behaviour must not change.** (Reminder: do NOT touch the date-narrowing `!` at phase-travelling:154–155 — that is the intentional, query-guaranteed pattern shared with summary/print/phase-planning/phase-past.)

- [x] **Step 1: `timeline.tsx` — narrow `depEntry` for the same-day label**

`sameDay` (line 141) is `depEntry?.arrivesSameDay && depEntry?.arrTimeLabel`, so `depEntry!` at line 185 is safe. Replace the `sameDay` local and its usage with a narrowed object:

```tsx
  const sameDayLabels =
    depEntry && depEntry.arrivesSameDay && depEntry.arrTimeLabel
      ? { dep: depEntry.depTimeLabel, arr: depEntry.arrTimeLabel }
      : null;
```

and render:

```tsx
          {sameDayLabels && (
            <span className="text-[11px] font-mono text-muted-foreground">
              {sameDayLabels.dep} → {sameDayLabels.arr}
            </span>
          )}
```

- [x] **Step 2: `route-map.tsx` — guard `L`/`map` into non-null bindings**

After the Leaflet map is created (`map = L.map(mapRef.current, …)` around line 139), add an early guard so the rest of the effect (markers/polylines) uses narrowed values instead of `L!`/`map!`:

```ts
      if (!L || !map) return;
```

Then remove the `!` from `L!.divIcon`, `L!.marker`, and `.addTo(map!)` (they now narrow from the guard). Verify the unmount cleanup still references the captured `map` correctly. Read the surrounding effect before editing.

- [x] **Step 3: `cost-summary.tsx` — fold the home-equivalent into one narrowed object**

Replace the `showHomeEquiv` / `homeEstimatedStr` / `homeActualStr` block (lines ~38–58) with:

```tsx
  const rate = cost.rateToHome;
  const homeEquiv =
    homeCurrency != null &&
    rate != null &&
    cost.currency.toUpperCase() !== homeCurrency.toUpperCase()
      ? {
          estimated: formatMoney(
            convertMinor(cost.estimatedMinor, cost.currency, homeCurrency, rate),
            homeCurrency,
          ),
          actual:
            cost.actualMinor !== null && cost.actualMinor !== undefined
              ? formatMoney(
                  convertMinor(cost.actualMinor, cost.currency, homeCurrency, rate),
                  homeCurrency,
                )
              : null,
        }
      : null;
```

Then in the JSX, replace `homeEstimatedStr` → `homeEquiv?.estimated` and `homeActualStr` → `homeEquiv?.actual`. No `!` should remain.

- [x] **Step 4: `phase-travelling.tsx` — drop `depAt!` in the sort**

The `.filter` above already guarantees `depAt`, but to avoid `!` use a guarded fallback in the comparator (lines ~217–220):

```ts
      .sort((a, b) => {
        const aAt = a.transport.depAt ? new Date(a.transport.depAt).getTime() : 0;
        const bAt = b.transport.depAt ? new Date(b.transport.depAt).getTime() : 0;
        return aAt - bAt;
      });
```

- [x] **Step 5: Typecheck + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: green. Confirm no new `!` introduced and the four target `!` are gone.

- [x] **Step 6: Commit**

```bash
git add components/trip/timeline.tsx components/trip/route-map.tsx components/trip/cost-summary.tsx components/trip/home/phase-travelling.tsx
git commit -m "refactor: replace guarded non-null assertions with proper narrowing"
```

---

### Task 6: Focused tests for the highest-risk interactive components

**Files:**
- Test (create): `components/trip/cost-editor.test.tsx`
- Test (create): `components/trip/checklist.test.tsx`
- Test (create): `components/trip/stop-form-dialog.test.tsx`

**Context:** These large client components are currently only exercised indirectly. Add **focused** tests for their highest-risk logic only, following the existing convention in `components/trip/vote-control.test.tsx`: `vi.mock("@/server/actions/…")`, `render` from `@testing-library/react`, drive with `@testing-library/user-event`, assert the mocked action is called with the right arguments. **Read each component first** to get exact labels/roles/props; the cases below define WHAT to assert.

Convention reference (`vote-control.test.tsx`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/votes", () => ({ setVote: vi.fn().mockResolvedValue(undefined) }));
import { setVote } from "@/server/actions/votes";

beforeEach(() => vi.clearAllMocks());
```

- [x] **Step 1: `cost-editor.test.tsx` — money parsing → minor units (the "cost math")**

Mock `@/server/actions/costs` (`createCost`, `updateCost`, `deleteCost` as `vi.fn().mockResolvedValue(...)`). Render `CostEditor` (read its props — needs `tripId`, owner identity, `costs`, `homeCurrency`). Assert:
  1. Adding a cost: open the add form, type an estimated amount (e.g. "12.50" in a currency with 2 minor digits), submit → `createCost` called with `estimatedMinor: 1250` and `actualMinor: undefined` (actual left blank).
  2. Typing both estimated and actual parses both to minor units in the `createCost` payload.
  3. (If quick) editing an existing cost prefills the form from `cost.estimatedMinor`.

Run: `npx vitest run components/trip/cost-editor.test.tsx`
Expected: PASS.

- [x] **Step 2: `checklist.test.tsx` — toggling**

Mock the checklist server actions (read `checklist.tsx` for the exact import path & names — toggle/add/delete). Render `Checklist` with a couple of seed items. Assert:
  1. Clicking an unchecked item's checkbox calls the toggle action with that item's id (and the new checked state, if the action takes one).
  2. Adding an item via the input calls the add action with the typed text (and `kind` if required).

Run: `npx vitest run components/trip/checklist.test.tsx`
Expected: PASS.

- [x] **Step 3: `stop-form-dialog.test.tsx` — validation / error state**

Mock the stop server action(s) used by the dialog (read `stop-form-dialog.tsx`). Render the dialog open. Assert:
  1. Submitting with the required name empty does NOT call the server action and surfaces the validation error (the dialog's client-side gate).
  2. Submitting valid input calls the server action with the expected payload shape.
  3. (If the dialog renders server-returned `FormErrors`) a returned field error is displayed.

Run: `npx vitest run components/trip/stop-form-dialog.test.tsx`
Expected: PASS.

- [x] **Step 4: Full suite + lint + typecheck**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: green; new tests included in the count.

- [x] **Step 5: Commit**

```bash
git add components/trip/cost-editor.test.tsx components/trip/checklist.test.tsx components/trip/stop-form-dialog.test.tsx
git commit -m "test(trip): focused coverage for cost-editor math, checklist toggle, stop-form validation"
```

---

## Self-review notes

- **Spec coverage:** Task 1 → FX duplication (point 1). Tasks 2–3 → stale renames (point 2). Task 4 → "More" underline (point 4a). Task 5 → non-null assertions (point 4b). Task 6 → focused tests (point 3, scoped to high-risk per the user's choice).
- **Out of scope (intentional):** the documented date-narrowing `!`; blanket component coverage; any behaviour change beyond the URL/copy.
- **Type consistency:** helper named `applyFxRatesToCosts` everywhere; returns `BudgetCost[]`; imported from `@/lib/budget`.
