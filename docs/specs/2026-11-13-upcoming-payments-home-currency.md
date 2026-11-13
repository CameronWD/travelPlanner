# Upcoming payments in Home currency

Feedback: `cmwdagfzt000108l323mrgv7v` (Main, Trip home) — "Next repayments are
confusing when they aren't converted. They should always be converted to the
trip currency. Worth noting what they are really in."

## Rule (CONTEXT.md **Due date**)

Wherever an upcoming payment is shown, its amount is in the Trip's **Home
currency**, with the Cost's own currency in brackets when that differs:
`A$212 (€120)`. When there is no **Exchange rate** to convert with, it shows in
its own currency alone, exactly as today. A Cost already in the Home currency
shows exactly as today.

Rate: the same one the Budget and To pay use — the Cost's snapshot
`rateToHome`, otherwise the Trip's Exchange rate table (`applyFxRatesToCosts`),
converted with `convertMinor`. No new rate fetching, no "≈" marker.

## Surfaces

1. **Desktop Home "Trip cost" tile, Next payment block**
   (`components/trip/home/desktop/trip-cost-tile.tsx`).
   - No cover: headline `A$212 (€120)`, label below, due line `Due Thu 3 Dec`.
   - With cover: `A$212 (€120) · Hotel Kaiser` (label truncates), then `Due Thu 3 Dec`.
2. **Mobile "Upcoming payments" card** (planning + travelling Home,
   `components/trip/upcoming-payments-card.tsx`): the amount reads `A$212 (€120)`.
3. **Planning Home "Next payment" stat tile** (`components/trip/home/phase-planning.tsx`):
   same rule.
4. **Digest** payment line (`lib/digest-dispatch.ts` → `lib/digest.ts`):
   `A$212.00 (€120.00) Hotel Kaiser comes out in 3 days`.

Each surface keeps its existing money formatter; only the amount text changes.

## Unchanged

Which Costs count as upcoming payments, their order, the "comes out in X days"
wording, the Budget and To pay pages. MCP cost reads and rate fetching are out
of scope.
