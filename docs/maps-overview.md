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
| **Google Geocoding + Places (New)** | Server lookups (geocode, reverse, venue location and details) and the as-you-type place field (Autocomplete) | Server key (`GOOGLE_MAPS_SERVER_KEY`); browser key for Autocomplete | `lib/geocode.ts`, `components/ui/place-combobox.tsx` |
| **Google Maps / Apple Maps** | "Open in Maps" + turn-by-turn directions deep links | None — URL schemes only | `lib/map/maps.ts` |

Env: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`
(both inlined at build — rebuild after changing), and `GOOGLE_MAPS_SERVER_KEY`
(server-only, first used by Branches 2 and 3). `mapsConfig()` in
`lib/map/google-config.ts` returns `{ apiKey, mapId }` or `null`; **Advanced
Markers require a Map ID**, so a missing Map ID counts as "not configured".

**Cost rule.** Every Google API we call has a per-day quota of Teepee's share
(now all) of its free monthly allowance ÷ 30, so a
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
│  lib/map/world.ts    WORLD_RESTRICTION for the world-view maps      │
│  lib/day-map.ts      the day's point model + route order            │
│  lib/route-map.ts    home-base point extraction                     │
│  lib/geo-cluster.ts  clustering                                     │
│  lib/trips/route-sketch.ts lat/lng -> SVG projection (route sketch) │
│  lib/nearby.ts       radius search over located items               │
└─────────────────────────────────────────────────────────────────────┘
┌─ Server (network I/O, "use server") ────────────────────────────────┐
│  lib/geocode.ts             Google Geocoding/Places client      │
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
│  components/map/maps-auth.ts          remembers a refused key       │
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
  (a caller opts back into other controls, or out of zoom, through `mapProps` —
  Your travels and the desktop Home tile turn zoom off: it would sit under their
  overlays);
- starts on a world view (`defaultCenter` `{ lat: 20, lng: 0 }`, `defaultZoom`
  2) unless `mapProps` gives a camera — vis.gl warns on every render without one;
- puts `className`/`style` on a **wrapper** div (the caller must size it — it is
  0px tall otherwise) and `tp-map` on the map root;
- falls back on `APILoadingStatus.FAILED`, on a key Google refuses (e.g. a wrong
  referrer on a preview host), and on any render error inside the map (an error
  boundary — markers can throw on a dead library after a client-side navigation);
- calls `onFail` once per mount on any failure, including "no config".

**A refused key is remembered for the page.** Google reports it only by calling
`window.gm_authFailure`, once per page load, and vis.gl 1.10.1 never sets
`APILoadingStatus.AUTH_FAILURE` (the constant exists; nothing assigns it).
`components/map/maps-auth.ts` installs one handler (chaining any previous one),
keeps a module-level flag and notifies subscribers; `useMapsAuthFailed()` reads
it. So a frame mounted after a client-side navigation falls back at once
instead of waiting for a call that already happened. Branch 2's Places forms
are to read the same hook. Tests call
`resetMapsAuthForTests()` in `beforeEach`.

Never pass `mapId`, `colorScheme` or `style` in `mapProps` — the frame owns the
first two, and vis.gl drops `style` once the map has a `className`.

### 4.2 Theme

The map's `colorScheme` is read only when the map is created, so a theme flip
needs a new map. Two things make that happen: vis.gl itself recreates the
`google.maps.Map` instance when `colorScheme` changes (it is in the deps of the
effect that builds the map), and the frame also keys the `<Map>` on `dark`, so
the whole subtree remounts — every pin, line and fit hook runs its effects from
scratch against the new instance, and the map comes back in the new scheme with
pins recoloured. Share pages keep their forced `theme` override
(`RouteMapProps.theme`). One Map ID carries both light and dark styles.

**A theme flip does not keep the camera.** The remount refits the map to its
data. Carrying the camera across would take more than dropping the `key`:
vis.gl's saved-camera restore only fires when the `mapId` changes, not the
scheme, and every fit or pan (`useFitBounds`, the Home tile's `FitView`, the
Globe's `FitInitial` and `PanToSelected`) runs again on a new map instance, so
each would also have to skip itself on an instance change.

**Don't turn on `reuseMaps` casually.** It hands a pooled map instance to the
next `<Map>` with the same Map ID and scheme. vis.gl only `setOptions` the new
owner's props, so any option the new owner doesn't set (`restriction`,
`minZoom`, …) stays from the previous owner, and listeners it did not remove are
not cleared.

### 4.3 Pins

Every pin is the existing HTML string (`pinHtml(...)` and friends) mounted in an
Advanced Marker by `HtmlPin({ position, html, title?, onClick?, zIndex?, open?, onClose?, children? })`.
It is centre-anchored; `children` become the InfoWindow content, shown while
`open`. The pin wrapper carries `tp-map-pin` — the stable DOM hook tests and the
audit scripts look for.

InfoWindow content is React children, so React escapes it. Pin HTML is a raw
string set with `dangerouslySetInnerHTML`, so **pin builders interpolate only
numbers, hex colours and fixed letters (`H`, `T`) — never user text**; a name
belongs in the marker's `title` or the popup. Popups stay width-clamped for
mobile.

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

## 6. Geocoding and places — `lib/geocode.ts`

Google Geocoding and Places (New) over REST, server-only, behind
`GOOGLE_MAPS_SERVER_KEY` (ADR 0076). It replaced Nominatim and Photon, along with
their pacing and response cache. The contract:

- **Never throws.** Every function returns `null` on any failure, with a 5 s timeout.
- **Keyless is a no-op.** `hasServerKey()` is false without the key: every lookup
  returns `null` with no network call and the row saves without coordinates.
- `geocodePlaceDetailed` (Geocoding), `reverseGeocode`, `locateVenue` (Text Search,
  IDs only, then Place Details Essentials; a hit further than **500 m** from the
  address is rejected) and `fetchVenueDetails` (Place Details Enterprise: opening
  hours, website, business status).

**The place field.** Every place-ish text field (Stop, Item, Accommodation,
Transport ends, Trip Home, Globe marker) is `PlaceCombobox` on `usePlaceSuggestions`
(Places Autocomplete (New), debounce 350 ms, minimum 3 characters, one session
token per field focus, ended by the pick's `fetchFields`). A pick fetches
Essentials fields only (`id, location, formattedAddress, addressComponents`); its
name is the prediction's main text. The pick travels with the save as `placeId` +
coordinates, so the server does not look the place up again. Typing after a pick
clears it. Google's attribution shows as the list footer ("Google Maps").

**Keyless behaviour.** Without `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, or after
Google refuses the key (`useMapsAuthFailed()`), the field is a plain text input
with the hint "Suggestions aren't available. The place is looked up when you
save." The save still works: the server looks the text up (or saves without
coordinates when it has no key either). The Globe marker form is the exception:
`createMarker` looks nothing up, so its hint is "Search isn't available right
now. Drop a pin on the map to place it."

**On save, in the server action**, never at render time. A save looks up only when
no picked place came with it and the text changed or the row has no coordinates:

| Entity | Looked up |
|---|---|
| Stop | `"<name>, <country>"` → coords, `countryCode`, `placeId` |
| Item | `locateVenue(title, address)` → coords, `placeId` (biased to the Stop's point) |
| Accommodation | its `address` / name |
| Transport | `depPlace` and `arrPlace` separately → 4 columns plus `depPlaceId` / `arrPlaceId` |
| Trip home base | the home place name → coords, country, timezone |

Transport gets its own coordinates rather than its Stops', because a terminal is
tens of kilometres from the city pin (ADR 0011).

`locateVenue` runs Text Search and a Geocoding of the address side by side and
keeps the venue only within 500 m of the address. A venue goes through unchecked
only when Google answers that it has no result for the address (`ZERO_RESULTS`),
or there is no address. A *failed* call (quota, HTTP error, 5 s timeout) on
either side returns nothing, and the row saves without coordinates; a failure is
never read as "the address doesn't exist". It reports whether the venue or the
address matched (`matched: "venue" | "address"`). `lookUpPlace` / `lookUpVenue`
return `{ status: "ok" | "miss" | "error" }` for callers that must tell the two
apart (the backfill); `geocodePlaceDetailed` / `locateVenue` return the
candidate or `null`.

**Venue details and the Enterprise counter.** An Item pick of an establishment
(the prediction's `types`, free with the suggestion, include `establishment` or
`point_of_interest`) calls the server action `venueDetailsForPick`, which fills
opening hours and the link (only when empty) and business status. A city or a
bare street address skips it. That is a Place Details **Enterprise**
call. Google's quota is per method, so one GetPlace cap (333/day) covers the
Essentials picks, the server lookups and Enterprise together. Teepee holds
Enterprise to **33/day** itself with `dailyCap("venue-details")`
(`lib/google-usage.ts`, table `GoogleUsage`, a per-UTC-day counter). Past it the
pick still fills location; hours and link just do not fill. Overnight hours are
split across days by `lib/opening-hours-google.ts`.

**Surprise.** A placeholder masks `placeId` and `businessStatus` like
`address`/`lat`/`lng` (ADR 0072) — "Open in Maps" uses `query_place_id`, which
would otherwise reveal the venue.

**The MCP server has no place search.** `search_places` is gone; Claude researches
venues on the web.

**Retroactively**, `npm run backfill:places` (`scripts/backfill-google-places.ts`)
puts place IDs on rows that still carry OpenStreetMap coordinates, in two steps:

1. **Dry run** (the default). Looks every row up, prints it as
   `kind id · "query" · old → new · km · VERDICT · [venue|address] matched address`,
   and writes `backfill-places-plan.json` (git-ignored, in the working directory):
   every row it would write, with the exact columns to set, what matched, and
   whether Enterprise details will be fetched. Nothing else is written.
2. **`-- --execute [plan file]`** applies exactly that file, with no location
   lookups. It refuses a missing plan or one older than 24 hours, and skips any
   row that changed since the plan (a place picked, a pin moved, a zone set, or
   the text it was looked up by edited), so re-running it resumes; Items whose
   details failed are retried (they still hold the planned place ID and no
   business status). A dry run deletes any earlier plan before it starts.

Verdicts: ACCEPT (within 1 km for Items, Accommodation, Transport ends and
Markers; 25 km for Stops and Home bases), NEW (the row had no point), TOO-FAR,
ADDRESS-ONLY (the row has a pin and only the address or area matched: an
address match never replaces a pin), NO-MATCH, ERROR (the lookup failed;
counted apart from NO-MATCH, and 5 in a row stop the run with no plan written)
and NO-ANCHOR (nothing to look up; skipped). Only ACCEPT and NEW rows go in the
plan. New Items and stays with no point are biased to their Stop's point; rough
Stops get no timezone. Item hours, link and business status are fetched at
execute time, only for venue matches against a real address, and fill only
what is empty. It bypasses the app's 33/day Enterprise counter by design, so
the runbook raises the console quotas for the hour (DEPLOY §4j). Not run inside
`prisma migrate deploy`.


## 7. Directions and Travel times

`lib/map/maps.ts` builds URLs for the external-maps deep links (no API call). Real Travel times come from the Routes API, below.

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

**The estimate** (the fallback when no real time is stored), pure code from `lib/geo.ts`:

```ts
haversineKm(a, b)                                             // great-circle km
estimateDriveMinutes(km, { windingFactor, avgSpeedKph })      // km × factor ÷ speed
```

`windingFactor` and `avgSpeedKph` are per-trip settings. It is a hint, not an
ETA, costs nothing and needs no key; it stands in wherever a real time has not
been looked up, and is shown as "(estimated)".

### 7.1 Travel times (Routes API)

- **Hops** (`lib/travel-times/hops.ts`, pure). A hop is two consecutive located
  Items on a day, or a car Transport leg. The way it is travelled: under 2 km
  walk; a walk of 20 minutes or less stays a walk; anything longer uses the
  Stop's **Local travel mode** (Drive or Public transport, guessed from the
  Stop's Transport, set on the Stop form or by MCP `set_local_travel_mode`).
  Car legs are DRIVE only.
- **Keys.** Each hop has a key `MODE|lat,lng|lat,lng` (5-decimal points; public transport adds its departure, rounded to 15 minutes) into
  the global `TravelTime` cache: status OK (minutes, distance, polyline), NONE
  (no route exists) or ERROR (retried after a 24 h cooldown). It is global, not
  per Trip, so identical hops share one lookup.
- **Read vs fetch.** Readers (`lib/travel-times/read.ts`) only read the cache
  and fall back to the estimate; they never call Google. Fetching is
  narrower: public-transport hops are only fetched within 90 days of departure
  (read mode loads any departure that is already stored).
- **Refresh trigger.** `revalidateTrip` schedules the job with `after()`
  (`lib/travel-times/refresh.ts`) so a save never waits on Google. The operator
  script `npm run travel-times:refresh` (dry run by default, `-- --execute`;
  upcoming Trips first) covers what the hook cannot: points moved by the places
  backfill, Trips beyond 90 days, failed lookups.
- **Cost guard.** One Compute Routes (Essentials mask) call per key; TRANSIT
  also bills Essentials. At most 40 calls per pass of one Trip refresh (the operator script loops passes until one fetches nothing or the day's cap stops it, and stops the whole run when every call in a pass fails), 4 concurrent, each gated by
  `dailyCap("routes")` (the day counter, same as DEPLOY §4j's
  quota; only the operator script can lift it, with `--cap`). Past it, hops stay estimated.
- **Surprise views.** The real plan is refreshed first, then each Traveller's
  Surprise view of it: a hidden Surprise Item reaches readers as a placeholder
  with no coordinates, so its hops are stepped over and never named or looked up
  for a Traveller who is not in on it.
- **Readers.** Flags (long driving day and tight-connection / retime checks),
  Compare, the promote preview, the Plan page's drive estimate, Day map hop lines
  (Day view and the Travelling Home), Route map car legs (Summary, Share, the
  Plan mini map), and MCP `get_day` hops.
- **No key.** Without `GOOGLE_MAPS_SERVER_KEY` the job does nothing and every
  reader shows estimates; nothing errors.

## 8. Testing

- **Pure `lib/` modules have real unit tests** — `geo`, `map/maps`, `day-map`,
  `geocode`, `nearby`, `route-sketch`, `map/pins`,
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
4. **Quota exhaustion should degrade — unverified.** Per-day quotas (DEPLOY.md
   §4j) are set below the free allowance, so hitting one should mean the fallback,
   not a bill. That the fallback appears (rather than Google's grey error box) is
   expected but not yet verified: we don't know whether Google routes an
   over-quota Dynamic Maps load through `gm_authFailure`. DEPLOY.md §4j step 11
   checks it before the push. Every map mount is a billable Dynamic Maps load,
   including a theme-flip remount and the Plan's mini map plus its dialog.
5. **The InfoWindow theme is ours.** `app/globals.css` restyles Google's
   InfoWindow under `.tp-map`; Google's own rules have higher specificity than a
   bare class, so the overrides are scoped to `.tp-map .gm-style`.
6. **`Permissions-Policy: geolocation=()`** is set in `next.config.ts`. There's no
   "locate me" button, and adding one means relaxing that header.
7. **No CSP is set** (`next.config.ts` deliberately sets none), so Google's origins
   need no header changes. Adding a CSP later means allowing `maps.googleapis.com`
   and `maps.gstatic.com`.
8. **Places quotas are per API method.** One GetPlace cap covers Essentials picks,
   server lookups and Enterprise detail calls; Teepee holds Enterprise to 33/day
   with its own `GoogleUsage` counter (§6).
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
   (`google-map-frame`, `maps-auth`, `html-pin`, `map-polyline`,
   `use-fit-bounds`, `map-unavailable`), plus the `.tp-map` rules in
   `app/globals.css`.
4. Copy `lib/map/pins.ts` (category -> colour) and `lib/map/world.ts`.
5. Copy `components/ui/map-loader.tsx` if a page needs an `ssr:false` seam.
6. Copy `lib/map/maps.ts` for the deep links, `lib/geo.ts` for distance and drive
   estimates.
7. Write one map component per surface on `GoogleMapFrame`, with a fallback;
   keep the point-model logic in a pure `lib/` module.
8. Copy `test/google-maps-mock.tsx` and mock `@vis.gl/react-google-maps` with it —
   see §8.
9. Set a per-day quota on every Google API you call (your share of the free allowance ÷ 30
   is a safe rule) and a budget alert.

---

### Reference: relevant ADRs

| ADR | Decision |
|---|---|
| `0011` | Geocode all located entities on save; Transport gets its own coordinates |
| `0024` | The "Globe" is a flat map, not a 3D globe (amended: now Google) |
| `0028` | Nominatim response cache — superseded by 0076 |
| `0033` | Free raster basemap tiles — superseded by 0076 |
| `0076` | Google Maps Platform replaces the free map stack |
