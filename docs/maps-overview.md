# Maps: packages, services, and how we use them

A portable write-up of the mapping stack in this app — what's installed, what's
just an HTTP endpoint, how the layers are separated, and the patterns worth
copying into another project.

**Headline: the entire map stack is one runtime dependency (`leaflet`) plus three
free HTTP services. No API keys, no accounts, no billing.**

---

## 1. What's actually installed

| Package | Version | Role |
|---|---|---|
| `leaflet` | `^1.9.4` | The only map rendering library. Raster-tile 2D map, markers, polylines, popups. |
| `@types/leaflet` | `^1.9.21` (dev) | Types. We import types via `typeof import("leaflet")` so the runtime import stays dynamic. |

That's it. Notably **not** installed:

- **`react-leaflet`** — deliberately skipped. See §3.
- **Any 3D globe library** (`react-globe.gl`, `three`, `cobe`) — considered and
  rejected (ADR 0024). The "Globe" feature is a flat Leaflet world map; the name
  describes the concept, not the rendering.
- **Any geocoding/routing SDK** (`@mapbox/*`, `@googlemaps/*`) — we call
  Nominatim over plain `fetch` and deep-link out for directions.

## 2. Services we consume (no packages, just URLs)

| Service | Used for | Auth | Where |
|---|---|---|---|
| **CARTO basemaps** (Positron / Dark Matter) | Raster tiles, light + dark | None — public CDN | `lib/map-tiles.ts` |
| **OpenStreetMap Nominatim** | Forward geocode, place search, reverse geocode | None — but a real contact in `User-Agent` is mandatory | `lib/geocode.ts` |
| **Google Maps / Apple Maps** | "Open in Maps" + turn-by-turn directions deep links | None — URL schemes only | `lib/maps.ts` |

**Why CARTO instead of raw OSM tiles:** OSM's standard raster tiles have no dark
variant, and dark mode is first-class in this app. CARTO publishes Positron
(light) and Dark Matter (dark) on a free, keyless CDN with the same
`{s}/{z}/{x}/{y}` scheme, so it's a one-line swap that closes the dark-mode gap
(ADR 0033). Cost: dual attribution is mandatory — OpenStreetMap for the data,
CARTO for the tiles — and we now depend on CARTO's CDN uptime, mitigated by
keeping the tile config in exactly one file.

```ts
// lib/map-tiles.ts — the entire tile layer config, 34 lines
export const CARTO_TILES = {
  light: { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", ... },
  dark:  { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",  ... },
};
export function cartoTiles(isDark: boolean): TileConfig { ... }
```

## 3. Why raw Leaflet and not `react-leaflet`

Every map component drives Leaflet **imperatively inside `useEffect`** rather
than declaring `<MapContainer><Marker/></MapContainer>`. The trade:

- **No wrapper version-coupling.** `react-leaflet` majors track React majors and
  lag them; on React 19 that's a recurring upgrade tax for a thin abstraction.
- **The dynamic-import boundary is cleaner.** We `await import("leaflet")`
  *inside* the effect, so Leaflet is never touched during SSR or in jsdom.
- **Markers are cheap DOM, not React trees.** All pins are `L.divIcon` with an
  inline HTML string — no reconciliation, no per-marker component.

The cost is real and worth knowing before you copy it: you hand-manage the map
lifecycle (double-init guards, `map.remove()` on unmount, dependency
signatures). Roughly 40 lines of boilerplate per map component. If your project
has more than ~5 maps or wants React state bound to map state,
`react-leaflet` starts paying for itself.

## 4. Architecture — four layers

```
┌─ Pure logic (no React, no network, no Prisma) ──────────────────────┐
│  lib/geo.ts          haversine distance, offline drive estimates    │
│  lib/maps.ts         Google/Apple URL builders                      │
│  lib/day-map.ts      builds the day's point model + route order     │
│  lib/route-map.ts    home-base point extraction                     │
│  lib/route-render.ts lat/lng → SVG projection (map-less cover art)  │
│  lib/nearby.ts       radius search over located items               │
│  lib/map-tiles.ts    tile config + theme selection                  │
└─────────────────────────────────────────────────────────────────────┘
┌─ Server (network I/O, "use server") ────────────────────────────────┐
│  lib/geocode.ts             Nominatim client (cached, never throws) │
│  server/actions/*.ts        geocode-on-save; search actions         │
│  scripts/backfill-geocode.ts throttled one-off backfill             │
└─────────────────────────────────────────────────────────────────────┘
┌─ Loader boundary (the ssr:false seam) ──────────────────────────────┐
│  components/ui/map-loader.tsx  createMapLoader<P>() factory         │
│  *-map-loader.tsx              one 8-line file per map              │
└─────────────────────────────────────────────────────────────────────┘
┌─ Leaflet components (client-only, imperative) ──────────────────────┐
│  components/trip/route-map.tsx     trip route: numbered stops       │
│  components/trip/day-map.tsx       one day: items + hotel + transit │
│  components/trip/wishlist-map.tsx  category pins for one trip       │
│  components/globe/globe-map.tsx    world map, cross-trip pins       │
└─────────────────────────────────────────────────────────────────────┘
```

The point of the split: **everything testable is pure and lives in `lib/`;
everything untestable is a thin imperative shell.** `lib/day-map.ts` decides
which points exist, their order, and each item's predecessor — `day-map.tsx`
only knows how to draw whatever it's handed.

### The four maps

| Component | Surface | What it renders |
|---|---|---|
| `route-map.tsx` | Trip summary, share page, home phases | Numbered stop pins coloured by chapter, per-segment dashed polylines, 🏠 home-base bookend pins with outbound/return legs, fallback list when <2 stops have coords |
| `day-map.tsx` | A single day (inside a collapsible panel) | Numbered item pins, `H` accommodation pin, `T` transport pins, route polyline, per-pin "Open in Maps" + "Directions from previous", an "Open today's route" multi-stop deep link |
| `wishlist-map.tsx` | Trip wishlist board | Category-coloured pins, click → select item in the list |
| `globe-map.tsx` | Cross-trip Globe | Category-coloured pins world-wide, click-map-to-drop-a-pin, fly-to + popup on select, Edit/Delete buttons wired inside popups |

## 5. The patterns worth copying

### 5.1 One loader factory for every map

`next/dynamic` with `ssr: false` is only legal inside a Client Component, so we
made that boundary a 25-line factory instead of repeating it four times:

```tsx
// components/ui/map-loader.tsx
"use client";
export function createMapLoader<P extends object>(
  load: () => Promise<React.ComponentType<P>>,
): (props: P) => React.ReactElement {
  const Inner = dynamic(load, { ssr: false }) as React.ComponentType<P>;
  return function MapLoader(props: P) { return <Inner {...props} />; };
}
```

Each map then gets an 8-line loader file:

```tsx
// components/trip/route-map-loader.tsx
"use client";
export const RouteMapLoader = createMapLoader<RouteMapProps>(
  () => import("./route-map").then((m) => m.RouteMap),
);
```

Two details that matter: the generic is `<P extends object>`, **not**
`Record<string, unknown>`, so prop interfaces with function members
(`onSelect`, `onMapClick`) stay assignable without an index signature. And the
loader is the seam tests mock — see §8.

### 5.2 Dynamic-import Leaflet *inside* the effect

Belt-and-braces on top of `ssr: false`. Leaflet reaches for `window` at module
scope, so it must never be evaluated on the server or in jsdom:

```tsx
useEffect(() => {
  if (!mapRef.current) return;
  if (leafletMapRef.current) return;          // React strict-mode double-init guard

  import("leaflet").then((leaflet) => {
    const L = leaflet.default ?? leaflet;     // interop: ESM default vs namespace
    // ... build map
  });

  return () => {                              // MUST clean up or you get
    leafletMapRef.current?.remove();          // "Map container is already initialized"
    leafletMapRef.current = null;
  };
}, [/* derived signature — see 5.6 */]);
```

`leaflet.default ?? leaflet` is not optional — it resolves differently under
Next's bundler vs. Vitest's.

### 5.3 Self-host the marker icons

Leaflet's default icon URLs are derived from the CSS path and break under every
bundler. The fix lives in `lib/map-icons.ts`, run once per map init immediately
after the dynamic `import("leaflet")` resolves, with the three PNGs copied from
`node_modules/leaflet/dist/images/` into `public/leaflet/`:

```tsx
// lib/map-icons.ts — call once per map init, after import("leaflet") resolves
applyLeafletIconDefaults(L);
```

All four map components call it right after `const L = leaflet.default ?? leaflet;`.
We use `divIcon` for all real pins, so this mostly just stops a broken-image
icon ever appearing — but it's two lines and it removes a whole class of bug.

### 5.4 Theme-aware tiles without rebuilding the map

Keep a ref to the tile layer and `setUrl()` it when the theme flips. Rebuilding
the whole map on a theme toggle throws away zoom/pan state:

```tsx
const { theme } = useTheme();
const isDark = theme === "dark";

// on init
tileLayerRef.current = L.tileLayer(cartoTiles(isDark).url, { ...opts }).addTo(map);

// on theme change — swap tiles in place
useEffect(() => {
  tileLayerRef.current?.setUrl(cartoTiles(isDark).url);
}, [isDark]);
```

**The dependency arrays are the load-bearing part.** `isDark` must NOT appear in
the *init* effect's deps. React runs an effect's cleanup before re-running it,
and the init cleanup calls `map.remove()` — so depending on the theme there
destroys and rebuilds the map on every toggle (losing pan/zoom, re-fitting
bounds) while the `setUrl` effect fires uselessly against a detached layer.
Each map carries a comment saying so, because it looks like an omission.

Also needed, once, globally — Leaflet panes fight z-index with modals/popovers:

```css
/* app/globals.css */
.leaflet-container { isolation: isolate; }
```

### 5.5 `divIcon` markers + escaped popup HTML

Every pin is a styled `<div>` in an HTML string. Cheap, fully controllable,
no image assets:

```tsx
L.divIcon({
  html: `<div style="width:28px;height:28px;border-radius:50%;background:${hex};
    color:#fff;display:flex;align-items:center;justify-content:center;
    border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">${index + 1}</div>`,
  className: "",
  iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16],
});
```

`hex` above is `pinHex(category)` on the Wishlist and Globe maps, which colour
pins by category; Route colours pins from chapter data and Day uses fixed
per-type colours instead.

```tsx
import { escapeHtml } from "@/lib/escape-html";   // shared — never re-implement
import { pinHex } from "@/lib/map-pins";          // category → pin colour
```

**Popups are raw HTML, so every interpolated value goes through `escapeHtml`.**
All four map components import the same helper from `lib/escape-html.ts` —
user-entered place names and titles land directly in `bindPopup()` strings and
would otherwise be an XSS hole. This used to be four copy-pasted private
copies; now there is exactly one.

Popups are also width-clamped for mobile: `min-width:min(140px,80vw);
max-width:min(240px,90vw)`.

Interactive controls *inside* a popup (the Globe's Edit/Delete) are wired on the
map's `popupopen` event — the DOM doesn't exist until the popup opens:

```tsx
map.on("popupopen", (e) => {
  e.popup.getElement()?.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => onEditRef.current(btn.dataset.edit!);
  });
});
```

### 5.6 Dependency signatures, not array identity

Effects can't depend on `stops` (a new array every render) or the whole map
rebuilds continuously. Depend on a **derived string** of only the fields that
change the render, and disable `exhaustive-deps` with a comment saying why:

```tsx
}, [
  hasEnoughCoords,
  isDark,
  stops.map((s) => `${s.id}:${s.lat},${s.lng}:${s.chapterColour ?? ""}`).join("|"),
  home?.lat, home?.lng, showReturn,
]);
```

Companion pattern — **callbacks in refs**, updated in their own effect, so a new
inline `onSelect` from the parent never re-initialises the map:

```tsx
const onSelectRef = useRef(onSelect);
useEffect(() => { onSelectRef.current = onSelect; });   // never mutate during render
// ...later: marker.on("click", () => onSelectRef.current(mk.id));
```

One more subtlety we hit: because the map is created asynchronously, a plotting
effect that runs before the map exists may never re-run for a stable data set.
The Globe fixes this with a `ready` state flag flipped when the async init
finishes, which the plotting effect depends on.

### 5.7 Always `fitBounds`, never a hardcoded centre

```tsx
map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40] });
// world view when there's nothing to fit:
map.setView([20, 0], 2);
```

The Globe adds `maxZoom: 8` on fit (one pin shouldn't zoom to street level) and
`worldCopyJump: true` for infinite horizontal panning.

### 5.8 Degrade gracefully when coordinates are missing

Every map has a no-coords path, and none of them is a blank grey box:
`route-map` renders a numbered text list of stops with a "add coordinates to see
the map" hint; `wishlist-map` renders an `EmptyState`; `day-map` returns `null`
and its panel doesn't render at all. **Coordinates are always optional** —
nothing in the data model requires a successful geocode.

### 5.9 Lazy-mount the heavy ones

`day-map-panel.tsx` mounts `DayMap` only when the user expands the panel, so
Leaflet's ~140 KB never downloads on a day view nobody opens.

## 6. Geocoding — `lib/geocode.ts`

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

**Retroactively**, `scripts/backfill-geocode.ts` — idempotent (only touches rows
missing coords), throttled at 1100 ms, `--dry-run` supported, prints a
scanned/geocoded/skipped/failed summary. Explicitly *not* run inside
`prisma migrate deploy`: slow network calls don't belong in a migration.

## 7. Directions — deep links, not a routing API

`lib/maps.ts` builds URLs; nothing calls a routing or distance-matrix service.

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

The split in §4 is what makes this testable at all:

- **Pure `lib/` modules have real unit tests** — `geo.test.ts`, `maps.test.ts`,
  `day-map.test.ts`, `map-tiles.test.ts`, `geocode.test.ts`, `nearby.test.ts`,
  `route-render.test.ts`. This is where the actual logic lives, so this is where
  the coverage is.
- **Leaflet components are never rendered in jsdom.** Tests mock at the loader
  boundary:

```tsx
vi.mock("./globe-map-loader", () => ({ GlobeMapLoader: () => null }));
vi.mock("./day-map", () => ({ DayMap: () => <div data-testid="day-map" /> }));
```

  That lets you assert the *surrounding* behaviour (panel toggles, selection
  wiring, empty states) without Leaflet touching a fake DOM.
- **Visual output is human-verified.** Marker styling, polyline colours, and the
  home-base bookends carry `VISUAL:` comments saying so explicitly.

`lib/geocode.ts` exports `_resetGeocodeCacheForTests()` — a deliberate test-only
seam, since the module-level cache would otherwise leak between cases.

## 9. Offline / PWA behaviour

The service worker (`lib/offline.ts` → `public/sw.js`) routes **all cross-origin
GETs to `network-only`**, which includes tile requests. So:

- Tiles are **not** precached or SW-cached — an offline user gets the browser's
  own HTTP cache for tiles they've already seen, and grey squares beyond that.
- Everything else on a map page still works offline: pins, polylines, popups,
  and deep links all render from data already in the page.

ADR 0024 flags this as the known trade of choosing raster tiles over a bundled
globe texture. If offline maps ever become a requirement, tile caching is the
place to look.

## 10. Gotchas and limits (read before porting)

1. **`NOMINATIM_CONTACT` must be set in every environment.** Unset → warning +
   no contact header; placeholder → HTTP 403. This is the #1 "why is search
   broken in prod" cause.
2. **Nominatim is a free shared service.** Fine for a two-person app at human
   pace. It is *not* fine for production traffic — you'll need a paid geocoder
   (or self-hosted Nominatim) and a durable cache.
3. **The response cache is per-instance and unbounded.** No TTL, no eviction —
   correct at this scale, wrong past it.
4. **CARTO tiles are a free CDN with no SLA.** Fine to depend on; keep the swap
   point (one file) intact.
5. **Attribution is contractual.** The OpenStreetMap + CARTO dual credit renders
   on every map. Removing it violates CARTO's terms.
6. **`Permissions-Policy: geolocation=()`** is set in `next.config.ts`. There's
   no "locate me" button, and adding one means relaxing that header.
7. **No clustering.** At a few hundred pins the Globe will get crowded;
   `leaflet.markercluster` is the drop-in if that day comes.
8. **Popup HTML is hand-built.** Every new interpolation needs `escapeHtml`. A
   React-portal popup approach would remove this footgun at the cost of the
   imperative simplicity.

## 11. Porting checklist

To stand this up in another Next.js App Router project:

1. `npm i leaflet && npm i -D @types/leaflet`
2. Copy `node_modules/leaflet/dist/images/marker-icon.png`, `marker-icon-2x.png`,
   `marker-shadow.png` → `public/leaflet/`
3. Add `.leaflet-container { isolation: isolate; }` to global CSS
4. Copy the `lib/` map helpers: `map-tiles.ts` (tile config), `map-icons.ts`
   (default-icon fix), `map-pins.ts` (category → hex), `escape-html.ts` (popup
   escaping). All four are dependency-free and copy verbatim.
5. Copy `components/ui/map-loader.tsx` (the `createMapLoader` factory)
6. Copy `lib/maps.ts` verbatim if you want the deep links, `lib/geo.ts` for
   distance/drive estimates
7. Copy `lib/geocode.ts`, set `NOMINATIM_CONTACT` to a **real** email or app URL
   in every environment — and re-read §6/§10 about whether Nominatim suits your
   traffic
8. Write one map component per surface, following §5.2–§5.8; write a
   `*-map-loader.tsx` beside each and import **the loader**, never the component
9. Keep the point-model logic in a pure `lib/` module so it's testable, and mock
   the loader in component tests

## 12. If we were starting fresh

The choices we'd revisit, in rough order of likely payoff:

- **MapLibre GL + vector tiles** instead of Leaflet + raster. Sharper on retina,
  smooth zoom, runtime-restylable (so theme switching is a style swap, not a
  tile-URL swap), better offline story. Costs: WebGL requirement, larger bundle,
  and a tile source that usually wants a key.
- **`react-leaflet`** if the map count grows past ~5 or map state needs to be
  reactive. The imperative pattern is fine at four maps; it wouldn't be at twelve.
- **A React-portal popup renderer** to kill the hand-escaped HTML strings.
- **A paid geocoder** (Mapbox / Google / self-hosted Nominatim) the moment this
  serves more than a handful of users.
- **`leaflet.markercluster`** before pin counts reach the hundreds.

Everything else — the loader factory, the pure-logic split, geocode-on-save,
never-throws geocoding, deep-links-not-routing, the graceful no-coords
fallbacks — we'd keep as-is.

---

### Reference: relevant ADRs

| ADR | Decision |
|---|---|
| `0011` | Geocode all located entities on save; Transport gets its own coordinates |
| `0024` | The "Globe" renders as a flat Leaflet map, not a 3D globe |
| `0028` | Nominatim etiquette via in-memory response caching, not runtime rate limiting |
| `0033` | CARTO Positron/Dark Matter tiles for light/dark basemaps |
