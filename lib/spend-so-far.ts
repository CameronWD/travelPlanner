import { convertCostToHome, type BudgetCost } from "@/lib/budget";
import { daysBetween } from "@/lib/dates";

export interface SpendCost extends BudgetCost {
  /** When the cost was paid; null = not yet paid (excluded from "paid so far"). */
  paidAt: Date | string | null;
}

export interface SpendSoFar {
  estimatedTotalMinor: number;
  paidSoFarMinor: number;
  paidEstimateMinor: number;
  /** paidSoFar − paidEstimate; > 0 = over your estimates on what you've paid. */
  varianceMinor: number;
  estimatedRemainingMinor: number;
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
    const { estimatedHome, actualHome } = convertCostToHome(c, input.homeCurrency);
    if (estimatedHome === null) continue; // missing rate — excluded everywhere
    estimatedTotal += estimatedHome;
    if (c.paidAt != null) {
      // Cash-flow basis: a cost marked paid with no actual amount contributes 0 to paidSoFar,
      // but its estimate still counts toward paidEstimate (so variance reflects the gap).
      paidSoFar += actualHome ?? 0;
      paidEstimate += estimatedHome;
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
    estimatedTotalMinor: estimatedTotal,
    paidSoFarMinor: paidSoFar,
    paidEstimateMinor: paidEstimate,
    varianceMinor: paidSoFar - paidEstimate,
    estimatedRemainingMinor: estimatedTotal - paidEstimate,
    tripElapsedPct,
  };
}
