/**
 * Pure cache-strategy helper for Trip Planner PWA.
 *
 * PURE — no browser APIs, no framework imports. Fully unit-testable.
 *
 * The service worker (public/sw.js) mirrors this logic in plain JS.
 * This module is the source of truth — keep them in sync.
 */

import { addDays, daysBetween } from '@/lib/dates';

// ---------------------------------------------------------------------------
// Offline warm-set
// ---------------------------------------------------------------------------

/** Max day-pages to pre-warm, guarding against a mis-entered huge range. */
export const MAX_WARM_DAYS = 60;

export interface WarmAttachment { url: string; size: number }

/** Attachments above this size are skipped by the warm (matches the upload cap). */
export const MAX_WARM_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * The set of same-origin paths worth pre-caching for offline viewing of a trip:
 * the read-while-travelling essentials (including the user guide and the
 * What's new page, ADR 0056) + one page per dated day (capped). Pure — no
 * browser APIs.
 */
export function tripOfflinePaths(
  tripId: string,
  startDate: string | null,
  endDate: string | null,
  attachments: WarmAttachment[] = [],
): string[] {
  const base = `/trips/${tripId}`;
  // `/whats-new` is account-level, not trip-scoped, but it's a read-only doc
  // route exactly like `${base}/help` — the project already treats those as
  // worth warming — so it rides along in the same list rather than needing
  // its own warm-set mechanism.
  const paths = [base, `${base}/plan`, `${base}/summary`, `${base}/today`, `${base}/checklists`, `${base}/files`, `${base}/help`, '/whats-new'];
  if (startDate && endDate && endDate >= startDate) {
    const span = Math.min(daysBetween(startDate, endDate), MAX_WARM_DAYS - 1);
    for (let i = 0; i <= span; i++) {
      paths.push(`${base}/day/${addDays(startDate, i)}`);
    }
  }
  for (const att of attachments) {
    if (att.size <= MAX_WARM_ATTACHMENT_BYTES) paths.push(att.url);
  }
  return paths;
}

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

/**
 * Returns true for the authenticated attachment serve route
 * (`/api/attachments/<id>`), the ONE api path the service worker may cache:
 * ticket/booking files must be readable offline (ADR 0043, narrows ADR 0016).
 * The cache is purged on sign-out, so this leaks nothing across users.
 */
export function isAttachmentRoute(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return /^\/api\/attachments\/[^/]+$/.test(pathname);
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
 * 3a. Same-origin /api/attachments/<id> → network-first  (tickets, confirmations offline)
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

  // Rule 3a: attachments (tickets, confirmations) are cacheable network-first
  // so they survive offline — the ONLY /api/* exception (ADR 0043).
  if (isAttachmentRoute(url)) {
    return 'network-first';
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
