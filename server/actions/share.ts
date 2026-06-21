"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";

// ---------------------------------------------------------------------------
// Share link actions
//
// One ShareLink per trip (unique on tripId).
// Creating is idempotent — returns the existing token rather than replacing it.
// Rotating explicitly replaces the token with a freshly-generated one.
// Revoking deletes the row entirely.
// ---------------------------------------------------------------------------

/**
 * Return { token } for the trip's existing share link, or create one if none
 * exists (idempotent — calling twice returns the same token).
 *
 * Access-checked: the calling user must be a member of the trip.
 */
export async function createShareLink(
  tripId: string,
): Promise<{ token: string }> {
  await requireTripAccess(tripId);

  // Check for an existing share link first
  const existing = await db.shareLink.findFirst({
    where: { tripId },
    select: { token: true },
  });

  if (existing) {
    revalidatePath(`/trips/${tripId}/settings`);
    return { token: existing.token };
  }

  // Generate a URL-safe, unguessable token
  const token = crypto.randomUUID();

  const created = await db.shareLink.create({
    data: { tripId, token },
    select: { token: true },
  });

  revalidatePath(`/trips/${tripId}/settings`);
  return { token: created.token };
}

/**
 * Replace the trip's share token with a new one (rotate).
 *
 * Access-checked. The old link becomes immediately invalid.
 */
export async function rotateShareLink(
  tripId: string,
): Promise<{ token: string }> {
  await requireTripAccess(tripId);

  const newToken = crypto.randomUUID();

  // upsert so rotating works whether or not a link already exists.
  const updated = await db.shareLink.upsert({
    where: { tripId },
    update: { token: newToken },
    create: { tripId, token: newToken },
    select: { token: true },
  });

  revalidatePath(`/trips/${tripId}/settings`);
  return { token: updated.token };
}

/**
 * Delete the trip's share link (revoke).
 *
 * Access-checked. Anyone who had the old link can no longer view the itinerary.
 */
export async function revokeShareLink(tripId: string): Promise<void> {
  await requireTripAccess(tripId);

  // deleteMany so revoking is a no-op (not an error) when no link exists.
  await db.shareLink.deleteMany({
    where: { tripId },
  });

  revalidatePath(`/trips/${tripId}/settings`);
}

/**
 * Return the existing { token } for a trip's share link, or null if none.
 *
 * Access-checked. Used by the Settings page to display the current share URL.
 */
export async function getShareLink(
  tripId: string,
): Promise<{ token: string } | null> {
  await requireTripAccess(tripId);

  const link = await db.shareLink.findFirst({
    where: { tripId },
    select: { token: true },
  });

  return link ? { token: link.token } : null;
}
