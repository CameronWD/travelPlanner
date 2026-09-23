/**
 * Trip Planner Service Worker
 *
 * Cache strategy source of truth: lib/offline.ts
 * This file mirrors that logic in plain JS — keep them in sync if rules change.
 *
 * Strategy summary:
 *   - Non-GET (mutations / server actions)  → network-only
 *   - Cross-origin requests                  → network-only
 *   - Same-origin /api/attachments/*         → network-first (tickets, confirmations offline)
 *   - Same-origin /api/*                     → network-only  (auth + live data)
 *   - Same-origin /_next/static/*            → cache-first   (immutable hashed assets)
 *   - Everything else (navigations, pages)   → network-first (private per-user data)
 *
 * SECURITY: navigations render private trip data, so they are network-first
 * (fresh from the authenticated server when online; cache only as an offline
 * fallback) and the runtime cache is cleared on sign-out via a CLEAR_CACHE
 * message — never serve one user's cached pages to another on a shared device.
 */

// Bump on cache-policy changes so old caches (incl. any authenticated pages
// cached under the previous stale-while-revalidate policy) are purged.
const CACHE_VERSION = 'trip-planner-v4';

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

  // Rule 3a: attachments (tickets) are cacheable network-first — the ONLY
  // /api/* exception (ADR 0043). Cache purged on sign-out via CLEAR_CACHE.
  if (isAttachmentRoute(url)) return 'network-first';

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

  if (strategy === 'network-first') {
    event.respondWith(networkFirst(event.request));
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
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch((err) => console.warn('[SW] cache clear failed:', err))
    );
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
 * network-first: always try the network first so an online user gets fresh,
 * authenticated content (never another user's cached page). Cache successful
 * responses so they can serve as an OFFLINE-ONLY fallback. On network failure,
 * serve the cached copy if present, else the offline page for navigations.
 *
 * The cache is purged on sign-out (CLEAR_CACHE message), so the offline
 * fallback can only ever be the currently signed-in user's own pages.
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone()).catch(() => {}); // non-blocking
    }
    return response;
  } catch (err) {
    console.warn('[SW] network-first fetch failed, falling back to cache:', err);

    const cached = await caches.match(request);
    if (cached) return cached;

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
