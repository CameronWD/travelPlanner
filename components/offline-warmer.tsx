"use client";

import { useEffect, useSyncExternalStore } from "react";
import { beginWarm, cancelWarm, finishWarm, getStatus, subscribe } from "@/lib/offline-status";

/**
 * Background-warms the SW cache with a trip's key pages so they're available
 * offline later — the Trip becomes Saved for offline (CONTEXT.md). Fire-and-
 * forget; never throws; renders nothing. The network-first SW caches each
 * successful GET as an offline fallback.
 *
 * Progress goes to lib/offline-status.ts so the Trip's Settings row can show
 * it; "Save again" there bumps `requestId`, which re-runs this effect.
 */
export function OfflineWarmer({ tripId, paths }: { tripId: string; paths: string[] }) {
  const requestId = useSyncExternalStore(subscribe, () => getStatus(tripId).requestId, () => 0);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    // Only warm when a SW is actually controlling the page (prod); otherwise
    // these fetches do nothing useful — and the status stays "Not saved yet".
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;

    let cancelled = false;
    const warm = async () => {
      if (cancelled) return;
      beginWarm(tripId);
      for (const path of paths) {
        if (cancelled) return;
        try {
          await fetch(path, { cache: "no-store" });
        } catch {
          // ignore — best-effort warming
        }
      }
      if (!cancelled) finishWarm(tripId);
    };
    // Defer to idle so it never competes with the page the user is viewing.
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(() => void warm());
    else setTimeout(() => void warm(), 1500);

    return () => {
      cancelled = true;
      cancelWarm(tripId);
    };
  }, [tripId, paths, requestId]);

  return null;
}
