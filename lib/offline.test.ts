import { describe, it, expect } from 'vitest';
import { cacheStrategyFor, isNextStaticAsset, isApiRoute, isAttachmentRoute, tripOfflinePaths, MAX_WARM_DAYS, MAX_WARM_ATTACHMENT_BYTES } from './offline';

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
  it('caches attachment bytes network-first (offline tickets)', () => {
    expect(cacheStrategyFor({ method: 'GET', url: `${origin}/api/attachments/abc`, sameOrigin: true }))
      .toBe('network-first');
  });
  it('keeps non-GET attachment requests network-only', () => {
    expect(cacheStrategyFor({ method: 'POST', url: `${origin}/api/attachments/abc`, sameOrigin: true }))
      .toBe('network-only');
  });
  it('keeps the trip cover route network-only (deliberately outside the carve-out)', () => {
    expect(cacheStrategyFor({ method: 'GET', url: `${origin}/api/trips/t1/cover`, sameOrigin: true }))
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
  it('returns base paths + one /day/ path per date in an inclusive range', () => {
    const paths = tripOfflinePaths('t1', '2026-07-01', '2026-07-03');
    expect(paths).toEqual([
      '/trips/t1',
      '/trips/t1/plan',
      '/trips/t1/summary',
      '/trips/t1/checklists',
      '/trips/t1/files',
      '/trips/t1/help',
      '/whats-new',
      '/trips/t1/day/2026-07-01',
      '/trips/t1/day/2026-07-02',
      '/trips/t1/day/2026-07-03',
    ]);
  });

  it('returns only the seven non-day paths when dates are null', () => {
    const paths = tripOfflinePaths('t1', null, null);
    expect(paths).toEqual([
      '/trips/t1',
      '/trips/t1/plan',
      '/trips/t1/summary',
      '/trips/t1/checklists',
      '/trips/t1/files',
      '/trips/t1/help',
      '/whats-new',
    ]);
  });

  it('caps day paths at MAX_WARM_DAYS for a 400-day range', () => {
    const paths = tripOfflinePaths('t1', '2026-01-01', '2027-02-05'); // > 400 days
    expect(paths).toHaveLength(7 + MAX_WARM_DAYS);
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
});
