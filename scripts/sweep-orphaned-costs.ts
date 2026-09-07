/**
 * One-off sweep for Cost rows orphaned before deletes cleaned up costs
 * (ADR 0039). Applies the same split-by-paid rule as deleteOwnedCostsTx:
 * unpaid orphans are deleted, ever-paid orphans convert to Other costs with
 * a generic label (their owners are gone, so no name is recoverable).
 *
 *   npx tsx scripts/sweep-orphaned-costs.ts            # dry run (default)
 *   npx tsx scripts/sweep-orphaned-costs.ts --execute  # apply changes
 */
import { db } from "@/lib/db";

const TYPE_LABEL: Record<string, string> = {
  ACCOMMODATION: "Accommodation",
  ITEM: "Item",
  TRANSPORT: "Transport",
};

async function main() {
  const execute = process.argv.includes("--execute");
  const costs = await db.cost.findMany({
    where: { ownerType: { in: ["ACCOMMODATION", "ITEM", "TRANSPORT"] }, ownerId: { not: null } },
    select: { id: true, ownerType: true, ownerId: true, paidMinor: true, paidAt: true, label: true, tripId: true },
  });

  const ownerIds = {
    ACCOMMODATION: costs.filter((c) => c.ownerType === "ACCOMMODATION").map((c) => c.ownerId!),
    ITEM: costs.filter((c) => c.ownerType === "ITEM").map((c) => c.ownerId!),
    TRANSPORT: costs.filter((c) => c.ownerType === "TRANSPORT").map((c) => c.ownerId!),
  };
  const [accs, items, transports] = await Promise.all([
    db.accommodation.findMany({ where: { id: { in: ownerIds.ACCOMMODATION } }, select: { id: true } }),
    db.item.findMany({ where: { id: { in: ownerIds.ITEM } }, select: { id: true } }),
    db.transport.findMany({ where: { id: { in: ownerIds.TRANSPORT } }, select: { id: true } }),
  ]);
  const alive = new Set([
    ...accs.map((r) => `ACCOMMODATION:${r.id}`),
    ...items.map((r) => `ITEM:${r.id}`),
    ...transports.map((r) => `TRANSPORT:${r.id}`),
  ]);

  const orphans = costs.filter((c) => !alive.has(`${c.ownerType}:${c.ownerId}`));
  const doomed = orphans.filter((c) => c.paidMinor === null && c.paidAt === null);
  const converts = orphans.filter((c) => c.paidMinor !== null || c.paidAt !== null);

  console.log(`${costs.length} owned costs scanned — ${orphans.length} orphaned`);
  console.log(`  would delete (never paid):   ${doomed.length}`);
  console.log(`  would convert (ever paid):   ${converts.length}`);
  for (const c of orphans) {
    const fate = c.paidMinor !== null || c.paidAt !== null ? "CONVERT" : "DELETE";
    console.log(`  [${fate}] cost ${c.id} trip ${c.tripId} (${c.ownerType} ${c.ownerId})`);
  }
  if (!execute) {
    console.log("\nDry run — re-run with --execute to apply.");
    return;
  }

  await db.$transaction(async (tx) => {
    if (doomed.length > 0) {
      await tx.cost.deleteMany({ where: { id: { in: doomed.map((c) => c.id) } } });
    }
    for (const c of converts) {
      const base = c.label ?? TYPE_LABEL[c.ownerType] ?? "Deleted";
      await tx.cost.update({
        where: { id: c.id },
        data: { ownerType: "OTHER", ownerId: null, label: `${base} (deleted)` },
      });
    }
  });
  console.log(`Applied: deleted ${doomed.length}, converted ${converts.length}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
