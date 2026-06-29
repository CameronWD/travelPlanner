"use client";

import { useEffect } from "react";

/**
 * Background-warms the SW cache with a trip's key pages so they're available
 * offline later. Fire-and-forget; never throws; renders nothing. The network-
 * first SW caches each successful GET as an offline fallback.
 */
export function OfflineWarmer({ paths }: { paths: string[] }) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    // Only warm when a SW is actually controlling the page (prod); otherwise
    // these fetches do nothing useful.
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;

    let cancelled = false;
    const warm = async () => {
      for (const path of paths) {
        if (cancelled) return;
        try {
          await fetch(path, { cache: "no-store" });
        } catch {
          // ignore — best-effort warming
        }
      }
    };
    // Defer to idle so it never competes with the page the user is viewing.
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(() => void warm());
    else setTimeout(() => void warm(), 1500);

    return () => { cancelled = true; };
  }, [paths]);

  return null;
}
