import type { Prisma } from "@prisma/client";

export type DeletedCostOwner = {
  type: "ACCOMMODATION" | "ITEM" | "TRANSPORT";
  id: string;
  /** Human name of the owner being deleted, used to label converted costs. */
  label: string;
};

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
    select: { id: true, paidMinor: true, paidAt: true, label: true, ownerType: true, ownerId: true },
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
    const base = cost.label ?? ownerLabel.get(`${cost.ownerType}:${cost.ownerId}`) ?? "Deleted";
    await tx.cost.update({
      where: { id: cost.id },
      data: { ownerType: "OTHER", ownerId: null, label: `${base} (deleted)` },
    });
    converted++;
  }
  if (doomedIds.length > 0) {
    await tx.cost.deleteMany({ where: { id: { in: doomedIds } } });
  }
  return { deleted: doomedIds.length, converted };
}
