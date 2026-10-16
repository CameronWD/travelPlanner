import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";

export interface ForkListItem {
  id: string;
  name: string;
  sortOrder: number;
}

/**
 * List all forks for a trip in sortOrder. Used by the trip layout (through
 * lib/trip-shell-reads.ts's readForks) to populate the ForkSwitcher.
 */
export async function listForks(tripId: string): Promise<ForkListItem[]> {
  await requireTripAccess(tripId);
  return db.fork.findMany({
    where: { tripId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, sortOrder: true },
  });
}
