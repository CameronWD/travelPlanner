"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      const json = subscription.toJSON();
      await subscribeToPush({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: (json.keys as Record<string, string>)?.p256dh ?? "",
          auth: (json.keys as Record<string, string>)?.auth ?? "",
        },
      });

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
