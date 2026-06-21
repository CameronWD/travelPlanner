/**
 * Pure cache-strategy helper for Trip Planner PWA.
 *
 * PURE — no browser APIs, no framework imports. Fully unit-testable.
 *
 * The service worker (public/sw.js) mirrors this logic in plain JS.
 * This module is the source of truth — keep them in sync.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CacheStrategy =
  | 'network-only'
  | 'network-first'
  | 'stale-while-revalidate'
  | 'cache-first';

export interface StrategyInput {
  method: string;
  url: string;
  sameOrigin: boolean;
}

// ---------------------------------------------------------------------------
// URL classification helpers
// ---------------------------------------------------------------------------

/**
 * Returns true for Next.js immutable static assets (`/_next/static/...`).
 * These are content-hashed and safe to cache indefinitely.
 */
export function isNextStaticAsset(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return pathname.startsWith('/_next/static/');
  } catch {
    return false;
  }
}

/**
 * Returns true for same-origin API / auth routes that must NOT be cached.
 * Covers `/api/*` including `/api/auth/*`.
 */
export function isApiRoute(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Strategy selector
// ---------------------------------------------------------------------------

/**
 * Determines the appropriate cache strategy for a given request.
 *
 * Decision tree:
 * 1. Non-GET → network-only  (mutations / server actions must never be cached)
 * 2. Cross-origin → network-only  (tile servers, FX API, etc.)
 * 3. Same-origin /api/* → network-only  (auth & live data)
 * 4. Same-origin /_next/static/* → cache-first  (immutable hashed assets)
 * 5. Everything else (navigations, RSC, pages) → network-first
 *
 * Navigations render PRIVATE, per-user trip data, so they must NOT be served
 * stale from a shared (URL-keyed) cache — that would leak one traveller's trip
 * to another user on the same device/browser. network-first always fetches
 * fresh from the server (which is authenticated by the session cookie) when
 * online, and only falls back to the cache when genuinely offline. Combined
 * with clearing the cache on sign-out, the offline fallback can only ever be
 * the same user's own data.
 */
export function cacheStrategyFor({ method, url, sameOrigin }: StrategyInput): CacheStrategy {
  // Rule 1: never cache mutations
  if (method.toUpperCase() !== 'GET') {
    return 'network-only';
  }

  // Rule 2: never cache cross-origin requests
  if (!sameOrigin) {
    return 'network-only';
  }

  // Rule 3: never cache API / auth routes
  if (isApiRoute(url)) {
    return 'network-only';
  }

  // Rule 4: cache-first for immutable static assets
  if (isNextStaticAsset(url)) {
    return 'cache-first';
  }

  // Rule 5: network-first for navigations / pages / RSC (private per-user data)
  return 'network-first';
}
