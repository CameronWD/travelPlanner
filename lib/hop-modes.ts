import "server-only";
import { db } from "@/lib/db";
import { hopModeKey, type HopModeChoice } from "@/lib/travel-times/hops";

export { hopModeKey, type HopModeChoice };

export async function loadHopModes(tripId: string): Promise<Map<string, HopModeChoice>> {
  const rows = await db.hopMode.findMany({ where: { tripId }, select: { fromItemId: true, toItemId: true, mode: true } });
  return new Map(
    rows.flatMap((r) =>
      r.mode === "WALK" || r.mode === "TRANSIT" || r.mode === "DRIVE" ? [[hopModeKey(r.fromItemId, r.toItemId), r.mode] as const] : [],
    ),
  );
}
