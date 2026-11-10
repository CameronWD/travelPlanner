import "server-only";
import { db } from "@/lib/db";
import type { PackingViewer } from "@/lib/packing-access";

export async function loadPackingViewer(tripId: string, userId: string): Promise<PackingViewer> {
  const trip = await db.trip.findUniqueOrThrow({
    where: { id: tripId },
    select: { packingListsOpen: true },
  });
  return { userId, open: trip.packingListsOpen };
}
