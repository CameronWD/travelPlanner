"use client";

import { deviceTimeZone } from "@/lib/tz";
import { subscribeToPush } from "@/server/actions/push";

// ---------------------------------------------------------------------------
// VAPID public key — exposed as NEXT_PUBLIC_VAPID_PUBLIC_KEY
// ---------------------------------------------------------------------------

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * Whether this deployment has VAPID keys configured at all — a fact no
 * `LocalDeviceState` can carry, since it is about the server, not the
 * browser. Exported so `DevicesPanel` can gate its own Enable control on it
 * too: without this, a misconfigured deployment would offer a button that
 * can only ever fail (`subscribe()` with an empty applicationServerKey).
 */
export function isPushConfigured(): boolean {
  return !!VAPID_PUBLIC_KEY;
}

// ---------------------------------------------------------------------------
// Helper: convert the URL-safe base64 VAPID public key to a Uint8Array.
// This is the standard approach for applicationServerKey in PushManager.subscribe.
// ---------------------------------------------------------------------------

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Record a browser PushSubscription against the signed-in user, stamped with
 * the zone this browser is in *right now*.
 *
 * `subscribeToPush` upserts on `endpoint`, so re-sending an existing
 * subscription is idempotent and cheap — which is what makes the refresh below
 * safe to run on every visit.
 */
async function persistSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const zone = deviceTimeZone();
  return subscribeToPush({
    endpoint: subscription.endpoint,
    keys: {
      p256dh: (json.keys as Record<string, string>)?.p256dh ?? "",
      auth: (json.keys as Record<string, string>)?.auth ?? "",
    },
    userAgent: navigator.userAgent,
    ...(zone ? { timezone: zone } : {}),
  });
}

export type SubscribeThisDeviceResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "error" };

/**
 * The actual browser mechanics of turning this Device on: request
 * permission, subscribe via PushManager, persist the subscription.
 *
 * Used to sit behind a now-deleted `EnableDevice` button; `DevicesPanel` is
 * its only caller now (Task 8 — Device management moved to Account and Trip
 * Settings no longer renders an Enable control of its own). It renders its
 * own copy for the needsInstall / denied / unsupported states, driven by the
 * async `readLocalDeviceState` (Task 5), rather than a synchronous
 * `isPushSupported()` check that reads real browser globals a test has no
 * way to inject.
 */
export async function subscribeThisDevice(): Promise<SubscribeThisDeviceResult> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "denied" };
    }

    const registration = await navigator.serviceWorker.ready;
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    });

    const result = await persistSubscription(subscription);
    return result.ok ? { ok: true } : { ok: false, reason: "error" };
  } catch (err) {
    console.error("[subscribeThisDevice] failed:", err);
    return { ok: false, reason: "error" };
  }
}
