/**
 * Teepee Service Worker
 *
 * Cache strategy source of truth: lib/offline.ts
 * This file mirrors that logic in plain JS — keep them in sync if rules change.
 *
 * Strategy summary:
 *   - Non-GET (mutations / server actions)  → network-only
 *   - Router payloads (RSC) / prefetches     → network-only  (spec 2026-10-06 §T)
 *   - Cross-origin requests                  → network-only
 *   - Same-origin /api/attachments/*         → cache-first   (an Attachment id never changes content)
 *   - Same-origin /api/trips/<id>/cover      → network-first (its ?v= can change)
 *   - Same-origin /api/*                     → network-only  (auth + live data)
 *   - Same-origin /_next/static/*            → cache-first   (immutable hashed assets)
 *   - Everything else (navigations, pages)   → network-first (private per-user data)
 *
 * With the network down, slow or answering 5xx (ADR 0077): a navigation to `/`
 * redirects to the saved Trip, and a navigation that adds a query to a saved
 * page redirects to the plain path, which is then answered from its saved copy.
 *
 * Stores (spec 2026-10-06 §T), oldest entries trimmed past each cap:
 *   - static  teepee-static-<build>  /_next/static/*, /offline.html   cap 300
 *   - pages   teepee-pages-v1        navigations / pages              cap 400
 *   - files   teepee-files-v1        attachments, trip covers         no entry cap
 *                                    (ADR 0043's per-Trip byte cap bounds the warm)
 *   - meta    teepee-meta-v1         { build, previous } record       one entry
 *
 * Activate keeps this build's stores AND the previous build's static store —
 * cached pages still reference that build's chunks until they are re-warmed.
 *
 * SECURITY: navigations render private trip data, so they are network-first
 * (fresh from the authenticated server when online; cache only as a fallback
 * when the network fails or, for a navigation, is slow or answers 5xx, ADR
 * 0077) and the runtime cache is cleared on sign-out via a CLEAR_CACHE
 * message — never serve one user's cached pages to another on a shared device.
 * Sign-out keeps only /offline.html and the build record.
 */

// Spec 2026-10-06 §T (mirrors lib/offline.ts cacheNames / CACHE_ENTRY_LIMITS).
// The page registers /sw.js?build=<NEXT_PUBLIC_BUILD_ID>, so a deploy installs
// a new worker whose static store has a new name; activate keeps the previous
// build's store and drops older ones.
const BUILD_ID = (() => {
  try {
    return new URL(self.location.href).searchParams.get('build') || 'dev';
  } catch {
    return 'dev';
  }
})();
const CACHE_NAMES = { static: 'teepee-static-' + BUILD_ID, pages: 'teepee-pages-v1', files: 'teepee-files-v1' };
const CACHE_ENTRY_LIMITS = { static: 300, pages: 400, files: null };
// Mirrors META_CACHE_NAME / BUILD_META_PATH in lib/offline.ts: which build
// last activated and the one before it, so activate keeps the previous
// build's static store for pages Saved for offline under it.
const META_CACHE_NAME = 'teepee-meta-v1';
const BUILD_META_PATH = '/__teepee/build-meta';
// Mirrors LAST_TRIP_PATH in lib/offline.ts.
const LAST_TRIP_PATH = '/__teepee/last-trip';

// App shell resources to precache on install. Only truly public assets —
// NEVER '/', which redirects to the authenticated app.
const PRECACHE_URLS = ['/offline.html'];

// ---------------------------------------------------------------------------
// URL classification helpers (mirrors lib/offline.ts)
// ---------------------------------------------------------------------------

function isNextStaticAsset(url) {
  try {
    const { pathname } = new URL(url);
    return pathname.startsWith('/_next/static/');
  } catch {
    return false;
  }
}

function isApiRoute(url) {
  try {
    const { pathname } = new URL(url);
    return pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

/**
 * Returns true for the authenticated attachment serve route
 * (`/api/attachments/<id>`), the ONE api path the service worker may cache:
 * ticket/booking files must be readable offline (ADR 0043, narrows ADR 0016).
 * The cache is purged on sign-out, so this leaks nothing across users.
 */
function isAttachmentRoute(url) {
  try {
    const { pathname } = new URL(url);
    return /^\/api\/attachments\/[^/]+$/.test(pathname);
  } catch {
    return false;
  }
}

/**
 * Returns true for the member-gated trip cover serve route
 * (`/api/trips/<id>/cover`, with or without its `?v=` cache-buster). Warmed
 * alongside attachments (ADR 0043, amended 2026-10-01).
 */
function isCoverRoute(url) {
  try {
    const { pathname } = new URL(url);
    return /^\/api\/trips\/[^/]+\/cover$/.test(pathname);
  } catch {
    return false;
  }
}

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

/** Mirrors isRouterRequest() in lib/offline.ts. */
function isRouterRequest(request) {
  return request.headers.get('RSC') !== null || request.headers.get('Next-Router-Prefetch') !== null;
}

/** Mirrors cacheStoreFor() in lib/offline.ts. */
function cacheStoreFor(url) {
  if (isAttachmentRoute(url) || isCoverRoute(url)) return 'files';
  if (isNextStaticAsset(url)) return 'static';
  try {
    if (new URL(url).pathname === '/offline.html') return 'static';
  } catch {
    // fall through
  }
  return 'pages';
}

/** Mirrors isPinnedCacheEntry() in lib/offline.ts: the offline page is never evicted. */
function isPinnedCacheEntry(url) {
  try {
    return new URL(url).pathname === '/offline.html';
  } catch {
    return false;
  }
}

/**
 * Drop the oldest entries past the store's cap (mirrors evictionCount()),
 * skipping pinned entries.
 */
async function trimCache(store) {
  const limit = CACHE_ENTRY_LIMITS[store];
  if (limit === null) return;
  const cache = await caches.open(CACHE_NAMES[store]);
  const keys = await cache.keys();
  const extra = keys.length - limit;
  if (extra <= 0) return;
  const evictable = keys.filter((key) => !isPinnedCacheEntry(key.url));
  for (let i = 0; i < extra && i < evictable.length; i++) await cache.delete(evictable[i]);
}

/** Mirrors storableResponse() in lib/offline.ts: a redirected response is never kept as-is. */
function storableResponse(response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** Mirrors asksForBytes() in lib/offline.ts. */
function asksForBytes(url) {
  const queryAt = url.indexOf('?');
  if (queryAt === -1) return false;
  return url.slice(queryAt + 1).split('&').includes(OFFLINE_BYTES_PARAM + '=1');
}

/** Mirrors shouldStoreResponse() in lib/offline.ts. */
function shouldStoreResponse(bytesRequested, response) {
  return response.ok && !(bytesRequested && response.redirected);
}

/** Mirrors isServableCacheHit() in lib/offline.ts. */
function isServableCacheHit(mode, cached, bytesRequested) {
  return !(cached.redirected && (mode === 'navigate' || bytesRequested));
}

// Mirrors NAVIGATION_TIMEOUT_MS, SAVED_COPY_HEADER, SAVED_COPY_MESSAGE,
// isServerFailure(), savedCopyResponse() and savedCopyMessage() in
// lib/offline.ts (spec 2026-11-17 §A5, ADR 0077).
const NAVIGATION_TIMEOUT_MS = 4000;
const SAVED_COPY_HEADER = 'X-Teepee-Saved-Copy';
const SAVED_COPY_MESSAGE = 'SAVED_COPY';

function isServerFailure(status) {
  return status >= 500;
}

function queryFallbackPath(url, mode, exactServable, plainServable) {
  if (mode !== 'navigate' || exactServable || !plainServable) return null;
  const { pathname, search } = new URL(url);
  return search ? pathname : null;
}

function savedCopyResponse(response) {
  const headers = new Headers(response.headers);
  headers.set(SAVED_COPY_HEADER, '1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function savedCopyMessage(url) {
  return { type: SAVED_COPY_MESSAGE, url };
}

// Mirrors WAS_SAVED_COPY_MESSAGE, SAVED_COPY_RECORD_TTL_MS, SAVED_COPY_RECORD_LIMIT,
// withSavedCopyRecord(), withoutSavedCopyRecord(), wasSavedCopy() and
// wasSavedCopyQueryPath() in lib/offline.ts.
const WAS_SAVED_COPY_MESSAGE = 'WAS_SAVED_COPY';
const SAVED_COPY_RECORD_TTL_MS = 60000;
const SAVED_COPY_RECORD_LIMIT = 8;

function withSavedCopyRecord(records, path, now) {
  const live = records.filter((r) => r.path !== path && now - r.at < SAVED_COPY_RECORD_TTL_MS);
  return [...live, { path, at: now }].slice(-SAVED_COPY_RECORD_LIMIT);
}

function withoutSavedCopyRecord(records, path) {
  return records.filter((r) => r.path !== path);
}

function wasSavedCopy(records, path, now) {
  return records.some((r) => r.path === path && now - r.at < SAVED_COPY_RECORD_TTL_MS);
}

function wasSavedCopyQueryPath(data) {
  if (typeof data !== 'object' || data === null) return null;
  return data.type === WAS_SAVED_COPY_MESSAGE && typeof data.url === 'string' ? data.url : null;
}

// In memory only: a restarted worker forgets, and the page then relies on the
// pushed message and the date check.
let savedCopyRecords = [];

/** Mirrors OFFLINE_BYTES_PARAM in lib/offline.ts: a warm's ask for the bytes, never a redirect. */
const OFFLINE_BYTES_PARAM = 'offline';

/** Mirrors fileCacheKey() in lib/offline.ts. */
function fileCacheKey(url) {
  const queryAt = url.indexOf('?');
  if (queryAt === -1) return url;
  const params = url.slice(queryAt + 1).split('&');
  const kept = params.filter((p) => p.split('=')[0] !== OFFLINE_BYTES_PARAM);
  if (kept.length === params.length) return url;
  return kept.length ? url.slice(0, queryAt) + '?' + kept.join('&') : url.slice(0, queryAt);
}

/** Mirrors cacheKeyFor() in lib/offline.ts: a file warmed with the offline flag lives under its plain URL. */
function cacheKeyFor(request) {
  if (cacheStoreFor(request.url) !== 'files') return request;
  const key = fileCacheKey(request.url);
  return key === request.url ? request : key;
}

/** A cache hit the request may be answered with; a redirected one for a navigation is dropped. */
async function servableCached(request) {
  const key = cacheKeyFor(request);
  const cached = await caches.match(key);
  if (!cached) return undefined;
  if (isServableCacheHit(request.mode, cached, asksForBytes(request.url))) return cached;
  const cache = await caches.open(CACHE_NAMES[cacheStoreFor(request.url)]);
  await cache.delete(key);
  return undefined;
}

// Mirrors isCachedTripHome(), pickOfflineStart() and lastTripMessagePath() in
// lib/offline.ts; RESERVED_TRIP_SLUGS mirrors lib/trip-slug.ts.
const RESERVED_TRIP_SLUGS = ['new'];

function isCachedTripHome(path) {
  const match = /^\/trips\/([^/?#]+)$/.exec(path);
  return match !== null && !RESERVED_TRIP_SLUGS.includes(match[1]);
}

function pickOfflineStart(cachedUrls, lastTripPath) {
  if (lastTripPath && cachedUrls.includes(lastTripPath)) return lastTripPath;
  const home = cachedUrls.find(isCachedTripHome);
  if (home) return home;
  return cachedUrls.includes('/trips') ? '/trips' : null;
}

function lastTripMessagePath(data) {
  if (typeof data !== 'object' || data === null) return null;
  return data.type === 'LAST_TRIP' && typeof data.path === 'string' && isCachedTripHome(data.path) ? data.path : null;
}

/**
 * Determines cache strategy for a given fetch event.
 * Mirrors cacheStrategyFor() in lib/offline.ts.
 */
function getCacheStrategy(request) {
  const { method, url } = request;

  // Rule 1: never cache mutations
  if (method.toUpperCase() !== 'GET') return 'network-only';

  // Rule 1b: never cache router payloads or prefetches
  if (isRouterRequest(request)) return 'network-only';

  const sameOrigin = isSameOrigin(url);

  // Rule 2: never cache cross-origin
  if (!sameOrigin) return 'network-only';

  // Rule 3a: attachments and the trip cover are the ONLY /api/* exceptions
  // (ADR 0043, amended 2026-10-01 for the cover; amended 2026-10-02 for
  // cache-first attachments). An Attachment id never changes content, so
  // cache-first is safe; the cover keeps network-first (its ?v= can
  // change). Cache purged on sign-out via CLEAR_CACHE.
  if (isAttachmentRoute(url)) return 'cache-first';
  if (isCoverRoute(url)) return 'network-first';

  // Rule 3: never cache API / auth routes
  if (isApiRoute(url)) return 'network-only';

  // Rule 4: cache-first for immutable static assets
  if (isNextStaticAsset(url)) return 'cache-first';

  // Rule 5: network-first for navigations / pages (private per-user data)
  return 'network-first';
}

// ---------------------------------------------------------------------------
// Install: precache app shell
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAMES.static)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        // Precache failure must not break the SW install
        console.warn('[SW] Precache failed:', err);
        return self.skipWaiting();
      })
  );
});

// ---------------------------------------------------------------------------
// Activate: clean up old cache versions
// ---------------------------------------------------------------------------

/** Mirrors nextBuildMeta() in lib/offline.ts. */
function nextBuildMeta(stored, buildId) {
  if (!stored) return { build: buildId, previous: null };
  if (stored.build === buildId) return { build: buildId, previous: stored.previous };
  return { build: buildId, previous: stored.build };
}

/** Mirrors staleCacheNames() in lib/offline.ts. */
function staleCacheNames(existing, buildId, previousBuildId) {
  const keep = new Set([...Object.values(CACHE_NAMES), META_CACHE_NAME]);
  if (previousBuildId) keep.add('teepee-static-' + previousBuildId);
  return existing.filter((name) => !keep.has(name));
}

/** Mirrors signOutCacheNames() in lib/offline.ts. */
function signOutCacheNames(existing, buildId) {
  const keep = new Set(['teepee-static-' + buildId, META_CACHE_NAME]);
  return existing.filter((name) => !keep.has(name));
}

// No deploy means no new install to precache /offline.html again, so sign-out
// empties this build's static store around it rather than deleting the store.
async function clearPrivateCaches() {
  const names = await caches.keys();
  await Promise.all(signOutCacheNames(names, BUILD_ID).map((name) => caches.delete(name)));
  const meta = await caches.open(META_CACHE_NAME);
  await meta.delete(LAST_TRIP_PATH);
  const statics = await caches.open(CACHE_NAMES.static);
  const keys = await statics.keys();
  await Promise.all(keys.filter((key) => !isPinnedCacheEntry(key.url)).map((key) => statics.delete(key)));
  if (!keys.some((key) => isPinnedCacheEntry(key.url))) await statics.addAll(PRECACHE_URLS);
}

/** Read the stored build record, then overwrite it with this build's. */
async function recordBuild() {
  const meta = await caches.open(META_CACHE_NAME);
  let stored = null;
  try {
    const hit = await meta.match(BUILD_META_PATH);
    if (hit) {
      const parsed = await hit.json();
      if (parsed && typeof parsed.build === 'string') {
        stored = { build: parsed.build, previous: typeof parsed.previous === 'string' ? parsed.previous : null };
      }
    }
  } catch {
    stored = null;
  }
  const next = nextBuildMeta(stored, BUILD_ID);
  await meta.put(
    BUILD_META_PATH,
    new Response(JSON.stringify(next), { headers: { 'Content-Type': 'application/json' } })
  );
  return next;
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    recordBuild()
      .catch(() => ({ build: BUILD_ID, previous: null }))
      .then((record) =>
        caches
          .keys()
          .then((keys) => Promise.all(staleCacheNames(keys, BUILD_ID, record.previous).map((key) => caches.delete(key))))
      )
      .then(() => self.clients.claim())
      .catch((err) => {
        console.warn('[SW] Activate cleanup failed:', err);
        return self.clients.claim();
      })
  );
});

// ---------------------------------------------------------------------------
// Fetch: apply strategy
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  // Only handle http/https (skip chrome-extension:// etc.)
  if (!event.request.url.startsWith('http')) return;

  const strategy = getCacheStrategy(event.request);

  if (strategy === 'network-only') {
    // Pass through — no caching at all
    return;
  }

  if (strategy === 'cache-first') {
    event.respondWith(cacheFirst(event));
    return;
  }

  if (strategy === 'network-first') {
    event.respondWith(networkFirst(event));
    return;
  }
});

// ---------------------------------------------------------------------------
// Message: allow the app to clear the runtime cache (e.g. on sign-out) so a
// different user on the same device can't read the previous user's cached
// private pages while offline.
// ---------------------------------------------------------------------------

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'CLEAR_CACHE') {
    event.waitUntil(clearPrivateCaches().catch((err) => console.warn('[SW] cache clear failed:', err)));
  }
  const askedPath = wasSavedCopyQueryPath(data);
  if (askedPath !== null && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ savedCopy: wasSavedCopy(savedCopyRecords, askedPath, Date.now()) });
  }
  const lastTrip = lastTripMessagePath(data);
  if (lastTrip) event.waitUntil(recordLastTrip(lastTrip).catch(() => {}));
});

// ---------------------------------------------------------------------------
// Strategy implementations
// ---------------------------------------------------------------------------

/**
 * cache-first: serve from cache; fall back to network and populate cache.
 * Used for immutable hashed assets — never serve stale if unavailable.
 * The put is held open by the event so the worker is not stopped mid-write
 * (a large file); a body that fails makes the put reject and keeps nothing.
 */
async function cacheFirst(event) {
  const { request } = event;
  try {
    const cached = await servableCached(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (shouldStoreResponse(asksForBytes(request.url), response)) {
      const store = cacheStoreFor(request.url);
      const copy = storableResponse(response.clone());
      event.waitUntil(
        caches
          .open(CACHE_NAMES[store])
          .then((cache) => cache.put(cacheKeyFor(request), copy))
          .then(() => trimCache(store))
          .catch(() => {})
      );
    }
    return response;
  } catch (err) {
    console.warn('[SW] cache-first fetch failed:', err);
    // A file opened in its own tab gets the offline page, not the browser's error.
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/offline.html').catch(() => null);
      if (fallback) return fallback;
    }
    // For static assets there's no useful fallback — re-throw so the browser
    // shows its default error rather than a confusing blank page.
    throw err;
  }
}

/**
 * network-first: always try the network first so an online user gets fresh,
 * authenticated content (never another user's cached page). Cache successful
 * responses so they can serve as a fallback. On network failure, serve the
 * cached copy if present, else the offline page for navigations. A navigation
 * with a saved copy also gets that copy, marked, when the network answers 5xx
 * or takes longer than NAVIGATION_TIMEOUT_MS (ADR 0077).
 *
 * The cache is purged on sign-out (CLEAR_CACHE message), so the fallback can
 * only ever be the currently signed-in user's own pages.
 */
async function networkFirst(event) {
  const { request } = event;

  if (request.mode === 'navigate') {
    savedCopyRecords = withoutSavedCopyRecord(savedCopyRecords, new URL(request.url).pathname);
    const redirect = takeOfflineRedirect(request.url);
    if (redirect) {
      const cached = await servableCached(request);
      if (cached) return announceSavedCopy(event, cached);
    }
  }

  const network = fetchAndKeep(event);
  try {
    return await (request.mode === 'navigate' ? navigationAnswer(event, network) : network);
  } catch (err) {
    console.warn('[SW] network-first fetch failed, falling back to cache:', err);
    return offlineResponse(event);
  }
}

function fetchAndKeep(event) {
  const { request } = event;
  return fetch(request).then((response) => {
    if (shouldStoreResponse(asksForBytes(request.url), response)) {
      const store = cacheStoreFor(request.url);
      const copy = storableResponse(response.clone());
      event.waitUntil(
        caches
          .open(CACHE_NAMES[store])
          .then((cache) => cache.put(cacheKeyFor(request), copy))
          .then(() => trimCache(store))
          .catch(() => {})
      );
      if (request.mode === 'navigate') {
        const { pathname, search } = new URL(request.url);
        if (!search && isCachedTripHome(pathname)) recordLastTrip(pathname).catch(() => {});
      }
    }
    return response;
  });
}

// The saved copy is looked up only once the network is slow or failing, so a
// fast answer never waits on the cache.
async function navigationAnswer(event, network) {
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(resolve, NAVIGATION_TIMEOUT_MS, null);
  });
  const response = await Promise.race([network, timedOut]).finally(() => clearTimeout(timer));
  if (response && !isServerFailure(response.status)) return response;
  const copy = await savedCopy(event.request);
  if (!copy) return response || network;
  if (!response) event.waitUntil(network.catch(() => {}));
  if (copy.redirect) return redirectToSavedTrip(copy.redirect);
  return announceSavedCopy(event, copy.cached);
}

function announceSavedCopy(event, cached) {
  savedCopyRecords = withSavedCopyRecord(savedCopyRecords, new URL(event.request.url).pathname, Date.now());
  event.waitUntil(postSavedCopy(event.resultingClientId, event.request.url).catch(() => {}));
  return savedCopyResponse(cached);
}

// The page a navigation opens becomes a client only once its response
// arrives, so the worker asks for it until it exists.
const SAVED_COPY_CLIENT_TRIES = 50;
const SAVED_COPY_CLIENT_WAIT_MS = 100;

async function postSavedCopy(clientId, url) {
  if (!clientId) return;
  for (let i = 0; i < SAVED_COPY_CLIENT_TRIES; i++) {
    const client = await self.clients.get(clientId);
    if (client) {
      client.postMessage(savedCopyMessage(url));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, SAVED_COPY_CLIENT_WAIT_MS));
  }
}

async function recordLastTrip(path) {
  const meta = await caches.open(META_CACHE_NAME);
  await meta.put(LAST_TRIP_PATH, new Response(path, { headers: { 'Content-Type': 'text/plain' } }));
}

// The offline redirect from `/` was decided a moment ago with the network
// down or slow, so the navigation that follows it reads the cache without
// asking the network again, and is marked as the saved copy. In memory only: a
// restarted worker just asks the network.
const OFFLINE_REDIRECT_TTL_MS = 10000;
let offlineRedirect = null;

function takeOfflineRedirect(url) {
  const marker = offlineRedirect;
  offlineRedirect = null;
  if (marker === null || marker.path !== new URL(url).pathname || Date.now() - marker.at >= OFFLINE_REDIRECT_TTL_MS) return null;
  return marker;
}

function redirectToSavedTrip(path) {
  offlineRedirect = { path, at: Date.now() };
  return Response.redirect(new URL(path, self.location.origin).href, 302);
}

async function offlineStart() {
  const pages = await caches.open(CACHE_NAMES.pages);
  // Cache keys come back oldest first (trimCache relies on it); the pick wants newest first.
  let paths = (await pages.keys())
    .map((key) => new URL(key.url))
    .filter((url) => url.origin === self.location.origin && !url.search)
    .map((url) => url.pathname)
    .reverse();
  const meta = await caches.open(META_CACHE_NAME);
  const last = await meta.match(LAST_TRIP_PATH);
  const lastPath = last ? await last.text() : null;
  for (;;) {
    const path = pickOfflineStart(paths, lastPath);
    if (!path) return null;
    const hit = await pages.match(path);
    if (hit && isServableCacheHit('navigate', hit)) return path;
    await pages.delete(path);
    paths = paths.filter((p) => p !== path);
  }
}

// What this device can answer a request with: for a navigation to `/`, the
// saved Trip; otherwise the request's own cached copy.
async function savedCopy(request) {
  // Asked before the cached `/` itself: a Landing cached while signed out must
  // never open for a Traveller who has a Trip saved. A redirect, not the Trip's
  // body, so the address, the router's pathname and the page all agree.
  if (request.mode === 'navigate' && new URL(request.url).pathname === '/') {
    const start = await offlineStart().catch(() => null);
    if (start) return { redirect: start };
  }
  const cached = await servableCached(request);
  if (cached) return { cached };
  if (request.mode === 'navigate' && new URL(request.url).search) {
    const { pathname } = new URL(request.url);
    const plain = await caches.match(new URL(pathname, self.location.origin).href);
    const redirect = queryFallbackPath(request.url, request.mode, false, !!plain && isServableCacheHit('navigate', plain));
    if (redirect) return { redirect };
  }
  return null;
}

async function offlineResponse(event) {
  const { request } = event;
  const copy = await savedCopy(request);
  if (copy && copy.redirect) return redirectToSavedTrip(copy.redirect);
  // A caller that is not a navigation (the offline save) reads the mark to tell
  // an old copy from a fresh answer.
  if (copy) return request.mode === 'navigate' ? announceSavedCopy(event, copy.cached) : savedCopyResponse(copy.cached);

  if (request.mode === 'navigate') {
    const fallback = await caches.match('/offline.html').catch(() => null);
    if (fallback) return fallback;
  }

  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain' },
  });
}

// ---------------------------------------------------------------------------
// Push: receive and display notifications
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : null;
    if (!data) return; // no payload — nothing to show

    const title = data.title ?? 'Teepee';
    const options = {
      body: data.body ?? '',
      data: { url: data.url ?? '/' },
      // Static files under public/icons/, added when the generated `/icon`
      // route was retired.
      icon: '/icons/icon-192.png',
      badge: '/icons/push-badge-96.png',
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    // Guard against malformed JSON or missing push data — never crash the SW.
    console.warn('[SW] push handler error:', err);
  }
});

// ---------------------------------------------------------------------------
// Notification click: focus existing tab or open new window
// ---------------------------------------------------------------------------

self.addEventListener('notificationclick', (event) => {
  try {
    event.notification.close();

    const url = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Try to focus an existing tab at the target URL
          for (const client of clientList) {
            if (client.url === url && 'focus' in client) {
              return client.focus();
            }
          }
          // No existing tab — open a new one
          if (self.clients.openWindow) {
            return self.clients.openWindow(url);
          }
        })
        .catch((err) => {
          console.warn('[SW] notificationclick navigation error:', err);
        })
    );
  } catch (err) {
    console.warn('[SW] notificationclick handler error:', err);
  }
});

// ---------------------------------------------------------------------------
// Push subscription rotation
// ---------------------------------------------------------------------------

// A push service may rotate an endpoint at any time, including while the app
// is closed. Without this, the stored row keeps pointing at the dead endpoint
// until the Traveller presses Enable again — the Device looks healthy in
// Account and silently receives nothing.
//
// A service worker cannot call a server action, so this posts to /api/push.
// The fetch carries the session cookie; if there is no session the route
// answers 401 and we give up, and the Device heals on its next visit instead.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription || null;

        // Re-subscribe with the SAME applicationServerKey the dead
        // subscription used. Reading it off the old options avoids baking the
        // VAPID key into the service worker, which is generated at build time.
        const applicationServerKey =
          (oldSub && oldSub.options && oldSub.options.applicationServerKey) || undefined;

        const fresh =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            ...(applicationServerKey ? { applicationServerKey } : {}),
          }));

        if (!fresh || !fresh.endpoint) return;

        const keys = (fresh.toJSON && fresh.toJSON().keys) || {};
        if (!keys.p256dh || !keys.auth) return;

        await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...(oldSub && oldSub.endpoint ? { oldEndpoint: oldSub.endpoint } : {}),
            endpoint: fresh.endpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
            // The Device's CURRENT zone, so a healed row is never left with
            // `timezone: null` — the cron scan (app/api/cron/digest/route.ts)
            // filters to `timezone: { not: null }`, so a healed Device with no
            // zone can never be elected for the ADR 0050 Digest and, once its
            // dead row is pruned on a 410, drops the whole person out of the
            // subscriber scan until their next app open. `Intl` is available
            // in service worker scope.
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
      } catch (err) {
        // Never throw out of a service worker event. A failed heal leaves the
        // Device exactly as it was — healed on its next visit.
        console.warn('[SW] pushsubscriptionchange failed:', err);
      }
    })(),
  );
});
