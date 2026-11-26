import { requireTripAccess } from "@/lib/guards";
import { loadFlags } from "@/lib/flags-loader";
import { canMarkFine } from "@/lib/flags";

/**
 * get_flags: `loadFlags`'s Flags reshaped to the fields a Claude connection
 * needs. `title` is the flag's targetType (what kind of thing it's about:
 * "stop", "transport", "accommodation", "item", "day", or "trip"); `detail` is
 * its message; `itemId` names the Item an "item" Flag is about (spec
 * 2026-10-17 R7), so Claude can read it with get_item or fix it with
 * set_opening_hours; `flagId` and `fingerprint` are set on a travel-time
 * or drive Flag, the kinds mark_flag_fine takes (with both, so a Flag that changed
 * since it was read is refused). `markedFine` lists the travel-time Flags a Traveller
 * Marked fine (spec 2026-11-18 T5), from the same Flags, so nothing about a
 * Surprise hidden from the caller is in it.
 */
export async function loadFlagsForMcp(tripId: string) {
  const { user } = await requireTripAccess(tripId);
  const { shown, markedFine } = await loadFlags(tripId, user.id);
  return {
    flags: shown.map((f) => ({
      severity: f.severity,
      title: f.targetType.toLowerCase(),
      detail: f.message,
      stopId: f.stopId ?? null,
      itemId: f.targetType === "ITEM" ? (f.targetId ?? null) : null,
      flagId: canMarkFine(f) ? f.id : null,
      fingerprint: canMarkFine(f) ? f.fingerprint : null,
    })),
    markedFine: markedFine.map((f) => ({ flagId: f.id, detail: f.message, by: f.markedByName, at: f.markedAt.toISOString() })),
  };
}
