import { loadBookingConfirmationsToAdd } from "@/lib/booking-confirmations-loader";
import type { NeedsConfirmation } from "./plan-shapes";

export async function loadNeedsConfirmation(tripId: string, viewerId: string | null): Promise<NeedsConfirmation> {
  if (!viewerId) return new Set();
  return new Set((await loadBookingConfirmationsToAdd(tripId, viewerId)).map((c) => c.id));
}
