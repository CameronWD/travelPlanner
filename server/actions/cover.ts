"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";
import { scheduleBlobDeletion } from "@/lib/blob-retention";
import { reportError } from "@/lib/error-sink";

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
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
  const key = generateKey({ trip: tripId }, crypto.randomUUID(), `cover.${ext}`);
  try {
    await storage.save(key, bytes, file.type);
  } catch (err) {
    // Blob-first order: nothing has been written to the Trip row yet, so a
    // failed write needs no cleanup — just report it honestly.
    await reportError(err, {
      route: "server/actions/cover.ts#setTripCover",
      source: "server",
    });
    return { success: false, error: "Upload failed — nothing was saved. Please try again." };
  }

  // Schedule the previous cover blob for retention/sweep (ARCH-DAT-3) rather
  // than destroying it synchronously.
  if (trip.coverImageKey && trip.coverImageKey !== key) {
    await scheduleBlobDeletion([trip.coverImageKey]);
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
    // Schedule for retention/sweep (ARCH-DAT-3) rather than destroying now.
    await scheduleBlobDeletion([trip.coverImageKey]);
    await db.trip.update({ where: { id: tripId }, data: { coverImageKey: null } });
  }

  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);
  return { success: true };
}

function clampUnit(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Set where the cover photo's `object-cover` crop centres (spec E2): x and y
 * are fractions 0–1 across and down the photo. A point outside the photo is
 * clamped to its edge; a non-number is refused.
 */
export async function setCoverFocal(tripId: string, x: number, y: number): Promise<CoverActionResult> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { success: false, error: "That point isn't on the photo." };
  }

  await requireTripAccess(tripId);

  await db.trip.update({
    where: { id: tripId },
    data: { coverFocalX: clampUnit(x), coverFocalY: clampUnit(y) },
  });

  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);
  return { success: true };
}
