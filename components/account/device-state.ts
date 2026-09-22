"use client";

import { isStandalone } from "@/lib/standalone";

/**
 * What THIS browser knows about itself as a **Device** (CONTEXT.md).
 *
 * Three facts live only here and can be obtained nowhere else: whether
 * notification permission is granted, whether a live PushSubscription exists,
 * and what timezone the machine is in. The server can observe none of them —
 * which is why a Device that had lost permission went on looking healthy from
 * every angle TEEPEE could see (ADR 0048).
 */
export type DevicePermission = "granted" | "denied" | "default" | "unsupported";

export interface LocalDeviceState {
  permission: DevicePermission;
  endpoint: string | null;
  keys: { p256dh: string; auth: string } | null;
  needsInstall: boolean;
}

/**
 * iOS permits web push only from a PWA installed to the Home Screen; a plain
 * Safari tab cannot subscribe at all (ADR 0047). Detected so the UI can
 * explain itself instead of offering a button that cannot work.
 */
export function isIosWithoutInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  return !isStandalone();
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function readLocalDeviceState(): Promise<LocalDeviceState> {
  if (!isPushSupported()) {
    return { permission: "unsupported", endpoint: null, keys: null, needsInstall: isIosWithoutInstall() };
  }

  const permission = Notification.permission as DevicePermission;
  const needsInstall = isIosWithoutInstall();

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return { permission, endpoint: null, keys: null, needsInstall };
    }
    const json = subscription.toJSON();
    const keys = (json.keys ?? {}) as Record<string, string>;
    return {
      permission,
      endpoint: subscription.endpoint,
      keys: { p256dh: keys.p256dh ?? "", auth: keys.auth ?? "" },
      needsInstall,
    };
  } catch {
    // A service worker that never becomes ready is indistinguishable from one
    // with no subscription, for every decision the UI makes.
    return { permission, endpoint: null, keys: null, needsInstall };
  }
}
