"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";

export type CoverActionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Set (or replace) a trip's cover photo. FormData: tripId (string), file (File).
 * Image-only, one per trip — replacing deletes the previous blob (best-effort).
 */
export async function setTripCover(formData: FormData): Promise<CoverActionResult> {
  const tripId = formData.get("tripId");
  const file = formData.get("file");

  if (typeof tripId !== "string" || !tripId) {
    return { success: false, error: "Missing tripId." };
  }
  if (!(file instanceof File)) {
    return { success: false, error: "No file provided." };
  }

  await requireTripAccess(tripId);

  const validation = validateUpload({ mime: file.type, size: file.size });
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }
  if (!file.type.startsWith("image/")) {
    return { success: false, error: "Cover must be an image (PNG, JPEG, WebP or GIF)." };
  }

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { coverImageKey: true },
  });
  if (!trip) return { success: false, error: "Trip not found." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();
  const key = generateKey(tripId, crypto.randomUUID(), `cover-${file.name}`);
  await storage.save(key, bytes, file.type);

  // Best-effort cleanup of the previous cover blob.
  if (trip.coverImageKey && trip.coverImageKey !== key) {
    await storage.delete(trip.coverImageKey).catch(() => {});
  }

  await db.trip.update({ where: { id: tripId }, data: { coverImageKey: key } });

  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);
  return { success: true };
}

/** Remove a trip's cover photo (reverts to the route-render/monogram fallback). */
export async function removeTripCover(tripId: string): Promise<CoverActionResult> {
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { coverImageKey: true },
  });
  if (!trip) return { success: false, error: "Trip not found." };

  if (trip.coverImageKey) {
    await getStorage().delete(trip.coverImageKey).catch(() => {});
    await db.trip.update({ where: { id: tripId }, data: { coverImageKey: null } });
  }

  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);
  return { success: true };
}
