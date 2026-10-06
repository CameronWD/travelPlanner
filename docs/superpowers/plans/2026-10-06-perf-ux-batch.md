# Performance and UX batch (2026-10-06) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut TEEPEE's server load and client bundle, remove every silent failure, and ship the small UX fixes the 2026-10-06 sweep ranked Tier 1 and Tier 2, plus the Photon typeahead.

**Architecture:** Four independent clusters on one branch. Server data (warmer throttle, Day loader split, parallel page queries, fetch revalidation, indexes); client performance (one tree per breakpoint, lazy maps/dialogs/motion, React Compiler, cover sizes, service-worker bounds); UX (failure toasts, deep links, cost defaults, Stop edit, dirty guard, nights stepper, Share chooser, optimistic updates); tooling, Photon and docs. Tasks inside a cluster are ordered; clusters do not depend on each other except where an Interfaces block says so.

**Tech Stack:** Next.js 16.3 (App Router, server actions, Turbopack), React 19.2, Prisma 7 + `@prisma/adapter-pg` on Postgres, Tailwind 4, Radix, `motion` 12, Leaflet 1.9, zod 4, vitest 4 + Testing Library, Playwright (audits only).

**Spec:** `docs/specs/2026-10-06-perf-ux-batch.md` and `docs/specs/2026-10-06-typeahead-photon.md`. Findings: `docs/audits/2026-10-06-perf-ux-library-sweep.md`. Glossary: `CONTEXT.md`.

## Global Constraints

- Node `>=20.19`; Next `16.3.4`; React `19.2.4`; Prisma `7.10.0` — do not bump these.
- Read `node_modules/next/dist/docs/01-app/` before writing Next-specific code; this version differs from training data.
- No `loading.tsx` anywhere under `app/(app)/` except `app/(app)/trips/loading.tsx` (ADR 0063; a convention test pins it). No `template.tsx`.
- Trip URLs use the slug (`lib/trip-path.ts`, ADR 0064); `revalidatePath` must target the path the page actually renders at.
- No paid or keyed service; no new data processor without a sentence on `/privacy` and its test (ADR 0059). Photon and Speed Insights are the only two this batch adds.
- Nominatim: at most one request per second, never from a typeahead (ADR 0069). Photon serves the typeahead.
- `use cache` / `cacheLife` are NOT available (`cacheComponents` is off, NAV-01). Use `fetch(..., { next: { revalidate } })` and React `cache()`.
- UI copy follows `CONTEXT.md` terms: Stop, Traveller, Share link (never bare "share"), Settlement "Before you go" / "On the trip", Pinned, Saved for offline, Flag.
- Every task keeps `npx vitest run`, `npx tsc --noEmit` and `npm run lint` green; unit tests mock `@/lib/db` with `vi.mock`; `TZ=UTC` is set by `npm test`.
- Commit each task separately; Conventional Commits; body says why; end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Never run `npm run feedback:pull|resolve|accept`, never deploy, never touch `main`.

## Review Focus

1. **A Trip with no dates, or a Travelling Trip whose today is outside its date range** — the warmer must still warm the section pages and must not throw on the day window (Task owning §A: add a test for `startDate === null` and for `today` after `endDate`).
2. **A Day page whose neighbours fall outside the Trip** (first and last day) — the shared loader must serve `null` neighbours without a second trip read (§B task: test the first-day case).
3. **An action whose `revalidatePath` targets `/trips/<id>` while the page lives at `/trips/<slug>`** — removing `router.refresh()` there would leave stale UI (§J task: test every touched action revalidates `tripPath(slug)`).
4. **A failed delete while offline** — the toast must say the offline message, the dialog must stay open, and nothing must be optimistically removed (§E and §W tasks: test `success:false` with the `OFFLINE_MESSAGE` and test the optimistic revert).
5. **A Photon response with a feature missing coordinates, or a non-FeatureCollection body** — the combobox must get `status:"error"` or skip the feature, never throw (Photon §A task: test both).

---

> **DRAFT — sections 1–3 (Tasks 1–48) are still being written; section 4 below is final.**

# Section 4 — Photon typeahead, batch-geocode spacing, platform tooling, docs (Tasks 49–62)

Specs: `docs/specs/2026-10-06-typeahead-photon.md` (all of §A–§E) and `docs/specs/2026-10-06-perf-ux-batch.md` §X (everything except `server-only`, the AWS pin and lazy S3) and §Y.

**Order constraints:** Tasks 49→50 and 49→51 in order. Task 58 runs after the §B Day-loader tasks from the other section. Tasks 59–60 (knip) run after every other code task in the whole plan. 61 and 62 run last.

---

### Task 49: Photon client `searchPlacesTypeahead`  (photon spec §A)

**Files:**
- Modify: `lib/geocode.ts:1-10` (module docblock), `lib/geocode.ts:144-165` (`cachedFetchJson`), append after `searchPlacesWithStatus` (ends line 219)
- Test: `lib/geocode.test.ts`

**Interfaces:**
- Consumes: `cachedFetchJson`, `GeoCandidate`, `PlaceSearchOutcome`, `ACCEPT_LANGUAGE`, `_resetGeocodeCacheForTests` (all in `lib/geocode.ts` today)
- Produces: `export async function searchPlacesTypeahead(query: string, limit = 5): Promise<PlaceSearchOutcome>`

- [ ] **Step 1: Write the failing test**

In `lib/geocode.test.ts`, change line 2's import to:
```ts
import { geocodePlace, searchPlaces, searchPlacesWithStatus, searchPlacesTypeahead, reverseGeocode, _resetGeocodeCacheForTests } from "./geocode";
```
Then append at the end of the file:
```ts
// ADR 0069: the as-you-type combobox searches Photon, not Nominatim.
const photonFC = (features: unknown[]) => ({ type: "FeatureCollection", features });
const photonFeature = (coordinates: unknown, properties: Record<string, unknown>) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates },
  properties,
});

describe("searchPlacesTypeahead (Photon)", () => {
  it("maps a feature to a GeoCandidate, lng/lat order, lower-cased country code", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () =>
        photonFC([
          photonFeature([139.7454, 35.6586], {
            name: "Tokyo Tower", city: "Tokyo", country: "Japan", countrycode: "JP", osm_value: "attraction",
          }),
        ]),
    });
    const res = await searchPlacesTypeahead("Tokyo Tower");
    expect(res).toEqual({
      status: "ok",
      candidates: [{ name: "Tokyo Tower, Tokyo, Japan", lat: 35.6586, lng: 139.7454, city: "Tokyo", country: "Japan", countryCode: "jp" }],
    });
  });

  it("falls back through town/village/locality and drops a duplicate name part", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () =>
        photonFC([
          photonFeature([13.64, 47.56], { name: "Hallstatt", village: "Hallstatt", country: "Austria", countrycode: "AT" }),
          photonFeature([2.1, 41.4], { name: "Sagrada Família", locality: "Eixample", country: "Spain" }),
        ]),
    });
    const res = await searchPlacesTypeahead("place");
    if (res.status !== "ok") throw new Error("expected ok");
    expect(res.candidates[0]).toMatchObject({ name: "Hallstatt, Austria", city: "Hallstatt", countryCode: "at" });
    expect(res.candidates[1]).toMatchObject({ name: "Sagrada Família, Eixample, Spain", city: "Eixample", countryCode: null });
  });

  it("skips features without numeric coordinates", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () =>
        photonFC([
          photonFeature(["x", 1], { name: "Bad" }),
          { type: "Feature", properties: { name: "No geometry" } },
          photonFeature([151.21, -33.87], { name: "Sydney", country: "Australia", countrycode: "AU" }),
        ]),
    });
    const res = await searchPlacesTypeahead("syd");
    if (res.status !== "ok") throw new Error("expected ok");
    expect(res.candidates.map((c) => c.name)).toEqual(["Sydney, Australia"]);
  });

  it("returns ok with no candidates on an empty FeatureCollection", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => photonFC([]) });
    expect(await searchPlacesTypeahead("nowhere-xyz")).toEqual({ status: "ok", candidates: [] });
  });

  it("returns ok with no candidates and no fetch for a blank query", async () => {
    expect(await searchPlacesTypeahead("   ")).toEqual({ status: "ok", candidates: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns error on a non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    expect(await searchPlacesTypeahead("paris")).toEqual({ status: "error" });
  });

  it("returns error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    expect(await searchPlacesTypeahead("paris")).toEqual({ status: "error" });
  });

  it("returns error on a body that is not a GeoJSON FeatureCollection, and does not cache it", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ message: "oops" }) });
    expect(await searchPlacesTypeahead("retry-photon")).toEqual({ status: "error" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => photonFC([]) });
    expect(await searchPlacesTypeahead("retry-photon")).toEqual({ status: "ok", candidates: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("calls Photon with q, limit and lang=en", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => photonFC([]) });
    await searchPlacesTypeahead("Tokyo Tower", 5);
    const [url] = fetchMock.mock.calls[0];
    expect(url as string).toMatch(/^https:\/\/photon\.komoot\.io\/api\?/);
    expect(url as string).toContain("lang=en");
    expect(url as string).toContain("limit=5");
    expect(url as string).toContain("q=Tokyo+Tower");
  });

  it("serves a repeated identical query from cache (one fetch)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => photonFC([photonFeature([2.35, 48.85], { name: "Paris", country: "France", countrycode: "FR" })]),
    });
    await searchPlacesTypeahead("cache-hit-photon");
    const second = await searchPlacesTypeahead("cache-hit-photon");
    expect(second.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run lib/geocode.test.ts -t "Photon"`
Expected: FAIL with `searchPlacesTypeahead is not a function` (or a TS import error).

- [ ] **Step 3: Implement**

(a) Replace the module docblock (lines 1–10) with:
```ts
/**
 * Geocoding helpers — OpenStreetMap Nominatim for one-off lookups (saving a
 * place, reverse geocoding, button-press search) and Photon (komoot) for the
 * as-you-type place combobox (ADR 0069; Nominatim's policy forbids
 * autocomplete).
 *
 * Rules:
 * - Never throws; always returns null / { status: "error" } on any error.
 * - Uses an AbortController timeout so it doesn't block actions indefinitely.
 * - Sets a descriptive User-Agent header (required by Nominatim's usage policy;
 *   harmless to Photon).
 * - Memoises successful responses in-process by URL (ADR 0028). Failures —
 *   including a 2xx body of the wrong shape — are never cached.
 */
```

(b) Replace `cachedFetchJson` (lines 144–165, docblock included) with:
```ts
/**
 * Fetch and parse JSON from a geocoder URL, memoising successful responses by
 * URL. Returns the parsed body on success (HTTP 2xx + valid JSON + `accept`
 * says the shape is right), or null on any failure (which is NOT cached).
 * Never throws.
 */
async function cachedFetchJson(
  url: string,
  accept: (data: unknown) => boolean = () => true,
): Promise<unknown | null> {
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
    if (!accept(data)) return null;
    responseCache.set(url, data);
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

(c) Directly after `searchPlacesWithStatus` (after its closing brace, currently line 219), insert:
```ts
// ---------------------------------------------------------------------------
// Photon (komoot) — the as-you-type place search (ADR 0069)
// ---------------------------------------------------------------------------

const PHOTON_URL = "https://photon.komoot.io/api";

interface PhotonProperties {
  name?: string;
  city?: string;
  town?: string;
  village?: string;
  locality?: string;
  country?: string;
  /** ISO 3166-1 alpha-2, upper-case in Photon's responses. */
  countrycode?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: PhotonProperties;
}

function isPhotonFeatureCollection(data: unknown): data is { type: "FeatureCollection"; features: PhotonFeature[] } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as { type?: unknown; features?: unknown };
  return d.type === "FeatureCollection" && Array.isArray(d.features);
}

/** Photon has no `display_name`: compose "name, city, country", blanks and repeats dropped. */
function photonToCandidate(feature: PhotonFeature): GeoCandidate | null {
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords; // GeoJSON order
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = feature.properties ?? {};
  const city = p.city ?? p.town ?? p.village ?? p.locality ?? null;
  const country = p.country ?? null;
  const parts: string[] = [];
  for (const part of [p.name, city, country]) {
    const t = part?.trim();
    if (t && !parts.includes(t)) parts.push(t);
  }
  return {
    name: parts.join(", "),
    lat,
    lng,
    city,
    country,
    countryCode: p.countrycode ? p.countrycode.toLowerCase() : null,
  };
}

/**
 * As-you-type place search on Photon (photon.komoot.io), built for
 * autocomplete. Same contract as `searchPlacesWithStatus`: never throws;
 * "error" on network error, timeout, non-2xx or a body that is not a GeoJSON
 * FeatureCollection; "ok" with [] on no match. No fallback to Nominatim on
 * error — that would recreate the policy violation (ADR 0069).
 */
export async function searchPlacesTypeahead(query: string, limit = 5): Promise<PlaceSearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { status: "ok", candidates: [] };

  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", ACCEPT_LANGUAGE);

  const data = await cachedFetchJson(url.toString(), isPhotonFeatureCollection);
  if (!isPhotonFeatureCollection(data)) return { status: "error" };
  const candidates = data.features
    .map(photonToCandidate)
    .filter((c): c is GeoCandidate => c !== null);
  return { status: "ok", candidates };
}
```
Also change the `GeoCandidate` docblock (line 73) from "A resolved place from Nominatim, …" to "A resolved place from Nominatim or Photon, with the address components we care about."

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run lib/geocode.test.ts`
Expected: PASS (all the existing Nominatim tests too).

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add lib/geocode.ts lib/geocode.test.ts
git commit -m "feat(geocode): add Photon client for the typeahead

Nominatim's usage policy forbids autocomplete; the place combobox now
queries from two characters (ADR 0069). searchPlacesTypeahead keeps
searchPlacesWithStatus's contract and cache, and a wrong-shape body is
an error that is never cached.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 50: The combobox's action uses Photon  (photon spec §B)

**Files:**
- Modify: `server/actions/places.ts:1-14`
- Test: `server/actions/places.test.ts`

**Interfaces:**
- Consumes: `searchPlacesTypeahead(query: string, limit = 5): Promise<PlaceSearchOutcome>` (Task 49)
- Produces: nothing new (`findPlaces(query: string): Promise<PlaceSearchOutcome>` unchanged)

- [ ] **Step 1: Write the failing test**

Replace lines 3–5 of `server/actions/places.test.ts` with:
```ts
const { requireUser, search, nominatim } = vi.hoisted(() => ({ requireUser: vi.fn(), search: vi.fn(), nominatim: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireUser }));
vi.mock("@/lib/geocode", () => ({ searchPlacesTypeahead: search, searchPlacesWithStatus: nominatim }));
```
In the `beforeEach`, add `nominatim.mockReset();`. Then add this test inside the `describe`:
```ts
  it("searches Photon, never Nominatim (ADR 0069: no autocomplete on Nominatim)", async () => {
    await findPlaces("Sydney");
    expect(search).toHaveBeenCalledWith("Sydney", 5);
    expect(nominatim).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run server/actions/places.test.ts -t "Photon"`
Expected: FAIL. `search` was not called, and `nominatim` was called with ("Sydney", 5).

- [ ] **Step 3: Implement**

Replace the whole of `server/actions/places.ts` with:
```ts
"use server";

import { requireUser } from "@/lib/guards";
import { searchPlacesTypeahead, type PlaceSearchOutcome } from "@/lib/geocode";

/**
 * The place combobox's as-you-type search (components/ui/place-combobox.tsx),
 * for pages with no Trip or Globe yet (New trip) and the Stop forms. Goes to
 * Photon, not Nominatim — Nominatim forbids autocomplete (ADR 0069).
 * Server-side and session-gated like every action.
 */
export async function findPlaces(query: string): Promise<PlaceSearchOutcome> {
  await requireUser();
  if (typeof query !== "string") return { status: "ok", candidates: [] };
  return searchPlacesTypeahead(query.slice(0, 200), 5);
}
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run server/actions/places.test.ts components/ui/place-combobox.test.tsx lib/server-action-exports.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add server/actions/places.ts server/actions/places.test.ts
git commit -m "feat(places): send the combobox typeahead to Photon

findPlaces backs the as-you-type place combobox, which Nominatim's
policy forbids. Same session gate, 200-char cap and five results. The
Globe and Transport button-press searches stay on Nominatim (ADR 0069).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 51: Batch geocodes skip located Stops and are spaced 1 s  (photon spec §C)

The spec's lines have drifted slightly. The geocode calls are at `server/actions/stops.ts:925` (`firmUpSegment`) and `:1053` (`firmUpTrip`). Both are firm-up loops: the spec's "re-flow ~925" is `firmUpSegment`. `locateRoughStops` is at `server/actions/trips.ts:165-177`.

**Files:**
- Modify: `lib/geocode.ts` (append after `_resetGeocodeCacheForTests`, line 142)
- Modify: `server/actions/stops.ts:9` (import), `:881-892` (select), `:923-925` (loop), `:1022-1025` (select), `:1051-1053` (loop)
- Modify: `server/actions/trips.ts:9` (import), `:165-177`
- Test: `lib/geocode.test.ts`, `server/actions/stops.test.ts`, `server/actions/firm-up-trip.test.ts`, `server/actions/trips.test.ts`

**Interfaces:**
- Consumes: `geocodePlaceDetailed(query: string): Promise<GeoCandidate | null>` (exists)
- Produces: `export async function paceNominatim(): Promise<void>`, `export function _resetNominatimPaceForTests(): void`

- [ ] **Step 1: Write the failing tests**

(a) `lib/geocode.test.ts`: add `paceNominatim, _resetNominatimPaceForTests` to the line-2 import and append:
```ts
describe("paceNominatim", () => {
  afterEach(() => {
    vi.useRealTimers();
    _resetNominatimPaceForTests();
  });

  it("is a no-op for the first call", async () => {
    vi.useFakeTimers();
    let done = false;
    const p = paceNominatim().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await p;
  });

  it("spaces the next call at least 1000 ms after the previous one", async () => {
    vi.useFakeTimers();
    await paceNominatim();
    let done = false;
    const p = paceNominatim().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
  });

  it("does not wait when the previous call was over a second ago", async () => {
    vi.useFakeTimers();
    await paceNominatim();
    await vi.advanceTimersByTimeAsync(1500);
    let done = false;
    const p = paceNominatim().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await p;
  });
});
```

(b) `server/actions/stops.test.ts`: directly above line 154 (`vi.mock("@/lib/geocode", …)`) add `const paceNominatimMock = vi.hoisted(() => vi.fn());`, and change line 154 to:
```ts
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodePlaceMock, geocodePlaceDetailed: geocodePlaceDetailedMock, paceNominatim: paceNominatimMock }));
```
Append at the end of the file:
```ts
// ADR 0069 / spec 2026-10-06-typeahead-photon §C.
describe("firmUpSegment: geocodes respect Nominatim", () => {
  const row = (id: string, sortOrder: number, located: boolean) => ({
    id, sortOrder, chapterId: null, nights: 2, pinned: false, arriveDate: null, departDate: null,
    timezone: null, name: `Stop ${id}`, country: "Italy",
    lat: located ? 41.9 : null, lng: located ? 12.5 : null,
  });

  beforeEach(() => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});
    geocodePlaceDetailedMock.mockResolvedValue(null);
  });

  it("selects lat/lng so it can tell a located Stop", async () => {
    stopFindManyMock.mockResolvedValue([row("a", 0, true)]);
    await firmUpSegment({ tripId: "trip-1" });
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ lat: true, lng: true }) }),
    );
  });

  it("makes zero geocode calls when every Stop is located, writing only dates and timezone", async () => {
    stopFindManyMock.mockResolvedValue([row("a", 0, true), row("b", 1, true)]);
    await firmUpSegment({ tripId: "trip-1" });
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(paceNominatimMock).not.toHaveBeenCalled();
    expect(stopUpdateMock).toHaveBeenCalledTimes(2);
    for (const [arg] of stopUpdateMock.mock.calls) {
      expect(Object.keys(arg.data).sort()).toEqual(["arriveDate", "departDate", "timezone"]);
    }
  });

  it("makes two paced geocode calls for two unlocated Stops", async () => {
    stopFindManyMock.mockResolvedValue([row("a", 0, false), row("b", 1, false)]);
    await firmUpSegment({ tripId: "trip-1" });
    expect(geocodePlaceDetailedMock).toHaveBeenCalledTimes(2);
    expect(paceNominatimMock).toHaveBeenCalledTimes(2);
  });
});
```

(c) `server/actions/firm-up-trip.test.ts`: add `paceMock` to the hoisted destructure and object (`paceMock: vi.fn(),`). Change line 25 to:
```ts
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodeMock, geocodePlaceDetailed: geocodeMock, paceNominatim: paceMock }));
```
Append:
```ts
// ADR 0069 / spec 2026-10-06-typeahead-photon §C.
describe("firmUpTrip: geocodes respect Nominatim", () => {
  const located = (id: string, sortOrder: number) => ({ ...roughRow(id, sortOrder, 2), lat: 41.9, lng: 12.5 });
  const unlocated = (id: string, sortOrder: number) => ({ ...roughRow(id, sortOrder, 2), lat: null, lng: null });

  it("makes zero geocode calls when every Stop is located", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([located("a", 0), located("b", 1)]);
    await firmUpTrip("trip-1");
    expect(geocodeMock).not.toHaveBeenCalled();
    expect(paceMock).not.toHaveBeenCalled();
    for (const [arg] of stopUpdateMock.mock.calls) expect(arg.data).not.toHaveProperty("lat");
  });

  it("makes two paced geocode calls for two unlocated Stops", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([unlocated("a", 0), unlocated("b", 1)]);
    await firmUpTrip("trip-1");
    expect(geocodeMock).toHaveBeenCalledTimes(2);
    expect(paceMock).toHaveBeenCalledTimes(2);
  });
});
```

(d) `server/actions/trips.test.ts`: add `paceNominatimMock` to the hoisted destructure (line ~45) and the returned object (`paceNominatimMock: vi.fn(),` next to `geocodePlaceDetailedMock: vi.fn(),` at line 133). Change lines 151–153 to:
```ts
vi.mock("@/lib/geocode", () => ({
  geocodePlaceDetailed: geocodePlaceDetailedMock,
  paceNominatim: paceNominatimMock,
}));
```
Insert after the `it("a stop whose geocode fails is still created with null coords", …)` block (ends line 505):
```ts
  it("paces each rough-Stop geocode and skips located Stops (ADR 0069)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-pace" });
    geocodePlaceDetailedMock.mockResolvedValue(null);
    await createTrip({
      name: "Kansai", homeCurrency: "AUD", startDate: "2026-04-01", endDate: "2026-04-07",
      stops: [{ name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" }, { name: "Nara" }, { name: "Osaka" }],
    });
    expect(geocodePlaceDetailedMock).toHaveBeenCalledTimes(2);
    expect(paceNominatimMock).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run tests to verify they fail**
Run: `npx vitest run lib/geocode.test.ts server/actions/stops.test.ts server/actions/firm-up-trip.test.ts server/actions/trips.test.ts -t "paceNominatim|respect Nominatim|paces each"`
Expected: FAIL. `paceNominatim is not a function` in geocode.test; in the action tests the geocode is still called for located Stops and `paceNominatimMock`/`paceMock` has 0 calls.

- [ ] **Step 3: Implement**

(a) `lib/geocode.ts`, after `_resetGeocodeCacheForTests` (line 142):
```ts
// Nominatim asks for at most one request per second. A batch (firm-up, New
// trip) calls paceNominatim() before each geocode it actually runs, so
// consecutive calls are ≥1 s apart (ADR 0069). Process-local: a reservation
// is taken synchronously, so concurrent callers in one instance queue up
// rather than racing. The first call — and any call over a second after the
// previous one — does not wait.
const NOMINATIM_MIN_GAP_MS = 1_000;
let nextNominatimSlot = 0;

export async function paceNominatim(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextNominatimSlot - now);
  nextNominatimSlot = Math.max(now, nextNominatimSlot) + NOMINATIM_MIN_GAP_MS;
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
}

/** Test-only seam: forget the last paced call. */
export function _resetNominatimPaceForTests(): void {
  nextNominatimSlot = 0;
}
```

(b) `server/actions/stops.ts` line 9: `import { geocodePlaceDetailed, paceNominatim } from "@/lib/geocode";`

In `firmUpSegment`'s select (lines 881–892), add after `country: true,`:
```ts
        lat: true,
        lng: true,
```
Replace lines 923–925 (`for (const r of results) {` / `const s = segById[r.id];` / `const coords = await geocodePlaceDetailed(…)`) with:
```ts
  for (const r of results) {
    const s = segById[r.id];
    // ADR 0069: a Stop that already has coordinates keeps them (only its
    // dates/timezone are written); a geocode that does run is spaced ≥1 s.
    const located = s.lat != null && s.lng != null;
    if (!located) await paceNominatim();
    const coords = located ? null : await geocodePlaceDetailed([s.name, s.country].filter(Boolean).join(", "));
```

In `firmUpTrip`'s select (lines 1022–1025) change the second line to:
```ts
        arriveDate: true, departDate: true, timezone: true, name: true, country: true, lat: true, lng: true,
```
Replace lines 1051–1053 the same way:
```ts
  for (const r of results) {
    const s = stopById[r.id];
    // ADR 0069: skip located Stops; space the geocodes that do run ≥1 s.
    const located = s.lat != null && s.lng != null;
    if (!located) await paceNominatim();
    const coords = located ? null : await geocodePlaceDetailed([s.name, s.country].filter(Boolean).join(", "));
```

(c) `server/actions/trips.ts` line 9: `import { geocodePlaceDetailed, paceNominatim } from "@/lib/geocode";`. In `locateRoughStops`, replace lines 173–174 (the comment + `const geo = …`) with:
```ts
    // A Route copy carries the country; a bare name ("Paris") can land anywhere.
    // ADR 0069: consecutive Nominatim calls are spaced ≥1 s.
    await paceNominatim();
    const geo = await geocodePlaceDetailed([s.name, s.country].filter(Boolean).join(", "));
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run lib/geocode.test.ts server/actions/stops.test.ts server/actions/firm-up-trip.test.ts server/actions/trips.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add lib/geocode.ts lib/geocode.test.ts server/actions/stops.ts server/actions/stops.test.ts server/actions/firm-up-trip.test.ts server/actions/trips.ts server/actions/trips.test.ts
git commit -m "fix(geocode): batch geocodes skip located Stops, 1s apart

Firm-up and New trip geocoded every Stop back to back, against
Nominatim's one-request-per-second rule. A Stop that already has
coordinates is no longer re-geocoded; the rest go through
paceNominatim (ADR 0069).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 52: Privacy page names Photon  (photon spec §D)

**Files:**
- Modify: `app/privacy/page.tsx:211-218`, header comment line 25
- Test: `app/privacy/page.test.tsx:35`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Write the failing test**
In `app/privacy/page.test.tsx`, replace line 35 with:
```ts
    expect(screen.getByText(/OpenStreetMap \(Nominatim\), Photon \(komoot\) and CARTO/)).toBeInTheDocument();
```
Add a new test at the end of the `describe`:
```ts
  // ADR 0069: the as-you-type place search goes to Photon.
  it("says which geocoder sees what is typed", async () => {
    render(await PrivacyPage());
    expect(
      screen.getByText(/Photon for\s*as-you-type search, Nominatim when a place is saved/),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run app/privacy/page.test.tsx -t "third parties|geocoder"`
Expected: FAIL. Unable to find an element with the text /OpenStreetMap \(Nominatim\), Photon …/.

- [ ] **Step 3: Implement**
Replace the `<li>` at lines 211–218 with:
```tsx
          <li>
            <span className="font-bold">
              OpenStreetMap (Nominatim), Photon (komoot) and CARTO
            </span>{" "}
            — turn place names you type into map coordinates (Photon for
            as-you-type search, Nominatim when a place is saved), and draw
            the map tiles you see on the Summary, the Globe and the Day
            map.
          </li>
```
In the header comment, line 25: `lib/push.ts, lib/geocode.ts (Nominatim and Photon, ADR 0069), lib/map-tiles.ts, lib/storage.ts,`

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run app/privacy/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add app/privacy/page.tsx app/privacy/page.test.tsx
git commit -m "docs(privacy): name Photon as a geocoding processor

ADR 0059: a new processor is a promise to Travellers. Place names typed
into the combobox now go to Photon (ADR 0069).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 53: ADR 0028 amended note, HANDOFF and .env.example  (photon spec §E; perf spec §Y "ADR 0028 marked amended by 0069")

**Files:**
- Modify: `docs/adr/0028-nominatim-response-cache-not-rate-limiting.md:1-2`
- Modify: `docs/HANDOFF.md:16`, `:203`, `:226-228`, `:372`
- Modify: `.env.example:117-123`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Write the failing check**
Run: `grep -c "Amended by ADR 0069" docs/adr/0028-*.md; grep -c "Photon" docs/HANDOFF.md .env.example`
Expected (before): every count `0`.

- [ ] **Step 2: Confirm it fails**
Same command; all zeros.

- [ ] **Step 3: Implement**

(a) ADR 0028: insert after line 1 (the H1), following the repo's blockquote convention (`docs/adr/0006-…md:3`):
```markdown

> **Amended by ADR 0069 (2026-10-06).** This ADR's premise — geocodes happen
> at human pace — no longer holds: the place combobox became a typeahead, and
> firm-up geocoded every Stop back to back. The as-you-type search now goes
> to Photon; Nominatim keeps one-off lookups behind the cache below; batch
> geocodes skip Stops that already have coordinates and are spaced ≥1 s
> apart (`paceNominatim` in `lib/geocode.ts`). The caching decision stands.
```

(b) `docs/HANDOFF.md` line 16, replace the row with:
```markdown
| Maps / geocoding | Leaflet + CARTO tiles + Nominatim + Photon — works with no key, but tiles carry a CARTO watermark without `NEXT_PUBLIC_CARTO_API_KEY`; saving a place and the Globe/Transport search buttons need `NOMINATIM_CONTACT` (see §5); the as-you-type place search uses Photon, which needs no key and no contact |
```
Line 203, replace `— and [Nominatim](https://nominatim.org/) for geocoding.` with:
```markdown
— [Nominatim](https://nominatim.org/) for geocoding a saved place and for the Globe marker and Transport location search buttons, and [Photon](https://photon.komoot.io/) for the as-you-type place search (ADR 0069).
```
Line 228, replace the paragraph with:
```markdown
Geocoding requires no API key, but Nominatim's usage policy requires a real contact (email or app URL) in the User-Agent and returns **HTTP 403** for a missing or placeholder one. Set `NOMINATIM_CONTACT` in every environment where geocoding must work — without it, saving a place gets no coordinates and the Globe marker and Transport location searches show "Place search is temporarily unavailable". The as-you-type place combobox goes to **Photon** instead (ADR 0069), which needs neither a key nor a contact.
```
Line 372, change the purpose cell to `Real contact for Nominatim's User-Agent (Photon, the typeahead, needs none)`.

(c) `.env.example`: after line 122 (`# don't need any location lookups — search will not work until it is set.`) insert:
```
# The as-you-type place search (the place combobox) uses Photon
# (photon.komoot.io) instead, which needs no key and no contact (ADR 0069).
```

- [ ] **Step 4: Verify**
Run: `grep -c "Amended by ADR 0069" docs/adr/0028-*.md; grep -c "Photon" docs/HANDOFF.md .env.example`
Expected: `1`; HANDOFF `≥3`; .env.example `1`.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add docs/adr/0028-nominatim-response-cache-not-rate-limiting.md docs/HANDOFF.md .env.example
git commit -m "docs(geocode): record Photon beside Nominatim

ADR 0028's human-pace premise was overtaken by the typeahead; mark it
amended by 0069 and tell operators Photon needs no key or contact.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 54: Vercel Speed Insights, with the share-token redaction  (perf spec §X)

**Files:**
- Modify: `package.json` (dependency via npm)
- Modify: `components/analytics.tsx`
- Modify: `app/layout.tsx:8`, `:59-60`
- Modify: `app/privacy/page.tsx:25-28` (comment), `:265-268`, `:289-310`
- Test: `components/analytics.test.tsx`, `app/privacy/page.test.tsx`

**Interfaces:**
- Consumes: `redactShareToken(url: string): string` (exists)
- Produces: `analyticsBeforeSend<E extends { url: string }>(event: E): E` (now generic) and `export function VercelSpeedInsights(): JSX.Element`

- [ ] **Step 1: Install and check the prop type**
Run: `npm install @vercel/speed-insights` (latest at install time; a runtime dependency, beside `@vercel/analytics`).
Then: `grep -n "beforeSend\|url" node_modules/@vercel/speed-insights/dist/next/index.d.ts`. Confirm that the `beforeSend` event carries `url: string`. If it doesn't, stop and report back; don't improvise a different redaction.

- [ ] **Step 2: Write the failing tests**
At the top of `components/analytics.test.tsx` (after the vitest import) add:
```ts
import { render } from "@testing-library/react";
import { vi } from "vitest";

const { speedInsightsProps } = vi.hoisted(() => ({ speedInsightsProps: [] as Array<{ beforeSend?: unknown }> }));
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: (props: { beforeSend?: unknown }) => {
    speedInsightsProps.push(props);
    return null;
  },
}));
```
Change the `./analytics` import to `import { redactShareToken, analyticsBeforeSend, VercelSpeedInsights } from "./analytics";` and append:
```ts
describe("VercelSpeedInsights", () => {
  it("sends page timings through the same share-token redaction", () => {
    render(<VercelSpeedInsights />);
    expect(speedInsightsProps.at(-1)?.beforeSend).toBe(analyticsBeforeSend);
  });

  it("redacts a Speed Insights vital's URL too", () => {
    const vital = { type: "vital" as const, url: "/share/secret-token", route: "/share/[token]" };
    expect(analyticsBeforeSend(vital)).toEqual({ ...vital, url: "/share/[token]" });
  });
});
```
In `app/privacy/page.test.tsx` add:
```ts
  it("names Speed Insights as page-timing only", async () => {
    render(await PrivacyPage());
    expect(screen.getByText(/Vercel Speed Insights/)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/page timing only, no Trip content/i);
    expect(document.body.textContent).not.toMatch(/Beyond that one page-view counter/);
  });
```

- [ ] **Step 3: Run tests to verify they fail**
Run: `npx vitest run components/analytics.test.tsx app/privacy/page.test.tsx -t "Speed Insights|VercelSpeedInsights"`
Expected: FAIL. `VercelSpeedInsights` is not exported; the privacy text isn't found.

- [ ] **Step 4: Implement**

(a) `components/analytics.tsx`. Replace the `import type { BeforeSendEvent } from "@vercel/analytics";` line with `import { SpeedInsights } from "@vercel/speed-insights/next";`. Replace `analyticsBeforeSend` with a generic version and add the component:
```tsx
/**
 * The `beforeSend` middleware handed to both Vercel clients — Web Analytics
 * page views and Speed Insights vitals each carry the resolved URL.
 */
export function analyticsBeforeSend<E extends { url: string }>(event: E): E {
  const url = redactShareToken(event.url);
  return url === event.url ? event : { ...event, url };
}

export function VercelAnalytics() {
  return <Analytics beforeSend={analyticsBeforeSend} />;
}

/**
 * Vercel Speed Insights — real-device page-load timings (Core Web Vitals) with
 * the page URL, so the same share-token redaction applies. Vercel is already
 * a named processor; /privacy names Speed Insights (ADR 0059).
 */
export function VercelSpeedInsights() {
  return <SpeedInsights beforeSend={analyticsBeforeSend} />;
}
```
Add one line to the file docblock's first paragraph: `Also mounts Vercel Speed Insights with the same redaction.`

(b) `app/layout.tsx` line 8: `import { VercelAnalytics, VercelSpeedInsights } from "@/components/analytics";`. After `<VercelAnalytics />` (line 60) add `<VercelSpeedInsights />`.

(c) `app/privacy/page.tsx`:
- Line 267: `deploy, and runs the Web Analytics and Speed Insights described below.`
- In the Analytics paragraph, after `does not use cookies and does not build a personal profile.` (line 299) insert:
```tsx
          Teepee also uses{" "}
          <span className="font-bold">Vercel Speed Insights</span> (part
          of the same hosting) to measure how quickly pages load and
          respond on real devices: the page address, the kind of device
          and the timings — page timing only, no Trip content.
```
- Change `so that token is stripped before the page view is sent to analytics —` to `so that token is stripped before the page view is sent to analytics, and before a page timing is sent to Speed Insights —`. This keeps the two pinned regexes `/stripped\s*before the page view is sent to analytics/` and `/still appears,\s*unredacted, in an Error report/` matching.
- Change `Beyond that one page-view counter, there is no other analytics.` to `Beyond those page views and page timings, there is no other analytics.`
- Header comment line 27: `components/analytics.tsx + app/layout.tsx (Vercel Web Analytics and Speed Insights — what`.

- [ ] **Step 5: Run tests to verify they pass**
Run: `npx vitest run components/analytics.test.tsx app/privacy/page.test.tsx app/layout.test.tsx`
Expected: PASS

- [ ] **Step 6: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 7: Commit**
```bash
git add package.json package-lock.json components/analytics.tsx components/analytics.test.tsx app/layout.tsx app/privacy/page.tsx app/privacy/page.test.tsx
git commit -m "feat(analytics): add Vercel Speed Insights

The slow-on-iPhone reports behind ADRs 0063/0065 were diagnosed with no
field data. Speed Insights sends page timings with the URL, so it gets
the same share-token redaction; /privacy names it (ADR 0059). It
reports only once Speed Insights is switched on in the Vercel project.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 55: TIMEZONES from `Intl.supportedValuesOf`, curated list as fallback  (perf spec §X)

Node 24's ICU returns legacy ids (`Asia/Calcutta`, `Asia/Saigon`) and no `UTC`. So the curated entries stay first, keeping their stored values and labels, and Intl aliases of them are dropped.

**Files:**
- Modify: `lib/tz.ts:13-91`
- Test: `lib/tz.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `export const CURATED_TIMEZONES: TimezoneOption[]`, `export function buildTimezones(supported: readonly string[] | null): TimezoneOption[]`, `export const TIMEZONES: TimezoneOption[]` (same name and type as today)

- [ ] **Step 1: Write the failing test**
In `lib/tz.test.ts` add `CURATED_TIMEZONES, buildTimezones,` to the import and insert after the `describe("TIMEZONES", …)` block:
```ts
describe("buildTimezones", () => {
  it("falls back to the curated list when Intl offers none", () => {
    expect(buildTimezones(null)).toEqual(CURATED_TIMEZONES);
    expect(buildTimezones([])).toEqual(CURATED_TIMEZONES);
  });

  it("keeps the curated entries first, then adds uncovered zones sorted by label", () => {
    const out = buildTimezones(["Pacific/Guam", "Europe/London", "Africa/Abidjan"]);
    expect(out.slice(0, CURATED_TIMEZONES.length)).toEqual(CURATED_TIMEZONES);
    expect(out.slice(CURATED_TIMEZONES.length)).toEqual([
      { value: "Africa/Abidjan", label: "Africa/Abidjan" },
      { value: "Pacific/Guam", label: "Pacific/Guam" },
    ]);
  });

  it("drops an Intl alias of a curated zone (Asia/Calcutta is Asia/Kolkata)", () => {
    const out = buildTimezones(["Asia/Calcutta", "Asia/Saigon"]);
    expect(out.map((t) => t.value)).not.toContain("Asia/Calcutta");
    expect(out.map((t) => t.value)).not.toContain("Asia/Saigon");
    expect(out.map((t) => t.value)).toContain("Asia/Kolkata");
  });

  it("labels an uncurated zone by its id with spaces for underscores", () => {
    expect(buildTimezones(["America/Port_of_Spain"]).at(-1)).toEqual({
      value: "America/Port_of_Spain",
      label: "America/Port of Spain",
    });
  });
});

describe("TIMEZONES on this runtime", () => {
  it("covers zones beyond the curated list, with no duplicate values", () => {
    const values = TIMEZONES.map((t) => t.value);
    expect(values).toContain("Africa/Abidjan");
    expect(new Set(values).size).toBe(values.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run lib/tz.test.ts -t "buildTimezones|on this runtime"`
Expected: FAIL. `buildTimezones` / `CURATED_TIMEZONES` are not exported, and TIMEZONES lacks `Africa/Abidjan`.

- [ ] **Step 3: Implement**
In `lib/tz.ts`, rename the array: line 13–17 becomes
```ts
/**
 * Curated common IANA timezones with friendly labels. Listed first in the
 * selector, and the whole list where `Intl.supportedValuesOf` is missing.
 */
export const CURATED_TIMEZONES: TimezoneOption[] = [
```
(entries unchanged). After its closing `];` (line 91) insert:
```ts
/** A zone's canonical id on this runtime (V8: "Asia/Kolkata" → "Asia/Calcutta"). */
function canonicalZone(zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return zone;
  }
}

/**
 * The selector's list: every curated entry (stored values keep their label),
 * then every zone `supported` names that the curated list doesn't already
 * cover (directly or as an alias), sorted by label. `null`/empty → curated only.
 */
export function buildTimezones(supported: readonly string[] | null): TimezoneOption[] {
  if (!supported || supported.length === 0) return CURATED_TIMEZONES;
  const covered = new Set<string>();
  for (const c of CURATED_TIMEZONES) {
    covered.add(c.value);
    covered.add(canonicalZone(c.value));
  }
  const extra = supported
    .filter((zone) => !covered.has(zone) && !covered.has(canonicalZone(zone)))
    .map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...CURATED_TIMEZONES, ...extra];
}

function supportedTimeZones(): readonly string[] | null {
  try {
    return typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : null;
  } catch {
    return null;
  }
}

/** Every timezone for the selector (perf spec §X). */
export const TIMEZONES: TimezoneOption[] = buildTimezones(supportedTimeZones());
```
Update the module docblock (lines 1–6): "Provides the IANA timezone list for UI selectors (runtime `Intl` list, curated names first) and a best-effort guesser …".

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run lib/tz.test.ts components/trip/stop-form-dialog.test.tsx`
Expected: PASS. If `stop-form-dialog.test.tsx` doesn't exist, run only `lib/tz.test.ts`.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add lib/tz.ts lib/tz.test.ts
git commit -m "feat(tz): list every runtime timezone in the selector

A Stop in a zone the 78-entry list lacked could not be set by hand.
TIMEZONES now comes from Intl.supportedValuesOf, curated entries first
so stored values keep their label; the curated list is the fallback.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 56: `typedRoutes: true` and fix every rejected href  (perf spec §X)

Read first: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/typedRoutes.md`, and `…/05-config/02-typescript.md` §"Statically Typed Links". Facts from the Next 16.3.4 generator (`node_modules/next/dist/server/lib/router-utils/typegen.js:258-298`):
- `Route` = static routes | `?…`/`#…` | `x:y` URLs | literals matching a dynamic route (a slug may not contain `/`).
- A plain `string` is rejected by `<Link href>`, `router.push/replace/prefetch`, `redirect`/`permanentRedirect` and `next/form` `action`.
- Without typed routes, `Route` is `string & {}` (`node_modules/next/dist/types.d.ts:31`), so the type changes below compile either way.
- The types land in `.next/types/link.d.ts`, which `tsconfig.json` already includes. **Run `npx next typegen` before `npx tsc --noEmit`**, or the check is silently skipped.

**Files:**
- Modify: `next.config.ts:21`
- Modify: `lib/trip-path.ts`, `components/trip/use-trip-href.ts:19-22`, `components/navigation/use-app-router.ts:37-46`, `server/actions/trips.ts:27`
- Modify: the further sites `tsc` reports (expected list in Step 6)
- Test: `next.config.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `tripPath(ref: string, sub?: string): Route` (was `string`); `useTripHref(tripId): (sub?: string) => Route`; `CreateTripResult` = `ActionResult<{ tripId: string; href: Route }>`

- [ ] **Step 1: Write the failing test**
Append inside the `describe` in `next.config.test.ts`:
```ts
  it("types every internal link and navigation (typedRoutes)", () => {
    expect(config.typedRoutes).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run next.config.test.ts -t "typedRoutes"`
Expected: FAIL (expected undefined to be true).

- [ ] **Step 3: Turn it on**
In `next.config.ts`, add as the first key of `nextConfig` (line 22):
```ts
  // Statically typed links (perf spec §X): <Link href>, router.push/replace/
  // prefetch and redirect() reject a path that is not a route.
  typedRoutes: true,
```

- [ ] **Step 4: Fix the shared builders first**
`lib/trip-path.ts`:
```ts
import type { Route } from "next";
…
export function tripPath(ref: string, sub = ""): Route {
  if (sub !== "" && !/^[/?#]/.test(sub)) {
    throw new Error(`tripPath: sub must start with "/", "?" or "#" (got "${sub}")`);
  }
  // Runtime-built, so cast once here: every Trip URL goes through this function (ADR 0064).
  return `/trips/${encodeURIComponent(ref)}${sub}` as Route;
}
```
`components/trip/use-trip-href.ts`: add `import type { Route } from "next";` and change line 19 to `export function useTripHref(tripId: string): (sub?: string) => Route {`.
`components/navigation/use-app-router.ts`: add `import type { Route } from "next";` and change the two inner calls to `router.push(href as Route, options)` and `router.replace(href as Route, options)`. Its own `href: string` parameters stay: they accept everything Route does.
`server/actions/trips.ts:27`: `export type CreateTripResult = ActionResult<{ tripId: string; href: Route }>;` plus `import type { Route } from "next";`.

- [ ] **Step 5: Generate the route types and collect the errors**
Run: `npx next typegen && npx tsc --noEmit`
Expected: a list of errors like `Type 'string' is not assignable to type 'RouteImpl<…>'` / `UrlObject`.

- [ ] **Step 6: Fix each reported error by these rules, in this order**
1. **A prop or field that holds an href and is always built in code** (from literals, `tripPath`, `useTripHref`): type it `Route` (`import type { Route } from "next"`) where it's declared. Expected sites:
   - `components/ui/tab-bar.tsx:9`, `components/ui/dock.tsx:10`
   - `components/shell/sidebar-nav.tsx:54`
   - `components/trip/trip-nav.tsx:13,54,71,126`
   - `components/trip/home/quick-actions.tsx:12`, `components/trip/home/budget-glance.tsx:9`, `components/trip/home/desktop/{countdown-tile,spend-so-far-tile,shared-pot-tile}.tsx`
   - `components/trips/trip-card.tsx:19`
   - `components/trip/day/day-carousel.tsx:14,20`, `components/trip/day/day-arrow.tsx:18` (`Route | null`), `components/trip/day/day-keyboard-nav.tsx:16`
   - `components/legal/legal-page.tsx:29`
   - `components/command-palette-results.tsx:40` (`tripPages` return type) and the `href` of the item type read at `:192`
   - `lib/next-steps.ts:16,110`, `lib/sort-these-out.ts:32` (`Route | null`)
   - `components/trip/days-href-context.tsx:14` (`Route | null`)
2. **A value only known at runtime** (`usePathname()`, a URL read from the database, a server-action result typed `string`, `app/share/[token]/pending-link.tsx`'s `href`): cast once where it enters navigation, `as Route`. Expected:
   - `components/trip/itinerary-manager.tsx:602`
   - `components/money/breakdown-switch.tsx:32`: `router.replace((qs ? \`${pathname}?${qs}\` : pathname) as Route, { scroll: false })`
   - `components/trip/fork-switcher.tsx:278`
   - `components/trip/settings/trip-details-form.tsx:87`
   - `app/share/[token]/pending-link.tsx:14` (type the prop `Route`, cast at its call site)
3. **A wrapper component that forwards `href` to `next/link`**: type its prop `Route`, not `React.ComponentProps<typeof Link>["href"]` widened to string.
4. **Test files** that pass a non-literal string: cast in the test (`"/x" as Route`).
5. Never `as any`, `@ts-expect-error` or `@ts-ignore`. If a site fits none of the rules, stop and report it.

Re-run `npx next typegen && npx tsc --noEmit` until it's clean.

- [ ] **Step 7: Run tests to verify they pass**
Run: `npx vitest run next.config.test.ts lib/trip-path.test.ts components/trip/use-trip-href.test.tsx lib/trip-links.guard.test.ts && npm test`
Expected: PASS (type-only changes; no behaviour change).

- [ ] **Step 8: Typecheck + lint + build**
Run: `npx next typegen && npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 9: Commit**
```bash
git add -A next.config.ts next.config.test.ts lib components app server
git commit -m "feat(next): turn on typedRoutes and type every href

A typo'd or stale internal link now fails the typecheck instead of
404ing. tripPath returns Route, so Trip URLs are checked in one place;
runtime paths (usePathname, server-action hrefs) are cast once where
they enter navigation. Run 'npx next typegen' before 'tsc --noEmit'
locally; 'next build' does it itself.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 57: Playwright as a real devDependency; delete the shim  (perf spec §X)

`tsconfig.json` needs no change: it has no `types`/`typeRoots` and no NODE_PATH. The shim was found through `include: ["**/*.ts"]`.

**Files:**
- Modify: `package.json`, `package-lock.json` (npm)
- Delete: `scripts/types/playwright-shim.d.ts`
- Modify: `scripts/lib/audit-browser.ts:1-109`
- Modify: `scripts/layout-audit.ts:36-44,105-111,138,674-684`, `scripts/contrast-audit.ts:26-55,294-296,303,982-992`, `scripts/nav-audit.ts:17-18,234`, `scripts/layout-audit/crops.ts:14-17,50,297-304`
- Test: `scripts/lib/audit-browser.test.ts`, `scripts/layout-audit/run.test.ts:174-321`

**Interfaces:**
- Consumes: nothing
- Produces: `resolvePlaywright(): { chromium: BrowserType }` (no parameter now); `playwrightMissingMessage` is deleted

- [ ] **Step 1: Write the failing test**
In `scripts/lib/audit-browser.test.ts`:
- Remove `playwrightMissingMessage` from the import and add `resolvePlaywright`.
- Add `import { chromium } from "playwright";`.
- Delete the whole `describe("playwrightMissingMessage", …)` block (from line 79 to its end).
- Append:
```ts
describe("resolvePlaywright", () => {
  it("hands back the installed package's chromium (Playwright is a devDependency now)", () => {
    expect(resolvePlaywright().chromium).toBe(chromium);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run scripts/lib/audit-browser.test.ts -t "resolvePlaywright"`
Expected: FAIL. `Cannot find package 'playwright'`, or a different object if a global copy resolves.

- [ ] **Step 3: Install**
Run: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --save-dev --save-exact playwright@1.63.0`
Why 1.63.0: it's the version installed globally in this environment (`/usr/local/lib/node_modules/playwright`), so browser builds already in the machine's Playwright cache match. Then: `git rm scripts/types/playwright-shim.d.ts`.

- [ ] **Step 4: Implement**

(a) `scripts/lib/audit-browser.ts`. Replace lines 1–109 (docblock, imports, the whole "Resolving Playwright at runtime" block, `isModuleNotFoundError`, `playwrightMissingMessage`, `resolvePlaywright`) with:
```ts
/**
 * Shared Playwright plumbing for this repo's browser-driven audits
 * (`scripts/contrast-audit.ts`, the layout audit, the nav audit).
 *
 * Playwright is a devDependency. Its browsers are not downloaded on
 * `npm install` (set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 anywhere an install
 * must never fetch them, e.g. CI); run `npx playwright install chromium` once
 * on a machine that runs an audit.
 */

import { chromium, type BrowserType, type Page } from "playwright";

export type Theme = "light" | "dark";
export type MapReveal = "wishlist-map-tab" | "show-day-map";

/** The Chromium launcher every audit uses. The one place a harness file
 * takes a value from `playwright` (run.test.ts allowlists only this file). */
export function resolvePlaywright(): { chromium: BrowserType } {
  return { chromium };
}
```
Leave everything from the `// Auth` section down unchanged.

(b) Callers. Replace each try/catch block with one line, and drop `BrowserType` from that file's `import type { … } from "playwright"`. In every file it's only used by the deleted `let chromium: BrowserType;`.
- `scripts/layout-audit.ts:675-684` → `const { chromium } = resolvePlaywright();`
- `scripts/contrast-audit.ts:983-992` → same.
- `scripts/layout-audit/crops.ts:298-304` → same.
- `scripts/nav-audit.ts:234` → `const { chromium } = resolvePlaywright();`

(c) Docblocks:
- `scripts/contrast-audit.ts` lines 29–36: replace with
```
 *   - `npx playwright install chromium` — once per machine. Playwright is a
 *     devDependency; its browsers are not fetched by `npm install`
 *     (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 guarantees that in CI).
```
  Replace the whole "WHY NOT A DEPENDENCY" section (lines 49–54) with:
```
 * PLAYWRIGHT
 * -----------------
 *   A devDependency since 2026-10-06 (perf spec §X). The npm package is
 *   small; the ~300MB is the browsers, installed separately as above.
```
  Line 295 `NODE_PATH=/usr/local/lib/node_modules npm run audit:contrast` → `npm run audit:contrast`.
- `scripts/layout-audit.ts:39-42`: `- Playwright + Chromium: \`npx playwright install chromium\` once (see contrast-audit.ts), then \`npm run audit:layout\`.`
  Line 110: `in turn), \`node:\` builtins, and \`playwright\` — values only in scripts/lib/audit-browser.ts — nothing else.`
- `scripts/nav-audit.ts:17-18`: `- Playwright + Chromium: \`npx playwright install chromium\` once, then \`npm run audit:nav\`.`
- `scripts/layout-audit/crops.ts:14-17`: `Playwright for the audit itself (resolvePlaywright() in scripts/lib/audit-browser.ts), so cropping and downscaling is done the same way — …`

(d) `scripts/layout-audit/run.test.ts`:
- Comment lines 179–184: replace the `playwright` bullet with `` - `playwright`, type-only — except scripts/lib/audit-browser.ts, the one file that imports its value (resolvePlaywright()). `` Drop "or scripts/types/" from the relative-path bullet, and change the last sentence to "…and so is any use of `require` as a value."
- Line 186: `const HARNESS_DIRS = ["scripts/layout-audit", "scripts/lib"].map((d) => path.join(ROOT, d));`
- Lines 245–246: replace with
```ts
    } else if (spec === "playwright") {
      if (!ref.typeOnly && path.relative(ROOT, file) !== "scripts/lib/audit-browser.ts") {
        out.push(`${ref.text}: playwright values come only through resolvePlaywright() in scripts/lib/audit-browser.ts`);
      }
```
- Files list (lines 262–271): delete the `...readdirSync("scripts/types")…` spread. The directory no longer exists, and `readdirSync` would throw.
- In the positive-control `good` list, add a sanctioned case after the loop:
```ts
    expect(check(`import { chromium, type Page } from "playwright";`, path.join(ROOT, "scripts/lib/audit-browser.ts"))).toEqual([]);
```
- Line 318: `expect(moduleRefs(src, file).requireAliases).toBe(0);` and delete the comment above it.

- [ ] **Step 5: Run tests to verify they pass**
Run: `npx vitest run scripts/`
Expected: PASS

- [ ] **Step 6: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
The real Playwright types replace the hand-written shim. If tsc reports an audit-script call the shim typed loosely, fix the call to match the real type and list it in the commit body. Don't widen anything to `any`.

- [ ] **Step 7: Commit**
```bash
git add package.json package-lock.json scripts/
git commit -m "build(audits): make Playwright a real devDependency

The hand-maintained shim drifted with every audit and the scripts
needed NODE_PATH tricks to find a global install. The package is now
a pinned devDependency; browsers still install separately, and
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 keeps CI installs browser-free.
run.test.ts still allowlists playwright values to audit-browser.ts.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 58: Real-Postgres integration tier on the docker-compose DB, seeded with a Day-loader test  (perf spec §X)

**Run after the other section's §B tasks** (the `loadDayTripData`/`projectDay` split of `lib/day-view-loader.ts`). Those keep `getDay`'s signature, and this test drives it so it covers whatever reads §B introduced.

**Drift note:** CI already runs this tier. `.github/workflows/ci.yml:29-57` has an `integration` job: postgres:16, `prisma migrate deploy`, `npm run test:integration`, `INTEGRATION=1`. This task doesn't touch CI.

**Files:**
- Create: `test/helpers/local-db.ts`, `test/helpers/local-db.test.ts`, `test/server-only-stub.ts`, `test/integration/day-view-loader.test.ts`
- Modify: `vitest.integration.config.ts`, `docker-compose.yml:1-7`

**Interfaces:**
- Consumes: `getDay(tripId: string, dateParam: string, viewerId: string): Promise<DayViewData | "invalid" | "out-of-range" | "dateless">` (`lib/day-view-loader.ts`, signature kept by §B)
- Produces: `DOCKER_COMPOSE_DATABASE_URL: string`, `integrationDatabaseUrl(env: Record<string, string | undefined>): string`

- [ ] **Step 1: Write the failing test**
`test/helpers/local-db.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DOCKER_COMPOSE_DATABASE_URL, integrationDatabaseUrl } from "./local-db";

describe("integrationDatabaseUrl", () => {
  it("defaults to the docker-compose database", () => {
    expect(integrationDatabaseUrl({})).toBe(DOCKER_COMPOSE_DATABASE_URL);
    expect(DOCKER_COMPOSE_DATABASE_URL).toBe("postgresql://trip:trip@localhost:5432/trip?schema=public");
  });

  it("keeps a local DATABASE_URL (CI's service container)", () => {
    expect(integrationDatabaseUrl({ DATABASE_URL: "postgresql://trip:trip@127.0.0.1:5432/trip" })).toBe(
      "postgresql://trip:trip@127.0.0.1:5432/trip",
    );
  });

  it("refuses any non-local host — the tests delete rows", () => {
    expect(() => integrationDatabaseUrl({ DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db" })).toThrow(/local Postgres/);
  });

  it("refuses a URL it cannot parse", () => {
    expect(() => integrationDatabaseUrl({ DATABASE_URL: "not a url" })).toThrow(/not a valid URL/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/helpers/local-db.test.ts`
Expected: FAIL. Cannot find module `./local-db`.

- [ ] **Step 3: Implement**
`test/helpers/local-db.ts`:
```ts
/** docker-compose.yml's database — the same URL as .env.example's DATABASE_URL. */
export const DOCKER_COMPOSE_DATABASE_URL = "postgresql://trip:trip@localhost:5432/trip?schema=public";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The database the integration tier runs against: DATABASE_URL when set,
 * else the docker-compose one. Throws for any non-local host: these tests
 * delete rows, and a shell can easily be holding a production URL
 * (scripts/load-env.ts prefers .env.production.local).
 */
export function integrationDatabaseUrl(env: Record<string, string | undefined>): string {
  const url = env.DATABASE_URL?.trim() || DOCKER_COMPOSE_DATABASE_URL;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL; the integration tests need the docker-compose Postgres.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Integration tests only run against a local Postgres (docker compose up -d); DATABASE_URL points at "${host}".`,
    );
  }
  return url;
}
```
`test/server-only-stub.ts`:
```ts
// `server-only` throws outside React's server condition, and vitest does not
// use it. The integration tier imports real lib/db (perf spec §X adds
// `import "server-only"` there), so it resolves the package to this no-op.
export {};
```
Replace `vitest.integration.config.ts` with:
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'
import { integrationDatabaseUrl } from './test/helpers/local-db'

// The real-Postgres tier (perf spec §X): docker compose up -d, then
// npx prisma migrate deploy, then npm run test:integration. CI's `integration`
// job runs the same against a service container. Refuses a non-local DB.
const databaseUrl = integrationDatabaseUrl(process.env)

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/integration/**/*.test.ts'],
    // These tests share one database — no parallel files/tests.
    fileParallelism: false,
    testTimeout: 30_000,
    env: { DATABASE_URL: databaseUrl, INTEGRATION: '1' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
})
```
`docker-compose.yml`: replace lines 4–6 of the header comment with:
```yaml
#   docker compose up -d          # start
#   npx prisma migrate deploy     # apply the committed migrations
#   npm run db:seed               # seed sample data
#   npm run test:integration      # the real-Postgres test tier (test/integration/)
```
`test/integration/day-view-loader.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getDay } from "@/lib/day-view-loader";

// Real Postgres (npm run test:integration). The seed test for the loaders
// spec 2026-10-06 §B/§C reshaped: their unit tests mock the db and count
// queries, so only a real database proves every select, relation filter and
// groupBy is one Postgres accepts.
const USER = "it-day-user";
const TRIP_ID = "it-day-trip";
const STOP_ID = "it-day-lisbon";

describe.skipIf(process.env.INTEGRATION !== "1")("getDay (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "day@example.test", name: "Day IT" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades stops, items, day titles
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Day", homeCurrency: "AUD", createdById: USER,
        startDate: "2027-05-01", endDate: "2027-05-04",
        members: { create: { userId: USER, role: "owner" } },
      },
    });
    await db.stop.create({
      data: {
        id: STOP_ID, tripId: TRIP_ID, name: "IT Lisbon", country: "Portugal", countryCode: "pt",
        timezone: "Europe/Lisbon", arriveDate: "2027-05-01", departDate: "2027-05-04", sortOrder: 0,
        lat: 38.72, lng: -9.14,
      },
    });
    await db.item.create({
      data: { tripId: TRIP_ID, stopId: STOP_ID, title: "IT Pastéis de Belém", category: "FOOD", date: "2027-05-02", sortOrder: 0 },
    });
    await db.dayTitle.create({ data: { stopId: STOP_ID, dayIndex: 1, title: "IT Belém day" } });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("projects one day from the Trip's real rows", async () => {
    const day = await getDay(TRIP_ID, "2027-05-02", USER);
    if (typeof day === "string") throw new Error(`getDay returned ${day}`);
    expect(day.stop?.name).toBe("IT Lisbon");
    expect(day.dayNumber).toBe(2);
    expect(day.totalDays).toBe(4);
    expect(day.prevDate).toBe("2027-05-01");
    expect(day.nextDate).toBe("2027-05-03");
    expect(day.dayTitle).toBe("IT Belém day");
    expect(JSON.stringify(day.ordered)).toContain("IT Pastéis de Belém");
    expect(day.strip.dates.find((d) => d.iso === "2027-05-02")?.count).toBe(1);
  });

  it("serves the Day page's three neighbouring days from one Trip", async () => {
    const days = await Promise.all(["2027-05-01", "2027-05-02", "2027-05-03"].map((d) => getDay(TRIP_ID, d, USER)));
    expect(days.map((d) => (typeof d === "string" ? d : d.dayNumber))).toEqual([1, 2, 3]);
  });

  it("answers out-of-range far outside the Trip", async () => {
    expect(await getDay(TRIP_ID, "2030-01-01", USER)).toBe("out-of-range");
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run test/helpers/local-db.test.ts`
Expected: PASS.
Then: `docker compose up -d && npx prisma migrate deploy && npm run test:integration`
Expected: PASS (three files: `locking`, `trip-slug`, `day-view-loader`). If Docker isn't available here, say so in the commit body; CI's `integration` job runs it.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add vitest.integration.config.ts docker-compose.yml test/helpers/local-db.ts test/helpers/local-db.test.ts test/server-only-stub.ts test/integration/day-view-loader.test.ts
git commit -m "test(integration): run on docker DB; seed Day-loader test

The loader rewrites (perf spec §B/§C) are unit-tested against a mocked
db, which cannot reject a bad select. The integration tier now defaults
to the docker-compose Postgres, refuses any non-local host, and gains
getDay as its first loader test.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 59: knip as a devDependency, configured  (perf spec §X)

**Run after every other code task in the plan.** This commit is config only; the removals are Task 60.

**Files:**
- Modify: `package.json` (devDependency via npm; script)
- Create: `knip.json`

**Interfaces:**
- Consumes: nothing
- Produces: `npm run knip`

- [ ] **Step 1: Install**
Run: `npm install --save-dev knip` (latest at install time).

- [ ] **Step 2: Add the script and config**
In `package.json` `scripts`, after `"lint": "eslint",` add:
```json
    "knip": "knip --include files,exports,types",
```
Create `knip.json`:
```json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "entry": [
    "proxy.ts",
    "scripts/*.ts",
    "scripts/**/*.ts",
    "prisma/seed*.ts",
    "prisma.config.ts"
  ],
  "project": ["**/*.{ts,tsx}"],
  "ignore": [
    "design_handoff/**",
    "types/**",
    "test/server-only-stub.ts"
  ]
}
```
Why each entry is there:
- `proxy.ts`: Next 16's middleware file, which knip's Next plugin may not know.
- `scripts/**`: run by `tsx`, including `scripts/verify-r2-presign.ts`, which has no npm script.
- `types/**`: ambient `.d.ts` files.
- `test/server-only-stub.ts`: referenced only by the integration config's alias string.

If knip warns that a config key is deprecated, switch to the replacement it names.

- [ ] **Step 3: Run it and triage**
Run: `npm run knip`
Sort each finding into one of two kinds:
- **False positive.** It's used in a way knip can't see: a Next.js file-convention export (`metadata`, `viewport`, `generateMetadata`, `dynamic`, `revalidate`, route-handler `GET`/`POST`…), something referenced by a string path (a config alias, `vercel.json`, a `package.json` script), or a `"use server"` export listed in `lib/server-action-exports.test.ts`. Confirm with `grep -rn "<name>" --include=*.{ts,tsx,json,mjs,js} . | grep -v node_modules`, then silence it narrowly in `knip.json`: add the file to `entry` if it's a real entry point, or `ignore` for a non-code file. Don't ignore whole folders of app code.
- **True positive.** Leave it in place for Task 60.

Re-run until only true positives remain.

- [ ] **Step 4: Verify**
Run: `npm run knip`
Expected: only true positives listed. Write down the count for the commit body.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add package.json package-lock.json knip.json
git commit -m "build(knip): add knip with false positives configured

One run of knip over files, exports and types (perf spec §X). This
commit only configures it; the dead code it found (N findings) is
removed in the next commit so that diff reviews on its own.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(Replace N with the count from Step 4.)

---

### Task 60: Remove the dead code knip found  (perf spec §X — "removed in a separate commit")

**Files:**
- Modify/Delete: exactly the files `npm run knip` lists after Task 59

**Interfaces:**
- Consumes: `npm run knip` (Task 59)
- Produces: nothing

- [ ] **Step 1: Baseline**
Run: `npm run knip`
Expected: the true positives Task 59 recorded.

- [ ] **Step 2: Remove, one finding at a time**
- **Unused export, used inside its own file:** delete only the `export` keyword.
- **Unused export, used nowhere:** delete the declaration, then anything that becomes unused because of it (imports, helpers).
- **Unused exported type:** same two rules.
- **Unused file:** confirm with `grep -rn "<basename without extension>" . --include=*.{ts,tsx,json,mjs,md} | grep -v node_modules` that nothing refers to it (a doc mention is fine). Then `git rm` it, along with its own `*.test.ts(x)` if that tests only the deleted file.
- Never delete an export used only by tests: knip counts tests as usage, so it won't list those.

- [ ] **Step 3: Run until clean**
Run: `npm run knip`
Expected: no issues.

- [ ] **Step 4: Run tests**
Run: `npm test`
Expected: PASS

- [ ] **Step 5: Typecheck + lint + build**
Run: `npx next typegen && npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "refactor: remove dead exports and files found by knip

No behaviour change. Exports used only in their own file lose the
export keyword; unused declarations and files are deleted. Separate
from the knip setup so the removal reviews on its own.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 61: docs/open-follow-ups.md — new entries and migration state  (perf spec §Y)

**Files:**
- Modify: `docs/open-follow-ups.md` (new subsection after the blockquote that ends line 604; new dated section appended at the end of the file, after line 2672)

**Interfaces:**
- Consumes: the migration folder written by the other section's §V task
- Produces: nothing

- [ ] **Step 1: Find the migration folder**
Run: `ls prisma/migrations | grep add_plan_order_indexes`
Expected: one folder name, `<timestamp>_add_plan_order_indexes`. Use it verbatim below. If it's missing, the §V task hasn't landed: stop and report.

- [ ] **Step 2: Add the migration state**
Insert after line 604 (the end of the `> **Mostly history …` blockquote), before `## Two migrations written on 2026-09-21`:
```markdown
## One migration written on 2026-10-06 — `<timestamp>_add_plan_order_indexes` — NOT applied

Written on branch `chore/codebase-audit-2026-10-06` (spec
`docs/specs/2026-10-06-perf-ux-batch.md` §V). Purely additive: `@@index([tripId,
forkId, sortOrder])` on `Stop`, `Transport` and `Item`, `@@index([tripId,
date])` on `Reminder`, `@@index([resolvedAt])` on `AccessRequest`. No column
changes, so it opens **no** `docs/DEPLOY.md` §4b window; `CREATE INDEX`
blocks writes to each table only while that index builds (seconds at this
size). **The operator applies it to production before the deploy that
ships the batch** (`npx prisma migrate deploy` against `DIRECT_URL`); the
production build's own `migrate deploy` (`vercel.json`) would otherwise run
it mid-deploy. Nothing here claims it has run.
```

- [ ] **Step 3: Append the dated section at the end of the file**
```markdown

## 2026-10-06 · Performance and UX batch (specs 2026-10-06-perf-ux-batch, 2026-10-06-typeahead-photon)

- **PX-01 · Backfill small cover copies.** §H stores a ~480w WebP at
  `<key>-sm` beside each cover uploaded from now on; covers uploaded before
  have none, and `app/api/trips/[tripId]/cover/route.ts` serves them the
  large copy for every `?w=` (correct, just heavier on the trips page and the
  blurred backdrop). A one-off `scripts/backfill-cover-small.ts`, shaped like
  `scripts/backfill-cover-aspect.ts`, would read each `Trip.coverImageKey`
  with no `-sm` sibling, run it through the same compression as upload and
  save `<key>-sm`. Needs production storage credentials; the operator runs
  it once.
- **PX-02 · The integration tier in CI.** CI already runs it: the
  `integration` job in `.github/workflows/ci.yml` starts postgres:16, runs
  `npx prisma migrate deploy`, then `npm run test:integration`. Still owed:
  (a) confirm it is a **required** check on `main` (a GitHub branch-protection
  setting, not visible from the repo); (b) grow the tier past its seed
  (`test/integration/day-view-loader.test.ts`) to the other loaders §C
  reshaped — `lib/travelling-home-loader.ts`, `lib/desktop-home-loader.ts`,
  `lib/next-steps-loader.ts`, `lib/trips/trips-page-loader.ts` and the Plan
  page's batch — since their unit tests mock the db and cannot catch a
  select Postgres rejects.
- **PX-03 · Switch Speed Insights on in Vercel.** `<VercelSpeedInsights />` is
  mounted (`app/layout.tsx`) and `/privacy` names it, but Vercel only collects
  once Speed Insights is enabled on the project in the Vercel dashboard.
  Operator step; nothing to build.
```

- [ ] **Step 4: Verify**
Run: `grep -n "add_plan_order_indexes\|PX-01\|PX-02\|PX-03" docs/open-follow-ups.md`
Expected: the subsection heading and the three entries.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add docs/open-follow-ups.md
git commit -m "docs(follow-ups): record the 2026-10-06 batch's owed work

The new index migration is written, not applied; the cover backfill,
integration-tier growth and Speed Insights switch-on are owed. CI
already runs the integration job, so that entry names what is left.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 62: Release notes for the batch, worded to Travellers  (perf spec §Y)

**Files:**
- Modify: `lib/release-notes.ts:28` (insert at the top of `RELEASE_NOTES`)
- Test: `lib/release-notes.test.ts` (existing invariants: newest first, valid timestamp, one line ≤140 chars, no future date)

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Write the failing test**
Append inside `describe("RELEASE_NOTES", …)`:
```ts
  it("carries the 2026-10-06 performance and UX batch", () => {
    expect(RELEASE_NOTES.some((n) => n.text.startsWith("Travelling: a new cost starts in the local currency"))).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run lib/release-notes.test.ts -t "2026-10-06"`
Expected: FAIL (expected false to be true).

- [ ] **Step 3: Implement**
Get the release minute: `date -u +%Y-%m-%dT%H:%M:00Z`. Call it T. Notes get T, T−1 min, T−2 min, … in the order below, newest first. They must be no earlier than now (a dismissal between an earlier stamp and the deploy would swallow them) and never in the future (the test checks this). Drop any line whose spec part is not in `git log` on this branch; the part is in the trailing comment.
```ts
  {
    publishedAt: "<T>",
    text: "Travelling: a new cost starts in the local currency, set to On the trip and already paid — change any of it before saving.", // §K
  },
  {
    publishedAt: "<T − 1 min>",
    text: "Plan: change a stop's nights with − and + right on the stop, and edit its place with the same search as adding one.", // §N, §L
  },
  {
    publishedAt: "<T − 2 min>",
    text: "Add a stop, a cost or a Wishlist idea from Home or Search and the form opens straight away; a flag takes you to its stop.", // §F
  },
  {
    publishedAt: "<T − 3 min>",
    text: "Share: send one of your trip's Share links from the trip menu or from Search.", // §O
  },
  {
    publishedAt: "<T − 4 min>",
    text: "A form you've changed asks before it closes, and a save that fails now tells you and keeps what you typed.", // §M, §E
  },
  {
    publishedAt: "<T − 5 min>",
    text: "Votes, checklist ticks and calendar moves show the moment you make them.", // §W
  },
  {
    publishedAt: "<T − 6 min>",
    text: "Saved for offline refreshes every few hours rather than every visit, skips data-saver connections, and Settings says when it last saved.", // §A
  },
  {
    publishedAt: "<T − 7 min>",
    text: "Summary: a departure shows the date in the place you leave from.", // §G
  },
  {
    publishedAt: "<T − 8 min>",
    text: "Teepee is quicker: pages load in fewer steps, maps load only when on screen, and place search keeps up as you type.", // §B–§D, §H, §P–§U, Photon
  },
```
Write real ISO strings (e.g. T = `2026-10-06T14:20:00Z` → `14:19`, `14:18`, …), not the `<…>` markers, and don't keep the trailing comments.

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run lib/release-notes.test.ts`
Expected: PASS (every line is one line and ≤140 chars; the longest, the Saved for offline one, is about 135).

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add lib/release-notes.ts lib/release-notes.test.ts
git commit -m "docs(release-notes): tell Travellers about the 2026-10-06 batch

One line per change a Traveller would notice (ADR 0056), worded in
CONTEXT.md's terms; internal work (indexes, tooling, knip) earns none.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Section self-check

**Spec items covered → tasks**
- Photon §A (Photon client and its tests) → 49
- Photon §B (`findPlaces` uses Photon; Globe/Transport and the combobox unchanged) → 50
- Photon §C (skip located Stops in both firm-up loops; `paceNominatim`; `locateRoughStops` spacing; zero-geocode and two-geocode tests) → 51
- Photon §D (privacy page names Photon, plus test) → 52
- Photon §E (ADR 0028 amended; HANDOFF Maps row; `.env.example`) → 53
- Perf §X `@vercel/speed-insights`, /privacy sentence and test → 54
- Perf §X `Intl.supportedValuesOf("timeZone")` with fallback → 55
- Perf §X `typedRoutes: true` and the rejected hrefs → 56
- Perf §X Playwright devDependency, shim deleted, `audit-browser.ts` imports the package, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` documented → 57
- Perf §X real-Postgres integration tier on the docker-compose DB, plus the Day-loader seed test → 58
- Perf §X knip run, config and false positives → 59; dead code in a separate commit → 60
- Perf §Y ADR 0028 amended-by-0069 → 53; follow-ups (cover backfill, integration-tier CI, `add_plan_order_indexes` migration state) → 61; release notes → 62

**Couldn't plan exactly, and why**
- **typedRoutes (56):** the full list of rejected hrefs only exists after `next typegen` and `tsc`, which write files. The task gives the generator's real rules, concrete fixes for the shared builders, the expected sites found by grep, and fixed rules for the rest.
- **knip (59/60):** what it finds is only known after installing and running it. The tasks give the config, triage rules and removal rules, not a list of deletions.

**Drift and cross-section flags**
- The geocode lines are `stops.ts:925` (`firmUpSegment`) and `:1053` (`firmUpTrip`); both are firm-up loops. `locateRoughStops` is at `trips.ts:165-177`. The loops also needed `lat`/`lng` added to their `findMany` selects.
- CI already runs the integration tier (`.github/workflows/ci.yml:29-57`), so the spec's "CI wiring is a follow-up" is partly done. PX-02 names what's actually left.
- **`server-only` coordination:** Task 58 adds a `server-only` alias pointing at `test/server-only-stub.ts` in `vitest.integration.config.ts`. Once the other planner puts `import "server-only"` in `lib/db.ts`, all three integration files need it. If that planner also creates a stub (for `vitest.config.ts`), merge on one file.
- Task 58 depends on the other section's §B tasks; Task 61 depends on its §V migration folder name; Task 62's lines depend on which spec parts actually landed.
- Small additions beyond the letter of the spec:
  - Speed Insights reuses the share-token redaction. Its timings carry the URL too, so not doing it would leak tokens.
  - Photon wrong-shape bodies are never cached, to meet the spec's "failures never cached".
  - The integration config refuses a non-local `DATABASE_URL`, because the tests delete rows.
  - PX-03 is an operator note: Speed Insights collects nothing until it's switched on in Vercel.
- Playwright is pinned to 1.63.0 to match this environment's global install. Pinning is a choice; the spec named no version.
- Commit trailers follow RULES.md (`Claude Fable 5.1`), not this session's commit-attribution reminder.

---

## Task list

49. Photon client `searchPlacesTypeahead` (photon §A)
50. The combobox's action uses Photon (photon §B)
51. Batch geocodes skip located Stops and are spaced 1 s (photon §C)
52. Privacy page names Photon (photon §D)
53. ADR 0028 amended note, HANDOFF and .env.example (photon §E; perf §Y ADR item)
54. Vercel Speed Insights, with the share-token redaction (perf §X)
55. TIMEZONES from `Intl.supportedValuesOf`, curated list as fallback (perf §X)
56. `typedRoutes: true` and fix every rejected href (perf §X)
57. Playwright as a real devDependency; delete the shim (perf §X)
58. Real-Postgres integration tier on the docker-compose DB, seeded with a Day-loader test (perf §X)
59. knip as a devDependency, configured (perf §X)
60. Remove the dead code knip found (perf §X)
61. docs/open-follow-ups.md — new entries and migration state (perf §Y)
62. Release notes for the batch, worded to Travellers (perf §Y)

The self-check is the last part of the section above.

