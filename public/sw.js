/**
 * Trip Planner Service Worker
 *
 * Cache strategy source of truth: lib/offline.ts
 * This file mirrors that logic in plain JS — keep them in sync if rules change.
 *
 * Strategy summary:
 *   - Non-GET (mutations / server actions)  → network-only
 *   - Cross-origin requests                  → network-only
 *   - Same-origin /api/*                     → network-only  (auth + live data)
 *   - Same-origin /_next/static/*            → cache-first   (immutable hashed assets)
 *   - Everything else (navigations, pages)   → stale-while-revalidate
 */

const CACHE_VERSION = 'trip-planner-v1';

// App shell resources to precache on install
const PRECACHE_URLS = ['/', '/offline.html'];

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

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

/**
 * Determines cache strategy for a given fetch event.
 * Mirrors cacheStrategyFor() in lib/offline.ts.
 */
function getCacheStrategy(request) {
  const { method, url } = request;

  // Rule 1: never cache mutations
  if (method.toUpperCase() !== 'GET') return 'network-only';

  const sameOrigin = isSameOrigin(url);

  // Rule 2: never cache cross-origin
  if (!sameOrigin) return 'network-only';

  // Rule 3: never cache API / auth routes
  if (isApiRoute(url)) return 'network-only';

  // Rule 4: cache-first for immutable static assets
  if (isNextStaticAsset(url)) return 'cache-first';

  // Rule 5: stale-while-revalidate for navigations / pages
  return 'stale-while-revalidate';
}

// ---------------------------------------------------------------------------
// Install: precache app shell
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
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

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
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
    event.respondWith(cacheFirst(event.request));
    return;
  }

  if (strategy === 'stale-while-revalidate') {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
});

// ---------------------------------------------------------------------------
// Strategy implementations
// ---------------------------------------------------------------------------

/**
 * cache-first: serve from cache; fall back to network and populate cache.
 * Used for immutable hashed assets — never serve stale if unavailable.
 */
async function cacheFirst(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone()).catch(() => {}); // non-blocking
    }
    return response;
  } catch (err) {
    console.warn('[SW] cache-first fetch failed:', err);
    // For static assets there's no useful fallback — re-throw so the browser
    // shows its default error rather than a confusing blank page.
    throw err;
  }
}

/**
 * stale-while-revalidate: respond immediately from cache (if present),
 * then update cache from network in background.
 * On cache miss + network failure for a navigation, serve offline fallback.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const cached = await caches.match(request);

    // Kick off background revalidation (non-blocking)
    const networkPromise = fetch(request)
      .then((response) => {
        if (response.ok) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      // Respond immediately from cache; background update runs concurrently
      return cached;
    }

    // Cache miss — wait for network
    const networkResponse = await networkPromise;
    if (networkResponse) return networkResponse;

    // Both cache and network failed — serve offline fallback for navigations
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/offline.html');
      if (fallback) return fallback;
    }

    // No fallback available — fail gracefully
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (err) {
    console.warn('[SW] stale-while-revalidate error:', err);

    // On any unexpected error, try the offline fallback for navigations
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
}

// ---------------------------------------------------------------------------
// Push: receive and display notifications
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : null;
    if (!data) return; // no payload — nothing to show

    const title = data.title ?? 'Trip Planner';
    const options = {
      body: data.body ?? '',
      data: { url: data.url ?? '/' },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
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
