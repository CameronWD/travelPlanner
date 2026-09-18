"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { deviceLabelFromUserAgent } from "@/lib/device-label";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type PushActionResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Subscribe the current user to web push.
 *
 * Upserts a PushSubscription by endpoint, so re-subscribing with the same
 * endpoint updates the keys rather than creating a duplicate.
 */
export async function subscribeToPush(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timezone?: string;
  userAgent?: string;
}): Promise<PushActionResult> {
  const user = await requireUser();

  try {
    // Omit `timezone` entirely when the client didn't send one — writing
    // `null` here would wipe a good stored zone whenever an older client
    // re-subscribes, and a subscription with no zone never fires (the
    // dispatcher can't know when 8pm is for it).
    const tz = sub.timezone ? { timezone: sub.timezone } : {};

    await db.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        // Captured once, here, at the moment a Device is enabled. Absent from
        // `update` on purpose (ADR 0048): re-deriving it would let a browser
        // upgrade rename a Device that has been listed for months.
        label: deviceLabelFromUserAgent(sub.userAgent),
        lastSeenAt: new Date(),
        ...tz,
      },
      // `userId: user.id` on `update` is deliberate, and asymmetric with
      // `reconcileDevice` (server/actions/devices.ts), which refuses to touch
      // a row it doesn't already own. This action only ever runs from a
      // traveller explicitly pressing Enable on THIS physical device, so
      // re-pointing an existing row at whoever is signed in now is the
      // correct read of a shared machine changing hands — unlike
      // `reconcileDevice`'s silent, background self-heal, which must never
      // reassign a Device out from under the person it actually belongs to.
      update: {
        userId: user.id,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        lastSeenAt: new Date(),
        ...tz,
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
