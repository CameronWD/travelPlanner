/**
 * Pure cache-strategy helper for Trip Planner PWA.
 *
 * PURE — no browser APIs, no framework imports. Fully unit-testable.
 *
 * The service worker (public/sw.js) mirrors this logic in plain JS.
 * This module is the source of truth — keep them in sync.
 */

import { COVER_SMALL_WIDTH, coverUrlForWidth } from '@/lib/cover';
import { addDays, daysBetween } from '@/lib/dates';
import { tripPath } from '@/lib/trip-path';
import type { TripPhase } from '@/lib/trip-phase';

// ---------------------------------------------------------------------------
// Offline warm-set
// ---------------------------------------------------------------------------

/** Max day-pages to pre-warm, guarding against a mis-entered huge range. */
export const MAX_WARM_DAYS = 60;

/** Days either side of today warmed while a Trip is Travelling (spec 2026-10-06 §A). */
export const TRAVELLING_WARM_RADIUS_DAYS = 7;

/**
 * A full warm newer than this counts as fresh: the automatic warm on opening
 * a Trip skips its page paths (spec 2026-10-06 §A). "Save again" ignores it.
 */
export const WARM_FRESH_MS = 6 * 60 * 60 * 1000;

/** Which days to warm: the Trip's Phase and its own today (trip layout). */
export interface WarmDayWindow {
  phase?: TripPhase;
  today?: string;
}

/**
 * The Day pages worth warming. While Travelling: the days within
 * TRAVELLING_WARM_RADIUS_DAYS of today, clamped to the Trip. Otherwise every
 * day. Both capped at MAX_WARM_DAYS. Pure.
 */
export function warmDayDates(
  startDate: string | null,
  endDate: string | null,
  window: WarmDayWindow = {},
): string[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  let from = startDate;
  let to = endDate;
  if (window.phase === 'travelling' && window.today) {
    const lo = addDays(window.today, -TRAVELLING_WARM_RADIUS_DAYS);
    const hi = addDays(window.today, TRAVELLING_WARM_RADIUS_DAYS);
    if (lo > from) from = lo;
    if (hi < to) to = hi;
    if (to < from) return [];
  }
  const span = Math.min(daysBetween(from, to), MAX_WARM_DAYS - 1);
  const dates: string[] = [];
  for (let i = 0; i <= span; i++) dates.push(addDays(from, i));
  return dates;
}

/** True when the last full warm finished under WARM_FRESH_MS ago. A future timestamp is not fresh. */
export function isWarmFresh(warmedAt: number | null, now: number): boolean {
  if (warmedAt === null) return false;
  const age = now - warmedAt;
  return age >= 0 && age < WARM_FRESH_MS;
}

/** The part of the Network Information API the warmer reads (not in TS's DOM lib). */
export interface ConnectionHint {
  saveData?: boolean;
  effectiveType?: string;
}

/** A connection that asks to save data: Save-Data on, or 2G or slower (spec 2026-10-06 §A). */
export function isConstrainedConnection(connection: ConnectionHint | null | undefined): boolean {
  if (!connection) return false;
  return connection.saveData === true || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}

export interface WarmAttachment { url: string; size: number; createdAt?: string | Date }

/** Attachments above this size are skipped by the warm (matches the upload cap). */
export const MAX_WARM_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Max total bytes of Attachments warmed per Trip (ADR 0043, amended
 * 2026-10-02). Newest-first; a file that would cross the line is skipped —
 * later smaller files may still fit.
 */
export const MAX_WARM_TRIP_BYTES = 200 * 1024 * 1024;

/**
 * The set of same-origin paths worth pre-caching for offline viewing of a trip:
 * the read-while-travelling essentials — Home, Plan, Today, Summary, Money,
 * Calendar, Checklists, Files, the user guide and the What's new page (ADR
 * 0056) — + the Day pages from `warmDayDates` (around today while Travelling,
 * capped) + attachments under the size cap + the cover photo. Pure — no
 * browser APIs.
 *
 * `tripRef` is the Trip's URL ref — its slug, or id fallback (ADR 0064) —
 * built into paths via `tripPath`.
 *
 * `coverUrl` is the exact `<img src>` the pages render for the cover
 * (`/api/trips/<id>/cover?v=<key>`) and its small-copy URL (`&w=480`, spec
 * 2026-10-06 §H), the two URLs `CoverPhotoImage` requests: the service worker
 * cache is keyed by URL, so anything else would warm a different entry. No
 * size check here — the Trip row stores none, and the same 10 MiB
 * `validateUpload` cap that `MAX_WARM_ATTACHMENT_BYTES` mirrors already bounds
 * every cover on upload (ADR 0043, amended 2026-10-01).
 */
export function tripOfflinePaths(
  tripRef: string,
  startDate: string | null,
  endDate: string | null,
  attachments: WarmAttachment[] = [],
  coverUrl: string | null = null,
  dayWindow: WarmDayWindow = {},
): string[] {
  const base = tripPath(tripRef);
  // `/whats-new` is account-level, not trip-scoped, but it's a read-only doc
  // route exactly like `${base}/help` — the project already treats those as
  // worth warming — so it rides along in the same list rather than needing
  // its own warm-set mechanism.
  const paths = [
    base,
    `${base}/plan`,
    `${base}/today`,
    `${base}/summary`,
    `${base}/budget`,
    `${base}/calendar`,
    `${base}/checklists`,
    `${base}/files`,
    `${base}/help`,
    '/whats-new',
  ];
  for (const date of warmDayDates(startDate, endDate, dayWindow)) {
    paths.push(`${base}/day/${date}`);
  }
  // Newest-first (undefined createdAt sorts last), capped at
  // MAX_WARM_TRIP_BYTES per Trip (ADR 0043, amended 2026-10-02). A file that
  // would cross the line is skipped — later, smaller files may still fit.
  const sorted = [...attachments].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : -Infinity;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : -Infinity;
    return bt - at;
  });
  let total = 0;
  for (const att of sorted) {
    if (att.size > MAX_WARM_ATTACHMENT_BYTES) continue;
    if (total + att.size > MAX_WARM_TRIP_BYTES) continue;
    total += att.size;
    paths.push(att.url);
  }
  if (coverUrl) paths.push(coverUrl, coverUrlForWidth(coverUrl, COVER_SMALL_WIDTH));
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

/**
 * Returns true for the member-gated trip cover serve route
 * (`/api/trips/<id>/cover`, with or without its `?v=` cache-buster). Warmed
 * alongside attachments so the Home tile and Trips list don't show a broken
 * photo offline (ADR 0043, amended 2026-10-01).
 */
export function isCoverRoute(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return /^\/api\/trips\/[^/]+\/cover$/.test(pathname);
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
 * 3a. Same-origin /api/attachments/<id> → cache-first  (an Attachment id never changes content)
 *     Same-origin /api/trips/<id>/cover → network-first  (its ?v= can change)
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

  // Rule 3a: attachments (tickets, confirmations) and the trip cover are the
  // ONLY /api/* exceptions (ADR 0043, amended 2026-10-01 for the cover;
  // amended 2026-10-02 for cache-first attachments). An Attachment's id
  // never changes content — a replaced file is a new id — so cache-first is
  // safe and skips the re-download. The cover keeps network-first because
  // its `?v=` can change.
  if (isAttachmentRoute(url)) {
    return 'cache-first';
  }
  if (isCoverRoute(url)) {
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
