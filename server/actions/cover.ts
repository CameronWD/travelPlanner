"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";
import { scheduleBlobDeletion } from "@/lib/blob-retention";
import { reportError } from "@/lib/error-sink";
import { readImageSize } from "@/lib/image-size";
import { checkQuota } from "@/lib/storage-quota";
import { coverSmallKeyFor } from "@/lib/cover";

export type CoverActionResult =
  | { success: true }
  | { success: false; error: string };

/** The small copy is a browser-made ~480px WebP (lib/image-compress.ts compressCoverSmall); anything bigger isn't one. */
const MAX_SMALL_COVER_BYTES = 512 * 1024;

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
  const fileSmall = formData.get("fileSmall");
  const small =
    fileSmall instanceof File && fileSmall.type === "image/webp" && fileSmall.size > 0 && fileSmall.size <= MAX_SMALL_COVER_BYTES
      ? fileSmall
      : null;

  await requireTripAccess(tripId);

  const validation = validateUpload({ mime: file.type, size: file.size });
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }
  if (!file.type.startsWith("image/")) {
    return { success: false, error: "Cover must be an image (PNG, JPEG, WebP or GIF)." };
  }

  // Quota (spec 2026-10-02 §B): a Trip cover creates no Attachment row, so
  // it counts only toward the global cap.
  const quota = await checkQuota({ tripId: null, size: file.size + (small?.size ?? 0) });
  if (!quota.ok) return { success: false, error: quota.error };

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { coverImageKey: true, coverSmallKey: true },
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

  // Spec 2026-10-06 §H: the small copy is best-effort — without it the
  // route serves the large one, as for every cover uploaded before it.
  let smallKey: string | null = null;
  if (small) {
    const k = coverSmallKeyFor(key);
    try {
      await storage.save(k, Buffer.from(await small.arrayBuffer()), "image/webp");
      smallKey = k;
    } catch (err) {
      await reportError(err, { route: "server/actions/cover.ts#setTripCover", source: "server" });
    }
  }

  // Schedule the previous cover blob for retention/sweep (ARCH-DAT-3) rather
  // than destroying it synchronously.
  const replaced = [trip.coverImageKey, trip.coverSmallKey].filter(
    (k): k is string => k != null && k !== key && k !== smallKey,
  );
  if (replaced.length > 0) {
    await scheduleBlobDeletion(replaced);
  }

  // Spec F: width/height, read from the image's header bytes — never a full
  // decode. Null when the format/bytes can't be parsed; the trips-list card
  // then falls back to its own client-side portrait detection.
  const size = readImageSize(bytes);
  const coverAspect = size ? size.width / size.height : null;

  await db.trip.update({
    where: { id: tripId },
    data: { coverImageKey: key, coverSmallKey: smallKey, coverFocalX: null, coverFocalY: null, coverAspect },
  });

  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);
  return { success: true };
}

/** Remove a trip's cover photo (reverts to the route sketch / passport stamp fallback). */
export async function removeTripCover(tripId: string): Promise<CoverActionResult> {
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { coverImageKey: true, coverSmallKey: true },
  });
  if (!trip) return { success: false, error: "Trip not found." };

  if (trip.coverImageKey) {
    // Schedule for retention/sweep (ARCH-DAT-3) rather than destroying now.
    await scheduleBlobDeletion([trip.coverImageKey, trip.coverSmallKey].filter((k): k is string => k != null));
    await db.trip.update({
      where: { id: tripId },
      data: { coverImageKey: null, coverSmallKey: null, coverFocalX: null, coverFocalY: null, coverAspect: null },
    });
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
