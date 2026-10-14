import { isOnTrip, type CostSettlement } from "@/lib/enum-values";
import { formatMinor } from "@/lib/money";
import type { ProposalCostFields } from "@/lib/booking-import/types";
import type { CostRow } from "@/server/actions/costs";

interface CostSeed {
  costAmount: string;
  currency: string;
  paidAmount: string;
  paidAt: string;
  paid: boolean;
  settlement: CostSettlement;
}

/** The inline Cost fields' first values: a saved single Cost, else a Proposal's Cost, else empty (ADR 0037: paidAt is the "is paid" signal). */
export function seedCost(singleCost: CostRow | null, proposed: ProposalCostFields | undefined, defaultCurrency: string): CostSeed {
  if (singleCost) {
    return {
      costAmount: formatMinor(singleCost.costMinor, singleCost.currency),
      currency: singleCost.currency,
      paidAmount: singleCost.paidMinor !== null && singleCost.paidMinor !== undefined ? formatMinor(singleCost.paidMinor, singleCost.currency) : "",
      paidAt: singleCost.paidAt ? new Date(singleCost.paidAt).toISOString().slice(0, 10) : "",
      paid: Boolean(singleCost.paidAt),
      settlement: isOnTrip(singleCost.settlement) ? "ON_TRIP" : "BEFORE",
    };
  }
  if (proposed?.costMinor !== undefined && proposed.currency) {
    return {
      costAmount: formatMinor(proposed.costMinor, proposed.currency),
      currency: proposed.currency,
      paidAmount: proposed.paidMinor != null ? formatMinor(proposed.paidMinor, proposed.currency) : "",
      paidAt: proposed.paidAt ?? "",
      paid: Boolean(proposed.paidAt),
      settlement: proposed.settlement ?? "BEFORE",
    };
  }
  return { costAmount: "", currency: defaultCurrency, paidAmount: "", paidAt: "", paid: false, settlement: "BEFORE" };
}
