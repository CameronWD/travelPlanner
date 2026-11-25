import { formatMoney } from "@/lib/money/money";
import { refundState } from "@/lib/money/refund";

type Refunded = { refundMinor?: number | null; refundedAt?: Date | string | null; currency: string };

/** "Refunded A$50.00", "A$50.00 refund expected", or null when the Cost has no Refund. */
export function refundLabel(c: Refunded): string | null {
  const state = refundState({ refundMinor: c.refundMinor ?? null, refundedAt: c.refundedAt ?? null });
  if (state === "none") return null;
  const amount = formatMoney(c.refundMinor!, c.currency);
  return state === "received" ? `Refunded ${amount}` : `${amount} refund expected`;
}
