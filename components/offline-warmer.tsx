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
  // The server layout hands us a fresh `paths` array on every render (each
  // revalidation — a Plan edit, a Settings toggle — builds a new array even
  // when the paths themselves are unchanged). Depending on `paths` directly
  // would cancel and restart the warm on every one of those re-renders, so
  // depend on this content-based key instead and rebuild the list from it.
  const pathsKey = paths.join("\n");

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    // Only warm when a SW is actually controlling the page (prod); otherwise
    // these fetches do nothing useful — and the status stays "Not saved yet".
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;

    const pathList = pathsKey === "" ? [] : pathsKey.split("\n");
    let cancelled = false;
    const warm = async () => {
      if (cancelled) return;
      beginWarm(tripId);
      for (const path of pathList) {
        if (cancelled) return;
        if (typeof caches !== "undefined" && (await caches.match(path).catch(() => undefined))) continue;
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
  }, [tripId, pathsKey, requestId]);

  return null;
}
