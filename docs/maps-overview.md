# Maps: packages, services, and how we use them

A portable write-up of the mapping stack in this app — what's installed, which
services it calls, how the layers are separated, and the patterns worth copying.

**Headline: every map renders on Google Maps through one frame component
(`components/map/google-map-frame.tsx`), built on `@vis.gl/react-google-maps`.
It needs a Google Cloud project, a browser key and a Map ID (runbook:
[DEPLOY.md §4j](DEPLOY.md)); without them every map degrades to a fallback list
and the page keeps working. Decision: [ADR 0076](adr/0076-google-maps-platform-replaces-the-free-map-stack.md).**

---

## 1. What's actually installed

| Package | Version | Role |
|---|---|---|
| `@vis.gl/react-google-maps` | `1.10.1` (pinned) | The only map library: `APIProvider`, `Map`, `AdvancedMarker`, `InfoWindow`, hooks. Loads Google's Maps JavaScript API. |

Notably **not** installed: any 3D globe library (`react-globe.gl`, `three`,
`cobe` — rejected in ADR 0024; the "Globe" is a flat map, the name describes the
concept), `@googlemaps/*` SDKs, and any routing SDK. `leaflet`, `@types/leaflet`
and the raster-tile config are gone.

## 2. Services we consume

| Service | Used for | Auth | Where |
|---|---|---|---|
| **Google Maps JavaScript API** | Rendering every map (vector, Map ID with light and dark styles), Advanced Markers, InfoWindows | Browser key (HTTP-referrer restricted) + Map ID | `components/map/google-map-frame.tsx`, `lib/map/google-config.ts` |
| **OpenStreetMap Nominatim** | Forward geocode, place search, reverse geocode — *replaced in Branch 2* | None — a real contact in `User-Agent` is mandatory | `lib/geocode.ts` |
| **Photon (komoot)** | As-you-type place search — *replaced in Branch 2* | None | `lib/geocode.ts` |
| **Google Maps / Apple Maps** | "Open in Maps" + turn-by-turn directions deep links | None — URL schemes only | `lib/map/maps.ts` |

Env: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`
(both inlined at build — rebuild after changing), and `GOOGLE_MAPS_SERVER_KEY`
(server-only, first used by Branches 2 and 3). `mapsConfig()` in
`lib/map/google-config.ts` returns `{ apiKey, mapId }` or `null`; **Advanced
Markers require a Map ID**, so a missing Map ID counts as "not configured".

**Cost rule.** Every Google API we call has a per-day quota of half its free
monthly allowance ÷ 30, on a billing account shared with hometracker, so a
month inside the quota is $0 by construction. The quota table and budget alert
are in DEPLOY.md §4j.

## 3. Architecture — four layers

```
┌─ Pure logic (no React, no network, no Prisma) ──────────────────────┐
│  lib/geo.ts          haversine distance, offline drive estimates    │
│  lib/map/maps.ts     Google/Apple URL builders                      │
│  lib/map/pins.ts     category -> pin colour; pin HTML builders      │
│  lib/map/palette.ts  pin / chapter palette                          │
│  lib/map/overlap.ts  overlapping-pin offsets                        │
│  lib/map/google-config.ts  env -> { apiKey, mapId } | null          │
│  lib/day-map.ts      the day's point model + route order            │
│  lib/route-map.ts    home-base point extraction                     │
│  lib/geo-cluster.ts  clustering                                     │
│  lib/trips/route-sketch.ts lat/lng -> SVG projection (route sketch) │
│  lib/nearby.ts       radius search over located items               │
└─────────────────────────────────────────────────────────────────────┘
┌─ Server (network I/O, "use server") ────────────────────────────────┐
│  lib/geocode.ts             Nominatim client (replaced in Branch 2) │
│  server/actions/*.ts        geocode-on-save; search actions         │
└─────────────────────────────────────────────────────────────────────┘
┌─ Loader boundary (ssr:false seam where a page needs one) ───────────┐
│  components/ui/map-loader.tsx  createMapLoader<P>() factory         │
│  *-map-loader.tsx              one small file per map               │
└─────────────────────────────────────────────────────────────────────┘
┌─ Map components (client-only) ──────────────────────────────────────┐
│  components/map/google-map-frame.tsx  the frame every map uses      │
│  components/map/html-pin.tsx          pin = HTML in Advanced Marker │
│  components/map/map-polyline.tsx      lines                         │
│  components/map/use-fit-bounds.ts     fit / single-point zoom       │
│  components/map/map-unavailable.tsx   fallback copy                 │
│  components/trip/route-map.tsx     trip route: numbered stops       │
│  components/trip/day-map.tsx       one day: items + hotel + transit │
│  components/trip/wishlist-map.tsx  category pins for one trip       │
│  components/globe/globe-map.tsx    world map, cross-trip pins       │
└─────────────────────────────────────────────────────────────────────┘
```

Everything testable is pure and lives in `lib/`; `lib/day-map.ts` decides which
points exist, their order, and each item's predecessor — `day-map.tsx` only
draws whatever it's handed.

### The four maps

| Component | Surface | What it renders |
|---|---|---|
| `route-map.tsx` | Trip page, Summary, share page, home phases, the Plan's mini map and Route map dialog | Numbered stop pins coloured by chapter, per-segment lines (flight, train and ferry legs geodesic), home-base bookend pins with outbound/return legs, fallback list when <2 stops have coords |
| `day-map.tsx` | A single day (collapsible panel), Travelling Home | Numbered item pins, `H` accommodation pin, `T` transport pins, route line, per-pin "Open in Maps" + "Directions from previous", an "Open today's route" multi-stop deep link |
| `wishlist-map.tsx` | Trip wishlist board | Category-coloured pins, click selects the item in the list |
| `globe-map.tsx` | Cross-trip Globe | Category-coloured pins world-wide, click-map-to-drop-a-pin, fly-to + InfoWindow on select with Edit/Delete |

Your travels and the desktop Home route tile draw on the same frame.

## 4. The patterns worth copying

### 4.1 One frame

`GoogleMapFrame({ fallback, dark, className?, style?, mapProps?, onFail?, children })`
wraps `APIProvider` + `Map`. It:

- reads config via `mapsConfig()`; with no config it renders `fallback`;
- sets `disableDefaultUI` and turns `zoomControl` on, `clickableIcons={false}`
  (a caller opts back into other controls through `mapProps`);
- puts `className`/`style` on a **wrapper** div (the caller must size it — it is
  0px tall otherwise) and `tp-map` on the map root;
- falls back on `APILoadingStatus.FAILED` / `AUTH_FAILURE`, on
  `window.gm_authFailure` (a key Google refuses, e.g. a wrong referrer on a
  preview host), and on any render error inside the map (an error boundary —
  markers can throw on a dead library after a client-side navigation);
- calls `onFail` once per mount on any failure, including "no config".

Never pass `mapId` or `colorScheme` — the frame owns them.

### 4.2 Theme

The map's `colorScheme` is read only when the map is created, so a theme flip
**remounts** the map (keyed on `dark`) and it comes back in the new scheme with
pins recoloured. Share pages keep their forced `theme` override
(`RouteMapProps.theme`). One Map ID carries both light and dark styles.

### 4.3 Pins

Every pin is the existing HTML string (`pinHtml(...)` and friends) mounted in an
Advanced Marker by `HtmlPin({ position, html, title?, onClick?, zIndex?, open?, onClose?, children? })`.
It is centre-anchored; `children` become the InfoWindow content, shown while
`open`. The pin wrapper carries `tp-map-pin` — the stable DOM hook tests and the
audit scripts look for.

**Pin and InfoWindow HTML is raw HTML, so every interpolated value goes through
`escapeHtml` (`lib/escape-html.ts`)** — place names and titles are user input.
Popups stay width-clamped for mobile.

### 4.4 Lines

`MapPolyline({ path, color, weight, opacity?, dashed?, geodesic?, zIndex? })`.
Memoise `path` — a fresh array each render re-applies options. Flight, train and
ferry legs pass `geodesic`.

### 4.5 Fitting

`useFitBounds(points, { padding?, maxZoom? })` must be called from a component
rendered **inside** the frame (it uses `useMap()`). A single located point does
not `fitBounds` (it would zoom to max): it centres and zooms to
`FIT_SINGLE_ZOOM` (12). Never hardcode a centre; with nothing to fit the Globe
shows a world view.

### 4.6 Fallback

Three failure modes — no config, Google fails to load or refuses the key, a
render error — all land on the caller's `fallback`. `MapUnavailable` renders
"The map isn't available right now." above any children (the Route map's stop
list, say) and carries `data-map-fallback`. Existing "not enough coordinates"
copy is unchanged. Coordinates are always optional: nothing in the data model
requires a geocode.

### 4.7 Stable DOM hooks

| Hook | On |
|---|---|
| `.tp-map` | the map root |
| `.tp-map-pin` | every marker wrapper |
| `[data-map-fallback]` | every fallback root |

`audit:layout` and `audit:contrast` wait for `.tp-map-pin, [data-map-fallback]`,
so a keyless run (fallbacks only) does not time out.

### 4.8 Lazy-mount the heavy ones

`day-map-panel.tsx` mounts `DayMap` only when the user expands the panel, so the
Maps library never loads on a day view nobody opens.

## 6. Geocoding — `lib/geocode.ts` (replaced in Branch 2)

> Nominatim and Photon are replaced by Google Places and Geocoding in Branch 2 of the Google Maps work (ADR 0076). Until that merges, this section describes what runs.

One file, ~245 lines, wraps Nominatim's `/search` and `/reverse`. The contract:

- **Never throws.** Every function returns `null` / `[]` on any failure —
  network error, timeout, non-2xx, unparseable body. A geocode failure must
  never fail a user's save.
- **5-second `AbortController` timeout.** Saves do best-effort network I/O; they
  can't hang on a slow third party.
- **Real contact in the `User-Agent`.** Nominatim's policy requires it and
  returns **HTTP 403 for placeholder contacts like `example.com`** — so if
  `NOMINATIM_CONTACT` is unset we log a warning and send no contact at all
  rather than a fake one. This is the single most common way to get blocked.
- **`accept-language=en`** on every request, so results come back "Tokyo Tower"
  rather than "東京タワー".
- **In-memory response cache** keyed by full request URL, shared by all three
  request builders via one `cachedFetchJson` helper. Successes only — including
  genuine empty results; failures are never cached, so a transient outage never
  sticks.

Three public shapes, deliberately distinct:

```ts
geocodePlace(query): Promise<LatLng | null>              // just coords
geocodePlaceDetailed(query): Promise<GeoCandidate | null>// + city/country/countryCode
searchPlacesWithStatus(query, limit): Promise<
  | { status: "ok"; candidates: GeoCandidate[] }         // includes "ok, but empty"
  | { status: "error" }>                                 // request actually failed
reverseGeocode(lat, lng): Promise<GeoCandidate | null>   // for drop-a-pin
```

The `status` discriminant exists because an interactive search UI must say
"no matches" and "search unavailable" differently. Best-effort background paths
use the simpler `searchPlaces()` which collapses both to `[]`.

**Why a cache and not a rate limiter (ADR 0028).** Nominatim asks for ≤1 req/sec
*and* asks you to cache and not repeat identical queries. On serverless, a real
rate limiter needs shared cross-instance state (Redis/KV/Postgres lock) — new
infrastructure for a load that never approaches 1 req/sec at human interaction
pace. Caching removes the actual policy violation (repeat queries) for free. The
only path that can burst is the backfill script, which sleeps 1100 ms between
calls. **If your project has real traffic, this reasoning inverts — you need a
paid geocoder or a durable cache.**

### Where geocoding happens

**On save, in the server action**, never at render time (coupling render to a
5-second third-party call is how you get slow first loads):

| Entity | Query geocoded |
|---|---|
| Stop | `"<name>, <country>"` → coords + `countryCode` |
| Item | its `address`, if present |
| Accommodation | its `address`, if present |
| Transport | `depPlace` and `arrPlace` separately → 4 columns (`depLat/depLng/arrLat/arrLng`) |
| Trip home base | the home place name → coords + country |

Transport gets its *own* coordinates rather than borrowing its from/to Stop's,
because a departure terminal is tens of kilometres from the city centre pin
(ADR 0011).

**Interactively**, two server actions expose search to the UI:
`searchPlacesAction` (Globe marker form, transport location combobox) and
`reverseGeocodeAction` (drop-a-pin: click the Globe → reverse-geocode → prefill
the title and place).

**Retroactively**, `scripts/archive/backfill-geocode.ts` (archived) — idempotent (only touches rows
missing coords), throttled at 1100 ms, `--dry-run` supported, prints a
scanned/geocoded/skipped/failed summary. Explicitly *not* run inside
`prisma migrate deploy`: slow network calls don't belong in a migration.

## 7. Directions — deep links, not a routing API (Travel times arrive in Branch 3)

`lib/map/maps.ts` builds URLs; nothing calls a routing or distance-matrix service.

```ts
mapsUrl({ lat, lng, address, label })            // → google.com/maps/search/?api=1&query=…
appleMapsUrl({ lat, lng, address, label })       // → maps.apple.com/?ll=…&q=…
googleDirectionsUrl(points)                      // → /maps/dir/?origin&destination&waypoints=a|b
appleDirectionsUrl(points)                       // → ?saddr&daddr (Apple drops waypoints)
```

Each falls back `coords → address → label` and returns `null` when nothing
resolves, so callers just conditionally render the link. Apple degrades a
multi-stop route to first→last because it doesn't reliably support intermediate
waypoints — documented at the function, not discovered at runtime.

**Travel time is computed offline**, in pure code, from `lib/geo.ts`:

```ts
haversineKm(a, b)                                             // great-circle km
estimateDriveMinutes(km, { windingFactor, avgSpeedKph })      // km × factor ÷ speed
```

`windingFactor` and `avgSpeedKph` are per-trip settings. It's a hint, not an
ETA — and it costs nothing, needs no key, and works offline. A real routing API
would slot behind the same `estimateDriveMinutes` seam if accuracy ever
justifies the key/cost/rate-limit burden.

## 8. Testing

- **Pure `lib/` modules have real unit tests** — `geo`, `map/maps`, `day-map`,
  `geocode`, `nearby`, `route-sketch`, `escape-html`, `map/pins`,
  `map/google-config`. That is where the logic lives.
- **No test loads real Google Maps.** The `@vis.gl/react-google-maps` module is
  swapped for `createGoogleMapsMock()` from `test/google-maps-mock.tsx`:

  ```tsx
  const mock = await vi.hoisted(async () =>
    (await import("@/test/google-maps-mock")).createGoogleMapsMock(),
  );
  vi.mock("@vis.gl/react-google-maps", () => mock.module);
  beforeEach(() => mock.reset());
  ```

  It returns `{ module, map, status, markerStub, recorded, reset }`, where
  `recorded` holds the maps, mounts, markers, InfoWindows and polylines the
  component asked for. Render keyed with
  `vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k")` and
  `vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m")`; leave them empty to
  exercise the keyless fallback.
- **Surrounding-UI tests** can still mock the loader or the map component
  (`vi.mock("./globe-map-loader", ...)`, `vi.mock("./day-map", ...)`) when the map
  itself is not under test.
- **Visual output is human-verified.** Vitest asserts wiring and lifecycle, never
  appearance.
- **The real Google path is checked by hand** with keys in `.env.local`:
  `audit:layout` keyed should show `.tp-map-pin` on every map surface in both
  themes.

## 9. Offline / PWA behaviour

The service worker (`lib/offline.ts` → `public/sw.js`) routes **all cross-origin
GETs to `network-only`**, which includes Google's map tiles and scripts. Offline,
the Maps library cannot load, so each map shows its fallback; everything else on
the page still works from data already in the page, and deep links still render.

## 10. Gotchas and limits (read before porting)

1. **`NEXT_PUBLIC_*` is inlined at build.** Adding or changing the browser key or
   Map ID needs a redeploy. Read them as literal `process.env.NEXT_PUBLIC_…`
   member expressions.
2. **No Map ID, no map.** Advanced Markers need one, so `mapsConfig()` is `null`
   without it.
3. **Referrer restrictions bite on previews.** A host that doesn't match a key
   referrer makes Google refuse the key (`gm_authFailure`); the frame lands on the
   fallback rather than an error page.
4. **Quota exhaustion degrades.** Per-day quotas (DEPLOY.md §4j) are set below the
   free allowance, so hitting one means the fallback list, not a bill.
5. **The InfoWindow theme is ours.** `app/globals.css` restyles Google's
   InfoWindow under `.tp-map`; Google's own rules have higher specificity than a
   bare class, so the overrides are scoped to `.tp-map .gm-style`.
6. **`Permissions-Policy: geolocation=()`** is set in `next.config.ts`. There's no
   "locate me" button, and adding one means relaxing that header.
7. **No CSP is set** (`next.config.ts` deliberately sets none), so Google's origins
   need no header changes. Adding a CSP later means allowing `maps.googleapis.com`
   and `maps.gstatic.com`.
8. **Nominatim is a free shared service** — fine at human pace for a two-person
   app, replaced in Branch 2; `NOMINATIM_CONTACT` must be a real contact in every
   environment until then or HTTP 403.
9. **Storage stance.** Google's terms limit how long Places coordinates and Routes
   results may be cached; the app stores coordinates indefinitely, a known
   deviation accepted while the app is invite-only (ADR 0076, revisit if the
   allowlist opens).

## 11. Porting checklist

To stand this up in another Next.js App Router project:

1. `npm i @vis.gl/react-google-maps` (pin the version).
2. Create the Google Cloud project, a referrer-restricted browser key and a vector
   Map ID with light and dark styles (see DEPLOY.md §4j); set
   `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.
3. Copy `lib/map/google-config.ts` and the `components/map/` files
   (`google-map-frame`, `html-pin`, `map-polyline`, `use-fit-bounds`,
   `map-unavailable`), plus the `.tp-map` rules in `app/globals.css`.
4. Copy `lib/map/pins.ts` (category -> colour) and `lib/escape-html.ts`.
5. Copy `components/ui/map-loader.tsx` if a page needs an `ssr:false` seam.
6. Copy `lib/map/maps.ts` for the deep links, `lib/geo.ts` for distance and drive
   estimates.
7. Write one map component per surface on `GoogleMapFrame`, with a fallback;
   keep the point-model logic in a pure `lib/` module.
8. Copy `test/google-maps-mock.tsx` and mock `@vis.gl/react-google-maps` with it —
   see §8.
9. Set a per-day quota on every Google API you call (half the free allowance ÷ 30
   is a safe rule) and a budget alert.

---

### Reference: relevant ADRs

| ADR | Decision |
|---|---|
| `0011` | Geocode all located entities on save; Transport gets its own coordinates |
| `0024` | The "Globe" is a flat map, not a 3D globe (amended: now Google) |
| `0028` | Nominatim etiquette via in-memory response caching, not runtime rate limiting |
| `0033` | Free raster basemap tiles — superseded by 0076 |
| `0076` | Google Maps Platform replaces the free map stack |
