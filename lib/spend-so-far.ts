import { convertCostToHome, type BudgetCost } from "@/lib/budget";
import { daysBetween } from "@/lib/dates";

// `paidAt` (the sole "is this paid" signal) now lives on BudgetCost itself —
// SpendCost is kept as a distinct name for callers that build spend-so-far
// input, but no longer needs to redeclare the field.
export type SpendCost = BudgetCost;

/** Costs whose payment predates the paidAt-as-sole-signal remodel (ADR 0037):
 * an amount was recorded but no date, so they read as unpaid everywhere.
 * The Budget checklist is the remediation path (things-to-fix P2-8). */
export function legacyPaidCount(
  costs: Array<{ paidMinor: number | null; paidAt: Date | null }>,
): number {
  return costs.filter((c) => c.paidMinor !== null && c.paidAt === null).length;
}

export interface SpendSoFar {
  costTotalMinor: number;
  paidSoFarMinor: number;
  paidCostMinor: number;
  /** paidSoFar − paidEstimate; > 0 = over your estimates on what you've paid. */
  varianceMinor: number;
  costRemainingMinor: number;
  /** 0–100, or null when the trip has no/invalid dates. */
  tripElapsedPct: number | null;
}

export function buildSpendSoFar(input: {
  costs: SpendCost[];
  homeCurrency: string;
  tripStart?: string | null;
  tripEnd?: string | null;
  today: string;
}): SpendSoFar {
  let estimatedTotal = 0, paidSoFar = 0, paidEstimate = 0;
  for (const c of input.costs) {
    const { costHome, paidHome } = convertCostToHome(c, input.homeCurrency);
    if (costHome === null) continue; // missing rate — excluded everywhere
    estimatedTotal += costHome;
    if (c.paidAt != null) {
      if (c.paidMinor == null || paidHome === null) {
        // A paid Cost always carries a paid amount (costSchema enforces it), so
        // this is only reachable for a legacy row the backfill missed. Skip it:
        // counting it as zero would understate spending AND inflate the
        // variance, which is exactly the display bug this rule exists to kill.
        // NB: we check the raw `c.paidMinor` rather than relying on
        // `paidHome` alone, so this missing-amount case stays explicit even
        // if convertCostToHome's null-handling changes.
        continue;
      }
      paidSoFar += paidHome;
      paidEstimate += costHome;
    }
  }

  let tripElapsedPct: number | null = null;
  if (input.tripStart && input.tripEnd) {
    const total = daysBetween(input.tripStart, input.tripEnd);
    if (total > 0) {
      const elapsed = Math.min(Math.max(daysBetween(input.tripStart, input.today), 0), total);
      tripElapsedPct = Math.round((elapsed / total) * 100);
    } else {
      tripElapsedPct = input.today >= input.tripStart ? 100 : 0;
    }
  }

  return {
    costTotalMinor: estimatedTotal,
    paidSoFarMinor: paidSoFar,
    paidCostMinor: paidEstimate,
    varianceMinor: paidSoFar - paidEstimate,
    costRemainingMinor: estimatedTotal - paidEstimate,
    tripElapsedPct,
  };
}
