"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";

// ---------------------------------------------------------------------------
// Calendar feed actions
//
// One CalendarFeed per trip (unique on tripId).
// Creating is idempotent — returns the existing token rather than replacing it.
// Rotating explicitly replaces the token with a freshly-generated one (upsert).
// Revoking deletes the row entirely (deleteMany so it's a no-op when none exists).
// ---------------------------------------------------------------------------

export type CalendarFeedState = {
  token: string;
  includeTransport: boolean;
  includeAccommodation: boolean;
  includeActivities: boolean;
};

/**
 * Return the trip's calendar feed (token + type filters), or null if none.
 *
 * Access-checked: the calling user must be a member of the trip.
 */
export async function getCalendarFeed(
  tripId: string,
): Promise<CalendarFeedState | null> {
  await requireTripAccess(tripId);

  const feed = await db.calendarFeed.findFirst({
    where: { tripId },
    select: {
      token: true,
      includeTransport: true,
      includeAccommodation: true,
      includeActivities: true,
    },
  });

  return feed ?? null;
}

/**
 * Return { token } for the trip's existing calendar feed, or create one if none
 * exists (idempotent — calling twice returns the same token).
 *
 * Access-checked: the calling user must be a member of the trip.
 */
export async function createCalendarFeed(
  tripId: string,
): Promise<{ token: string }> {
  await requireTripAccess(tripId);

  const existing = await db.calendarFeed.findFirst({
    where: { tripId },
    select: { token: true },
  });

  if (existing) {
    revalidatePath(`/trips/${tripId}/settings`);
    return { token: existing.token };
  }

  const token = crypto.randomUUID();

  const created = await db.calendarFeed.create({
    data: { tripId, token },
    select: { token: true },
  });

  revalidatePath(`/trips/${tripId}/settings`);
  return { token: created.token };
}

/**
 * Replace the trip's calendar feed token with a new one (rotate).
 *
 * Access-checked. The old subscription URL becomes immediately invalid.
 */
export async function rotateCalendarFeed(
  tripId: string,
): Promise<{ token: string }> {
  await requireTripAccess(tripId);

  const newToken = crypto.randomUUID();

  // upsert so rotating works whether or not a feed already exists.
  const updated = await db.calendarFeed.upsert({
    where: { tripId },
    update: { token: newToken },
    create: { tripId, token: newToken },
    select: { token: true },
  });

  revalidatePath(`/trips/${tripId}/settings`);
  return { token: updated.token };
}

/**
 * Delete the trip's calendar feed (revoke).
 *
 * Access-checked. Anyone subscribed to the old URL will receive 404 after this.
 */
export async function revokeCalendarFeed(tripId: string): Promise<void> {
  await requireTripAccess(tripId);

  // deleteMany so revoking is a no-op (not an error) when no feed exists.
  await db.calendarFeed.deleteMany({
    where: { tripId },
  });

  revalidatePath(`/trips/${tripId}/settings`);
}

/**
 * Update which event types the trip's calendar feed publishes. No-op (safe)
 * when no feed exists. Same token/URL — calendars pick up the change on their
 * next refresh.
 *
 * Access-checked: the calling user must be a member of the trip.
 */
export async function updateCalendarFeedFilter(
  tripId: string,
  filter: {
    includeTransport: boolean;
    includeAccommodation: boolean;
    includeActivities: boolean;
  },
): Promise<void> {
  await requireTripAccess(tripId);

  await db.calendarFeed.updateMany({
    where: { tripId },
    data: {
      includeTransport: filter.includeTransport,
      includeAccommodation: filter.includeAccommodation,
      includeActivities: filter.includeActivities,
    },
  });

  revalidatePath(`/trips/${tripId}/settings`);
}
