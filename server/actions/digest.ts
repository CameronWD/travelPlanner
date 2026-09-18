"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";
import { dispatchDigest } from "@/lib/digest-dispatch";
import { isPushConfigured } from "@/lib/push";
import { todayISOInZone } from "@/lib/tz";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface DigestSettings {
  enabled: boolean;
  /**
   * How many Devices this Traveller has on file, at page-load time.
   *
   * Used only as `DigestPanel`'s pre-refetch fallback count, before
   * `listDevices` resolves with the authoritative, `isThisDevice`-attributed
   * list — so this is a `count()`, not a `findMany()`. It used to carry the
   * full row shape (`timezone`, `subscribedAt`, `label`) from Task 8, but
   * `DigestPanel` re-fetches the real rows itself via `listDevices` (ADR
   * 0048) and neither of those fields ever had another consumer — two
   * queries answering "how many devices" was exactly the kind of
   * unobservable duplication this branch exists to remove.
   */
  deviceCount: number;
}

export type SendTestDigestResult =
  /**
   * `placeholder` distinguishes the two successes: false means the real
   * Digest went out, true means there was nothing to say today and the probe
   * payload went instead. Both delivered; they need different copy.
   */
  | { ok: true; sent: number; placeholder: boolean }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Read the current user's Digest settings for a trip: whether the Digest is
 * on, and how many devices are on file for it.
 *
 * A missing DigestPreference row means enabled — subscribing a device is
 * itself the opt-in (see lib/digest-dispatch.ts), so this mirrors that
 * default rather than reporting a false "off".
 */
export async function getDigestSettings(tripId: string): Promise<DigestSettings> {
  const { user } = await requireTripAccess(tripId);

  const [preference, deviceCount] = await Promise.all([
    db.digestPreference.findUnique({
      where: { userId_tripId: { userId: user.id, tripId } },
      select: { enabled: true },
    }),
    db.pushSubscription.count({ where: { userId: user.id } }),
  ]);

  return {
    enabled: preference ? preference.enabled : true,
    deviceCount,
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
 * Beyond that, this must never report success when nothing was delivered: a
 * `sent: 0` from `dispatchDigest` is surfaced as a failure rather than
 * `{ ok: true }`. An *empty* day is no longer one of those cases — the forced
 * dispatch sends a placeholder instead (lib/digest.ts asTestDigest), because
 * this button probes the push pipe and a quiet day says nothing about it.
 */
export async function sendTestDigest(tripId: string): Promise<SendTestDigestResult> {
  const { user } = await requireTripAccess(tripId);

  if (!isPushConfigured()) {
    return {
      ok: false,
      error: "Push is not configured on this deployment — the VAPID keys are missing.",
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
    return { ok: false, error: "The test Digest could not be delivered." };
  }

  return { ok: true, sent: result.sent, placeholder: result.placeholder === true };
}

export interface TripDigestSetting {
  tripId: string;
  tripName: string;
  enabled: boolean;
}

/**
 * Every Trip this Traveller is on, with their own Digest switch for each.
 *
 * The Account view of the same `DigestPreference` rows the Trips' own Settings
 * carry — one fact, two places (CONTEXT.md **Account**). It exists so "am I
 * getting digests, and for what?" is answerable without opening every Trip.
 */
export async function listDigestSettingsForUser(): Promise<TripDigestSetting[]> {
  const user = await requireUser();

  const trips = await db.trip.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      digestPreferences: {
        where: { userId: user.id },
        select: { enabled: true },
      },
    },
  });

  return trips.map((t) => ({
    tripId: t.id,
    tripName: t.name,
    // A missing row means enabled (see `getDigestSettings`): subscribing a
    // Device is itself the opt-in, so absence must not read as "off".
    enabled: t.digestPreferences[0]?.enabled ?? true,
  }));
}
