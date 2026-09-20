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

export interface HealRotatedInput {
  /** The endpoint that rotated away. Browsers do not reliably supply it. */
  oldEndpoint?: string | null;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timezone?: string;
  userAgent?: string;
}

export type HealRotatedResult =
  | { ok: true; mode: "updated" | "registered" }
  | { ok: false; error: string };

/**
 * Heal a **Device** whose push endpoint rotated underneath it.
 *
 * A push service may rotate an endpoint at any time, including while the app
 * is closed. Until this existed, the stored row went on pointing at the dead
 * endpoint until someone pressed Enable again — the Device looked healthy and
 * received nothing, which is the ADR 0048 failure all over again.
 *
 * Two shapes, because `pushsubscriptionchange` does not reliably carry the old
 * subscription:
 *
 * - **Old endpoint known** — update that row in place. `label`, `timezone` and
 *   `createdAt` survive, so the Device keeps its identity in the Account list
 *   and the Traveller never learns anything happened. `label` is absent from
 *   the write on purpose (ADR 0048: captured once, never re-derived — same
 *   reasoning as `subscribeToPush`, above).
 * - **Old endpoint unknown** — register the new subscription and leave the old
 *   row alone. It drifts into "unseen since" and can be removed by hand. A
 *   tombstone the Traveller can see beats a Device that silently stops
 *   receiving, and TEEPEE never silently drops a Device.
 *
 * Always requires a session. Matching on the old endpoint alone would be a
 * hijack: an endpoint is a capability URL, so anyone holding a victim's could
 * post {old: victim, new: attacker} and have that Traveller's Digests — trip
 * contents and all — delivered to their own device.
 */
export async function healRotatedSubscription(
  input: HealRotatedInput,
): Promise<HealRotatedResult> {
  const user = await requireUser();

  // Same reasoning as reconcileDevice: a pair of empty strings is not a
  // degraded key, it is no key at all, and a row without usable keys is a
  // Device that LOOKS confirmed and can never receive a push.
  if (!input.keys?.p256dh || !input.keys?.auth) {
    return { ok: false, error: "No usable key material." };
  }

  try {
    if (input.oldEndpoint && input.oldEndpoint !== input.endpoint) {
      const existing = await db.pushSubscription.findUnique({
        where: { endpoint: input.oldEndpoint },
      });
      if (existing && existing.userId === user.id) {
        await db.pushSubscription.update({
          where: { endpoint: input.oldEndpoint },
          data: {
            endpoint: input.endpoint,
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
            lastSeenAt: new Date(),
            ...(input.timezone ? { timezone: input.timezone } : {}),
          },
        });
        return { ok: true, mode: "updated" };
      }
      // No row, or somebody else's. Fall through and register the new one:
      // reassigning a row we do not own would hand one person's Digest to
      // another (reconcileDevice makes the same refusal).
    }

    await db.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: user.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        label: deviceLabelFromUserAgent(input.userAgent),
        lastSeenAt: new Date(),
        ...(input.timezone ? { timezone: input.timezone } : {}),
      },
      update: {
        userId: user.id,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        lastSeenAt: new Date(),
        ...(input.timezone ? { timezone: input.timezone } : {}),
      },
    });
    return { ok: true, mode: "registered" };
  } catch {
    return { ok: false, error: "Failed to heal push subscription." };
  }
}
