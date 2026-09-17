"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { dispatchDigest } from "@/lib/digest-dispatch";
import { isPushConfigured } from "@/lib/push";
import { todayISOInZone } from "@/lib/tz";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface DigestSettings {
  enabled: boolean;
  /** Most recently subscribed device, or null when none. */
  device: { timezone: string | null; subscribedAt: Date } | null;
}

export type SendTestDigestResult =
  | { ok: true; sent: number }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Read the current user's Digest settings for a trip: whether the Digest is
 * on, and the most recently subscribed device (if any).
 *
 * A missing DigestPreference row means enabled — subscribing a device is
 * itself the opt-in (see lib/digest-dispatch.ts), so this mirrors that
 * default rather than reporting a false "off".
 */
export async function getDigestSettings(tripId: string): Promise<DigestSettings> {
  const { user } = await requireTripAccess(tripId);

  const [preference, devices] = await Promise.all([
    db.digestPreference.findUnique({
      where: { userId_tripId: { userId: user.id, tripId } },
      select: { enabled: true },
    }),
    db.pushSubscription.findMany({
      where: { userId: user.id },
      select: { timezone: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const newest = devices[0] ?? null;

  return {
    enabled: preference ? preference.enabled : true,
    // A device with no stored timezone is a device the dispatcher can't
    // schedule for — surface that honestly rather than inventing "UTC".
    device: newest ? { timezone: newest.timezone, subscribedAt: newest.createdAt } : null,
  };
}

/**
 * Turn the current user's Digest for a trip on or off.
 */
export async function setDigestEnabled(
  tripId: string,
  enabled: boolean,
): Promise<{ ok: true }> {
  const { user } = await requireTripAccess(tripId);

  await db.digestPreference.upsert({
    where: { userId_tripId: { userId: user.id, tripId } },
    create: { userId: user.id, tripId, enabled },
    update: { enabled },
  });

  revalidatePath(`/trips/${tripId}/settings`);
  return { ok: true };
}

/**
 * Send a one-off test Digest to the current user's device(s) for this trip.
 *
 * Two preconditions are checked BEFORE `dispatchDigest` is ever called,
 * because `dispatchDigest` claims its ledger row before it sends — even when
 * `force: true` skips that ledger for the test send itself, calling it while
 * push is unconfigured or the user owns no subscriptions would let it look
 * like it tried when nothing could ever have reached a device:
 *
 * 1. Push must be configured on this deployment at all.
 * 2. The user must own at least one PushSubscription.
 *
 * Beyond that, this must never report success when nothing was delivered:
 * `dispatchDigest`'s `sent: 0` (whatever the reason, including "empty") is
 * surfaced as a truthful, specific failure rather than `{ ok: true }`.
 */
export async function sendTestDigest(tripId: string): Promise<SendTestDigestResult> {
  const { user } = await requireTripAccess(tripId);

  if (!isPushConfigured()) {
    return {
      ok: false,
      error: "Push notifications are not configured on this deployment.",
    };
  }

  const devices = await db.pushSubscription.findMany({
    where: { userId: user.id },
    select: { timezone: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const newest = devices[0] ?? null;
  if (!newest) {
    return { ok: false, error: "No device is subscribed yet. Press Enable first." };
  }

  const localDate = todayISOInZone(newest.timezone ?? "UTC");

  const result = await dispatchDigest({
    userId: user.id,
    tripId,
    localDate,
    slot: "EVENING",
    force: true,
  });

  if (result.sent === 0) {
    if (result.reason === "empty") {
      return {
        ok: false,
        error:
          "Nothing to send right now — a test needs at least one thing due, a reminder today, or tomorrow's plan.",
      };
    }
    return { ok: false, error: "The test Digest could not be delivered." };
  }

  return { ok: true, sent: result.sent };
}
