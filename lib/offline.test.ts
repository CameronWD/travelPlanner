import { describe, it, expect } from 'vitest';
import { cacheStrategyFor, isNextStaticAsset, isApiRoute, isAttachmentRoute, isCoverRoute, tripOfflinePaths, MAX_WARM_DAYS, MAX_WARM_ATTACHMENT_BYTES, MAX_WARM_TRIP_BYTES, warmDayDates, isWarmFresh, isConstrainedConnection, WARM_FRESH_MS, isRouterRequest, cacheStoreFor, cacheNames, CACHE_ENTRY_LIMITS, evictionCount, staleCacheNames, isPinnedCacheEntry, nextBuildMeta, META_CACHE_NAME } from './offline';

// ---------------------------------------------------------------------------
// URL classification helpers
// ---------------------------------------------------------------------------

describe('isNextStaticAsset', () => {
  it('returns true for /_next/static/ paths', () => {
    expect(isNextStaticAsset('http://localhost:3000/_next/static/chunks/main.js')).toBe(true);
    expect(isNextStaticAsset('http://localhost:3000/_next/static/css/styles.css')).toBe(true);
  });

  it('returns false for non-static Next paths', () => {
    expect(isNextStaticAsset('http://localhost:3000/_next/image?url=...')).toBe(false);
    expect(isNextStaticAsset('http://localhost:3000/some/page')).toBe(false);
  });
});

describe('isApiRoute', () => {
  it('returns true for /api/* paths', () => {
    expect(isApiRoute('http://localhost:3000/api/fx')).toBe(true);
    expect(isApiRoute('http://localhost:3000/api/auth/session')).toBe(true);
    expect(isApiRoute('http://localhost:3000/api/auth/callback/google')).toBe(true);
  });

  it('returns false for non-api paths', () => {
    expect(isApiRoute('http://localhost:3000/')).toBe(false);
    expect(isApiRoute('http://localhost:3000/trips/123')).toBe(false);
    expect(isApiRoute('http://localhost:3000/_next/static/main.js')).toBe(false);
  });
});

describe('isAttachmentRoute', () => {
  it('returns true for attachment serve URLs', () => {
    expect(isAttachmentRoute('http://localhost:3000/api/attachments/abc123')).toBe(true);
  });
  it('returns false for other API routes and lookalikes', () => {
    expect(isAttachmentRoute('http://localhost:3000/api/attachments')).toBe(false);
    expect(isAttachmentRoute('http://localhost:3000/api/attachmentsfoo/x')).toBe(false);
    expect(isAttachmentRoute('http://localhost:3000/api/attachments/a/b')).toBe(false);
    expect(isAttachmentRoute('http://localhost:3000/api/trips/t1/cover')).toBe(false);
    expect(isAttachmentRoute('not a url')).toBe(false);
  });
});

describe('isCoverRoute', () => {
  it('returns true for the trip cover serve URL, with or without its ?v= cache-buster', () => {
    expect(isCoverRoute('http://localhost:3000/api/trips/t1/cover')).toBe(true);
    expect(isCoverRoute('http://localhost:3000/api/trips/t1/cover?v=covers%2Ft1%2Fabc.webp')).toBe(true);
  });
  it('returns false for other trip API routes and lookalikes', () => {
    expect(isCoverRoute('http://localhost:3000/api/trips/t1')).toBe(false);
    expect(isCoverRoute('http://localhost:3000/api/trips/t1/cover/extra')).toBe(false);
    expect(isCoverRoute('http://localhost:3000/api/trips/cover')).toBe(false);
    expect(isCoverRoute('http://localhost:3000/api/attachments/abc')).toBe(false);
    expect(isCoverRoute('not a url')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cacheStrategyFor — main decision tree
// ---------------------------------------------------------------------------

describe('cacheStrategyFor', () => {
  const origin = 'http://localhost:3000';

  // Rule 1: non-GET → network-only
  it('returns network-only for POST requests (mutations)', () => {
    expect(
      cacheStrategyFor({ method: 'POST', url: `${origin}/trips/new`, sameOrigin: true })
    ).toBe('network-only');
  });

  it('returns network-only for PUT requests', () => {
    expect(
      cacheStrategyFor({ method: 'PUT', url: `${origin}/trips/123`, sameOrigin: true })
    ).toBe('network-only');
  });

  it('returns network-only for DELETE requests', () => {
    expect(
      cacheStrategyFor({ method: 'DELETE', url: `${origin}/trips/123`, sameOrigin: true })
    ).toBe('network-only');
  });

  it('returns network-only for PATCH requests', () => {
    expect(
      cacheStrategyFor({ method: 'PATCH', url: `${origin}/trips/123`, sameOrigin: true })
    ).toBe('network-only');
  });

  // Rule 2: cross-origin GET → network-only
  it('returns network-only for cross-origin GET (e.g. tile server)', () => {
    expect(
      cacheStrategyFor({
        method: 'GET',
        url: 'https://tile.openstreetmap.org/12/2048/1360.png',
        sameOrigin: false,
      })
    ).toBe('network-only');
  });

  it('returns network-only for cross-origin GET (FX API)', () => {
    expect(
      cacheStrategyFor({
        method: 'GET',
        url: 'https://api.exchangerate.host/latest',
        sameOrigin: false,
      })
    ).toBe('network-only');
  });

  // Rule 3: same-origin /api/* GET → network-only
  it('returns network-only for same-origin GET to /api/fx', () => {
    expect(
      cacheStrategyFor({ method: 'GET', url: `${origin}/api/fx`, sameOrigin: true })
    ).toBe('network-only');
  });

  it('returns network-only for same-origin GET to /api/auth/session', () => {
    expect(
      cacheStrategyFor({ method: 'GET', url: `${origin}/api/auth/session`, sameOrigin: true })
    ).toBe('network-only');
  });

  it('returns network-only for same-origin GET to /api/auth/callback/*', () => {
    expect(
      cacheStrategyFor({
        method: 'GET',
        url: `${origin}/api/auth/callback/google`,
        sameOrigin: true,
      })
    ).toBe('network-only');
  });

  // Rule 3a: attachment routes (tickets, confirmations) are cacheable network-first
  it('serves attachments cache-first (an Attachment id never changes content)', () => {
    expect(cacheStrategyFor({ method: 'GET', url: `${origin}/api/attachments/abc`, sameOrigin: true }))
      .toBe('cache-first');
  });
  it('keeps non-GET attachment requests network-only', () => {
    expect(cacheStrategyFor({ method: 'POST', url: `${origin}/api/attachments/abc`, sameOrigin: true }))
      .toBe('network-only');
  });
  it('caches the trip cover network-first (ADR 0043, amended 2026-10-01)', () => {
    expect(cacheStrategyFor({ method: 'GET', url: `${origin}/api/trips/t1/cover?v=abc`, sameOrigin: true }))
      .toBe('network-first');
  });
  it('keeps a non-GET cover request network-only', () => {
    expect(cacheStrategyFor({ method: 'POST', url: `${origin}/api/trips/t1/cover`, sameOrigin: true }))
      .toBe('network-only');
  });

  // Rule 4: same-origin /_next/static/* GET → cache-first
  it('returns cache-first for same-origin GET to /_next/static JS chunk', () => {
    expect(
      cacheStrategyFor({
        method: 'GET',
        url: `${origin}/_next/static/chunks/main-abc123.js`,
        sameOrigin: true,
      })
    ).toBe('cache-first');
  });

  it('returns cache-first for same-origin GET to /_next/static CSS', () => {
    expect(
      cacheStrategyFor({
        method: 'GET',
        url: `${origin}/_next/static/css/styles-def456.css`,
        sameOrigin: true,
      })
    ).toBe('cache-first');
  });

  // Rule 5: same-origin page/navigation GET → network-first
  // (private per-user pages must never be served stale from a shared cache)
  it('returns network-first for same-origin GET to home page', () => {
    expect(
      cacheStrategyFor({ method: 'GET', url: `${origin}/`, sameOrigin: true })
    ).toBe('network-first');
  });

  it('returns network-first for same-origin GET to a trip page', () => {
    expect(
      cacheStrategyFor({
        method: 'GET',
        url: `${origin}/trips/abc123/budget`,
        sameOrigin: true,
      })
    ).toBe('network-first');
  });

  it('returns network-first for same-origin GET to RSC payload', () => {
    expect(
      cacheStrategyFor({
        method: 'GET',
        url: `${origin}/trips/abc123?_rsc=xyz`,
        sameOrigin: true,
      })
    ).toBe('network-first');
  });

  it('returns network-first for same-origin GET to sign-in page', () => {
    expect(
      cacheStrategyFor({ method: 'GET', url: `${origin}/signin`, sameOrigin: true })
    ).toBe('network-first');
  });
});

// ---------------------------------------------------------------------------
// tripOfflinePaths
// ---------------------------------------------------------------------------

describe('tripOfflinePaths', () => {
  const FIXED = [
    '/trips/t1',
    '/trips/t1/plan',
    '/trips/t1/today',
    '/trips/t1/summary',
    '/trips/t1/budget',
    '/trips/t1/calendar',
    '/trips/t1/checklists',
    '/trips/t1/files',
    '/trips/t1/help',
    '/whats-new',
  ];

  it('returns the fixed pages + one /day/ path per date in an inclusive range', () => {
    const paths = tripOfflinePaths('t1', '2026-07-01', '2026-07-03');
    expect(paths).toEqual([
      ...FIXED,
      '/trips/t1/day/2026-07-01',
      '/trips/t1/day/2026-07-02',
      '/trips/t1/day/2026-07-03',
    ]);
  });

  it('returns only the ten fixed pages when dates are null', () => {
    expect(tripOfflinePaths('t1', null, null)).toEqual(FIXED);
  });

  it('warms Today, Money and Calendar — the read-on-the-road views (spec 2026-10-01 §F2)', () => {
    const paths = tripOfflinePaths('t1', null, null);
    expect(paths).toContain('/trips/t1/today');
    expect(paths).toContain('/trips/t1/budget');
    expect(paths).toContain('/trips/t1/calendar');
  });

  it('caps day paths at MAX_WARM_DAYS for a 400-day range', () => {
    const paths = tripOfflinePaths('t1', '2026-01-01', '2027-02-05'); // > 400 days
    expect(paths).toHaveLength(FIXED.length + MAX_WARM_DAYS);
  });

  it('appends attachment urls within the size cap and skips oversized ones', () => {
    const paths = tripOfflinePaths('t1', null, null, [
      { url: '/api/attachments/small', size: 1024 },
      { url: '/api/attachments/huge', size: MAX_WARM_ATTACHMENT_BYTES + 1 },
    ]);
    expect(paths).toContain('/api/attachments/small');
    expect(paths).not.toContain('/api/attachments/huge');
  });

  it('warms no attachments when none are passed', () => {
    expect(tripOfflinePaths('t1', null, null).some((p) => p.startsWith('/api/'))).toBe(false);
  });

  it('warms newest attachments first and stops at 200 MB', () => {
    const MiB = 1024 * 1024;
    const atts = Array.from({ length: 30 }, (_, i) => ({
      url: `/api/attachments/a${i}`,
      size: 10 * MiB,
      createdAt: new Date(2026, 0, i + 1),
    }));
    const paths = tripOfflinePaths('eu', null, null, atts).filter((p) => p.startsWith('/api/attachments/'));
    expect(paths).toHaveLength(20);
    expect(paths[0]).toBe('/api/attachments/a29');
    expect(paths).not.toContain('/api/attachments/a0');
  });

  it('at exactly 200 MB nothing is skipped', () => {
    const MiB = 1024 * 1024;
    const atts = Array.from({ length: 20 }, (_, i) => ({
      url: `/api/attachments/a${i}`,
      size: 10 * MiB,
      createdAt: new Date(2026, 0, i + 1),
    }));
    expect(MAX_WARM_TRIP_BYTES).toBe(200 * 1024 * 1024);
    const paths = tripOfflinePaths('eu', null, null, atts).filter((p) => p.startsWith('/api/attachments/'));
    expect(paths).toHaveLength(20);
  });

  it('sorts attachments missing createdAt last', () => {
    const atts = [
      { url: '/api/attachments/no-date', size: 1024 },
      { url: '/api/attachments/dated', size: 1024, createdAt: new Date(2026, 0, 1) },
    ];
    const paths = tripOfflinePaths('t1', null, null, atts).filter((p) => p.startsWith('/api/attachments/'));
    expect(paths).toEqual(['/api/attachments/dated', '/api/attachments/no-date']);
  });

  it('appends the cover URL exactly as given (query string intact) when the trip has a photo', () => {
    const cover = '/api/trips/trip-id/cover?v=covers%2Ftrip-id%2Fabc.webp';
    const paths = tripOfflinePaths('t1', null, null, [], cover);
    expect(paths.slice(-2)).toEqual([cover, `${cover}&w=480`]);
  });

  it('warms both cover sizes the pages request (spec 2026-10-06 §H)', () => {
    const paths = tripOfflinePaths('my-trip', null, null, [], '/api/trips/t1/cover?v=k');
    expect(paths).toContain('/api/trips/t1/cover?v=k');
    expect(paths).toContain('/api/trips/t1/cover?v=k&w=480');
  });

  it('adds nothing for the cover when the trip has no photo', () => {
    expect(tripOfflinePaths('t1', null, null, [], null)).toEqual(FIXED);
  });
});

describe('warmDayDates (spec 2026-10-06 §A)', () => {
  it('returns every day, capped at MAX_WARM_DAYS, outside Travelling', () => {
    expect(warmDayDates('2026-07-01', '2026-07-03', { phase: 'planning', today: '2026-06-01' })).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(warmDayDates('2026-01-01', '2027-02-05')).toHaveLength(MAX_WARM_DAYS);
  });
  it('while Travelling returns only the days within 7 either side of today', () => {
    const days = warmDayDates('2026-07-01', '2026-08-30', { phase: 'travelling', today: '2026-07-20' });
    expect(days[0]).toBe('2026-07-13');
    expect(days[days.length - 1]).toBe('2026-07-27');
    expect(days).toHaveLength(15);
  });
  it('clamps the Travelling window to the Trip', () => {
    expect(warmDayDates('2026-07-01', '2026-07-05', { phase: 'travelling', today: '2026-07-02' })).toEqual(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05']);
  });
  it('is empty without both dates', () => {
    expect(warmDayDates(null, '2026-07-05')).toEqual([]);
  });
});

describe('tripOfflinePaths day window (spec 2026-10-06 §A)', () => {
  it('passes the window through to the day pages', () => {
    const paths = tripOfflinePaths('t1', '2026-07-01', '2026-08-30', [], null, { phase: 'travelling', today: '2026-07-20' });
    const days = paths.filter((p) => p.startsWith('/trips/t1/day/'));
    expect(days).toHaveLength(15);
    expect(days).toContain('/trips/t1/day/2026-07-20');
    expect(days).not.toContain('/trips/t1/day/2026-07-01');
  });
});

describe('isWarmFresh', () => {
  const now = 1_800_000_000_000;
  it('is fresh under 6 hours, stale at 6 hours or with no warm yet', () => {
    expect(isWarmFresh(now - WARM_FRESH_MS + 1000, now)).toBe(true);
    expect(isWarmFresh(now - WARM_FRESH_MS, now)).toBe(false);
    expect(isWarmFresh(null, now)).toBe(false);
  });
  it('treats a timestamp in the future (clock change) as stale', () => {
    expect(isWarmFresh(now + 60_000, now)).toBe(false);
  });
});

describe('isConstrainedConnection', () => {
  it('is true for Save-Data, slow-2g and 2g', () => {
    expect(isConstrainedConnection({ saveData: true })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: 'slow-2g' })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: '2g' })).toBe(true);
  });
  it('is false for 3g/4g or when the browser reports nothing', () => {
    expect(isConstrainedConnection({ effectiveType: '4g', saveData: false })).toBe(false);
    expect(isConstrainedConnection({ effectiveType: '3g' })).toBe(false);
    expect(isConstrainedConnection(undefined)).toBe(false);
  });
});

describe('service-worker cache bounds (spec 2026-10-06 §T)', () => {
  const origin = 'http://localhost:3000';
  const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

  it('never caches router (RSC) or prefetch requests', () => {
    expect(isRouterRequest(headers({ rsc: '1' }))).toBe(true);
    expect(isRouterRequest(headers({ 'next-router-prefetch': '1' }))).toBe(true);
    expect(isRouterRequest(headers({}))).toBe(false);
    expect(cacheStrategyFor({ method: 'GET', url: `${origin}/trips/x/plan?_rsc=1`, sameOrigin: true, routerRequest: true })).toBe('network-only');
  });

  it('sorts requests into three stores', () => {
    expect(cacheStoreFor(`${origin}/_next/static/chunks/a.js`)).toBe('static');
    expect(cacheStoreFor(`${origin}/offline.html`)).toBe('static');
    expect(cacheStoreFor(`${origin}/api/attachments/a1`)).toBe('files');
    expect(cacheStoreFor(`${origin}/api/trips/t1/cover?v=k&w=480`)).toBe('files');
    expect(cacheStoreFor(`${origin}/trips/x/plan`)).toBe('pages');
  });

  it('names the static store by build, the others by version', () => {
    expect(cacheNames('b1')).toEqual({ static: 'teepee-static-b1', pages: 'teepee-pages-v1', files: 'teepee-files-v1' });
  });

  it('caps static at 300 and pages at 400; files has no entry cap', () => {
    expect(CACHE_ENTRY_LIMITS).toEqual({ static: 300, pages: 400, files: null });
    expect(evictionCount(401, 400)).toBe(1);
    expect(evictionCount(10, 400)).toBe(0);
    expect(evictionCount(5000, null)).toBe(0);
  });

  it('never evicts the offline page', () => {
    expect(isPinnedCacheEntry(`${origin}/offline.html`)).toBe(true);
    expect(isPinnedCacheEntry(`${origin}/_next/static/chunks/a.js`)).toBe(false);
  });

  it('on activate, drops every cache but this build\'s three', () => {
    expect(staleCacheNames(['trip-planner-v6', 'teepee-static-old', 'teepee-static-b1', 'teepee-pages-v1', 'teepee-files-v1'], 'b1'))
      .toEqual(['trip-planner-v6', 'teepee-static-old']);
  });

  it('on activate, keeps the previous build\'s static store but drops older ones', () => {
    expect(staleCacheNames(['trip-planner-v6', 'teepee-static-b0', 'teepee-static-b1', 'teepee-static-b2', 'teepee-pages-v1', 'teepee-files-v1', META_CACHE_NAME], 'b2', 'b1'))
      .toEqual(['trip-planner-v6', 'teepee-static-b0']);
  });

  it('never deletes the meta store', () => {
    expect(staleCacheNames([META_CACHE_NAME], 'b1')).toEqual([]);
  });

  it('records the build that activated and the one before it', () => {
    expect(nextBuildMeta(null, 'b1')).toEqual({ build: 'b1', previous: null });
    expect(nextBuildMeta({ build: 'b1', previous: null }, 'b2')).toEqual({ build: 'b2', previous: 'b1' });
    expect(nextBuildMeta({ build: 'b2', previous: 'b1' }, 'b2')).toEqual({ build: 'b2', previous: 'b1' });
    expect(nextBuildMeta({ build: 'b2', previous: 'b1' }, 'b3')).toEqual({ build: 'b3', previous: 'b2' });
  });
});
