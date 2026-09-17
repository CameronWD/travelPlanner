"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { deviceLabelFromUserAgent } from "@/lib/device-label";
import { isDeviceStale, needsTouch } from "@/lib/devices";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * A **Device** as the Account list renders it.
 *
 * Deliberately carries NO endpoint and no keys. The endpoint is a capability
 * URL — anyone holding it can push to that Device — and it belongs only to the
 * browser that owns it. `isThisDevice` is resolved on the server precisely so
 * the page never has to receive the set of endpoints in order to compare them.
 */
export interface DeviceSummary {
  id: string;
  label: string | null;
  timezone: string | null;
  subscribedAt: Date;
  lastSeenAt: Date;
  isThisDevice: boolean;
  stale: boolean;
}

export interface ReconcileDeviceInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timezone?: string;
  userAgent?: string;
}

export interface ReconcileDeviceResult {
  known: boolean;
  healed: boolean;
}

export type RemoveDeviceResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * "I am here, I still have permission, and this is my timezone."
 *
 * Called on every authenticated page load by the browser that owns the
 * subscription (components/account/device-sync.tsx). It is the ONLY evidence
 * TEEPEE ever gets that a Device is alive: a push service accepts and reports
 * success for a subscription whose web app has been deleted, so silence from
 * the Device is the single available signal (ADR 0048).
 *
 * Reads always, writes rarely — only when the timezone moved, the row was
 * missing, or `lastSeenAt` has aged past `DEVICE_TOUCH_AFTER_MS`. Any
 * signed-in request has already woken the database for the session, so the
 * read costs nothing extra; the write is what ADR 0047's CU-hour budget cares
 * about.
 */
export async function reconcileDevice(
  input: ReconcileDeviceInput,
): Promise<ReconcileDeviceResult> {
  const user = await requireUser();
  const now = new Date();

  const existing = await db.pushSubscription.findUnique({
    where: { endpoint: input.endpoint },
  });

  // Self-heal. The browser holds a live subscription we have no record of —
  // the Traveller already granted permission on this Device, so recreating the
  // row is restoring a fact, not subscribing somebody without asking.
  if (!existing) {
    await db.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        label: deviceLabelFromUserAgent(input.userAgent),
        lastSeenAt: now,
        ...(input.timezone ? { timezone: input.timezone } : {}),
      },
    });
    return { known: true, healed: true };
  }

  // Someone else's row on this machine — a shared computer, or an account
  // switch. Reassigning it would hand one person's Digest to another.
  if (existing.userId !== user.id) {
    return { known: false, healed: false };
  }

  const zoneMoved = !!input.timezone && input.timezone !== existing.timezone;
  const shouldTouch = needsTouch(existing.lastSeenAt, now);

  if (zoneMoved || shouldTouch) {
    await db.pushSubscription.update({
      where: { endpoint: input.endpoint },
      // `label` is absent on purpose: it is captured once, when the Device is
      // enabled, and never re-derived. A browser update must not be able to
      // quietly rename a Device that has been in the list for months.
      data: {
        lastSeenAt: now,
        ...(zoneMoved ? { timezone: input.timezone } : {}),
      },
    });
  }

  return { known: true, healed: false };
}

/**
 * Every Device this Traveller has, newest first.
 *
 * `currentEndpoint` is the caller's own live subscription endpoint, or null
 * when this browser holds none — which is itself the answer the Account page
 * most needs, since a Traveller with Devices on file but none of them *here*
 * is exactly the state that made a dead phone look healthy.
 */
export async function listDevices(
  currentEndpoint: string | null,
): Promise<DeviceSummary[]> {
  const user = await requireUser();
  const now = new Date();

  const rows = await db.pushSubscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    timezone: r.timezone,
    subscribedAt: r.createdAt,
    lastSeenAt: r.lastSeenAt,
    isThisDevice: !!currentEndpoint && r.endpoint === currentEndpoint,
    stale: isDeviceStale(r.lastSeenAt, now),
  }));
}

/**
 * Forget a Device.
 *
 * Takes a row id, not an endpoint: `DeviceSummary` deliberately carries no
 * endpoint, and this is the action for removing a Device that is NOT the one
 * you are holding. Scoped to the caller's own rows, so one Traveller can never
 * remove the other's.
 *
 * This only deletes TEEPEE's record — no server can revoke a browser's
 * permission remotely, so a Device that still holds one re-registers itself
 * through `reconcileDevice` the next time it is opened, and the UI says so out
 * loud (ADR 0048). Removing the CURRENT Device is a different job and takes a
 * different path: `subscription.unsubscribe()` in the browser first, then
 * `unsubscribeFromPush(endpoint)`.
 */
export async function removeDeviceById(id: string): Promise<RemoveDeviceResult> {
  const user = await requireUser();

  try {
    await db.pushSubscription.deleteMany({ where: { id, userId: user.id } });
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't remove that device." };
  }
}
