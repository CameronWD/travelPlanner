import "server-only";
import { db } from "@/lib/db";
import { travellerFirstName, TRAVELLER_SELECT } from "@/lib/traveller";
import type { MarkedFineRow } from "@/lib/flag-dismissals";

/** The Trip's Marked fine rows, each with who marked it (CONTEXT.md "Marked fine"). */
export async function loadMarkedFineRows(tripId: string): Promise<MarkedFineRow[]> {
  const rows = await db.flagDismissal.findMany({
    where: { tripId },
    select: { flagId: true, fingerprint: true, createdAt: true, markedBy: { select: TRAVELLER_SELECT } },
  });
  return rows.map((r) => ({ flagId: r.flagId, fingerprint: r.fingerprint, createdAt: r.createdAt, markedByName: travellerFirstName(r.markedBy) }));
}
