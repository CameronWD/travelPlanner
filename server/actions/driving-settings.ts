"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Update a trip's offline drive-estimate settings. Values are clamped to sane
 * ranges (winding 1.0–3.0, speed 20–150 km/h). Access-checked.
 */
export async function updateDrivingSettings(
  tripId: string,
  input: { windingFactor: number; avgSpeedKph: number },
): Promise<void> {
  await requireTripAccess(tripId);
  await db.trip.update({
    where: { id: tripId },
    data: {
      drivingWindingFactor: clamp(input.windingFactor, 1.0, 3.0),
      drivingAvgSpeedKph: Math.round(clamp(input.avgSpeedKph, 20, 150)),
    },
  });
  revalidatePath(`/trips/${tripId}/settings`);
  revalidatePath(`/trips/${tripId}/plan`);
  revalidatePath(`/trips/${tripId}/summary`);
}
