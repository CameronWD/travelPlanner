import { netCostMinor, netPaidMinor } from "@/lib/money/refund";

/**
 * Shape of a cost row as rendered by the entity cards. Pages fetch costs
 * inline via `db.cost.findMany` (after `requireTripAccess`) and pass rows
 * matching this shape to the cards. A plain type in lib (spec 2026-10-14
 * card 3.N) so lib loaders and the cost form state don't import a
 * "use server" module for it.
 */
export type CostRow = {
  id: string;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  rateToHome: number | null;
  paidAt: Date | null;
  /** A Refund on a paid Cost (lib/money/refund.ts). Optional so a select that omits it reads as no Refund. */
  refundMinor?: number | null;
  refundedAt?: Date | null;
  dueDate: string | null;
  ownerType: string;
  ownerId: string | null;
  label: string | null;
  category: string | null;
  /** CONTEXT.md "Settlement" — BEFORE | ON_TRIP; anything else reads as BEFORE. */
  settlement: string;
  createdAt?: Date;
};

type Amounts = Pick<CostRow, "costMinor"> & Partial<Pick<CostRow, "paidMinor" | "paidAt" | "refundMinor" | "refundedAt">>;

function bearing(c: Amounts) {
  return { costMinor: c.costMinor, paidMinor: c.paidMinor ?? null, paidAt: c.paidAt ?? null, refundMinor: c.refundMinor ?? null, refundedAt: c.refundedAt ?? null };
}

/** The Cost's amount, less a received Refund: what a total counts. */
export function costNetMinor(c: Amounts): number {
  return netCostMinor(bearing(c));
}

/** CONTEXT.md "Cost": the one current number: the paid amount once Paid, else the cost; less a received Refund. */
export function shownCostMinor(c: Amounts): number {
  const b = bearing(c);
  return b.paidAt != null ? (netPaidMinor(b) ?? netCostMinor(b)) : c.costMinor;
}
