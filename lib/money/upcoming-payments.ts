import { daysBetween } from "@/lib/dates";
import { costLabel } from "@/lib/money/cost-labels";
import { isOnTrip } from "@/lib/enum-values";
import { convertMinor } from "@/lib/money/money";

export interface UpcomingPayment {
  costId: string;
  label: string;
  costMinor: number;
  currency: string;
  homeMinor: number | null;
  homeCurrency: string;
  dueDate: string;
  /** Days from `today` to `dueDate`; negative means overdue. */
  daysUntil: number;
}

export interface UpcomingPaymentsInput {
  costs: {
    id: string;
    costMinor: number;
    currency: string;
    rateToHome?: number | null;
    paidAt: Date | null;
    dueDate: string | null;
    ownerType: string;
    ownerId: string | null;
    label: string | null;
    /** CONTEXT.md "Settlement"; missing or unknown counts as BEFORE. */
    settlement?: string;
  }[];
  ownerNames: Map<string, string>;
  homeCurrency: string;
  /** YYYY-MM-DD */
  today: string;
}

/**
 * Costs that are still unpaid and carry a due date, soonest-due first (ties
 * broken by label). Paid costs and costs with no due date never appear here —
 * this is the "Upcoming payments" list (CONTEXT.md "Due date"), not a general
 * cost ledger. Only the Before you go kind is tracked: an On the trip Cost is
 * paid while away, so it is never an upcoming payment (CONTEXT.md
 * "Settlement").
 */
export function buildUpcomingPayments(input: UpcomingPaymentsInput): UpcomingPayment[] {
  const rows: UpcomingPayment[] = input.costs
    .filter((c) => c.paidAt == null && c.dueDate != null && !isOnTrip(c.settlement))
    .map((c) => ({
      costId: c.id,
      label: costLabel(c, input.ownerNames),
      costMinor: c.costMinor,
      currency: c.currency,
      homeMinor: upcomingHomeMinor(c, input.homeCurrency),
      homeCurrency: input.homeCurrency,
      dueDate: c.dueDate as string,
      daysUntil: daysBetween(input.today, c.dueDate as string),
    }));

  return rows.sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

export function upcomingHomeMinor(
  cost: { costMinor: number; currency: string; rateToHome?: number | null },
  homeCurrency: string,
): number | null {
  if (cost.currency.toUpperCase() === homeCurrency.toUpperCase()) return cost.costMinor;
  if (typeof cost.rateToHome === "number") {
    return convertMinor(cost.costMinor, cost.currency, homeCurrency, cost.rateToHome);
  }
  return null;
}

export function paymentAmountLabel(
  p: { costMinor: number; currency: string; homeMinor: number | null; homeCurrency: string },
  format: (amountMinor: number, currency: string) => string,
): string {
  if (p.homeMinor === null || p.currency.toUpperCase() === p.homeCurrency.toUpperCase()) {
    return format(p.costMinor, p.currency);
  }
  return `${format(p.homeMinor, p.homeCurrency)} (${format(p.costMinor, p.currency)})`;
}
