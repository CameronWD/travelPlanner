import { describe, it, expect } from 'vitest';
import { cacheStrategyFor, isNextStaticAsset, isApiRoute } from './offline';

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

  // Rule 5: same-origin page/navigation GET → stale-while-revalidate
  it('returns stale-while-revalidate for same-origin GET to home page', () => {
    expect(
      cacheStrategyFor({ method: 'GET', url: `${origin}/`, sameOrigin: true })
    ).toBe('stale-while-revalidate');
  });

  it('returns stale-while-revalidate for same-origin GET to a trip page', () => {
    expect(
      cacheStrategyFor({
        method: 'GET',
        url: `${origin}/trips/abc123/budget`,
        sameOrigin: true,
      })
    ).toBe('stale-while-revalidate');
  });

  it('returns stale-while-revalidate for same-origin GET to RSC payload', () => {
    expect(
      cacheStrategyFor({
        method: 'GET',
        url: `${origin}/trips/abc123?_rsc=xyz`,
        sameOrigin: true,
      })
    ).toBe('stale-while-revalidate');
  });

  it('returns stale-while-revalidate for same-origin GET to sign-in page', () => {
    expect(
      cacheStrategyFor({ method: 'GET', url: `${origin}/signin`, sameOrigin: true })
    ).toBe('stale-while-revalidate');
  });
});
