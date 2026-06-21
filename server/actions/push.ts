"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type PushActionResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Subscribe the current user to web push notifications.
 *
 * Upserts a PushSubscription by endpoint, so re-subscribing with the same
 * endpoint updates the keys rather than creating a duplicate.
 */
export async function subscribeToPush(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<PushActionResult> {
  const user = await requireUser();

  try {
    await db.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      update: {
        userId: user.id,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save push subscription." };
  }
}

/**
 * Unsubscribe the current user's push subscription for the given endpoint.
 *
 * Deletes only if the subscription belongs to the current user, so a user
 * cannot unsubscribe someone else's subscription.
 */
export async function unsubscribeFromPush(
  endpoint: string,
): Promise<PushActionResult> {
  const user = await requireUser();

  try {
    await db.pushSubscription.deleteMany({
      where: { endpoint, userId: user.id },
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to remove push subscription." };
  }
}
