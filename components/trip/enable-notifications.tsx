"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deviceTimeZone } from "@/lib/tz";
import { subscribeToPush } from "@/server/actions/push";

// ---------------------------------------------------------------------------
// VAPID public key — exposed as NEXT_PUBLIC_VAPID_PUBLIC_KEY
// ---------------------------------------------------------------------------

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

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

// ---------------------------------------------------------------------------
// Detect support
// ---------------------------------------------------------------------------

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/**
 * iOS only permits web push from a PWA installed to the Home Screen — a normal
 * Safari tab cannot subscribe at all (ADR 0047). Detect that state so the
 * button explains itself instead of failing.
 */
export function isIosWithoutInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
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
    ...(zone ? { timezone: zone } : {}),
  });
}

// ---------------------------------------------------------------------------
// PushTimezoneSync
// ---------------------------------------------------------------------------

/**
 * Keep the stored device timezone honest (ADR 0047: the zone is "captured from
 * the browser when a device subscribes **and refreshed on each visit**").
 *
 * Without this there is no refresh path at all: `handleEnable` is the only
 * place a zone is ever written, its button is rendered only while no device
 * exists, `public/sw.js` has no `pushsubscriptionchange` handler, and nothing
 * calls `unsubscribeFromPush`. A traveller who subscribes in Brisbane in
 * October and flies to Vienna on 1 December then gets the whole trip's evening
 * Digest at Brisbane 20:00 — 11:00 Vienna — and the travel-day morning one at
 * 21:00 the evening *before*, with no screen able to correct it.
 *
 * Mounted headless in the trip layout, so "each visit" means each visit rather
 * than each visit to Settings. It is deliberately silent: the fix is a write
 * nobody asked for, and the Settings panel is where the state is explained.
 *
 * Guards, in order:
 *   - unsupported browser or unconfigured deployment → nothing to refresh;
 *   - no live subscription → this browser is not a subscribed device, and
 *     creating one here would be subscribing somebody without asking;
 *   - live zone already equals the stored one → no write;
 *   - a ref keyed on the stored zone, so the effect cannot loop (the write
 *     does not refresh the server prop, so nothing re-triggers it anyway).
 */
export function PushTimezoneSync({ storedZone }: { storedZone: string | null }) {
  const reconciled = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (reconciled.current === storedZone) return;
    reconciled.current = storedZone;

    if (!isPushSupported() || !VAPID_PUBLIC_KEY) return;
    const zone = deviceTimeZone();
    if (!zone || zone === storedZone) return;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        await persistSubscription(subscription);
      } catch (err) {
        // A failed refresh leaves the old zone in place — wrong, but no worse
        // than before, and the Settings panel says so out loud.
        console.error("[PushTimezoneSync] failed to refresh the device timezone:", err);
      }
    })();
  }, [storedZone]);

  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Status = "idle" | "loading" | "enabled" | "denied" | "error";

interface EnableNotificationsProps {
  /** Optional extra className for the wrapper */
  className?: string;
}

/**
 * Enable Notifications button.
 *
 * - When VAPID public key is not configured OR push is not supported,
 *   renders a disabled state with a hint — never crashes.
 * - On success, calls the subscribeToPush server action to persist the
 *   PushSubscription to the database.
 * - Graceful: all errors are caught and surfaced as UI state.
 */
export function EnableNotifications({ className }: EnableNotificationsProps) {
  const [status, setStatus] = useState<Status>("idle");

  const supported = isPushSupported();
  const configured = !!VAPID_PUBLIC_KEY;

  if (isIosWithoutInstall()) {
    return (
      <div className={className}>
        <Button variant="outline" size="sm" disabled className="gap-2">
          <BellOff className="size-4" aria-hidden="true" />
          Add to Home Screen first
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          iPhone only sends reminders to an installed app. Tap Share, then
          &ldquo;Add to Home Screen&rdquo;, open TEEPEE from there, and this
          button will work.
        </p>
      </div>
    );
  }

  if (!supported || !configured) {
    return (
      <div className={className}>
        <Button variant="outline" size="sm" disabled className="gap-2">
          <BellOff className="size-4" aria-hidden="true" />
          Notifications unavailable
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          {!configured
            ? "Notifications need setup — ask the admin to configure VAPID keys."
            : "Your browser doesn't support push notifications."}
        </p>
      </div>
    );
  }

  if (status === "enabled") {
    return (
      <div className={className}>
        <Button variant="outline" size="sm" disabled className="gap-2">
          <Bell className="size-4 text-primary" aria-hidden="true" />
          Reminders enabled
        </Button>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className={className}>
        <Button variant="outline" size="sm" disabled className="gap-2">
          <BellOff className="size-4" aria-hidden="true" />
          Notifications blocked
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          Allow notifications in your browser settings to enable reminders.
        </p>
      </div>
    );
  }

  async function handleEnable() {
    setStatus("loading");

    try {
      // 1. Request permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      // 2. Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // 3. Subscribe via PushManager
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      // 4. Persist to the server
      await persistSubscription(subscription);

      setStatus("enabled");
    } catch (err) {
      console.error("[EnableNotifications] failed:", err);
      setStatus("error");
    }
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
        Enable trip reminders
      </Button>
      {status === "error" && (
        <p className="mt-1 text-xs text-destructive">
          Failed to enable notifications. Please try again.
        </p>
      )}
    </div>
  );
}
