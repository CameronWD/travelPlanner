# Nominatim Response Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop re-requesting the same place from OpenStreetMap Nominatim by memoising successful responses in-process, so the app complies with Nominatim's usage policy (cache results; don't repeat identical queries).

**Architecture:** All geocoding already funnels through three request builders in `lib/geocode.ts`. Introduce a single module-level `Map` memo behind one shared `cachedFetchJson(url)` helper (a caching upgrade of the existing private `fetchJson`), and route all three builders through it. Only successful responses (HTTP 2xx + valid JSON, including genuine empty "no match" results) are cached; failures are never cached and stay retryable. This mirrors the in-memory `Map` cache already used by `lib/weather.ts`. Then record the decision in a new ADR.

**Tech Stack:** TypeScript, Nominatim (OpenStreetMap) HTTP API, Vitest (`fetch` mocked via `vi.stubGlobal`). Deployed on Vercel serverless.

## Global Constraints

- Cache is **in-memory only** — a module-level `Map` in `lib/geocode.ts`. NO new dependency, NO Redis/KV, NO `GeocodeCache` Prisma model, NO migration.
- NO runtime rate limiter. The `scripts/backfill-geocode.ts` 1100 ms throttle is the only pacing and must NOT be touched by this work.
- Preserve every existing contract of `lib/geocode.ts`: never throws; `geocodePlace`/`geocodePlaceDetailed`/`reverseGeocode` return `null` on failure or empty; `searchPlacesWithStatus` returns `{ status: "error" }` on transport/HTTP/parse failure and `{ status: "ok", candidates }` (possibly empty) otherwise; `searchPlaces` returns `[]` on failure/empty.
- Cache **successful responses including empty ones**; NEVER cache a failure (network error, 5 s timeout/abort, non-2xx HTTP, or unparseable body). A cached failure must be impossible.
- Keep the existing 5 s `AbortController` timeout, the `User-Agent`/`NOMINATIM_CONTACT` header, the `Accept: application/json` header, and the `accept-language=en` parameter on all requests.
- No eviction / no TTL on the memo (matches `lib/weather.ts`; geocoding results are stable and two-user volume makes growth negligible).
- Tests never hit the network (`fetch` mocked via `vi.stubGlobal`). The module-level memo persists across test cases, so tests MUST reset it between cases.
- Commit trailer (last line of every commit, after a blank line): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: In-memory response cache in `lib/geocode.ts`

**Files:**
- Modify: `lib/geocode.ts`
- Test: `lib/geocode.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `cachedFetchJson(url: string): Promise<unknown | null>` — private (not exported). Replaces the current private `fetchJson`. Returns parsed JSON on HTTP 2xx, `null` on any failure; memoises only successes by URL.
  - `_resetGeocodeCacheForTests(): void` — **exported**, clears the memo. Test-only seam (module-level `Map` state otherwise leaks between test cases).
  - No change to the public signatures of `geocodePlace`, `searchPlaces`, `searchPlacesWithStatus`, `geocodePlaceDetailed`, `reverseGeocode`.

**Context for the implementer:**
- `fetchJson` currently has no external references (verified) — it is safe to rename/replace it with `cachedFetchJson`.
- `geocodePlace` and `searchPlacesWithStatus` currently inline their own `fetch` + timeout + `res.ok` + `res.json()`. Refactor both to call `cachedFetchJson(url.toString())` and keep only their result-shaping logic. `reverseGeocode` already calls `fetchJson` — point it at `cachedFetchJson`. This is what makes the memo cover all three paths from one place.
- Behaviour must not change except for the caching: `cachedFetchJson` returns `null` on non-ok/throw (so `searchPlacesWithStatus` still yields `{ status: "error" }` for those) and the parsed body otherwise (an ok-but-non-array body is still an `error` because `searchPlacesWithStatus` checks `Array.isArray`).
- Distinctive query strings in the new tests (e.g. `"cache-hit-paris"`, `"retry-me"`, `"nowhere-xyz"`) avoid any URL collision with other `describe` blocks even before the reset lands.

- [ ] **Step 1: Write the failing caching tests + add the reset seam to the test file**

In `lib/geocode.test.ts`, change the import line to add the reset seam:

```typescript
import { geocodePlace, searchPlaces, searchPlacesWithStatus, reverseGeocode, _resetGeocodeCacheForTests } from "./geocode";
```

Change the existing `afterEach` to also clear the memo (otherwise cached results leak across cases and break existing tests):

```typescript
afterEach(() => {
  vi.clearAllMocks();
  _resetGeocodeCacheForTests();
});
```

Add this new `describe` block at the end of the file:

```typescript
describe("response caching", () => {
  it("serves a repeated identical query from cache (one fetch)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: "48.8566", lon: "2.3522", display_name: "Paris, France", address: {} },
      ],
    });

    const first = await searchPlaces("cache-hit-paris");
    const second = await searchPlaces("cache-hit-paris");

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not cache a failed request (a later identical query retries)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const first = await searchPlacesWithStatus("retry-me");

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: "1", lon: "2", display_name: "Somewhere", address: {} },
      ],
    });
    const second = await searchPlacesWithStatus("retry-me");

    expect(first.status).toBe("error");
    expect(second.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches a genuine empty result (no repeat fetch for a no-match query)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    const first = await searchPlacesWithStatus("nowhere-xyz");
    const second = await searchPlacesWithStatus("nowhere-xyz");

    expect(first).toEqual({ status: "ok", candidates: [] });
    expect(second).toEqual({ status: "ok", candidates: [] });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/geocode.test.ts`
Expected: FAIL. Because `_resetGeocodeCacheForTests` is not exported yet, the `afterEach` throws `_resetGeocodeCacheForTests is not a function` and/or the three new caching assertions fail (fetch is called twice, not once). This confirms red.

- [ ] **Step 3: Implement the memo + `cachedFetchJson`, and route all three builders through it**

In `lib/geocode.ts`, **replace the existing private `fetchJson` function** (the `async function fetchJson(url: string)…` block) with the memo, the reset seam, and `cachedFetchJson`:

```typescript
// In-memory memo of successful Nominatim responses, keyed by request URL.
// Nominatim's usage policy asks callers to cache and not repeat identical
// queries. Geocoding results are stable, so entries live for the life of the
// server instance with no eviction — two-user volume makes growth a non-issue
// (mirrors the in-memory cache in lib/weather.ts). Only successful responses
// are stored; failures (network error, timeout, non-2xx, unparseable body) are
// never cached, so a transient outage never sticks and the next call retries.
const responseCache = new Map<string, unknown>();

/** Test-only seam: clear the in-memory response cache between cases. */
export function _resetGeocodeCacheForTests(): void {
  responseCache.clear();
}

/**
 * Fetch and parse JSON from a Nominatim URL, memoising successful responses by
 * URL. Returns the parsed body on success (HTTP 2xx + valid JSON), or null on
 * any failure (which is NOT cached). Never throws.
 */
async function cachedFetchJson(url: string): Promise<unknown | null> {
  if (responseCache.has(url)) return responseCache.get(url) ?? null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    responseCache.set(url, data);
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

Rewrite `geocodePlace` to use it (drop its inline fetch/timeout; keep the URL build and coord parsing):

```typescript
export async function geocodePlace(query: string): Promise<LatLng | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);
  url.searchParams.set("accept-language", ACCEPT_LANGUAGE);

  const data = await cachedFetchJson(url.toString());
  if (!Array.isArray(data) || data.length === 0) return null;

  const { lat, lon } = data[0] as NominatimResult;
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lngNum)) return null;

  return { lat: latNum, lng: lngNum };
}
```

Rewrite `searchPlacesWithStatus` to use it (drop its inline fetch/timeout; keep the empty-query guard and candidate mapping):

```typescript
export async function searchPlacesWithStatus(
  query: string,
  limit = 5,
): Promise<PlaceSearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { status: "ok", candidates: [] };

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("q", trimmed);
  url.searchParams.set("accept-language", ACCEPT_LANGUAGE);

  const data = await cachedFetchJson(url.toString());
  if (!Array.isArray(data)) return { status: "error" };
  const candidates = (data as NominatimDetailedResult[])
    .map(toCandidate)
    .filter((c): c is GeoCandidate => c !== null);
  return { status: "ok", candidates };
}
```

In `reverseGeocode`, change the one call site from `fetchJson(url.toString())` to `cachedFetchJson(url.toString())`. Leave the rest of `reverseGeocode` unchanged.

Update the module doc comment at the top of the file: replace the stale line `* - Never called in tests — the consumer mocks \`fetch\`.` with:

```typescript
 * - Memoises successful responses in-process by URL (Nominatim asks callers to
 *   cache and not repeat identical queries). Failures are never cached.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/geocode.test.ts`
Expected: PASS — all pre-existing geocode tests plus the three new caching tests (24 total).

Then the type + lint gate:

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx eslint lib/geocode.ts lib/geocode.test.ts`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/geocode.ts lib/geocode.test.ts
git commit -m "feat(geocode): memoise Nominatim responses in-process"
```
(Include the co-author trailer from Global Constraints as the last line.)

---

### Task 2: ADR 0028 — record the caching decision

**Files:**
- Create: `docs/adr/0028-nominatim-response-cache-not-rate-limiting.md`

**Interfaces:**
- Consumes: the caching approach shipped in Task 1.
- Produces: nothing code-facing. There is no ADR index file to update (verified).

**Context for the implementer:**
- Follow the structure of `docs/adr/0011-geocode-located-entities-and-transport-coordinates.md` (which this ADR extends): a `#` title line, then `## Context`, `## Decision`, `## Consequences`.
- This is a documentation-only task. No code changes, no tests.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0028-nominatim-response-cache-not-rate-limiting.md` with exactly this content:

```markdown
# Nominatim etiquette via in-memory response caching, not runtime rate limiting

## Context

Every geocode goes to OpenStreetMap's free, shared Nominatim service through
`lib/geocode.ts`. Its usage policy asks callers to send a real contact
(already done via `NOMINATIM_CONTACT`), to stay under ~1 request/second with no
bulk use, and — crucially — to **cache results and not repeat identical
queries**. ADR 0011 already foresaw this: "If volume ever grows, this is the
place that would need a paid geocoder or a cache."

Until now `lib/geocode.ts` cached nothing, so re-searching or re-saving the same
place re-hit Nominatim every time.

Two obvious "compliance" moves were on the table:

1. **A runtime rate limiter (~1 req/sec).** On Vercel serverless this needs a
   *shared* counter across lambda instances (Redis/KV or a Postgres lock),
   because an in-process limiter does nothing when each request may be a fresh
   instance. That is real new infrastructure — and the load never approaches
   1 req/sec: this is a two-person app where geocodes happen at human pace (a
   Search-button click; one lookup per Stop/Accommodation/Transport save), and
   the only place bursts are possible, `scripts/backfill-geocode.ts`, already
   sleeps 1100 ms between calls.
2. **Caching responses.** Directly removes the actual non-compliance (repeat
   queries) with no new infrastructure.

For the cache mechanism itself we considered a durable Postgres table (mirroring
`ExchangeRate`), but that is a new model + migration + read/write wiring for a
handful of lookups. An in-memory `Map` — the pattern `lib/weather.ts` already
uses — collapses the realistic repeat cases within a warm instance and needs
nothing new.

## Decision

- **Cache, don't rate-limit.** Memoise successful Nominatim responses in-process
  in a module-level `Map` keyed by request URL, behind one `cachedFetchJson`
  helper that all three request builders (`geocodePlace`,
  `searchPlacesWithStatus`, `reverseGeocode`) share.
- **Cache successes only, including genuine empty "no match" results.** Never
  cache a failure (network error, 5 s timeout, non-2xx HTTP, unparseable body)
  so a transient outage never sticks and the next call retries.
- **No eviction, no TTL.** Geocoding results are stable and two-user volume
  makes unbounded growth a non-issue (same choice as `lib/weather.ts`).
- **No runtime rate limiter.** The backfill script's existing 1100 ms throttle
  remains the only pacing, as the only path that can burst.

## Consequences

- Repeat lookups of the same place within a running server instance cost zero
  Nominatim requests; the never-throws / null-on-error contract is unchanged.
- The cache is per-instance and does not survive cold starts, so identical
  queries across instances or after a restart still hit Nominatim once each —
  acceptable at this scale, and the door to a durable cache stays open if volume
  grows (as ADR 0011 anticipated).
- A future reader wondering "why is there no 1 req/sec limiter when the policy
  says so?" — this ADR is the answer: it would be cross-instance infrastructure
  for a load that never reaches the limit, so caching carries the etiquette
  instead.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0028-nominatim-response-cache-not-rate-limiting.md
git commit -m "docs(adr): 0028 Nominatim response caching over rate limiting"
```
(Include the co-author trailer from Global Constraints as the last line.)

---

## Self-review notes

- **Spec coverage:** in-memory memo on all three paths ✓ (Task 1); cache successes + empty, never failures ✓ (Task 1 tests B/C + `cachedFetchJson` only sets on `res.ok`); no rate limiter / backfill untouched ✓ (Global Constraints, not modified); timeout + headers + `accept-language` preserved ✓ (carried into `cachedFetchJson` and each builder); ADR extending 0011 ✓ (Task 2); no CONTEXT.md change ✓ (not a glossary term).
- **No placeholders:** every step has concrete code / exact commands / full ADR text.
- **Type consistency:** `cachedFetchJson` and `_resetGeocodeCacheForTests` are named identically in the test import, the implementation, and all three call sites; `responseCache` is the single memo.
- **Test isolation:** the module-level memo is reset in `afterEach` via the exported seam — without it, the existing `geocodePlace("Paris")` / `searchPlacesWithStatus("paris")` cases that reuse a query across `it` blocks would contaminate each other.
```
