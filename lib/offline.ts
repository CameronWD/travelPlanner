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
import { RESERVED_TRIP_SLUGS } from '@/lib/trip-slug';
import type { TripPhase } from '@/lib/trip-phase';

// ---------------------------------------------------------------------------
// Offline warm-set
// ---------------------------------------------------------------------------

/** Max day-pages to pre-warm, guarding against a mis-entered huge range. */
export const MAX_WARM_DAYS = 60;

/** Days either side of today warmed while a Trip is Travelling (spec 2026-10-06 §A). */
const TRAVELLING_WARM_RADIUS_DAYS = 7;

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
 * the read-while-travelling essentials — Home, Plan, Summary, Money,
 * Calendar, Checklists, Files, Journal, the user guide, the What's new page
 * (ADR 0056) and the Trips list — + the Day pages from `warmDayDates` (around today while Travelling,
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
    `${base}/summary`,
    `${base}/budget`,
    `${base}/calendar`,
    `${base}/checklists`,
    `${base}/files`,
    `${base}/journal`,
    `${base}/help`,
    '/whats-new',
    '/trips',
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

const NEXT_STATIC_PREFIX = '/_next/static/';

function attributeOf(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match ? (match[1] ?? match[2]) : null;
}

// A page saved for offline needs its scripts and styles to be interactive; one
// for a section never opened since the last deploy would otherwise lack its chunks.
export function assetUrlsIn(html: string): string[] {
  const urls: string[] = [];
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const isScript = /^<script/i.test(tag);
    const url = isScript
      ? attributeOf(tag, 'src')
      : /\bstylesheet\b/i.test(attributeOf(tag, 'rel') ?? '')
        ? attributeOf(tag, 'href')
        : null;
    if (url?.startsWith(NEXT_STATIC_PREFIX) && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CacheStrategy =
  | 'network-only'
  | 'launch-page'
  | 'network-first'
  | 'stale-while-revalidate'
  | 'cache-first';

export interface StrategyInput {
  method: string;
  url: string;
  sameOrigin: boolean;
  /** True when the request carries an `RSC` or `Next-Router-Prefetch` header (isRouterRequest). */
  routerRequest?: boolean;
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
 * (`/api/trips/<id>/cover`, with or without its `?v=` cache-buster), and for
 * the route snapshot that stands in for it (`/api/trips/<id>/route-snapshot`;
 * its `shape` and `p` query are part of the cache key). Warmed
 * alongside attachments so the Home tile and Trips list don't show a broken
 * photo offline (ADR 0043, amended 2026-10-01).
 */
export function isCoverRoute(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return /^\/api\/trips\/[^/]+\/(cover|route-snapshot)$/.test(pathname);
  } catch {
    return false;
  }
}

// Makes the serve route answer 200 with the bytes instead of redirecting to
// storage, which the worker could not keep (spec 2026-11-17 §A2). Mirrored in sw.js.
export const OFFLINE_BYTES_PARAM = 'offline';

export function warmUrlFor(path: string): string {
  const url = new URL(path, 'https://warm.invalid').href;
  if (!isAttachmentRoute(url) && !isCoverRoute(url)) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${OFFLINE_BYTES_PARAM}=1`;
}

// Cut from the string rather than re-serialised: the cache matches the exact
// URL, and the pages render `?v=` with encodeURIComponent. Mirrored in sw.js.
export function fileCacheKey(url: string): string {
  const queryAt = url.indexOf('?');
  if (queryAt === -1) return url;
  const params = url.slice(queryAt + 1).split('&');
  const kept = params.filter((p) => p.split('=')[0] !== OFFLINE_BYTES_PARAM);
  if (kept.length === params.length) return url;
  return kept.length ? `${url.slice(0, queryAt)}?${kept.join('&')}` : url.slice(0, queryAt);
}

// Where a request is cached: a file warmed with the offline flag lives under
// its plain URL. Mirrored in sw.js.
export function cacheKeyFor<R extends { url: string }>(request: R): R | string {
  if (cacheStoreFor(request.url) !== 'files') return request;
  const key = fileCacheKey(request.url);
  return key === request.url ? request : key;
}

// ---------------------------------------------------------------------------
// Strategy selector
// ---------------------------------------------------------------------------

/**
 * Determines the appropriate cache strategy for a given request.
 *
 * Decision tree:
 * 1. Non-GET → network-only  (mutations / server actions must never be cached)
 * 1b. Router payload (`RSC`) or prefetch (`Next-Router-Prefetch`) → network-only
 *     (spec 2026-10-06 §T: they made the cache grow without bound)
 * 2. Cross-origin → network-only  (tile servers, FX API, etc.)
 * 3a. Same-origin /api/attachments/<id> → cache-first  (an Attachment id never changes content)
 *     Same-origin /api/trips/<id>/cover → network-first  (its ?v= can change)
 * 3. Same-origin /api/* → network-only  (auth & live data)
 * 4. Same-origin /_next/static/* → cache-first  (immutable hashed assets)
 * 5. Everything else (navigations, pages) → network-first
 *
 * Navigations render PRIVATE, per-user trip data, so they must NOT be served
 * stale from a shared (URL-keyed) cache — that would leak one traveller's trip
 * to another user on the same device/browser. network-first always fetches
 * fresh from the server (which is authenticated by the session cookie) and
 * falls back to the cache only when the network fails, or, for a navigation
 * with a saved copy, answers 5xx or takes longer than NAVIGATION_TIMEOUT_MS
 * (ADR 0077). Combined with clearing the cache on sign-out, the fallback can
 * only ever be the same user's own data.
 */
export function cacheStrategyFor({ method, url, sameOrigin, routerRequest }: StrategyInput): CacheStrategy {
  // Rule 1: never cache mutations
  if (method.toUpperCase() !== 'GET') {
    return 'network-only';
  }

  // Rule 1b (spec 2026-10-06 §T): router payloads and prefetches are never
  // cached — they were the bulk of the unbounded growth, and an offline
  // client navigation falls back to the cached page itself.
  if (routerRequest) {
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

  // Rule 4b: the launch page is public and the same for everyone, precached
  // per build. It is answered from any store, then from the network for at
  // most NAVIGATION_TIMEOUT_MS, and otherwise hands over to LAUNCH_HANDOVER_PATH
  // (where the offline launch logic already lives); no saved-copy mark.
  if (isLaunchPage(url)) {
    return 'launch-page';
  }

  // Rule 5: network-first for navigations / pages (private per-user data)
  return 'network-first';
}

// ---------------------------------------------------------------------------
// Cache stores (spec 2026-10-06 §T)
// ---------------------------------------------------------------------------

export type CacheStore = 'static' | 'pages' | 'files';

/**
 * Per-store entry caps; the oldest entries go first. `files` (attachments
 * and covers) has no entry cap: ADR 0043's per-Trip byte cap bounds it when
 * it is warmed.
 */
export const CACHE_ENTRY_LIMITS: Record<CacheStore, number | null> = { static: 300, pages: 400, files: null };

/** The static store is named by build; activate keeps this build's and the previous build's (staleCacheNames). */
export function cacheNames(buildId: string): Record<CacheStore, string> {
  return { static: `teepee-static-${buildId}`, pages: 'teepee-pages-v1', files: 'teepee-files-v1' };
}

/** Which store a cacheable request lives in. */
export function cacheStoreFor(url: string): CacheStore {
  if (isAttachmentRoute(url) || isCoverRoute(url)) return 'files';
  if (isNextStaticAsset(url)) return 'static';
  if (isPinnedCacheEntry(url)) return 'static';
  return 'pages';
}

export interface HeaderReader {
  get(name: string): string | null;
}

/** A Next router payload (`RSC`) or prefetch (`Next-Router-Prefetch`) request. */
export function isRouterRequest(headers: HeaderReader): boolean {
  return headers.get('RSC') !== null || headers.get('Next-Router-Prefetch') !== null;
}

/**
 * Entries a store's cap never evicts: the precached offline and launch pages, the
 * navigation fallback when nothing else is cached. Mirrored in sw.js trimCache.
 */
export function isPinnedCacheEntry(url: string): boolean {
  try {
    return PRECACHED_PATHS.includes(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** The static pages precached on install, in public/. Mirrored as PRECACHE_URLS in sw.js. */
export const PRECACHED_PATHS = ['/offline.html', '/launch.html'];

/** Where the launch page hands over, and where a launch page nothing can answer redirects to. */
export const LAUNCH_HANDOVER_PATH = '/';

/** The page the installed app opens on (manifest start_url): it animates the loading mark, then hands over to the app. */
export function isLaunchPage(url: string): boolean {
  try {
    return new URL(url).pathname === '/launch.html';
  } catch {
    return false;
  }
}

// A browser refuses a `redirected` response as the answer to a navigation, so
// a stored copy is rebuilt without the flag. Mirrored in sw.js.
export function storableResponse(response: Response): Response {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export function asksForBytes(url: string): boolean {
  const queryAt = url.indexOf('?');
  if (queryAt === -1) return false;
  return url.slice(queryAt + 1).split('&').includes(`${OFFLINE_BYTES_PARAM}=1`);
}

// Entries kept before redirects were stripped are replaced by the warm's own fetch. Mirrored in sw.js.
export function isServableCacheHit(mode: string, cached: { redirected: boolean }, bytesRequested = false): boolean {
  return !(cached.redirected && (mode === 'navigate' || bytesRequested));
}

// Spec 2026-11-17 §A5, ADR 0077: a navigation with a saved copy waits this long
// for the network, then is answered from the saved copy. Mirrored in sw.js.
export const NAVIGATION_TIMEOUT_MS = 4000;
export const SAVED_COPY_HEADER = 'X-Teepee-Saved-Copy';
// The offline save's request header: a Day page asked for with it renders its
// near days only, so a Trip's saved Day pages grow with its length, not its
// length squared (spec 2026-11-19 §1).
export const WARM_REQUEST_HEADER = 'x-teepee-warm';
export const SAVED_COPY_MESSAGE = 'SAVED_COPY';

// A 4xx is the app's real answer (a deleted Trip's 404), so only a 5xx gives way to the saved copy.
export function isServerFailure(status: number): boolean {
  return status >= 500;
}

// A link that adds a query to a saved page (`?by=place`) has no entry of its own:
// pages are saved without one. The worker redirects to the plain path rather than
// serving its body at the query URL, so the address and the page agree. Mirrored in sw.js.
export function queryFallbackPath(url: string, mode: string, exactServable: boolean, plainServable: boolean): string | null {
  if (mode !== 'navigate' || exactServable || !plainServable) return null;
  const { pathname, search } = new URL(url);
  return search ? pathname : null;
}

// Every navigation answered from the cache carries the mark. A request that is
// not a navigation carries it only when the network failed and the cache
// answered instead, so the offline save can tell an old copy from a fresh one.
export function savedCopyResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(SAVED_COPY_HEADER, '1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function savedCopyMessage(url: string): { type: typeof SAVED_COPY_MESSAGE; url: string } {
  return { type: SAVED_COPY_MESSAGE, url };
}

// The page pulls what the worker just did (ADR 0077): a pushed message can reach
// a client before its page listens, so the worker also remembers, in memory and
// briefly, the paths it answered with a saved copy. Mirrored in sw.js.
export const WAS_SAVED_COPY_MESSAGE = 'WAS_SAVED_COPY';
export const SAVED_COPY_RECORD_TTL_MS = 60000;
export const SAVED_COPY_RECORD_LIMIT = 8;

export interface SavedCopyRecord {
  path: string;
  at: number;
}

export function withSavedCopyRecord(records: SavedCopyRecord[], path: string, now: number): SavedCopyRecord[] {
  const live = records.filter((r) => r.path !== path && now - r.at < SAVED_COPY_RECORD_TTL_MS);
  return [...live, { path, at: now }].slice(-SAVED_COPY_RECORD_LIMIT);
}

export function withoutSavedCopyRecord(records: SavedCopyRecord[], path: string): SavedCopyRecord[] {
  return records.filter((r) => r.path !== path);
}

export function wasSavedCopy(records: SavedCopyRecord[], path: string, now: number): boolean {
  return records.some((r) => r.path === path && now - r.at < SAVED_COPY_RECORD_TTL_MS);
}

export function wasSavedCopyQueryPath(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { type, url } = data as { type?: unknown; url?: unknown };
  return type === WAS_SAVED_COPY_MESSAGE && typeof url === 'string' ? url : null;
}

// A warm's file that came back redirected (a login page, say) is not the bytes
// asked for: keeping it would make a later warm count it as saved. Mirrored in sw.js.
export function shouldStoreResponse(bytesRequested: boolean, response: { ok: boolean; redirected: boolean }): boolean {
  return response.ok && !(bytesRequested && response.redirected);
}

/** How many of the oldest entries to drop to get back under `limit`. */
export function evictionCount(entries: number, limit: number | null): number {
  if (limit === null) return 0;
  return Math.max(0, entries - limit);
}

/**
 * The worker's own bookkeeping store: one entry recording which build last
 * activated and the build before it, so activate can keep the previous
 * build's static store (pages Saved for offline under that build still point
 * at its chunks until they are re-warmed). Mirrored in sw.js.
 */
export const META_CACHE_NAME = 'teepee-meta-v1';
/** The reserved key the build record lives under in META_CACHE_NAME. */
export const BUILD_META_PATH = '/__teepee/build-meta';

// Spec 2026-11-17 §A1: the Trip Home last opened, kept in META_CACHE_NAME so an
// offline launch at `/` opens it. Mirrored in sw.js.
export const LAST_TRIP_PATH = '/__teepee/last-trip';

export function isCachedTripHome(path: string): boolean {
  const match = /^\/trips\/([^/?#]+)$/.exec(path);
  return match !== null && !RESERVED_TRIP_SLUGS.has(match[1]);
}

// A cached Landing (`/`) is never picked: it can predate the sign-in.
export function pickOfflineStart(cachedUrls: string[], lastTripPath: string | null): string | null {
  if (lastTripPath && cachedUrls.includes(lastTripPath)) return lastTripPath;
  const home = cachedUrls.find(isCachedTripHome);
  if (home) return home;
  return cachedUrls.includes('/trips') ? '/trips' : null;
}

export function lastTripMessagePath(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { type, path } = data as { type?: unknown; path?: unknown };
  return type === 'LAST_TRIP' && typeof path === 'string' && isCachedTripHome(path) ? path : null;
}

export interface BuildMeta {
  build: string;
  previous: string | null;
}

/**
 * The record an activating worker for `buildId` writes, given what it read.
 * A re-activation of the same build keeps the recorded previous build; a new
 * build makes the recorded one its previous. No record → no previous known.
 */
export function nextBuildMeta(stored: BuildMeta | null, buildId: string): BuildMeta {
  if (!stored) return { build: buildId, previous: null };
  if (stored.build === buildId) return { build: buildId, previous: stored.previous };
  return { build: buildId, previous: stored.build };
}

/**
 * Caches an activating worker deletes: everything but this build's three
 * stores, the meta store, and the immediately previous build's static store
 * (so HTML Saved for offline under that build still finds its CSS/JS).
 * Older `teepee-static-*` stores and the legacy `trip-planner-v6` go.
 */
export function staleCacheNames(existing: string[], buildId: string, previousBuildId?: string | null): string[] {
  const keep = new Set([...Object.values(cacheNames(buildId)), META_CACHE_NAME]);
  if (previousBuildId) keep.add(cacheNames(previousBuildId).static);
  return existing.filter((name) => !keep.has(name));
}

// Sign-out deletes every store but this build's static store, which the worker
// then empties down to its pinned offline page, and the meta store, which keeps
// the build record: with no deploy there is no new install to precache the
// offline page again. Mirrored in sw.js.
export function signOutCacheNames(existing: string[], buildId: string): string[] {
  const keep = new Set([cacheNames(buildId).static, META_CACHE_NAME]);
  return existing.filter((name) => !keep.has(name));
}
