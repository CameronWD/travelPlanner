"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { voteLevelSchema, type VoteLevel } from "@/lib/enums";
import { recordActivity } from "@/server/actions/activity";
import { entityLabel, voteSummary } from "@/lib/activity";
import type { ActionResult } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type VoteActionResult = ActionResult;

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
    select: { id: true, tripId: true, title: true },
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
  const item = await requireItemInTrip(tripId, itemId);

  const previous = await db.vote.findUnique({
    where: {
      tripId_itemId_userId: {
        tripId,
        itemId,
        userId: user.id,
      },
    },
    select: { level: true },
  });

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

  // ADR 0012 amendment 2026-10-11. Votes sit on the trip-wide Wishlist, so
  // there is no fork gate. Re-picking the level you already had is not news.
  const previousLevel = (previous?.level ?? null) as VoteLevel | null;
  if (previousLevel !== parsedLevel.data) {
    await recordActivity({
      tripId,
      verb: previousLevel === null ? "CREATED" : "UPDATED",
      entityType: "VOTE",
      entityId: itemId,
      entityLabel: entityLabel("VOTE", { title: item.title }),
      changes: voteSummary(item.title, previousLevel, parsedLevel.data),
    });
  }

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
