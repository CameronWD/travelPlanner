import "server-only";
import { db } from "@/lib/db";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { batchTripIds, prepareUsageRows, usageSite } from "./rows";
import type { UsageInput } from "./validate";

export async function storeUsageBatch(userId: string, records: UsageInput[]): Promise<number> {
  const tripIds = batchTripIds(records);
  const members = tripIds.length
    ? await db.tripMember.findMany({
        where: { userId, tripId: { in: tripIds }, trip: { deletedAt: null } },
        select: { tripId: true },
      })
    : [];
  const memberTripIds = new Set(members.map((m) => m.tripId));

  const surprisedTripIds = new Set<string>();
  for (const tripId of memberTripIds) {
    if (!records.some((r) => r.tripId === tripId && r.dayOffset !== null)) continue;
    const visibility = await loadSurpriseVisibility(tripId, userId);
    if (visibility.hiddenRootIds.length > 0) surprisedTripIds.add(tripId);
  }

  const rows = prepareUsageRows(records, { userId, site: usageSite(), memberTripIds, surprisedTripIds });
  if (rows.length > 0) await db.usageRecord.createMany({ data: rows });
  return rows.length;
}
