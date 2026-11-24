"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { beginWarm, cancelWarm, currentBuildId, finishWarm, getStatus, markPagesStale, recordFileShortfall, subscribe, takeWarmRequest } from "@/lib/offline-status";
import { assetUrlsIn, isAttachmentRoute, isCachedTripHome, isConstrainedConnection, isCoverRoute, isWarmFresh, SAVED_COPY_HEADER, STALE_WARM_DELAY_MS, WARM_REQUEST_HEADER, warmUrlFor, type ConnectionHint } from "@/lib/offline";

const FILE_STORED_WAITS_MS = [0, 250, 750];

const DAY_PAGE = /\/day\/\d{4}-\d{2}-\d{2}$/;
const DAY_PAGE_WARM = { cache: "no-store", headers: { [WARM_REQUEST_HEADER]: "1" } } satisfies RequestInit;

// The worker writes a file to the cache as its body arrives, a moment after
// the page has read the same bytes (longer for a large file on a slow phone),
// so a miss gets two more looks, 250 ms and 1 s after the first.
async function fileIsStored(path: string): Promise<boolean> {
  if (typeof caches === "undefined") return true;
  for (const wait of FILE_STORED_WAITS_MS) {
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const hit = await caches.match(path).catch(() => undefined);
    if (hit && !hit.redirected) return true;
  }
  return false;
}

function subscribeToController(onChange: () => void): () => void {
  if (!("serviceWorker" in navigator)) return () => {};
  navigator.serviceWorker.addEventListener("controllerchange", onChange);
  return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
}

function hasController(): boolean {
  return "serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller);
}

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
 * anyway (spec 2026-10-06 §T), and so does a save made under a different
 * build: its pages point at that deploy's chunks, so the first open after a
 * deploy re-warms them. Attachments and the cover keep their own already-cached check.
 *
 * A change to the Trip (`changeStamp`, the newest Activity row) leaves the
 * saved pages one edit behind: it marks them stale and, STALE_WARM_DELAY_MS
 * after the latest change, re-warms them. That run is automatic, not "Save
 * again", so a connection that asks to save data still skips it.
 *
 * Progress goes to lib/offline-status.ts so the Trip's Settings row can show
 * it.
 */
export function OfflineWarmer({ tripId, paths, changeStamp }: { tripId: string; paths: string[]; changeStamp: string | null }) {
  const requestId = useSyncExternalStore(subscribe, () => getStatus(tripId).requestId, () => 0);
  const controlled = useSyncExternalStore(subscribeToController, hasController, () => false);
  // The server layout hands us a fresh `paths` array on every render (each
  // revalidation — a Plan edit, a Settings toggle — builds a new array even
  // when the paths themselves are unchanged). Depending on `paths` directly
  // would cancel and restart the warm on every one of those re-renders, so
  // depend on this content-based key instead and rebuild the list from it.
  const pathsKey = paths.join("\n");
  const [staleRuns, setStaleRuns] = useState(0);
  const seenStamp = useRef(changeStamp);

  useEffect(() => {
    if (changeStamp === seenStamp.current) return;
    seenStamp.current = changeStamp;
    markPagesStale(tripId);
    const timer = setTimeout(() => {
      // A run already in flight finishes by clearing the flag, so set it again for this one.
      markPagesStale(tripId);
      setStaleRuns((n) => n + 1);
    }, STALE_WARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [tripId, changeStamp]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    // Only warm when a SW is actually controlling the page (prod); otherwise
    // these fetches do nothing useful — and the status stays "Not saved yet".
    if (!("serviceWorker" in navigator) || !controlled) return;
    const worker = navigator.serviceWorker.controller;
    if (!worker) return;

    const pathList = pathsKey === "" ? [] : pathsKey.split("\n");
    let cancelled = false;
    const warm = async () => {
      if (cancelled) return;
      const forced = takeWarmRequest(tripId);
      // So a cold launch with no signal opens the Trip last opened.
      const home = pathList.find(isCachedTripHome);
      if (home) worker.postMessage({ type: "LAST_TRIP", path: home });
      // Never on a connection that asks to save data — unless the Traveller
      // pressed "Save again" (CONTEXT.md "Saved for offline").
      const connection = (navigator as Navigator & { connection?: ConnectionHint }).connection;
      if (!forced && isConstrainedConnection(connection)) return;
      // A save only counts as fresh under the build it was made with: cached
      // HTML references that deploy's chunks. No recorded build → stale.
      const saved = getStatus(tripId);
      const sameBuild = saved.savedBuild !== null && saved.savedBuild === currentBuildId();
      let warmPages = forced || !sameBuild || !isWarmFresh(saved.savedAt, Date.now()) || saved.pagesFailed || saved.pagesStale;
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
      let total = 0;
      let savedCount = 0;
      let pagesFailed = 0;
      const assetsSeen = new Set<string>();
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
        total++;
        if (isFile && typeof caches !== "undefined") {
          // A redirected entry is one kept before the worker stripped redirects:
          // it fails to open offline, so it counts as missing and is replaced.
          const hit = await caches.match(path).catch(() => undefined);
          if (hit && !hit.redirected) {
            savedCount++;
            continue;
          }
        }
        try {
          // Files ask for their bytes (never a storage redirect); the worker
          // keeps them under the plain path, which is what caches.match checks.
          const response = await fetch(warmUrlFor(path), DAY_PAGE.test(path) ? DAY_PAGE_WARM : { cache: "no-store" });
          if (!response.ok || (isFile && response.redirected)) {
            if (!isFile) pagesFailed++;
            continue;
          }
          // The header marks an older copy the worker answered with because the
          // network failed. It is on the phone, so it counts as held; the
          // refresh failed, so no save is stamped and the next open tries again.
          if (response.headers.get(SAVED_COPY_HEADER)) {
            if (!isFile) {
              savedCount++;
              pagesFailed++;
            }
            continue;
          }
          if (isFile) {
            // Saved means the bytes are in the cache, not that the headers arrived:
            // a download that drops rejects here, and a failed write is a miss.
            await response.arrayBuffer();
            if (await fileIsStored(path)) savedCount++;
            continue;
          }
          // A page is only as saved as the scripts and styles it loads.
          const assets = assetUrlsIn(await response.text()).filter((a) => !assetsSeen.has(a));
          savedCount++;
          for (const asset of assets) {
            if (cancelled) return;
            assetsSeen.add(asset);
            total++;
            if (typeof caches !== "undefined" && (await caches.match(asset).catch(() => undefined))) {
              savedCount++;
              continue;
            }
            try {
              const assetResponse = await fetch(asset);
              if (assetResponse.ok) savedCount++;
              else pagesFailed++;
            } catch {
              pagesFailed++;
            }
          }
        } catch {
          if (!isFile) pagesFailed++;
        }
      }
      if (cancelled) return;
      // Only a run that warmed the pages counts as a save (its timestamp is
      // what the 6-hour skip reads). A run of files alone still reports one it lost.
      if (warmPages) finishWarm(tripId, { total, saved: savedCount, pagesFailed });
      else recordFileShortfall(tripId, { total, saved: savedCount });
    };
    // Defer to idle so it never competes with the page the user is viewing.
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(() => void warm());
    else setTimeout(() => void warm(), 1500);

    return () => {
      cancelled = true;
      cancelWarm(tripId);
    };
  }, [tripId, pathsKey, requestId, controlled, staleRuns]);

  return null;
}
