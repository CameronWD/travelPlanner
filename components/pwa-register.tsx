"use client";

import { useEffect } from "react";

/**
 * Registers the TEEPEE service worker in production.
 *
 * - Only runs in production (NODE_ENV === 'production') to avoid breaking
 *   Next.js HMR in development.
 * - Fails silently so a SW registration issue never crashes the app.
 * - Renders nothing — mount-only side effect.
 */
export function PwaRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Fail silently — a missing or broken SW must never break the app.
    });
    // Ask the browser to protect our cache from storage-pressure eviction —
    // an installed PWA is generally granted this. Best-effort, fire-and-forget.
    navigator.storage?.persist?.().catch(() => {
      /* Fail silently */
    });
  }, []);

  return null;
}
