"use client";

import { useEffect, useSyncExternalStore } from "react";
import { beginWarm, cancelWarm, finishWarm, getStatus, subscribe, takeWarmRequest } from "@/lib/offline-status";
import { isAttachmentRoute, isConstrainedConnection, isCoverRoute, isWarmFresh, type ConnectionHint } from "@/lib/offline";

/**
 * Background-warms the SW cache with a trip's key pages so they're available
 * offline later — the Trip becomes Saved for offline (CONTEXT.md). Fire-and-
 * forget; never throws; renders nothing. The network-first SW caches each
 * successful GET as an offline fallback.
 *
 * Once per few hours (spec 2026-10-06 §A): the automatic run on opening a
 * Trip skips the page paths when the last full warm is under 6 hours old,
 * and skips everything on a connection that asks to save data. "Save again"
 * in Settings bumps `requestId`, re-runs this effect and always warms the
 * pages. A fresh save whose first page is no longer in the cache warms them
 * anyway (spec 2026-10-06 §T). Attachments and the cover keep their own already-cached check.
 *
 * Progress goes to lib/offline-status.ts so the Trip's Settings row can show
 * it.
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
      const forced = takeWarmRequest(tripId);
      // Never on a connection that asks to save data — unless the Traveller
      // pressed "Save again" (CONTEXT.md "Saved for offline").
      const connection = (navigator as Navigator & { connection?: ConnectionHint }).connection;
      if (!forced && isConstrainedConnection(connection)) return;
      let warmPages = forced || !isWarmFresh(getStatus(tripId).savedAt, Date.now());
      // A fresh savedAt only counts if the pages are really still cached: a
      // new worker's activate (spec 2026-10-06 §T), sign-out's CLEAR_CACHE or
      // browser eviction can empty the cache while localStorage still says
      // "saved". Probe the first page path; a miss (or no Cache API) warms.
      if (!warmPages) {
        const firstPage = pathList.find((p) => {
          const u = new URL(p, window.location.origin).toString();
          return !isAttachmentRoute(u) && !isCoverRoute(u);
        });
        if (firstPage !== undefined) {
          const hit = typeof caches !== "undefined" ? await caches.match(firstPage).catch(() => undefined) : undefined;
          if (cancelled) return;
          if (!hit) warmPages = true;
        }
      }
      if (warmPages) beginWarm(tripId);
      for (const path of pathList) {
        if (cancelled) return;
        // `path` is origin-relative, but isAttachmentRoute/isCoverRoute parse
        // a full URL, so resolve it against the current origin first.
        const absoluteUrl = new URL(path, window.location.origin).toString();
        // Attachments and the cover are immutable once cached (an Attachment
        // id never changes content; the cover changes its own `?v=`), so they
        // skip on a cache hit. Pages always re-fetch when they are warmed, so
        // "Save again" really refreshes them.
        const isFile = isAttachmentRoute(absoluteUrl) || isCoverRoute(absoluteUrl);
        if (!isFile && !warmPages) continue;
        if (isFile && typeof caches !== "undefined" && (await caches.match(path).catch(() => undefined))) continue;
        try {
          await fetch(path, { cache: "no-store" });
        } catch {
          // ignore — best-effort warming
        }
      }
      // Only a run that warmed the pages counts as a save (its timestamp is
      // what the 6-hour skip reads).
      if (!cancelled && warmPages) finishWarm(tripId);
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
