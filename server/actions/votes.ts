"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { voteLevelSchema, type VoteLevel } from "@/lib/enums";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type VoteActionResult =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Verify that an item belongs to the given trip.
 * Returns the item or throws notFound().
 */
async function requireItemInTrip(tripId: string, itemId: string) {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, tripId: true },
  });
  if (!item || item.tripId !== tripId) {
    notFound();
  }
  return item;
}

function revalidateWishlistPath(tripId: string) {
  revalidatePath(`/trips/${tripId}/wishlist`);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Set (upsert) the current user's vote on an unscheduled wishlist item.
 *
 * - Access-checked: user must be a member of the trip.
 * - Verifies the item belongs to the trip (prevents IDOR).
 * - One vote per (tripId, itemId, userId) — upserts the level.
 */
export async function setVote(
  tripId: string,
  itemId: string,
  level: VoteLevel,
): Promise<VoteActionResult> {
  const { user } = await requireTripAccess(tripId);

  // Validate the level value
  const parsedLevel = voteLevelSchema.safeParse(level);
  if (!parsedLevel.success) {
    return { success: false, errors: { level: ["Invalid vote level"] } };
  }

  // Verify the item belongs to this trip
  await requireItemInTrip(tripId, itemId);

  await db.vote.upsert({
    where: {
      tripId_itemId_userId: {
        tripId,
        itemId,
        userId: user.id,
      },
    },
    update: { level: parsedLevel.data },
    create: {
      tripId,
      itemId,
      userId: user.id,
      level: parsedLevel.data,
    },
  });

  revalidateWishlistPath(tripId);
  return { success: true };
}

/**
 * Clear (delete) the current user's vote on a wishlist item.
 *
 * - Access-checked: user must be a member of the trip.
 * - Verifies the item belongs to the trip.
 * - Silently succeeds if no vote exists (idempotent).
 */
export async function clearVote(
  tripId: string,
  itemId: string,
): Promise<VoteActionResult> {
  const { user } = await requireTripAccess(tripId);

  // Verify the item belongs to this trip
  await requireItemInTrip(tripId, itemId);

  await db.vote.deleteMany({
    where: { tripId, itemId, userId: user.id },
  });

  revalidateWishlistPath(tripId);
  return { success: true };
}
