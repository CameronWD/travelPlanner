"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deviceTimeZone } from "@/lib/tz";
import { subscribeToPush } from "@/server/actions/push";
import { isIosWithoutInstall, isPushSupported } from "@/components/account/device-state";

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
 * Pulled out of the `EnableDevice` button so `DevicesPanel` can drive the
 * same subscribe flow from its own button — it renders its own copy for the
 * needsInstall / denied / unsupported states (driven by the async
 * `readLocalDeviceState`, Task 5) rather than `EnableDevice`'s synchronous
 * `isPushSupported()` check, which reads real browser globals `EnableDevice`
 * has no way to have injected for a test.
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Status = "idle" | "loading" | "enabled" | "denied" | "error";

interface EnableDeviceProps {
  /** Optional extra className for the wrapper */
  className?: string;
  /** Called after a successful subscribe + persist, so a caller such as
   * DevicesPanel can refresh whatever list of Devices it is showing. */
  onEnabled?: () => void;
}

/**
 * Enable Device button — the only way a browser subscribes itself to the
 * Digest (CONTEXT.md **Device**).
 *
 * - When VAPID public key is not configured OR push is not supported,
 *   renders a disabled state with a hint — never crashes.
 * - On success, calls the subscribeToPush server action to persist the
 *   PushSubscription to the database, then `onEnabled`.
 * - Graceful: all errors are caught and surfaced as UI state.
 */
export function EnableDevice({ className, onEnabled }: EnableDeviceProps) {
  const [status, setStatus] = useState<Status>("idle");

  const supported = isPushSupported();
  const configured = isPushConfigured();

  if (isIosWithoutInstall()) {
    return (
      <div className={className}>
        <Button variant="outline" size="sm" disabled className="gap-2">
          <BellOff className="size-4" aria-hidden="true" />
          Add to Home Screen first
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          iPhone only sends a digest to an installed app. Tap Share, then
          &ldquo;Add to Home Screen&rdquo;, open TEEPEE from there, and this
          will work.
        </p>
      </div>
    );
  }

  if (!supported || !configured) {
    return (
      <div className={className}>
        <Button variant="outline" size="sm" disabled className="gap-2">
          <BellOff className="size-4" aria-hidden="true" />
          Digests unavailable
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          {!configured
            ? "Digests need setup — ask the admin to configure the VAPID keys."
            : "This browser can't receive a digest."}
        </p>
      </div>
    );
  }

  if (status === "enabled") {
    return (
      <div className={className}>
        <Button variant="outline" size="sm" disabled className="gap-2">
          <Bell className="size-4 text-primary" aria-hidden="true" />
          Digest enabled on this device
        </Button>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className={className}>
        <Button variant="outline" size="sm" disabled className="gap-2">
          <BellOff className="size-4" aria-hidden="true" />
          Digests blocked
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          Allow them for TEEPEE in your browser or phone settings, then come
          back.
        </p>
      </div>
    );
  }

  async function handleEnable() {
    setStatus("loading");
    const result = await subscribeThisDevice();
    if (!result.ok) {
      setStatus(result.reason);
      return;
    }
    setStatus("enabled");
    onEnabled?.();
  }

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleEnable}
        loading={status === "loading"}
        className="gap-2"
      >
        <Bell className="size-4" aria-hidden="true" />
        Enable on this device
      </Button>
      {status === "error" && (
        <p className="mt-1 text-xs text-destructive">
          Couldn&rsquo;t enable digests on this device. Please try again.
        </p>
      )}
    </div>
  );
}
