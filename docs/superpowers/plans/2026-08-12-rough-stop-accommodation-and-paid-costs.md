# Rough-Stop Accommodation & Paid Costs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Add Accommodation" discoverable on rough Stops, and remodel Cost's two money amounts so a known price needs no fictional estimate and marking something paid always records real money.

**Architecture:** Two independent workstreams. Task 1 is a self-contained UI change in the plan editor that wires up an already-written-but-dead server path. Tasks 2–8 are a sequential chain: a mechanical rename lands first, then the "paid requires an amount" invariant, then the UI that depends on it. Task 1 touches no money code and Tasks 2–8 touch no accommodation code, so Task 1 can land in any order relative to the rest.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Prisma 7 + Postgres, Tailwind v4, Radix primitives, Vitest + Testing Library.

## Global Constraints

- **Never work on `main`.** All work happens on branch `feat/rough-stop-accommodation-and-paid-costs`, which already exists and is checked out.
- **Domain vocabulary is fixed by ADR 0037 and CONTEXT.md** (both already written — read them before starting). The two Cost amounts are the **cost amount** and the **paid amount**. The words "estimated" and "actual" must not appear in new user-facing copy for these fields.
- **On-screen labels:** the cost field is **"Cost"**, the paid field is **"You paid"**. The helper text under Cost is exactly: `Your best number — the real price if it's already booked.`
- **A Cost cannot be marked paid without a paid amount.** This is the invariant the whole chain exists to establish. No code path may write `paidAt` without a paid amount.
- **Test command:** `npm test` (Vitest — 2594 tests across 234 files currently passing; the README's "808" is stale). Run it after every task; it must stay green.
- **Lint command:** `npm run lint`. Must stay clean.
- There is no `typecheck` script — use `npx tsc --noEmit` to typecheck.
- **There is no database in this environment** — no Docker, no reachable Postgres. Never run `prisma migrate dev`/`deploy`; `prisma generate` is fine (schema-only). Every server-action test mocks `lib/db` through a `vi.hoisted` block (pattern: `server/actions/costs.test.ts:9-40`) — write new server-action tests that way, never against a real row.
- **Codebase helpers you will need** (do not invent alternatives): money conversion is `parseAmountToMinor(raw, currency): number | null` and `formatMinor(amountMinor, currency): string` from `@/lib/money` — there is no `toMinor`/`fromMinor`. Toasts are a direct import, `import { toast } from "@/components/ui/use-toast"`, not a hook. Confirms are `const { confirm, dialog } = useConfirm()` from `@/components/ui/confirm-dialog`.
- **Commit after every task.** Do not merge to `main` and do not deploy.

---

### Task 1: Add Accommodation is always visible on rough Stops

Today the button is hidden on any Stop without dates (`itinerary-manager.tsx:1396`), so the feature looks absent rather than blocked. This task shows it always, and on a rough Stop routes the click into a nudge dialog whose primary action calls `handleFirmUp(chapterId)` — a fully-written client handler at `itinerary-manager.tsx:621` that **no JSX currently calls**. The underlying `firmUpSegment` server action is already shipped and tested; only the button is missing.

**Files:**
- Modify: `components/trip/itinerary-manager.tsx:1394-1409` (the gated Add Accommodation block)
- Test: `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `handleFirmUp(chapterId: string | null): Promise<void>` — already defined at `itinerary-manager.tsx:621`. `confirm(opts: ConfirmOptions): Promise<boolean>` from the existing `useConfirm()` hook already destructured in this component.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add to `components/trip/itinerary-manager.test.tsx`. Follow the existing file's setup — it already renders `ItineraryManager` with mocked server actions; reuse that harness and add a rough stop (one with `arriveDate: null, departDate: null`) to the fixture.

```tsx
it("shows Add Accommodation on a rough stop", () => {
  renderManager({ stops: [roughStop({ id: "s1", name: "Rome" })] });
  expect(
    screen.getByRole("button", { name: /add accommodation/i }),
  ).toBeInTheDocument();
});

it("nudges to set dates instead of opening the form on a rough stop", async () => {
  const user = userEvent.setup();
  renderManager({ stops: [roughStop({ id: "s1", name: "Rome" })] });

  await user.click(screen.getByRole("button", { name: /add accommodation/i }));

  expect(screen.getByText(/rome has no dates yet/i)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /set dates for this leg/i }),
  ).toBeInTheDocument();
  // The accommodation form must NOT have opened.
  expect(screen.queryByLabelText(/accommodation name/i)).not.toBeInTheDocument();
});

it("opens the accommodation form directly on a dated stop", async () => {
  const user = userEvent.setup();
  renderManager({
    stops: [datedStop({ id: "s2", name: "Paris", arriveDate: "2026-06-04", departDate: "2026-06-07" })],
  });

  await user.click(screen.getByRole("button", { name: /add accommodation/i }));

  expect(screen.getByLabelText(/accommodation name/i)).toBeInTheDocument();
  expect(screen.queryByText(/has no dates yet/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/trip/itinerary-manager.test.tsx -t "rough stop"`
Expected: FAIL — the button is not rendered for a rough stop, so `getByRole` throws "Unable to find an accessible element".

- [ ] **Step 3: Remove the date gate and route rough clicks to a nudge**

Replace the block at `components/trip/itinerary-manager.tsx:1394-1409`. The current code wraps the button in `{stop.arriveDate && stop.departDate && ( ... )}` — drop that condition entirely and branch inside the click handler instead.

```tsx
{/* Add accommodation — always offered. On a rough stop the click explains
    that accommodation needs dates and offers to date the leg, rather than
    the button being hidden (which read as "the feature isn't there"). */}
<div className="ml-4 pl-4">
  <Button
    variant="ghost"
    size="sm"
    className="h-8 text-xs text-muted-foreground hover:text-foreground"
    onClick={() => handleAddAccommodationClick(stop)}
  >
    <Plus className="size-3.5" aria-hidden="true" />
    Add Accommodation
  </Button>
</div>
```

- [ ] **Step 4: Add the click handler**

Add next to the other handlers in `components/trip/itinerary-manager.tsx` (near `handleFirmUp`, around line 619). `confirm` and `handleFirmUp` are both already in scope.

```tsx
// Accommodation needs a real check-in and check-out, so a rough stop can't
// hold one yet. Rather than hiding the button (ADR-less UI decision recorded
// in the plan: a hidden control reads as a missing feature), explain the
// blocker and offer the fix. Primary action dates just this leg; the trip-wide
// control is named as the fallback for when the leg has no anchor to flow from.
async function handleAddAccommodationClick(stop: StopCardStop) {
  if (stop.arriveDate && stop.departDate) {
    setAddAccommodationStop(stop);
    return;
  }

  const proceed = await confirm({
    title: `${stop.name} has no dates yet`,
    description: (
      <>
        Accommodation needs a check-in and check-out. Set dates for this leg
        first and we&apos;ll take you straight to the form.
        <br />
        <br />
        No start date to work from? Use{" "}
        <strong>Set dates for all stops</strong> at the top of the plan.
      </>
    ),
    confirmLabel: "Set dates for this leg",
    destructive: false,
  });
  if (!proceed) return;

  await handleFirmUp(stop.chapterId ?? null);
}
```

- [ ] **Step 5: Open the form once the leg is dated**

`handleFirmUp` re-fetches via `revalidatePath`, so the freshly-dated stop arrives as a new prop rather than in the local closure. Set a pending marker and open the form when the dated stop reappears. Add the state next to the other `React.useState` declarations, and the effect below the handlers.

```tsx
const [pendingAccommodationStopId, setPendingAccommodationStopId] =
  React.useState<string | null>(null);
```

In `handleAddAccommodationClick`, replace the final line with:

```tsx
  setPendingAccommodationStopId(stop.id);
  await handleFirmUp(stop.chapterId ?? null);
```

Then:

```tsx
// Once the leg has been dated, the stop we were asked to add accommodation to
// comes back with real dates — that's our cue to open the form the user
// originally asked for, so the nudge isn't a dead end.
React.useEffect(() => {
  if (!pendingAccommodationStopId) return;
  const dated = localStops.find(
    (s) => s.id === pendingAccommodationStopId && s.arriveDate && s.departDate,
  );
  if (dated) {
    setAddAccommodationStop(dated);
    setPendingAccommodationStopId(null);
  }
}, [localStops, pendingAccommodationStopId]);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run components/trip/itinerary-manager.test.tsx`
Expected: PASS, including the three new tests and every pre-existing test in the file.

- [ ] **Step 7: Verify nothing else regressed**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(plan): offer Add Accommodation on rough stops with a set-dates nudge"
```

---

### Task 2: Rename the two Cost amounts

Mechanical but wide: 573 occurrences of `estimatedMinor` and 341 of `actualMinor` across 61 files. **Order matters** — `budget-hero-row` already has a `paidMinor` prop meaning the trip-wide total, so it must be renamed *before* the codemod introduces a per-Cost `paidMinor`, or the file ends up with two different `paidMinor` meanings.

**Files:**
- Modify: `components/trip/budget-hero-row.tsx`, `app/(app)/trips/[tripId]/budget/page.tsx` (hero prop, step 1)
- Modify: `prisma/schema.prisma:373-374`
- Create: `prisma/migrations/20260812000000_cost_and_paid_amounts/migration.sql`
- Modify: 61 files across `lib/`, `server/`, `components/`, `app/`, `prisma/`, `test/` (codemod)

**Interfaces:**
- Produces: `Cost.costMinor: number` (mandatory), `Cost.paidMinor: number | null`. `SpendSoFar.costTotalMinor`, `SpendSoFar.costRemainingMinor`, `SpendSoFar.paidCostMinor`, `SpendSoFar.paidSoFarMinor` (unchanged). `BudgetHeroRowProps.paidTotalMinor`. Every later task uses these names.

- [ ] **Step 1: Rename the colliding hero prop first**

In `components/trip/budget-hero-row.tsx`, rename the prop `paidMinor` → `paidTotalMinor` (interface field, destructured param, and all uses in the body). Update its doc comment to `/** Trip-wide total paid so far, in home currency minor units. */`. Update the call site at `app/(app)/trips/[tripId]/budget/page.tsx:296` from `paidMinor={spend.paidSoFarMinor}` to `paidTotalMinor={spend.paidSoFarMinor}`, and any reference in `components/trip/budget-hero-row.test.tsx`.

- [ ] **Step 2: Verify the app still builds before the codemod**

Run: `npx tsc --noEmit && npx vitest run components/trip/budget-hero-row.test.tsx`
Expected: PASS. This confirms the collision is cleared before the wide rename.

- [ ] **Step 3: Run the codemod**

```bash
FILES=$(grep -rl 'estimatedMinor\|actualMinor' \
  --include='*.ts' --include='*.tsx' \
  lib server components app prisma test)

echo "$FILES" | xargs sed -i \
  -e 's/\bestimatedMinor\b/costMinor/g' \
  -e 's/\bactualMinor\b/paidMinor/g'
```

Then the Spend-so-far names, which the codemod does not match (different identifiers) but which must follow the same vocabulary per ADR 0037:

```bash
grep -rl 'estimatedTotalMinor\|estimatedRemainingMinor\|paidEstimateMinor' \
  --include='*.ts' --include='*.tsx' lib server components app test \
  | xargs sed -i \
    -e 's/\bestimatedTotalMinor\b/costTotalMinor/g' \
    -e 's/\bestimatedRemainingMinor\b/costRemainingMinor/g' \
    -e 's/\bpaidEstimateMinor\b/paidCostMinor/g'
```

- [ ] **Step 4: Update the Prisma schema**

In `prisma/schema.prisma`, the `Cost` model lines 373-374 become:

```prisma
  costMinor      Int // minor units, always present
  paidMinor      Int? // minor units — what was actually charged; null until paid
```

- [ ] **Step 5: Write the migration**

Create `prisma/migrations/20260812000000_cost_and_paid_amounts/migration.sql`:

```sql
-- Rename the two Cost amounts to match the domain language (ADR 0037).
-- "estimated" implied a guess, but the field is required and holds the real
-- price for anything already booked.
ALTER TABLE "Cost" RENAME COLUMN "estimatedMinor" TO "costMinor";
ALTER TABLE "Cost" RENAME COLUMN "actualMinor" TO "paidMinor";

-- Backfill: rows marked paid with no amount recorded were displaying as
-- "Paid £0 · £X under estimate". Assume they were paid at their cost amount.
UPDATE "Cost"
SET "paidMinor" = "costMinor"
WHERE "paidAt" IS NOT NULL
  AND "paidMinor" IS NULL;
```

- [ ] **Step 6: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: the client regenerates with the new field names. This reads `schema.prisma` only and needs no database.

**Do not run `npx prisma migrate dev`.** This environment has no Docker and no reachable Postgres, so the migration cannot be applied here — it ships as SQL to be applied wherever the database actually lives. Verify the SQL by inspection instead: column names must match `schema.prisma` exactly (`costMinor`, `paidMinor`), and the backfill must be `WHERE "paidAt" IS NOT NULL AND "paidMinor" IS NULL` so it touches only the broken rows. The test suite never reaches a real database — every server-action test mocks `lib/db` via `vi.hoisted` (see `server/actions/costs.test.ts:9-40`) — so a green suite does **not** prove the migration is correct. Read it twice.

- [ ] **Step 7: Fix the fallout the codemod could not see**

Run: `npx tsc --noEmit`
Expected: initially some errors — comments and string literals the codemod rewrote awkwardly, plus any `Pick<Cost, ...>` or Prisma `select` blocks. Fix each until clean. Also grep for stragglers in prose:

```bash
grep -rn 'estimatedMinor\|actualMinor\|paidEstimateMinor' \
  --include='*.ts' --include='*.tsx' --include='*.prisma' . \
  | grep -v node_modules
```

Expected: no results.

- [ ] **Step 8: Run the full suite**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all 808 tests pass. This is a pure rename — **any behavioural test failure means the codemod broke something**, so investigate rather than editing the test's expectations.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(cost): rename estimated/actual amounts to cost/paid

Per ADR 0037 — the cost amount is required and holds the real price for
anything booked, so 'estimated' was the wrong word. Renames the DB columns,
backfills paid rows that had no amount, and renames budget-hero-row's
trip-wide paidMinor prop to paidTotalMinor to avoid a scope collision."
```

---

### Task 3: A Cost cannot be paid without a paid amount

Establishes the invariant. `lib/spend-so-far.ts:35` currently reads `paidSoFar += paidHome ?? 0` — that line is the bug that lets a £340 paid hotel display as £0 paid and £340 under. Once validation guarantees the amount, the fallback is dead and must go rather than remain as false reassurance.

**Files:**
- Modify: `lib/validations/cost.ts`
- Modify: `lib/spend-so-far.ts:30-37`
- Test: `lib/validations/cost.test.ts` (create if absent), `lib/spend-so-far.test.ts`

**Interfaces:**
- Consumes: `costMinor`, `paidMinor`, `paidAt` from Task 2.
- Produces: `costSchema` rejects `{ paidAt: set, paidMinor: undefined }` with the error message `Enter what you paid` on path `["paidMinor"]`. Tasks 4–7 rely on that exact path and message to surface field errors.

- [ ] **Step 1: Write the failing tests**

In `lib/validations/cost.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { costSchema } from "./cost";

const base = {
  costMinor: 34000,
  currency: "GBP",
  ownerType: "ACCOMMODATION" as const,
  ownerId: "a1",
};

describe("costSchema paid invariant", () => {
  it("rejects a paid date with no paid amount", () => {
    const result = costSchema.safeParse({ ...base, paidAt: "2026-06-04" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("paidMinor"));
      expect(issue?.message).toBe("Enter what you paid");
    }
  });

  it("accepts a paid date with a paid amount", () => {
    const result = costSchema.safeParse({
      ...base,
      paidAt: "2026-06-04",
      paidMinor: 34000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a paid amount with no paid date", () => {
    // Recording what something came to without confirming the payment date
    // stays legal — only the reverse is nonsense.
    const result = costSchema.safeParse({ ...base, paidMinor: 34000 });
    expect(result.success).toBe(true);
  });
});
```

In `lib/spend-so-far.test.ts`:

```ts
it("counts the full paid amount for every paid cost", () => {
  const result = buildSpendSoFar({
    costs: [
      { id: "c1", costMinor: 34000, paidMinor: 34000, currency: "GBP",
        rateToHome: null, paidAt: "2026-06-04" },
    ],
    homeCurrency: "GBP",
    today: "2026-06-10",
  });
  expect(result.paidSoFarMinor).toBe(34000);
  expect(result.varianceMinor).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/validations/cost.test.ts lib/spend-so-far.test.ts`
Expected: the two invariant tests FAIL (schema currently accepts a paid date with no amount).

- [ ] **Step 3: Add the refinement**

In `lib/validations/cost.ts`, append a third `.refine()` after the existing label refinement:

```ts
  // A Cost cannot be paid without a paid amount (ADR 0037). The app never
  // records a payment whose size it doesn't know — that produced the
  // "Paid £0 · £340 under estimate" display this rule exists to prevent.
  .refine((data) => !(data.paidAt && data.paidMinor === undefined), {
    message: "Enter what you paid",
    path: ["paidMinor"],
  });
```

Also update the docblock at the top of the schema: replace the `actualMinor is optional` line with `- \`paidMinor\` is optional, but REQUIRED when \`paidAt\` is set.`

- [ ] **Step 4: Remove the dead fallback**

In `lib/spend-so-far.ts`, replace the whole paid branch with exactly this — the `?? 0` fallback is the bug, and an explicit skip replaces it so a legacy row can never be silently counted as zero:

```ts
    if (c.paidAt != null) {
      if (paidHome === null) {
        // A paid Cost always carries a paid amount (costSchema enforces it), so
        // this is only reachable for a legacy row the backfill missed. Skip it:
        // counting it as zero would understate spending AND inflate the
        // variance, which is exactly the display bug this rule exists to kill.
        continue;
      }
      paidSoFar += paidHome;
      paidCost += costHome;
    }
```

Note `convertCostToHome` returns `paidHome` as `number | null`, so the guard is required for the types as well as the behaviour. Do not reintroduce `?? 0` anywhere in this file.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/validations/cost.test.ts lib/spend-so-far.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all green. Some existing spend-so-far tests may assert the old zero-fallback behaviour — those encode the bug and should be updated to the new expectation.

- [ ] **Step 7: Commit**

```bash
git add lib/validations/cost.ts lib/validations/cost.test.ts lib/spend-so-far.ts lib/spend-so-far.test.ts
git commit -m "feat(cost): require a paid amount whenever a cost is marked paid"
```

---

### Task 4: Paid toggle in the shared inline cost fields

`InlineCostFields` is used by the accommodation, transport and item dialogs, so one change covers all three. Today it hides the paid fields behind a date picker labelled "Date paid" and only reveals them once a cost is typed. It becomes a tick-box that reveals a pre-filled amount plus a date defaulting to today.

**Files:**
- Modify: `components/trip/inline-cost-fields.tsx`
- Modify: `components/trip/accommodation-form-dialog.tsx`, `components/trip/transport-form-dialog.tsx`, `components/trip/item-form-dialog.tsx` (prop wiring)
- Test: `components/trip/inline-cost-fields.test.tsx` (create)

**Interfaces:**
- Consumes: the `costSchema` error path `["paidMinor"]` from Task 3.
- Produces: `InlineCostFieldsProps` gains `paid: boolean`, `onPaidChange: (v: boolean) => void`, and renames `actualAmount`/`onActualChange` → `paidAmount`/`onPaidAmountChange`. Task 5 mirrors this shape in the other-cost editor.

- [ ] **Step 1: Write the failing tests**

Create `components/trip/inline-cost-fields.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineCostFields } from "./inline-cost-fields";

function renderFields(overrides = {}) {
  const props = {
    hasMultipleCosts: false,
    costAmount: "340.00",
    onCostChange: vi.fn(),
    currency: "GBP",
    onCurrencyChange: vi.fn(),
    paid: false,
    onPaidChange: vi.fn(),
    paidAmount: "",
    onPaidAmountChange: vi.fn(),
    paidAt: "",
    onPaidAtChange: vi.fn(),
    errors: {},
    ...overrides,
  };
  render(<InlineCostFields {...props} />);
  return props;
}

describe("InlineCostFields", () => {
  it("labels the cost field 'Cost', not 'Estimated cost'", () => {
    renderFields();
    expect(screen.getByLabelText(/^cost amount$/i)).toBeInTheDocument();
    expect(screen.queryByText(/estimated cost/i)).not.toBeInTheDocument();
  });

  it("hides the paid amount until Paid is ticked", () => {
    renderFields();
    expect(screen.queryByLabelText(/you paid amount/i)).not.toBeInTheDocument();
  });

  it("reveals the paid amount when Paid is ticked", () => {
    renderFields({ paid: true, paidAmount: "340.00" });
    expect(screen.getByLabelText(/you paid amount/i)).toBeInTheDocument();
  });

  it("prefills the paid amount from the cost when Paid is ticked", async () => {
    const user = userEvent.setup();
    const props = renderFields();
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    expect(props.onPaidChange).toHaveBeenCalledWith(true);
    expect(props.onPaidAmountChange).toHaveBeenCalledWith("340.00");
  });

  it("surfaces the missing-amount error on the paid field", () => {
    renderFields({ paid: true, errors: { paidMinor: ["Enter what you paid"] } });
    expect(screen.getByText("Enter what you paid")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/trip/inline-cost-fields.test.tsx`
Expected: FAIL — the component has no `paid` prop and still labels the field "Estimated cost".

- [ ] **Step 3: Rewrite the component**

Replace the body of `components/trip/inline-cost-fields.tsx`:

```tsx
export interface InlineCostFieldsProps {
  /** When true the CostEditor is authoritative — render nothing here. */
  hasMultipleCosts: boolean;
  costAmount: string;
  onCostChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  paid: boolean;
  onPaidChange: (v: boolean) => void;
  paidAmount: string;
  onPaidAmountChange: (v: string) => void;
  paidAt: string;
  onPaidAtChange: (v: string) => void;
  errors: FieldErrors;
  disabled?: boolean;
}

/** Today in YYYY-MM-DD, for defaulting the paid date. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InlineCostFields({
  hasMultipleCosts,
  costAmount,
  onCostChange,
  currency,
  onCurrencyChange,
  paid,
  onPaidChange,
  paidAmount,
  onPaidAmountChange,
  paidAt,
  onPaidAtChange,
  errors,
  disabled,
}: InlineCostFieldsProps): React.ReactElement | null {
  if (hasMultipleCosts) return null;

  // Ticking Paid pre-fills the amount with the cost, so confirming a thing that
  // cost what you expected is one gesture — that pre-fill is what keeps the
  // "paid needs an amount" rule (ADR 0037) from being friction.
  function handlePaidToggle(next: boolean) {
    onPaidChange(next);
    if (next) {
      if (!paidAmount.trim() && costAmount.trim()) onPaidAmountChange(costAmount);
      if (!paidAt.trim()) onPaidAtChange(todayISO());
    }
  }

  return (
    <>
      <Field
        label="Cost"
        description="Your best number — the real price if it's already booked."
        error={errors.costMinor?.[0]}
      >
        <MoneyInput
          amount={costAmount}
          currency={currency}
          currencies={CURRENCY_CODES}
          onAmountChange={onCostChange}
          onCurrencyChange={onCurrencyChange}
          disabled={disabled}
          invalid={Boolean(errors.costMinor)}
          aria-label="Cost amount"
        />
      </Field>

      {costAmount.trim() && (
        <>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={paid}
              onChange={(e) => handlePaidToggle(e.target.checked)}
              disabled={disabled}
              className="size-4 rounded border-input accent-primary"
            />
            Paid
          </label>

          {paid && (
            <>
              <Field label="You paid" error={errors.paidMinor?.[0]}>
                <MoneyInput
                  amount={paidAmount}
                  currency={currency}
                  currencies={CURRENCY_CODES}
                  onAmountChange={onPaidAmountChange}
                  onCurrencyChange={onCurrencyChange}
                  disabled={disabled}
                  invalid={Boolean(errors.paidMinor)}
                  aria-label="You paid amount"
                />
              </Field>

              <Field label="Date paid" error={errors.paidAt?.[0]}>
                <Input
                  type="date"
                  value={paidAt}
                  onChange={(e) => onPaidAtChange(e.target.value)}
                  disabled={disabled}
                />
              </Field>
            </>
          )}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 4: Wire the three dialogs**

In each of `accommodation-form-dialog.tsx`, `transport-form-dialog.tsx` and `item-form-dialog.tsx`:

1. Rename the local state `actualAmount` → `paidAmount` (the Task 2 codemod did not touch local variable names, only the `Minor` identifiers).
2. Add paid state, seeded from the existing cost so editing a paid Cost opens with the box ticked:

```tsx
const [paid, setPaid] = React.useState(Boolean(singleCost?.paidAt));
```

3. Update the `<InlineCostFields ... />` call to pass `costAmount`/`onCostChange`, `paid`/`onPaidChange={setPaid}`, `paidAmount`/`onPaidAmountChange`, `paidAt`/`onPaidAtChange`.
4. In the submit handler, only send paid data when the box is ticked, so un-ticking clears the payment:

```tsx
  paidAt: paid ? paidAt || undefined : undefined,
  paidMinor: paid
    ? (parseAmountToMinor(paidAmount, currency) ?? undefined)
    : undefined,
```

This matches the existing pattern in these dialogs — see `accommodation-form-dialog.tsx:259-262`, which already uses `parseAmountToMinor(...) ?? undefined`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run components/trip/inline-cost-fields.test.tsx components/trip/accommodation-form-dialog.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/item-form-dialog.test.tsx`
Expected: PASS. Existing dialog tests asserting the old "Estimated cost" / "Actual cost" labels must be updated to the new copy.

- [ ] **Step 6: Run the full suite**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add components/trip/inline-cost-fields.tsx components/trip/inline-cost-fields.test.tsx components/trip/accommodation-form-dialog.tsx components/trip/transport-form-dialog.tsx components/trip/item-form-dialog.tsx components/trip/*.test.tsx
git commit -m "feat(cost): replace the date-paid field with a Paid toggle and prefilled amount"
```

---

### Task 5: Paid toggle in the other-cost editor

`OtherCostEditor` has its own inline form (it does not use `InlineCostFields`) and currently shows all three money fields ungated. Bring it to the same shape so standalone costs behave identically.

**Files:**
- Modify: `components/trip/other-cost-editor.tsx:74-115` (form state), `:190-235` (the three Field blocks)
- Test: `components/trip/other-cost-editor.test.tsx`

**Interfaces:**
- Consumes: the same error paths and copy rules as Task 4.
- Produces: nothing new consumed downstream.

- [ ] **Step 1: Write the failing test**

Add to `components/trip/other-cost-editor.test.tsx`:

```tsx
it("hides the paid amount until Paid is ticked", async () => {
  const user = userEvent.setup();
  renderEditor();
  await user.click(screen.getByRole("button", { name: /add (other )?cost/i }));

  expect(screen.getByLabelText(/cost amount/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/you paid amount/i)).not.toBeInTheDocument();

  await user.type(screen.getByLabelText(/cost amount/i), "42.00");
  await user.click(screen.getByRole("checkbox", { name: /paid/i }));

  expect(screen.getByLabelText(/you paid amount/i)).toHaveValue("42.00");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/trip/other-cost-editor.test.tsx -t "paid"`
Expected: FAIL — there is no Paid checkbox.

- [ ] **Step 3: Add paid to the form state**

In the `FormState` interface at `components/trip/other-cost-editor.tsx:74`, add `paid: boolean;` and rename `actualAmount` → `paidAmount`. Update the blank initial state (`:84`) with `paid: false` and the edit-seeding block (`:98`) with `paid: Boolean(cost.paidAt)`.

- [ ] **Step 4: Replace the three Field blocks**

Replace the Estimated / Actual / Paid date blocks at `:190-235`:

```tsx
          <Field
            label="Cost"
            description="Your best number — the real price if it's already booked."
            required
            error={errors.costMinor?.[0]}
          >
            <MoneyInput
              amount={form.costAmount}
              currency={form.currency}
              currencies={CURRENCY_CODES}
              onAmountChange={(v) => setForm((f) => ({ ...f, costAmount: v }))}
              onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
              disabled={submitting}
              invalid={Boolean(errors.costMinor)}
              aria-label="Cost amount"
            />
          </Field>

          {form.costAmount.trim() && (
            <>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.paid}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      paid: e.target.checked,
                      // Prefill both so confirming a cost that came to what you
                      // expected is a single tick.
                      paidAmount:
                        e.target.checked && !f.paidAmount.trim()
                          ? f.costAmount
                          : f.paidAmount,
                      paidAt:
                        e.target.checked && !f.paidAt.trim()
                          ? new Date().toISOString().slice(0, 10)
                          : f.paidAt,
                    }))
                  }
                  disabled={submitting}
                  className="size-4 rounded border-input accent-primary"
                />
                Paid
              </label>

              {form.paid && (
                <>
                  <Field label="You paid" error={errors.paidMinor?.[0]}>
                    <MoneyInput
                      amount={form.paidAmount}
                      currency={form.currency}
                      currencies={CURRENCY_CODES}
                      onAmountChange={(v) => setForm((f) => ({ ...f, paidAmount: v }))}
                      onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                      disabled={submitting}
                      invalid={Boolean(errors.paidMinor)}
                      aria-label="You paid amount"
                    />
                  </Field>

                  <Field label="Date paid" error={errors.paidAt?.[0]}>
                    <Input
                      type="date"
                      value={form.paidAt}
                      onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))}
                      disabled={submitting}
                      className="w-full"
                    />
                  </Field>
                </>
              )}
            </>
          )}
```

- [ ] **Step 5: Send paid data only when ticked**

In the submit payload at `:112`:

```tsx
    paidAt: form.paid ? form.paidAt || undefined : undefined,
    paidMinor: form.paid
      ? (parseAmountToMinor(form.paidAmount, form.currency) ?? undefined)
      : undefined,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run components/trip/other-cost-editor.test.tsx`
Expected: PASS.

- [ ] **Step 7: Run the full suite and commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add components/trip/other-cost-editor.tsx components/trip/other-cost-editor.test.tsx
git commit -m "feat(cost): bring the other-cost editor onto the Paid toggle"
```

---

### Task 6: Fix the paid badge

`components/trip/cost-summary.tsx:81` only renders the green check inside the `{actualStr && ...}` block, so the badge keys off the wrong thing — a paid Cost shows no paid indicator unless an amount happens to be displayed. Now that paid always carries an amount the two coincide, but the render condition should say what it means.

**Files:**
- Modify: `components/trip/cost-summary.tsx:59-100`
- Test: `components/trip/cost-summary.test.tsx`

**Interfaces:**
- Consumes: `costMinor`, `paidMinor`, `paidAt` from Task 2.

- [ ] **Step 1: Write the failing test**

```tsx
it("shows the paid badge for a paid cost", () => {
  render(
    <CostSummary
      cost={{ id: "c1", costMinor: 34000, paidMinor: 34000,
              currency: "GBP", rateToHome: null, paidAt: "2026-06-04" }}
      homeCurrency="GBP"
    />,
  );
  expect(screen.getByLabelText(/paid/i)).toBeInTheDocument();
});

it("shows no paid badge for an unpaid cost", () => {
  render(
    <CostSummary
      cost={{ id: "c1", costMinor: 34000, paidMinor: null,
              currency: "GBP", rateToHome: null, paidAt: null }}
      homeCurrency="GBP"
    />,
  );
  expect(screen.queryByLabelText(/paid/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/trip/cost-summary.test.tsx -t "paid badge"`
Expected: FAIL — the icon is `aria-hidden` with no accessible name.

- [ ] **Step 3: Key the badge off paid state**

In `components/trip/cost-summary.tsx`, move the badge out of the `actualStr` block so it renders on `isPaid` alone, and give it an accessible name:

```tsx
        {isPaid && (
          <CheckCircle2
            className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-label="Paid"
          />
        )}
```

- [ ] **Step 4: Run tests, then the suite, then commit**

```bash
npx vitest run components/trip/cost-summary.test.tsx
npm test && npm run lint && npx tsc --noEmit
git add components/trip/cost-summary.tsx components/trip/cost-summary.test.tsx
git commit -m "fix(budget): render the paid badge from paid state, not the actual amount"
```

---

### Task 7: Mark-paid action and the Budget cost list

**The Budget page has no per-cost list today** — only aggregates (by category / stop / chapter / day) plus the OTHER-costs editor. The tick-down-the-list gesture needs that list built. The page already loads `allCosts`, `accommodations`, `transports` and `items`, so owner names can be resolved without new queries.

**Files:**
- Modify: `server/actions/costs.ts` (new action)
- Create: `components/trip/cost-checklist.tsx`
- Create: `components/trip/cost-checklist.test.tsx`
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (render the list, resolve owner names)
- Test: `server/actions/costs.test.ts`

**Interfaces:**
- Consumes: `costSchema` from Task 3.
- Produces: `markCostPaid(costId: string, paidMinor: number, paidAt: string): Promise<CostActionResult>` and `markCostUnpaid(costId: string): Promise<CostActionResult>`. `CostChecklistRow = { id: string; label: string; costMinor: number; paidMinor: number | null; currency: string; paidAt: Date | null }`.

- [ ] **Step 1: Write the failing action test**

In `server/actions/costs.test.ts`. **There is no live database** — this file already mocks `lib/db`, `lib/guards`, `lib/fx`, `next/cache` and `next/navigation` through a `vi.hoisted` block (see `server/actions/costs.test.ts:9-40`). Reuse the existing `costFindUniqueMock` and `costUpdateMock`; do not introduce a real `db` call or a seeded row.

```ts
describe("markCostPaid", () => {
  it("rejects a non-integer amount without touching the database", async () => {
    costFindUniqueMock.mockResolvedValueOnce({ id: "c1", tripId: "t1" });

    const result = await markCostPaid("c1", Number.NaN, "2026-06-04");

    expect(result.success).toBe(false);
    expect(costUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown cost", async () => {
    costFindUniqueMock.mockResolvedValueOnce(null);

    const result = await markCostPaid("nope", 34000, "2026-06-04");

    expect(result.success).toBe(false);
    expect(costUpdateMock).not.toHaveBeenCalled();
  });

  it("writes the paid amount and date", async () => {
    costFindUniqueMock.mockResolvedValueOnce({ id: "c1", tripId: "t1" });

    const result = await markCostPaid("c1", 34000, "2026-06-04");

    expect(result.success).toBe(true);
    expect(costUpdateMock).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { paidMinor: 34000, paidAt: new Date("2026-06-04") },
    });
  });
});

describe("markCostUnpaid", () => {
  it("clears the paid date but leaves the amount as history", async () => {
    costFindUniqueMock.mockResolvedValueOnce({ id: "c1", tripId: "t1" });

    const result = await markCostUnpaid("c1");

    expect(result.success).toBe(true);
    expect(costUpdateMock).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { paidAt: null },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/actions/costs.test.ts -t "markCostPaid"`
Expected: FAIL — `markCostPaid` is not exported.

- [ ] **Step 3: Add the actions**

Append to `server/actions/costs.ts`, following the access-check pattern already used by `deleteCost`:

```ts
/**
 * Mark a single Cost paid from the Budget checklist, without opening its
 * dialog. The amount is required (ADR 0037) — the caller offers it pre-filled
 * with the cost amount, so the common case is one tap.
 */
export async function markCostPaid(
  costId: string,
  paidMinor: number,
  paidAt: string,
): Promise<CostActionResult> {
  const cost = await db.cost.findUnique({
    where: { id: costId },
    select: { id: true, tripId: true },
  });
  if (!cost) return { success: false, errors: { _form: ["Cost not found"] } };
  await requireTripAccess(cost.tripId);

  if (!Number.isInteger(paidMinor) || paidMinor < 0) {
    return { success: false, errors: { paidMinor: ["Enter what you paid"] } };
  }

  await db.cost.update({
    where: { id: costId },
    data: { paidMinor, paidAt: new Date(paidAt) },
  });
  revalidatePath(`/trips/${cost.tripId}`);
  return { success: true };
}

/** Un-mark a Cost as paid. The paid amount stays as history. */
export async function markCostUnpaid(costId: string): Promise<CostActionResult> {
  const cost = await db.cost.findUnique({
    where: { id: costId },
    select: { id: true, tripId: true },
  });
  if (!cost) return { success: false, errors: { _form: ["Cost not found"] } };
  await requireTripAccess(cost.tripId);

  await db.cost.update({ where: { id: costId }, data: { paidAt: null } });
  revalidatePath(`/trips/${cost.tripId}`);
  return { success: true };
}
```

- [ ] **Step 4: Write the failing checklist test**

Create `components/trip/cost-checklist.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const markCostPaid = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/costs", () => ({
  markCostPaid: (...a: unknown[]) => markCostPaid(...a),
  markCostUnpaid: vi.fn().mockResolvedValue({ success: true }),
}));

import { CostChecklist } from "./cost-checklist";

const rows = [
  { id: "c1", label: "Hotel Ibis", costMinor: 34000, paidMinor: null,
    currency: "GBP", paidAt: null },
  { id: "c2", label: "Pensione Roma", costMinor: 21000, paidMinor: 21000,
    currency: "GBP", paidAt: new Date("2026-06-04") },
];

describe("CostChecklist", () => {
  it("lists every cost with its paid state", () => {
    render(<CostChecklist rows={rows} homeCurrency="GBP" />);
    expect(screen.getByText("Hotel Ibis")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /hotel ibis/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /pensione roma/i })).toBeChecked();
  });

  it("asks how much before marking paid, prefilled with the cost", async () => {
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} homeCurrency="GBP" />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));

    expect(screen.getByText(/paid how much/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/you paid amount/i)).toHaveValue("340.00");
    expect(markCostPaid).not.toHaveBeenCalled();
  });

  it("marks paid on confirm", async () => {
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} homeCurrency="GBP" />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(markCostPaid).toHaveBeenCalledWith("c1", 34000, expect.any(String));
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run components/trip/cost-checklist.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 6: Build the checklist**

Create `components/trip/cost-checklist.tsx`:

```tsx
"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { CURRENCY_CODES } from "@/lib/currencies";
import { formatMoney, formatMinor, parseAmountToMinor } from "@/lib/money";
import { markCostPaid, markCostUnpaid } from "@/server/actions/costs";
import { toast } from "@/components/ui/use-toast";

export interface CostChecklistRow {
  id: string;
  label: string;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  paidAt: Date | null;
}

interface CostChecklistProps {
  rows: CostChecklistRow[];
  homeCurrency: string;
}

/**
 * The reconciling gesture: tick down the list marking things paid. Ticking an
 * unpaid row opens a small confirm pre-filled with the cost amount — required
 * because a Cost can't be paid without an amount (ADR 0037), pre-filled so the
 * common case ("it cost what I thought") stays one tap.
 */
export function CostChecklist({ rows, homeCurrency }: CostChecklistProps) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  if (rows.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((row) => {
        const isPaid = row.paidAt != null;
        return (
          <li key={row.id} className="flex items-center gap-3 py-2">
            <Popover
              open={openId === row.id}
              onOpenChange={(o) => setOpenId(o ? row.id : null)}
            >
              <PopoverTrigger asChild>
                <input
                  type="checkbox"
                  checked={isPaid}
                  aria-label={row.label}
                  disabled={pendingId === row.id}
                  onChange={async () => {
                    if (!isPaid) {
                      setOpenId(row.id);
                      return;
                    }
                    // Un-marking needs no amount — the paid amount stays as history.
                    setPendingId(row.id);
                    const r = await markCostUnpaid(row.id);
                    setPendingId(null);
                    if (!r.success) {
                      toast({ variant: "destructive", title: "Couldn't update that cost." });
                    }
                  }}
                  className="size-4 shrink-0 rounded border-input accent-primary"
                />
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <PaidConfirm
                  row={row}
                  onCancel={() => setOpenId(null)}
                  onDone={() => setOpenId(null)}
                />
              </PopoverContent>
            </Popover>

            <span className="flex-1 truncate text-sm">{row.label}</span>

            <span className="shrink-0 text-sm text-muted-foreground">
              {formatMoney(row.costMinor, row.currency)}
            </span>

            {isPaid && (
              <CheckCircle2
                className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-label="Paid"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PaidConfirm({
  row,
  onCancel,
  onDone,
}: {
  row: CostChecklistRow;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = React.useState(
    formatMinor(row.costMinor, row.currency),
  );
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm() {
    const minor = parseAmountToMinor(amount, row.currency);
    if (minor === null || minor < 0) {
      setError("Enter what you paid");
      return;
    }
    setSubmitting(true);
    const r = await markCostPaid(row.id, minor, date);
    setSubmitting(false);
    if (!r.success) {
      toast({ variant: "destructive", title: "Couldn't mark that paid." });
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Paid how much?</p>

      <Field label="You paid" error={error ?? undefined}>
        <MoneyInput
          amount={amount}
          currency={row.currency}
          currencies={CURRENCY_CODES}
          onAmountChange={setAmount}
          onCurrencyChange={() => {}}
          disabled={submitting}
          invalid={Boolean(error)}
          aria-label="You paid amount"
        />
      </Field>

      <Field label="Date paid">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={submitting}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleConfirm} loading={submitting}>
          Confirm
        </Button>
      </div>
    </div>
  );
}
```

Note the money helpers are `parseAmountToMinor(raw, currency): number | null` (string → minor) and `formatMinor(amountMinor, currency): string` (minor → `"340.00"`). There is no `toMinor`/`fromMinor` in this codebase.

- [ ] **Step 7: Render it on the Budget page**

In `app/(app)/trips/[tripId]/budget/page.tsx`, build the rows after `allCosts` is loaded, resolving each cost's label from the already-loaded collections:

```tsx
const ownerName = new Map<string, string>([
  ...accommodations.map((a) => [a.id, a.name] as const),
  ...transports.map((t) => [t.id, transportLabel(t)] as const),
  ...items.map((i) => [i.id, i.title] as const),
]);

const checklistRows: CostChecklistRow[] = allCosts.map((c) => ({
  id: c.id,
  label: c.label ?? ownerName.get(c.ownerId ?? "") ?? "Cost",
  costMinor: c.costMinor,
  paidMinor: c.paidMinor,
  currency: c.currency,
  paidAt: c.paidAt,
}));
```

Render `<CostChecklist rows={checklistRows} homeCurrency={homeCurrency} />` in a `Card` titled **"Mark off what you've paid"**, placed in the main column directly below `SpendSoFarCard`. If `transportLabel` does not already exist, derive the label inline from the transport's mode and reference.

- [ ] **Step 8: Run the tests, the suite, then commit**

```bash
npx vitest run components/trip/cost-checklist.test.tsx server/actions/costs.test.ts
npm test && npm run lint && npx tsc --noEmit
git add server/actions/costs.ts server/actions/costs.test.ts components/trip/cost-checklist.tsx components/trip/cost-checklist.test.tsx "app/(app)/trips/[tripId]/budget/page.tsx"
git commit -m "feat(budget): add a cost checklist for marking things paid in bulk"
```

---

### Task 8: Sweep the remaining screen copy

The rename covered identifiers; several user-facing strings still say "Estimated" or "Actual" and would leave the glossary/UI drift ADR 0037 exists to prevent.

**Files:**
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx:304-318` (the "Estimated / Spent" legend)
- Modify: `components/trip/budget-hero-row.tsx`, `components/trip/spend-so-far-card.tsx`, `components/trip/cost-editor.tsx`, `components/trip/cost-amounts.tsx`, `components/trip/compare-table.tsx`, `app/(app)/trips/[tripId]/print/page.tsx`, `app/(app)/trips/[tripId]/summary/page.tsx`

- [ ] **Step 1: Find every remaining occurrence**

```bash
grep -rn -i 'estimated\|actual cost\|est\.' \
  --include='*.tsx' components app | grep -v '\.test\.'
```

- [ ] **Step 2: Rewrite each string**

Map: "Estimated" → "Cost"; "Spent"/"Actual" → "Paid"; "Est / day" → "Cost / day"; "est." → "cost". Leave `aria-label`s consistent with their visible text. Do **not** change the word "estimate" where it refers to the act of estimating in prose that is still accurate.

- [ ] **Step 3: Update snapshot-ish assertions**

Run: `npm test`
Expected: some component tests assert the old strings. Update them to the new copy — these are copy changes, not behaviour changes.

- [ ] **Step 4: Verify the drift is gone**

```bash
grep -rn -i 'estimated' --include='*.tsx' components app | grep -v '\.test\.'
```
Expected: no user-facing label results.

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add -A
git commit -m "refactor(budget): bring screen copy onto the cost/paid vocabulary"
```

---

## Out of scope — follow-up

**The "Firm up" → "Set dates" drift is not fixed here.** CONTEXT.md makes "Firm up" the canonical term for the rough → scheduled transition, but the UI says "Set dates for all stops" and the word never appears on screen. The same argument that motivated ADR 0037's full rename applies, but it is a separate job and is deliberately not smuggled into this one.
