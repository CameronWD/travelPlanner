type When = Date | string | null | undefined;

export interface RefundBearing {
  costMinor: number;
  paidMinor: number | null;
  paidAt: When;
  refundMinor: number | null | undefined;
  refundedAt: When;
}

export type RefundState = "none" | "expected" | "received";

export function refundState(c: Pick<RefundBearing, "refundMinor" | "refundedAt">): RefundState {
  if (c.refundMinor == null) return "none";
  return c.refundedAt != null ? "received" : "expected";
}

/** The Refund amount that counts in totals: 0 unless the Cost is paid and the Refund is received. */
export function receivedRefundMinor(c: Pick<RefundBearing, "paidAt" | "refundMinor" | "refundedAt">): number {
  return c.paidAt != null && c.refundedAt != null ? (c.refundMinor ?? 0) : 0;
}

export function netCostMinor(c: RefundBearing): number {
  return Math.max(0, c.costMinor - receivedRefundMinor(c));
}

/** null when the Cost has no paid amount; otherwise never below 0. */
export function netPaidMinor(c: RefundBearing): number | null {
  if (c.paidMinor == null) return null;
  return Math.max(0, c.paidMinor - receivedRefundMinor(c));
}

export const REFUND_MESSAGES = {
  tooMuch: "A refund can’t be more than what was paid.",
  notPaid: "Mark it paid before recording a refund.",
  unpayBlocked: "Remove the refund before marking this unpaid.",
};

/** The rule a Cost breaks, or null. Checks: a Refund needs a paid Cost; 1 ≤ refundMinor ≤ paidMinor; refundedAt needs refundMinor. */
export function refundProblem(
  c: Pick<RefundBearing, "paidMinor" | "paidAt" | "refundMinor" | "refundedAt">,
): string | null {
  if (c.refundMinor == null) {
    return c.refundedAt != null ? "A refund date needs a refund amount." : null;
  }
  if (c.paidAt == null) return REFUND_MESSAGES.notPaid;
  if (!Number.isInteger(c.refundMinor) || c.refundMinor < 1) return "A refund must be at least 1.";
  if (c.paidMinor == null || c.refundMinor > c.paidMinor) return REFUND_MESSAGES.tooMuch;
  return null;
}
