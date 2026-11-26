import { formatMoney } from "@/lib/money/money";
import { paidCurrencyOf } from "@/lib/money/paid-currency";
import { receivedRefundMinor, refundState } from "@/lib/money/refund";

export type RefundTagCost = {
  refundMinor?: number | null;
  refundedAt?: Date | string | null;
  paidAt?: Date | string | null;
  currency: string;
  paidCurrency?: string | null;
};

/**
 * "Refunded A$50.00" only when the Refund counts in totals (paid and received),
 * "A$50.00 refund expected" while it is awaited, otherwise null.
 */
export function refundTagText(
  c: RefundTagCost,
  format: (minor: number, currency: string) => string = formatMoney,
): string | null {
  const currency = paidCurrencyOf(c);
  const refund = { refundMinor: c.refundMinor ?? null, refundedAt: c.refundedAt ?? null, paidAt: c.paidAt ?? null };
  const state = refundState(refund);
  if (state === "expected") return `${format(c.refundMinor!, currency)} refund expected`;
  if (state === "received" && receivedRefundMinor(refund) > 0) return `Refunded ${format(c.refundMinor!, currency)}`;
  return null;
}
