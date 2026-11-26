import { z } from "zod";
import { isoDate } from "@/lib/validations/primitives";
import type { DeleteRefundAnswer } from "@/lib/money/delete-refund";

export const REFUND_RULES_NOTE = "Money is in minor units. A Refund is only for a paid Cost and never more than was paid. A Refund is in the currency the Cost was paid in.";
export const REFUND_NOTE = `${REFUND_RULES_NOTE} Omit receivedOn for a refund that has been promised but has not arrived.`;

export const refundsShape = z
  .array(z.object({ costId: z.string(), refundMinor: z.number().int().min(1), receivedOn: isoDate.nullable().optional() }))
  .optional()
  .describe(
    "For each paid Cost of the thing, what came back. Omit when nothing was refunded: the paid amount then stays in spend as an Other cost. Ask the person before deleting something that has been paid for.",
  );

type RefundsInput = z.infer<typeof refundsShape>;

/** Trailing arguments for a delete action: none at all when the caller gave no refunds. */
export function deleteRefundArgs(refunds: RefundsInput): [readonly DeleteRefundAnswer[]] | [] {
  if (!refunds) return [];
  return [refunds.map((r) => ({ costId: r.costId, refundMinor: r.refundMinor, refundedAt: r.receivedOn ?? null }))];
}
