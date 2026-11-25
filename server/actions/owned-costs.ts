import type { Prisma } from "@prisma/client";
import type { DeleteRefundAnswer } from "@/lib/money/delete-refund";
import { refundProblem, REFUND_MESSAGES } from "@/lib/money/refund";
import { refundedAtStringSchema } from "@/lib/validations/cost";

export type DeletedCostOwner = {
  type: "ACCOMMODATION" | "ITEM" | "TRANSPORT";
  id: string;
  /** Human name of the owner being deleted, used to label converted costs. */
  label: string;
};

function answerDate(refundedAt: string | null): Date | null | undefined {
  if (refundedAt === null) return null;
  const parsed = refundedAtStringSchema.safeParse(refundedAt);
  return parsed.success ? new Date(parsed.data) : undefined;
}

/**
 * The rule a set of delete answers breaks, or null. Run before anything is
 * deleted: an answer may only name a currently paid Cost of this owner.
 */
export async function deleteRefundsProblemTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  owner: DeletedCostOwner,
  refunds: readonly DeleteRefundAnswer[] | undefined,
): Promise<string | null> {
  if (!refunds || refunds.length === 0) return null;
  const ids = refunds.map((r) => r.costId);
  if (new Set(ids).size !== ids.length) return REFUND_MESSAGES.duplicateAnswer;

  const costs = await tx.cost.findMany({
    where: { tripId, ownerType: owner.type, ownerId: owner.id, id: { in: ids } },
    select: { id: true, paidMinor: true, paidAt: true },
  });
  const byId = new Map(costs.map((c) => [c.id, c]));
  for (const answer of refunds) {
    const cost = byId.get(answer.costId);
    if (!cost) return REFUND_MESSAGES.notThisThing;
    const refundedAt = answerDate(answer.refundedAt);
    if (refundedAt === undefined) return REFUND_MESSAGES.dateNeeded;
    const problem = refundProblem({ ...cost, refundMinor: answer.refundMinor, refundedAt });
    if (problem) return problem;
  }
  return null;
}

/**
 * Handle the Costs attached to owners being deleted, inside the caller's
 * transaction. Split-by-paid rule (CONTEXT.md "Other cost", ADR 0039):
 * unpaid costs die with their owner; any cost that has ever had a paid
 * amount converts to a standalone Other cost so Spend so far keeps
 * matching real money. paidMinor-without-paidAt counts as paid (legacy
 * rows; un-marking also leaves paidMinor as history).
 */
export async function deleteOwnedCostsTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  owners: DeletedCostOwner[],
  refunds: readonly DeleteRefundAnswer[] = [],
): Promise<{ deleted: number; converted: number }> {
  if (owners.length === 0) return { deleted: 0, converted: 0 };

  const byType = new Map<string, DeletedCostOwner[]>();
  for (const o of owners) {
    byType.set(o.type, [...(byType.get(o.type) ?? []), o]);
  }
  const costs = await tx.cost.findMany({
    where: {
      tripId,
      OR: [...byType.entries()].map(([type, list]) => ({
        ownerType: type,
        ownerId: { in: list.map((o) => o.id) },
      })),
    },
    select: { id: true, paidMinor: true, paidAt: true, refundMinor: true, label: true, ownerType: true, ownerId: true },
  });
  if (costs.length === 0) return { deleted: 0, converted: 0 };

  const ownerLabel = new Map(owners.map((o) => [`${o.type}:${o.id}`, o.label]));
  const doomedIds: string[] = [];
  let converted = 0;
  for (const cost of costs) {
    const everPaid = cost.paidMinor !== null || cost.paidAt !== null;
    if (!everPaid) {
      doomedIds.push(cost.id);
      continue;
    }
    const answer = refunds.find((r) => r.costId === cost.id);
    const base = cost.label ?? ownerLabel.get(`${cost.ownerType}:${cost.ownerId}`) ?? "Deleted";
    // A cancelled thing counts only the money that left; an unanswered, Refund-less Cost is unchanged.
    const cancelled = answer !== undefined || cost.refundMinor != null;
    const onlyWhatWasPaid = cancelled && cost.paidAt != null && cost.paidMinor != null ? { costMinor: cost.paidMinor } : {};
    await tx.cost.update({
      where: { id: cost.id },
      data: answer
        ? {
            ownerType: "OTHER",
            ownerId: null,
            label: `${base} (cancelled)`,
            ...onlyWhatWasPaid,
            refundMinor: answer.refundMinor,
            refundedAt: answerDate(answer.refundedAt),
          }
        : {
            ownerType: "OTHER",
            ownerId: null,
            label: `${base} (${cancelled ? "cancelled" : "deleted"})`,
            ...onlyWhatWasPaid,
          },
    });
    converted++;
  }
  if (doomedIds.length > 0) {
    await tx.cost.deleteMany({ where: { id: { in: doomedIds } } });
  }
  return { deleted: doomedIds.length, converted };
}
