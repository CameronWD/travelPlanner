import { daysBetween } from "@/lib/dates";
import { costLabel } from "@/lib/cost-labels";
import { isOnTrip } from "@/lib/enums";

export interface UpcomingPayment {
  costId: string;
  label: string;
  costMinor: number;
  currency: string;
  dueDate: string;
  /** Days from `today` to `dueDate`; negative means overdue. */
  daysUntil: number;
}

export interface UpcomingPaymentsInput {
  costs: {
    id: string;
    costMinor: number;
    currency: string;
    paidAt: Date | null;
    dueDate: string | null;
    ownerType: string;
    ownerId: string | null;
    label: string | null;
    /** CONTEXT.md "Settlement"; missing or unknown counts as BEFORE. */
    settlement?: string;
  }[];
  ownerNames: Map<string, string>;
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
      dueDate: c.dueDate as string,
      daysUntil: daysBetween(input.today, c.dueDate as string),
    }));

  return rows.sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}
