# Place Search English Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force every OpenStreetMap Nominatim request to return English place names so the place search stops showing local-language text (e.g. "東京タワー" instead of "Tokyo Tower").

**Architecture:** All geocoding flows through `lib/geocode.ts`, which builds three separate Nominatim request URLs (forward coords-only, forward detailed search, reverse). Add an `accept-language=en` query parameter to each. This is a display-only, forward-only change — no database, no UI, no new dependencies.

**Tech Stack:** TypeScript, Nominatim (OpenStreetMap) HTTP API, Vitest (fetch mocked via `vi.stubGlobal`).

## Global Constraints

- Language value is hard-wired to `en` — the app is English-only; do NOT introduce an i18n/locale system or a configurable language.
- `lib/geocode.ts` must never throw — every function returns `null` / `{ status: "error" }` on failure. Preserve this.
- Tests never hit the network: `fetch` is mocked with `vi.stubGlobal("fetch", fetchMock)`. Do NOT make real requests.
- Nominatim requires the existing `User-Agent` header — do NOT remove or alter it.
- Forward-only: no database backfill, no migration.

---

### Task 1: Send `accept-language=en` on every Nominatim request

**Files:**
- Modify: `lib/geocode.ts` (three request builders: `geocodePlace`, `searchPlacesWithStatus`, `reverseGeocode`)
- Test: `lib/geocode.test.ts`

**Interfaces:**
- Consumes: nothing new — existing exported functions `geocodePlace`, `searchPlaces`, `searchPlacesWithStatus`, `reverseGeocode`, `geocodePlaceDetailed`.
- Produces: no signature changes. Behaviour change only: every Nominatim request URL now carries `accept-language=en`. `geocodePlaceDetailed` and `searchPlaces` inherit this because they delegate to `searchPlacesWithStatus`.

**Context for the implementer:**
- The three URL builders each construct a `new URL(...)` and call `url.searchParams.set(...)`. You will add one `set("accept-language", ...)` call to each:
  - `geocodePlace` — around the block that sets `format`/`limit`/`q`.
  - `searchPlacesWithStatus` — around the block that sets `format`/`addressdetails`/`limit`/`q`.
  - `reverseGeocode` — around the block that sets `format`/`addressdetails`/`lat`/`lon`.
- `geocodePlace` returns only coordinates, so the language has no visible effect there — it is included purely so all three requests are uniform and correct.
- Define a single module-level constant so the value lives in one place (DRY). Put it next to the other module constants (e.g. near `TIMEOUT_MS`):
  ```typescript
  // The app is English-only. Ask Nominatim for English place names so search
  // results and derived city/country are not returned in the local language
  // (e.g. "Tokyo Tower", not "東京タワー"). Falls back to the local name only
  // when no English name exists in OpenStreetMap.
  const ACCEPT_LANGUAGE = "en";
  ```
- Existing tests read the request via `const [url, options] = fetchMock.mock.calls[0];`. The URL is a string; assert with `expect(url as string).toContain("accept-language=en")` (the value has no characters that get percent-encoded).

- [ ] **Step 1: Write the failing tests**

Add these three tests to `lib/geocode.test.ts` — one inside each existing `describe` block (`geocodePlace`, `searchPlacesWithStatus`, `reverseGeocode`):

```typescript
// inside describe("geocodePlace", ...)
it("requests English place names via accept-language=en", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => [{ lat: "35.6586", lon: "139.7454" }],
  });

  await geocodePlace("Tokyo Tower");

  const [url] = fetchMock.mock.calls[0];
  expect(url as string).toContain("accept-language=en");
});
```

```typescript
// inside describe("searchPlacesWithStatus", ...)
it("requests English place names via accept-language=en", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

  await searchPlacesWithStatus("Tokyo Tower");

  const [url] = fetchMock.mock.calls[0];
  expect(url as string).toContain("accept-language=en");
});
```

```typescript
// inside describe("reverseGeocode", ...)
it("requests English place names via accept-language=en", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ lat: "48.8584", lon: "2.2945", address: {} }),
  });

  await reverseGeocode(48.8584, 2.2945);

  const [url] = fetchMock.mock.calls[0];
  expect(url as string).toContain("accept-language=en");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- geocode`
Expected: The three new `accept-language=en` tests FAIL (the substring is absent from the URL). All other geocode tests still PASS.

- [ ] **Step 3: Add the constant and set the parameter in all three builders**

In `lib/geocode.ts`, add the module-level constant near `TIMEOUT_MS`:

```typescript
// The app is English-only. Ask Nominatim for English place names so search
// results and derived city/country are not returned in the local language
// (e.g. "Tokyo Tower", not "東京タワー"). Falls back to the local name only
// when no English name exists in OpenStreetMap.
const ACCEPT_LANGUAGE = "en";
```

In `geocodePlace`, add the line to its URL builder:

```typescript
const url = new URL(NOMINATIM_URL);
url.searchParams.set("format", "json");
url.searchParams.set("limit", "1");
url.searchParams.set("q", query);
url.searchParams.set("accept-language", ACCEPT_LANGUAGE);
```

In `searchPlacesWithStatus`, add the line to its URL builder:

```typescript
const url = new URL(NOMINATIM_URL);
url.searchParams.set("format", "json");
url.searchParams.set("addressdetails", "1");
url.searchParams.set("limit", String(limit));
url.searchParams.set("q", trimmed);
url.searchParams.set("accept-language", ACCEPT_LANGUAGE);
```

In `reverseGeocode`, add the line to its URL builder:

```typescript
const url = new URL(NOMINATIM_REVERSE_URL);
url.searchParams.set("format", "json");
url.searchParams.set("addressdetails", "1");
url.searchParams.set("lat", String(lat));
url.searchParams.set("lon", String(lng));
url.searchParams.set("accept-language", ACCEPT_LANGUAGE);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- geocode`
Expected: ALL geocode tests PASS, including the three new ones.

Then run the full suite and lint to confirm nothing else broke:

Run: `npm test`
Expected: PASS (whole suite green).

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add lib/geocode.ts lib/geocode.test.ts
git commit -m "fix(geocode): request English place names from Nominatim"
```

---

## Manual verification (after Task 1)

Not automated (real Nominatim call). With the dev server running and `NOMINATIM_CONTACT` set:
1. Open Globe → Add Marker.
2. Search "tokyo tower".
3. Expected: candidate reads "Tokyo Tower, …, Japan" (English), and the resolved "city, country" caption is English — not "東京タワー" / "日本".

## Self-review notes

- **Spec coverage:** Fix mechanism (`accept-language=en` on all three builders) ✓; forward-only / no backfill ✓ (no DB task); accepted limitation (local fallback when no English name) captured in the constant's comment ✓; out-of-scope items (command palette, i18n system) not touched ✓; verification test ✓.
- **No placeholders:** all steps contain concrete code and exact commands.
- **Type consistency:** no signatures change; `ACCEPT_LANGUAGE` is the single name used in all three builders.
