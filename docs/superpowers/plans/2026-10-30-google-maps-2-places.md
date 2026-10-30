# Google Maps — Branch 2: Places — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every place field searches Google Places, every server-side lookup goes to Google, picked places keep their place ID (and, for Item venues, fill opening hours, link and business status), "Open in Maps" opens the real venue, Photon and Nominatim are gone, and a guarded backfill script is ready to run after the deploy.

**Architecture:** Server: `lib/geocode.ts` keeps its file and its two survivor names (`geocodePlaceDetailed`, `reverseGeocode`) but talks to Google Geocoding with `GOOGLE_MAPS_SERVER_KEY`; new `locateVenue` (free Text Search IDs-only + Place Details Essentials + a 500 m guard) and `fetchVenueDetails` (Enterprise, backfill only) sit beside them. Client: `PlaceCombobox` keeps its props but its suggestions come from `AutocompleteSuggestion` via `useMapsLibrary("places")` inside its own `APIProvider`; with no key, a refused key or an exhausted quota it is a plain text field and the server looks the text up on save. A pure converter turns Google's opening-hours periods into Teepee's `OpeningHours`.

**Tech Stack:** Next 16.4.2 (read `node_modules/next/dist/docs/` before touching server actions/route conventions), React 19.3 + React Compiler, Prisma 7.10, `@vis.gl/react-google-maps` 1.10.1, Google Geocoding API, Places API (New) (REST on the server, Maps JS `places` library on the client), Vitest.

**Spec:** `docs/specs/2026-10-30-google-maps.md` — G, P1–P5, and "Hand-off from Branch 1". ADR 0076.

## Global Constraints

- **Nothing waits on Cam.** No key exists. Keyless server: every lookup returns `null` without a network call and the row saves without coordinates. Keyless client: every place field is a plain text input. All tests run keyless or with mocks.
- Env: `GOOGLE_MAPS_SERVER_KEY` (server, never `NEXT_PUBLIC_`), `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (client, read literally). Forms gate on the browser key only — **not** `mapsConfig()` (it needs a Map ID).
- `components/map/maps-auth.ts` (`useMapsAuthFailed()`) owns `window.gm_authFailure`. Place fields read it; nothing else assigns `window.gm_authFailure`.
- Suggestions: debounce **350 ms**, minimum **3** characters, one `AutocompleteSessionToken` per field focus, ended by the pick's `fetchFields`. The name of a pick comes from the prediction's main text (free), never `displayName` (Pro).
- Field masks — exact: **every client pick** fetches `["id","location","formattedAddress","addressComponents"]` (Essentials) — never Enterprise fields in the browser. Server Text Search mask `places.id` only. Server venue location `id,location,formattedAddress,addressComponents`. Server venue details (opening hours etc.) `id,regularOpeningHours,websiteUri,businessStatus` (Enterprise).
- **Google quotas are per API method, not per SKU** (one GetPlace daily cap covers Essentials and Enterprise). So Enterprise spend is held by Teepee itself: `takeGoogleQuota("venue-details", 15)` (a per-UTC-day DB counter) gates every Enterprise call the app makes. The backfill script is the only Enterprise caller that bypasses it (operator, runbook raises the console quota for the hour).
- Types: read `node_modules/@types/google.maps` for `AutocompleteSuggestion`, `PlacePrediction` (`mainText` is a `FormattableText` — use `.text`), `AutocompleteSessionToken`, `Place.fetchFields`, and whether `includedPrimaryTypes: ["(regions)"]` is valid for Autocomplete (New); if it isn't, use the documented equivalent and say so.
- Never overwrite: a pick or the backfill fills an Item's opening hours / link only when they are empty.
- Venue guard **500 m** (server `locateVenue`). Backfill tolerance **1 km** (Items, Accommodation, Transport ends, Markers) / **25 km** (Stops, Trip Home bases).
- Every server Google call: 5 s timeout, never throws, `null` on any failure.
- A Surprise placeholder masks `placeId` and `businessStatus` like it masks `address`/`lat`/`lng` (ADR 0072).
- Google attribution: the suggestions list shows the text `Google Maps` as its footer (Places policy: Places content shown off a map).
- Keyless/unavailable hint under a place field (exact): `Suggestions aren't available — the place is looked up when you save.`
- Re-look-up only on change: an update re-geocodes an address/place/name only when that text changed or the row has no coordinates, and never when a picked place came with the save.
- Zero comments unless the why is non-obvious; no JSDoc; double quotes + semicolons.
- **Never `git add -A` / `git add .`** — `docs/feedback/inbox.md` has an unrelated change. Stage explicit paths.
- Verification tiers (CLAUDE.md): inner loop `npx vitest run <files>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`; full `npm test` + `npm run build` + `npm run test:integration` only in Task 12.

## Review Focus

1. **Typed after a pick** — a Traveller picks "Ichiran Shibuya", then edits the text. The stale place ID/coords/hours must not be saved with the new text. Pinned in Task 6 and Task 7 (typing clears the pick).
2. **Update without touching the address** — editing an Item's notes must not re-look-up its address (cost + a moved pin). Pinned in Task 3 (`updateItem` with an unchanged address calls no lookup).
3. **Google refuses the key mid-session** — suggestions stop; the field must stay usable as plain text and the save must still work. Pinned in Task 5 (auth-failed → plain input + hint).
4. **Overnight hours** — a bar open 18:00–02:00 must become `fri: [["18:00","24:00"]], sat: [["00:00","02:00"], …]`, and a day that would need 3 spans must not be half-filled. Pinned in Task 4.
5. **Copies drop the place** — placing a Wishlist idea, forking/promoting, Duplicate, and Marker → Item must carry `placeId` / `businessStatus` / `depPlaceId` / `arrPlaceId`; the Activity diff must not report place-ID changes as edits. Pinned in Task 3.
6. **Enterprise cap reached mid-planning** — the 16th venue pick of the day still fills location; hours/link just don't fill. Pinned in Task 6.
7. **Surprise leak via place ID** — a surprised Traveller's placeholder must not carry the venue's place ID (an "Open in Maps" link would reveal it). Pinned in Task 8.

---

### Task 1: Schema — place IDs and business status

**Files:**
- Create: `prisma/migrations/20261030120000_google_place_ids/migration.sql` (generate it with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` against the local docker DB rather than by hand, then add the header comment; adapt flags to Prisma 7.10's CLI)
- Modify: `prisma/schema.prisma` (Item ~790, Stop ~622, Accommodation ~757, Transport ~709, Marker ~1232, Trip ~456; fix "from Nominatim" comments at ~628, ~1244)
- Modify: `lib/validations/item.ts`, `lib/validations/stop.ts`, `lib/validations/accommodation.ts`, `lib/validations/transport.ts`, `lib/validations/marker.ts`, the Trip validation file; their tests
- Test: the validation test files

**Interfaces:**
- Produces columns (all nullable `String?`): `Item.placeId`, `Item.businessStatus`, `Stop.placeId`, `Accommodation.placeId`, `Transport.depPlaceId`, `Transport.arrPlaceId`, `Marker.placeId`, `Trip.homePlaceId`.
- Produces model `GoogleUsage { day String; sku String; count Int @default(0); @@id([day, sku]) }` (day = UTC `YYYY-MM-DD`).
- Produces validation fields: optional `placeId: z.string().trim().min(1).max(300)` on item, stop, accommodation, marker inputs; `depPlaceId`/`arrPlaceId` on transport; `homePlaceId` on trip; `businessStatus: z.enum(["OPERATIONAL","CLOSED_TEMPORARILY","CLOSED_PERMANENTLY"])` optional on item. Item and Accommodation inputs also accept optional `lat`/`lng` (numbers in range) and Item `countryCode` — **only meaningful together with `placeId`** (a picked place); the schemas refine that `lat`/`lng` appear only alongside `placeId`.

- [ ] **Step 1: Failing tests** — per validation file: `accepts a picked place (placeId + lat + lng)`, `rejects lat/lng without placeId` (Item, Accommodation), `rejects an unknown businessStatus`, `accepts depPlaceId/arrPlaceId` (Transport), `accepts homePlaceId` (Trip).
- [ ] **Step 2:** run them → FAIL.
- [ ] **Step 3:** migration (`ALTER TABLE … ADD COLUMN … TEXT` per column; header comment citing the spec and "additive, nullable — one deploy" per DEPLOY §4b convention), schema, validations. `npx prisma generate`.
- [ ] **Step 4:** PASS; apply the migration to the local DB (`npx prisma migrate deploy` against local docker only).
- [ ] **Step 5:** task-done checks.
- [ ] **Step 6: Commit** — `feat(places): place IDs and business status columns`

---

### Task 2: Server lookups on Google

**Files:**
- Modify: `lib/geocode.ts` (rewrite), `lib/geocode.test.ts` (rewrite)
- Modify: `lib/picked-place.ts` (+ test) — `toPickedPlace` no longer parses a Nominatim `display_name`

**Interfaces:**
- Produces:
  - `type GeoCandidate = { name: string; lat: number; lng: number; city: string | null; country: string | null; countryCode: string | null; placeId: string | null; address: string | null }` (countryCode lower-case; `name` = the first `formatted_address` part for a locality, the full formatted address otherwise).
  - `geocodePlaceDetailed(query: string, opts?: { near?: LatLng }): Promise<GeoCandidate | null>` — Geocoding API `https://maps.googleapis.com/maps/api/geocode/json?address=…&language=en&key=…` (`bounds`/region bias from `near` optional); first result.
  - `reverseGeocode(lat: number, lng: number): Promise<GeoCandidate | null>` — Geocoding `latlng=`.
  - `locateVenue(title: string, address: string, opts?: { near?: LatLng }): Promise<GeoCandidate | null>` — POST `https://places.googleapis.com/v1/places:searchText` (`X-Goog-Api-Key`, `X-Goog-FieldMask: places.id`, body `{ textQuery: "<title>, <address>", locationBias?: { circle: { center, radius: 50000 } } }`) → first id → GET `https://places.googleapis.com/v1/places/<id>` mask `id,location,formattedAddress,addressComponents` → accepted only if within **0.5 km** (`haversineKm`) of `geocodePlaceDetailed(address)`; otherwise returns that address result (no venue ID beyond the address's own); `null` if both miss.
  - `fetchVenueDetails(placeId: string): Promise<{ openingHours: OpeningHours | null; website: string | null; businessStatus: string | null } | null>` — mask `id,regularOpeningHours,websiteUri,businessStatus`; hours through Task 4's converter (Task 2 may stub the hours mapping to `null` and Task 4 wires it — say so in the report).
  - `export const VENUE_GUARD_KM = 0.5`.
  - `lib/google-usage.ts` (+ test, server-only): `takeGoogleQuota(sku: string, limit: number): Promise<boolean>` — one atomic upsert-increment on `GoogleUsage(day=UTC today, sku)` returning `true` while the new count ≤ `limit`; never throws (a DB error → `false`).
- Removes: `geocodePlace`, `searchPlaces`, `searchPlacesWithStatus`, `searchPlacesTypeahead`, `PlaceSearchOutcome`, `paceNominatim`, `_resetNominatimPaceForTests`, the response cache and its reset, `GEOCODE_REVALIDATE_SECONDS`, `NOMINATIM_CONTACT`/User-Agent. **Leave the callers compiling**: if removing an export breaks a caller that a later task rewrites, keep a thin deprecated shim in this task (`geocodePlace = async (q) => { const c = await geocodePlaceDetailed(q); return c && { lat: c.lat, lng: c.lng }; }`) and list every shim in the report; Task 10 deletes them.
- Keyless: no `GOOGLE_MAPS_SERVER_KEY` → every function returns `null` with no `fetch`.

- [ ] **Step 1: Rewrite `lib/geocode.test.ts`** (stub `fetch` with `vi.stubGlobal`, `vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", …)`): `returns null and never fetches without a server key`; `maps the first Geocoding result to a candidate with placeId, address and a lower-case country code`; `returns null on ZERO_RESULTS, a non-OK status, a non-2xx, malformed JSON, and a 5 s timeout`; `reverseGeocode reads latlng`; `locateVenue asks Text Search for places.id only, then Place Details Essentials`; `locateVenue accepts a venue within 0.5 km of the address`; `locateVenue falls back to the address result when the venue is 2 km away`; `locateVenue biases to near when given`; `fetchVenueDetails asks for regularOpeningHours, websiteUri and businessStatus only`; `takeGoogleQuota allows the 15th call of a UTC day and refuses the 16th; a new day starts again` (integration-style against the test DB if the repo's action tests use one, else a mocked `db` upsert). Update `lib/picked-place.test.ts` for the new candidate shape.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** task-done checks (expect many dependents in `vitest related`; fix only what this task broke; mocks of `@/lib/geocode` that list removed names may need the shim names kept — note them).
- [ ] **Step 6: Commit** — `feat(places): server lookups go to Google Geocoding and Places`

---

### Task 3: Saves keep place IDs and look up only on change

**Files:**
- Modify: `server/actions/items.ts` (create ~183-215, update ~375-466), `server/actions/accommodation.ts` (~91-97, ~178-224), `server/actions/transport.ts` (~144-160, ~312-328), `server/actions/stops.ts` (~120, ~133, ~312, ~356, ~441-450, ~491, ~951, ~1074), `server/actions/trips.ts` (~103-122, ~209-221, ~338), `server/actions/globe.ts` (`createMarker`/`updateMarker` store `placeId`); their tests (`items.test.ts`, `accommodation.test.ts`, `transport.test.ts`, `stops.test.ts`, `trips.test.ts`, `firm-up-trip.test.ts`, `globe.test.ts`) and any integration test whose `@/lib/geocode` mock lists removed names.

**Interfaces:**
- Consumes: Task 1 columns/validations; Task 2 `geocodePlaceDetailed`, `locateVenue`.
- Rules:
  - **Picked place wins**: when the input carries `placeId` + `lat` + `lng` (Item, Accommodation, Stop, Marker, Trip home `homePlaceId` + `homeLat`/`homeLng`, Transport `depPlaceId`+`depLat`/`depLng` / `arr…`), store them and call no lookup.
  - **Item lookup**: `locateVenue(title, address, { near: <owning Stop's lat/lng> })`; store `lat`, `lng`, `countryCode`, `placeId`.
  - **Others**: `geocodePlaceDetailed(query)` as today's queries; store `placeId` with the coordinates.
  - **Only on change** (update paths): look up only if the text it is derived from changed (Item/Accommodation `address`, Transport `depPlace`/`arrPlace`, Stop `name`/`country` per today's rules, Trip `homeName`) or the row has no coordinates. An Item/Accommodation update whose address is unchanged keeps `lat`/`lng`/`countryCode`/`placeId`. A changed address clears the old `placeId` and `businessStatus` unless a new pick came with it.
  - Item `businessStatus` is stored from the input only (a pick); a looked-up address leaves it null.
  - Keep every existing "best effort, save without coordinates" behaviour and ADR 0007's "geocode outside the transaction".
  - Remove pacing calls (`paceNominatim`) and their test mocks.
  - **Copy paths carry the place**: grep the row-copy helpers — `ideaCopyData` (placing a Wishlist idea), Fork copy and promote (`server/actions/forks.ts` and helpers), Duplicate, Marker → Item (`add_marker_to_wishlist`, ADR 0025 seeding) — and add `placeId`/`businessStatus` (Item), `placeId` (Stop, Accommodation), `depPlaceId`/`arrPlaceId` (Transport) wherever fields are listed explicitly (Marker → Item copies the Marker's `placeId`).
  - **Activity**: the field-diff that records UPDATED lines must ignore `placeId`, `depPlaceId`, `arrPlaceId`, `homePlaceId`, `businessStatus` the way it ignores `lat`/`lng` (find where that ignore list lives).
- [ ] **Step 1: Failing tests** (extend each action's tests): `createItem with a picked place stores placeId and coordinates and looks nothing up`; `createItem with only an address calls locateVenue near the Stop and stores its placeId`; `updateItem with an unchanged address calls no lookup and keeps the place`; `updateItem with a changed address re-locates and clears businessStatus`; same "unchanged → no lookup" for Accommodation and Transport ends; `createStop with a picked place stores placeId`; `updateTrip with a picked home stores homePlaceId and skips geocoding`; `createMarker stores placeId`; one test per copy path that the copy keeps `placeId` (placing an idea, fork copy, duplicate, marker → item); `an update that only changes placeId records no Activity field line`.
- [ ] **Steps 2–5** as usual (`vitest related` will pull in integration-adjacent unit tests; also run `npx vitest run test/integration --run` only if the local DB is up — otherwise leave integration for Task 12).
- [ ] **Step 6: Commit** — `feat(places): saves keep place IDs and look up only what changed`

---

### Task 4: Google opening hours → Teepee opening hours

**Files:**
- Create: `lib/opening-hours-google.ts`, `lib/opening-hours-google.test.ts`
- Modify: `lib/geocode.ts` (wire `fetchVenueDetails` hours through the converter if Task 2 stubbed it)

**Interfaces:**
- Produces: `type GooglePeriod = { open: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }`; `openingHoursFromGoogle(periods: GooglePeriod[] | null | undefined, source?: string): OpeningHours | null`.
- Rules: Google `day` 0 = Sunday → `sun`; a single period with `open` day 0 00:00 and no `close` = open 24 h every day (`[["00:00","24:00"]]` × 7); a span crossing midnight splits into `[open,"24:00"]` on its day and `["00:00",close]` on the next; a day with no period is `[]` (closed) — only when at least one period exists; spans sorted; if any day would need more than `MAX_SPANS_PER_DAY` (2) spans, or the result fails `openingHoursSchema`, return `null`; `source` (a `https://www.google.com/maps/search/?api=1&query_place_id=…` link) is set when given. Empty/absent periods → `null`. The output must pass `openingHoursSchema` (`lib/validations/opening-hours.ts`).

- [ ] **Step 1: Failing tests**: `maps a simple Mon–Fri 9–17 week and marks the weekend closed`; `splits an 18:00–02:00 Friday into Friday to 24:00 and Saturday from 00:00`; `24/7 single period → every day 00:00–24:00`; `lunch + dinner → two spans`; `three spans on a day → null`; `no periods → null`; `sets source when given`; every non-null result passes `openingHoursSchema`.
- [ ] **Steps 2–5** as usual.
- [ ] **Step 6: Commit** — `feat(places): Google opening hours convert to Teepee's`

---

### Task 5: The place field on Google Places

**Files:**
- Modify: `components/ui/place-combobox.tsx` (+ `place-combobox.test.tsx`)
- Create: `components/places/use-place-suggestions.ts` (+ test), `components/places/places-available.ts` (+ test)
- Modify: `lib/picked-place.ts` (`PickedPlace` gains fields), `test/google-maps-mock.tsx` (add a `places` library stand-in: `useMapsLibrary("places")` returns `{ AutocompleteSuggestion: { fetchAutocompleteSuggestions }, AutocompleteSessionToken }` with recorded calls; `toPlace()` → `{ fetchFields, id, location, formattedAddress, addressComponents, regularOpeningHours, websiteURI, businessStatus }`)

**Interfaces:**
- Consumes: `useMapsAuthFailed()` (Branch 1), Task 4 `openingHoursFromGoogle`.
- Produces:
  - `placesBrowserKey(): string | null` (`lib/map/google-config.ts`) — literal `process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, non-empty.
  - `type PlaceKind = "region" | "venue" | "any"`; `region` → `includedPrimaryTypes: ["(regions)"]`; `venue` and `any` → no type filter (venues and street addresses both allowed). They differ only in the default `details` mask the caller passes.
  - `PickedPlace = { name: string; region?: string; lat: number; lng: number; countryCode?: string; placeId: string; address?: string }`.
  - `usePlaceSuggestions({ kind, near }: { kind: PlaceKind; near?: LatLng })` → `{ available: boolean; suggestions: { id: string; mainText: string; secondaryText: string }[]; status: "idle" | "loading" | "ok" | "empty" | "error"; search(text: string): void; pick(id: string): Promise<PickedPlace | null>; reset(): void }` — debounce 350 ms, min 3 chars, one session token per field focus (`reset()` starts a new one), `pick` calls `fetchFields` with the exact (Essentials) mask from Global Constraints and ends the session; a rejected `fetchFields` resolves `null` and the field keeps the typed text (the server looks it up on save); `available === false` when no browser key, `useMapsAuthFailed()`, or the `places` library failed to load; a rejected `fetchAutocompleteSuggestions` (quota) flips `available` to false for the field's lifetime.
  - `PlaceCombobox` keeps its current props and adds `kind?: PlaceKind` (default `"region"`, today's behaviour). It renders its own `APIProvider apiKey={placesBrowserKey()}` (no `libraries` prop) when a key exists. When `!available`: a plain input (same label/Field wiring, same `onValueChange`) plus the exact hint copy. The list footer reads `Google Maps`. Keeps ARIA combobox semantics, the race guard and `rankNear` (now passed as `near` bias).
  - Server action `server/actions/places.ts` (`findPlaces`) is no longer used by the combobox (Task 10 deletes it).
- [ ] **Step 1: Failing tests** (`place-combobox.test.tsx` rewritten on the mock): `is a plain input with the hint when there is no browser key`; `is a plain input with the hint after Google refuses the key`; `asks for suggestions after 3 characters and 350 ms, not before`; `region kind asks for (regions); venue and any kinds don't filter`; `a pick fetches exactly the location mask and returns placeId, coordinates, address, country code and the prediction's main text as name`; `a failed pick keeps the typed text and returns no place`; `a rejected suggestions call degrades to a plain input with the hint`; `one session token per focus; a pick ends it`; `the list footer says Google Maps`. Existing consumer tests (`stop-form-dialog`, `add-stop-sheet`, `step-from`, `step-where-past`) mock `findPlaces` — switch them to the maps mock or to mocking `PlaceCombobox`, keeping their behaviour assertions.
- [ ] **Steps 2–5** as usual.
- [ ] **Step 6: Commit** — `feat(places): the place field suggests from Google Places`

---

### Task 6: Item and Accommodation addresses search venues

**Files:**
- Modify: `components/trip/item-form-dialog.tsx` (address field ~868-875, state ~566/574, submit ~620/645), `components/trip/accommodation-form-dialog.tsx` (~265-271, ~176, ~219); their tests; `components/booking-import/proposal-card.tsx` only if it breaks

**Interfaces:**
- Create: `server/actions/venue-details.ts` (+ test) — `venueDetailsForPick(tripId: string, placeId: string): Promise<{ openingHours: OpeningHours | null; website: string | null; businessStatus: string | null } | null>`: trip access guard (the existing guard Item actions use), then `takeGoogleQuota("venue-details", 15)`; over the cap → `null` without calling Google; else `fetchVenueDetails(placeId)`.
- Consumes: Task 5 `PlaceCombobox` (`kind="venue"`), Task 1 validations, Task 2 `fetchVenueDetails` / `takeGoogleQuota`.
- Behaviour: the address field becomes `PlaceCombobox`, its text is the address. On pick: address = `picked.address`; keep `placeId`/`lat`/`lng`/`countryCode`. **Items** then call `venueDetailsForPick` and fill Opening hours **only if the form's hours are still empty**, Link **only if Link is empty**, and keep `businessStatus` for the save; a `null` answer (cap reached, Google miss, keyless) fills nothing and the pick still stands. Typing in the field after a pick clears the pick (and the hours/link it filled only if the Traveller hasn't changed them since). The save sends the picked fields; with no pick it sends the address only (server looks it up). `near` = the owning Stop's coordinates when known.
- [ ] **Step 1: Failing tests**: `picking a venue fills address and sends placeId, lat, lng`; `a venue pick fills empty opening hours and an empty link from venueDetailsForPick`; `when venueDetailsForPick answers null the pick still saves its place and fills nothing`; `venueDetailsForPick refuses the 16th call of the day without calling Google` (action test); `a venue pick leaves hours and link the Traveller already set`; `typing after a pick drops the place and sends the text only`; `keyless, the address is a plain field and saves as text` (Item and Accommodation).
- [ ] **Steps 2–5**. **Step 6: Commit** — `feat(places): Item and Accommodation addresses search venues`

---

### Task 7: Transport ends, Trip settings Home base and the Globe marker form

**Files:**
- Modify: `components/trip/location-combobox.tsx` (+ test) — the "Search …" button and `searchPlacesAction` call are replaced by Google suggestions (`usePlaceSuggestions`, `kind: "any"`, `details: "location"`) inside the popover; `LocationValue` `place` becomes `{ kind: "place"; name: string; placeId?: string; lat?: number; lng?: number }`
- Modify: `components/trip/transport-form-dialog.tsx` (~391-398, ~493-517, ~590-630) — From/To place ends and the Departure/Arrival point inputs send `depPlaceId`/`depLat`/`depLng` (and `arr…`) when picked; the point inputs become `PlaceCombobox kind="venue"`
- Modify: `components/trip/settings/trip-details-form.tsx` (~190-199) — Home base becomes `PlaceCombobox kind="region"`; sends `homeName` and, when picked, `homePlaceId`/`homeLat`/`homeLng`/`homeCountryCode`
- Modify: `components/new-trip/step-from.tsx`, `step-where-past.tsx`, `lib/new-trip/draft.ts` — carry `placeId` from the pick into the create input (`homePlaceId`; seeds' `placeId`)
- Modify: `components/globe/marker-form.tsx` (+ test) — the Place search input + Search button become `PlaceCombobox kind="any"` with `aria-label="Place search"` kept (help-guide drift guard); a pick sets title (when empty) from `name`, `lat`/`lng`/`city`/`country`/`countryCode`/`placeId`; the pin-drop prefill keeps calling `reverseGeocodeAction` (now Google) and stores its `placeId`
- Modify: `server/actions/globe.ts` — delete `searchPlacesAction` (keep `reverseGeocodeAction`); `server/actions/transport.ts` — delete `searchPlacesAction`

- [ ] **Step 1: Failing tests**: transport `picking a place end sends depPlaceId and coordinates`; `a picked departure point sends depPlaceId`; `a typed place end sends the name only`; trip settings `picking a Home base sends homePlaceId and coordinates`; new trip `the picked home carries homePlaceId`; marker form `a pick fills title, coordinates and placeId`; `keyless, Place search is a plain field` and the pin-drop path still prefills.
- [ ] **Steps 2–5**. **Step 6: Commit** — `feat(places): Transport ends, Home base and Globe pins search Google`

---

### Task 8: Open in Maps opens the venue; Surprise masks the place

**Files:**
- Modify: `lib/map/maps.ts` (+ `maps.test.ts`) — `MapLinkParams` and `DirectionsPoint` gain `placeId?: string | null`
- Modify: `components/trip/map-link.tsx` and its callers (`components/plan/stop-row.tsx:164`, `stay-panel.tsx:80`, `stay-dialog.tsx:105`, `components/trip/accommodation-card.tsx:112`, `item-card.tsx:258`, `components/trip/home/phase-travelling.tsx:218`, `components/trip/day/tonight-card.tsx:63`), `lib/day-map.ts` (point model carries `placeId`), `components/trip/day-map.tsx` popups — pass `placeId` where the row has one
- Modify: `lib/surprise-visibility.ts` (placeholder masks `placeId: null`, `businessStatus: null`) and its drift-guard test; any read shape/selector that lists Item/Stop/Accommodation fields explicitly so `placeId` reaches the link

**Interfaces:**
- `mapsUrl(p)`: with `placeId` → `https://www.google.com/maps/search/?api=1&query=<encoded label or address or lat,lng>&query_place_id=<placeId>`; without → unchanged. `googleDirectionsUrl(points)`: a point with `placeId` adds `destination_place_id` / `origin_place_id` / `waypoint_place_ids` (pipe-joined, aligned with `waypoints`) per Maps URLs; text/coords stay as the fallback. Apple builders unchanged.
- [ ] **Step 1: Failing tests**: `mapsUrl adds query_place_id when a placeId is given`; `googleDirectionsUrl adds origin/destination/waypoint place ids aligned with their points`; a MapLink caller test that an Item with a placeId links with `query_place_id`; Surprise drift guard: `a surprised Traveller's placeholder carries no placeId or businessStatus`.
- [ ] **Steps 2–5**. **Step 6: Commit** — `feat(places): Open in Maps opens the venue; Surprises hide the place ID`

---

### Task 9: Claude connection — no place search, web-research guidance

**Files:**
- Modify: `lib/mcp/tools/reads.ts` (~411-419 remove `search_places`, ~31 import) and `reads.test.ts` (~134, ~510-523)
- Modify: `lib/mcp/prompts.ts` (`LOGISTICS_CHECK` ~17-22, `plan-day` ~84) and `prompts.test.ts` (~19-20)
- Modify: `lib/mcp/tools/trips-stops-write.ts` `add_stop` description if it mentions search_places; `docs/connect-claude.md` (~165-185)

**Interfaces:**
- Prompt wording (exact, replacing the search_places sentence in `LOGISTICS_CHECK`): `(1) Address: look the venue up on the web and give its full street address, so Teepee places the pin on the venue. Mark each point verified (say how: web search).` `plan-day` keeps asking for "date, stopId, startTime, endTime and address" and adds "a full street address".
- `docs/connect-claude.md` gains one line under Ready-made prompts: Claude researches venues on the web and passes full street addresses; Teepee finds the venue from the address.
- [ ] **Step 1: Failing tests**: `the tool list has no search_places`; `plan-day and check-day ask for a full street address from a web search and never mention search_places`.
- [ ] **Steps 2–5**. **Step 6: Commit** — `feat(mcp): Claude researches venues on the web; no place search tool`

---

### Task 10: Photon and Nominatim are gone

**Files:**
- Delete: `server/actions/places.ts` (+ `places.test.ts`), every shim Task 2 left in `lib/geocode.ts`
- Modify: every remaining importer/mocker of removed names (grep `searchPlaces|findPlaces|paceNominatim|geocodePlace\b|PlaceSearchOutcome|NOMINATIM|photon|nominatim` under `app components lib server test scripts` excluding `scripts/archive`)
- Modify: `.env.example` (drop `NOMINATIM_CONTACT` block); `app/privacy/page.tsx` (~211-214: replace the Nominatim/Photon item with Google Places and Geocoding — "turn place names and addresses you type into places on the map, and fill a venue's opening hours and website when you pick it"; header comment ~25) and `page.test.tsx` (~35, ~59-63); `components/trip/help-guide.tsx` (~678-681 Item address copy: pick a suggestion or type an address and the app looks it up as it saves; ~1566-1572 Globe "Place search" stays) and drift tests; code comments naming Nominatim (`lib/globe.ts:86`, `lib/stop-patch.ts:17`, `lib/validations/stop.ts:3`, `lib/validations/marker.ts:44`, `lib/continents.ts:8`, `server/actions/trips.ts:214`, `stops.ts:948,1072`, `globe.ts:55`)
- Modify: `docs/adr/0028-…` and `0069-…` Status → `Superseded by ADR 0076 (2026-10-30)`; `docs/adr/0011-…` — Amendment: Google is the geocoder; place IDs are stored beside coordinates (ADR 0076)

- [ ] **Step 1:** grep; list hits in the report.
- [ ] **Step 2:** remove/replace; update tests.
- [ ] **Step 3:** grep again → only `scripts/archive/`, `docs/` history (specs/plans/audits/ADRs-as-history) remain; task-done checks.
- [ ] **Step 4: Commit** — `chore(places): Photon and Nominatim are gone`

---

### Task 11: The backfill script (dry run by default)

**Files:**
- Create: `scripts/backfill-google-places.ts`, `lib/backfill-places.ts` (pure decision + formatting), `lib/backfill-places.test.ts`
- Modify: `package.json` — `"backfill:places": "tsx --conditions=react-server scripts/backfill-google-places.ts"`

**Interfaces:**
- `lib/backfill-places.ts`: `type BackfillKind = "item" | "stop" | "accommodation" | "transport-dep" | "transport-arr" | "marker" | "home"`; `toleranceKm(kind): number` (stop/home 25, else 1); `verdict(kind, old: LatLng | null, next: LatLng | null): "accept" | "new" | "too-far" | "no-match"`; `formatRow({ kind, id, query, old, next, verdict }): string` → `<kind> <id> · "<query>" · <old lat,lng | —> → <new lat,lng | —> · <km to 1 dp | —> km · <VERDICT>`.
- Script: `import "./load-env"` first; `dbTargetLine(process.env, !execute)` first line (from `scripts/lib/script-guards.ts`); **dry run unless `--execute`**; aborts with a clear message if `GOOGLE_MAPS_SERVER_KEY` is unset. Scans every located-or-addressed row (Items with `address` or coordinates; Stops; Accommodation; Transport ends with a place; Markers; Trips with `homeName`) that has no `placeId`. Lookup: Items/Accommodation `locateVenue(name/title, address, { near: old })`; Stops `geocodePlaceDetailed("name, country", { near: old })`; Home `geocodePlaceDetailed(homeName)`; Transport ends `geocodePlaceDetailed(place)`; Markers `locateVenue(title, [city, country].join(", "), { near: old })`. Prints every row with `formatRow`. With `--execute`, writes only `accept`/`new` rows (coords, `placeId`, `countryCode` where the model has it). Items accepted with a place ID: `fetchVenueDetails` → fill `openingHours` (serialized) when null — to the whole family via `lib/item-family.ts` helpers, never across a Surprise — and `link` when null, and `businessStatus`. No Activity rows (operator script). Ends with a summary per kind (`scanned / accept / new / too-far / no-match`) and the number of Enterprise detail calls made.
- [ ] **Step 1: Failing tests** (`lib/backfill-places.test.ts`): `accepts a stop 20 km away, rejects 30 km`; `accepts an item 0.8 km away, rejects 1.2 km`; `a row with no old point is new when Google finds it`; `no-match when Google finds nothing`; `formatRow prints the exact layout`.
- [ ] **Step 2:** FAIL. **Step 3:** implement the lib + script (script not run; type-checked). **Step 4:** PASS. **Step 5:** task-done checks.
- [ ] **Step 6: Commit** — `feat(places): a dry-run-first backfill onto Google places`

---

### Task 12: Docs, runbook and branch verification

**Files:**
- Modify: `docs/DEPLOY.md` §4j — the Autocomplete quota row becomes **165/day** ("Autocomplete Requests": abandoned sessions and the first 12 requests of each session bill per request against 10,000 free/month shared with hometracker; half ÷ 30); add Text Search (IDs only — free, set 1000/day as a runaway cap) and Place Details Enterprise (15/day) rows if missing; add the backfill steps at the end of the checklist: raise Place Details Enterprise to 100/day for the hour, `npm run backfill:places` (dry run) → Cam reads → `npm run backfill:places -- --execute` → put the quota back.
- Modify: `docs/maps-overview.md` (§6 rewritten for Google lookups, the place field, keyless behaviour, the backfill; remove "replaced in Branch 2" markers), `README.md` (~15, ~32), `docs/HANDOFF.md` (~16, ~227, ~237-239, ~385), `COMPONENTS.md` if it lists PlaceCombobox/LocationCombobox behaviour
- Modify: `docs/specs/2026-10-30-google-maps.md` "Before the one push" — name the backfill command in its step, and add a keyed check item: one real pick per field kind (Stop/region, Item venue with hours fill, Transport end, Globe pin), then confirm Google's billing report shows **Autocomplete Session Usage** (proof sessions terminate — if they don't, every keystroke bills per request). Same check in DEPLOY §4j.
- DEPLOY §4j quota table: Place Details is **one GetPlace cap at 165/day** (Essentials picks + server venue lookups + the app's Enterprise calls); Enterprise is held to 15/day by Teepee's own `GoogleUsage` counter, not the console — say so, and how to read the day's count (one SQL line).
- [ ] **Step 1:** write the docs.
- [ ] **Step 2: Branch verification (tier 3):** `npm test` (node 24) + `npm run build` + `npm run test:integration` (local DB `travelplanner-db-1`; `npx prisma migrate deploy` against it first). Known pre-existing flake: `components/trip/transport-form-dialog.test.tsx` "defaultDate is ignored when editing" — if it fails, prove it fails on `main` via a temporary worktree; `lib/help-guide.test.ts` can time out under the parallel suite — rerun alone.
- [ ] **Step 3: Commit** — `docs(places): Places runbook, quotas and backfill steps`
