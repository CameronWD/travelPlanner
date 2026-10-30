# Google Maps across Teepee — spec (2026-10-30)

Agreed in a grilling session on 2026-10-30. Decision record: ADR 0076.
Glossary: CONTEXT.md **Travel time**, **Local travel mode**, **Day map**
(amended). Prior art: Cam's hometracker app (`@vis.gl/react-google-maps`,
Routes, Geocoding, Places).

Replaces the whole map stack described in `docs/maps-overview.md` — Leaflet,
CARTO tiles, Nominatim, Photon, and the "no routing SDK" stance — with Google
Maps Platform: rendering, Places, and Routes.

## Delivery

One spec, one ADR, three branches in order. Each branch is planned
(superpowers:writing-plans) and executed (superpowers:subagent-driven-development)
on its own, reviewed, then **merged locally into `main`**. Nothing is pushed
until all three are merged: **one deploy**.

| Branch | Name | Depends on |
|---|---|---|
| 1 | `feat/google-maps-1-rendering` | — |
| 2 | `feat/google-maps-2-places` | 1 (Places content may only be shown on a Google map) |
| 3 | `feat/google-maps-3-travel-times` | 1 (route lines), 2 (Google coordinates) |

## G. Cross-cutting decisions (ADR 0076)

### G1. Storage stance

Teepee stores Google-sourced coordinates, place IDs and Travel times
indefinitely, as it stores coordinates today (ADR 0011). Google's Service
Specific Terms allow Places latitude/longitude to be cached for 30 days only
and Routes results not at all; place IDs may be kept forever. The ADR names
this as a known deviation, accepted because Teepee is invite-only behind the
one-door allowlist (ADR 0057). **Revisit trigger: the allowlist opens.**

Every Google-sourced coordinate is stored beside its **place ID**, so coming
into compliance later is a refresh cron, not a migration plus a re-geocode.

### G2. Cost rule

- A Google Cloud project `teepee` on Cam's existing billing account (shared
  with hometracker's `ourhome`). Google's free monthly usage is granted per
  SKU **per billing account**, so the two apps share it.
- **Every Google API Teepee calls has a per-day quota set to half its free
  monthly allowance ÷ 30.** E.g. Dynamic Maps 150/day, Routes Essentials,
  Geocoding and Place Details Essentials ~165/day, Place Details Enterprise
  15/day, Autocomplete per the current SKU table. A month inside the quota
  cannot leave the free allowance, so the bill is $0 by construction.
- A budget alert on the billing account at $1 and $5.
- Quota exhaustion degrades, never fails: maps show their fallback list,
  Travel times fall back to estimates, saves succeed without coordinates.
- Essentials tier wherever possible: no traffic-aware routing, no Pro-only
  route fields.
- Two keys: a **browser key** restricted by HTTP referrer to `teepeeapp.com`,
  `beta.teepeeapp.com`, Vercel preview hosts and localhost, and restricted to
  the Maps JavaScript API and Places API (New); a **server key** restricted
  by API to Routes, Geocoding and Places API (New).
- Follow-up for the hometracker repo (not this work): cap hometracker's quotas
  at the other half.

### G3. Attribution

Google's required attribution is shown wherever Places content appears off a
map — the autocomplete dropdown — per the Places API policies. Maps carry
their own Google attribution. OpenStreetMap/CARTO attribution goes with
Leaflet.

## Branch 1 — Maps (rendering)

### M1. One library

`@vis.gl/react-google-maps` renders every map. It replaces `leaflet`,
`@types/leaflet`, the imperative per-map lifecycle code, and the `ssr:false`
loader factory (`components/ui/map-loader.tsx` and the `*-map-loader.tsx`
files) where vis.gl makes them unnecessary.

The four maps and every surface they appear on:

| Map | Surfaces |
|---|---|
| Route map (`components/trip/route-map.tsx`) | Trip page, Summary, Share page, Home phases (planning, past), the Plan's mini map and route dialog |
| Day map (`components/trip/day-map.tsx`) | Day view (day plan card), Travelling Home |
| Wishlist map (`components/trip/wishlist-map.tsx`) | Wishlist board |
| Globe (`components/globe/globe-map.tsx`) | Globe |

Behaviour each map has today is kept: numbered and chapter-coloured pins,
home-base bookend pins and legs, H / T pins, popups with Open in Maps /
Directions, click-to-select, fly-to on select, click-map-to-drop-a-pin on the
Globe, Edit/Delete inside Globe popups, clustering.

### M2. Keep the pure layer

`lib/day-map.ts`, `lib/route-map.ts`, `lib/map/pins.ts`, `lib/map/palette.ts`,
`lib/map/icons.ts`, `lib/map/overlap.ts`, `lib/geo-cluster.ts`,
`lib/home-map-stops.ts` and `lib/trips/route-sketch.ts` keep their contracts.
Pins become **Advanced Markers** carrying the same HTML they render today, so
the maps look the same. No redesign in this work.

### M3. Light and dark

One Map ID with cloud-based styling; the map's colour scheme follows the app
theme (light / dark), switching live like the CARTO swap does today.
`lib/map/tiles.ts`, `NEXT_PUBLIC_CARTO_API_KEY` and ADR 0033 retire.

### M4. Lines

- Route map: Stop-to-Stop and home legs keep their per-segment lines. Flight,
  train and ferry legs are **geodesic** (great-circle) lines. Car legs follow
  the road once Branch 3 supplies their Travel time; until then they are drawn
  as today.
- Day map: hops are drawn as today in Branch 1; Branch 3 adds route lines.

### M5. Fallback

When the browser key is missing, the Maps JavaScript API fails to load, or a
quota is exhausted, each map renders its **fallback list** (the Route map's
existing "fewer than two located Stops" list generalised to every map). The
page never breaks. This is also what tests, the layout-audit harness and
local dev without a key see.

### M6. Env and docs

- New env: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`,
  `GOOGLE_MAPS_SERVER_KEY` (the server key is first used in Branch 2, but its
  runbook lands here). `.env.example` updated; `NEXT_PUBLIC_CARTO_API_KEY`
  removed.
- `docs/DEPLOY.md`: a new section — the Google Cloud runbook: create the
  `teepee` project, enable the APIs, the two keys and their restrictions, the
  Map ID (light + dark styling), every per-day quota from G2, the budget
  alert, the env vars on Vercel (Production + Preview) and `.env.local`.
- `docs/maps-overview.md` rewritten for the new stack.
- ADR 0076 written; ADR 0033 marked superseded, ADR 0024 amended (the Globe is
  a flat Google map).
- `app/privacy/page.tsx` names Google Maps for map display.

## Branch 2 — Places

### P1. Picking a place

Every place field uses **Places Autocomplete (New)** with session tokens, so
keystrokes are free and the session bills once on the pick.

| Field | Searches |
|---|---|
| Stop location, Trip Home base | cities and regions |
| Item, Accommodation, Transport departure/arrival point, Globe Marker | venues and addresses |

A pick stores **place ID**, coordinates, country code and formatted address.

For an **Item** venue the pick also, in the same Place Details request:

- fills **Opening hours** when the Item has none — never overwriting hours a
  Traveller or Claude set;
- fills the Item's **link** with the venue's website when it is empty;
- stores the venue's **business status** (stored only; a Flag is a follow-up).

Other entities request location fields only (Essentials).

### P2. Server-side lookups

For anything saved with an address but no picked place ID — the Claude
connection, the booking importer, an address typed without picking:

- **Items:** a free Text Search requesting `places.id` only (Text Search
  Essentials IDs Only — unlimited, no charge) for "*title*, *address*",
  biased to the Stop's location, then Place Details Essentials for the
  venue's coordinates. The venue is accepted only within **~500 m** of where
  the address itself geocodes; otherwise fall through.
- **Everything else, and the fall-through:** Google Geocoding API.
- **Globe click:** Google reverse geocoding.

The contract of `lib/geocode.ts` stays: best effort, never throws, a failure
saves the row without coordinates.

### P3. Open in Maps

Anything with a place ID links to
`https://www.google.com/maps/search/?api=1&query=<name>&query_place_id=<id>`
(Maps URLs: no key, no charge). Nothing is stored for the link. Without a
place ID the existing coordinate links stay (`lib/map/maps.ts`).

### P4. Removals and docs

- Photon and Nominatim retire, with their pacing and response cache
  (ADR 0028) and ADR 0069's typeahead split. ADR 0028 and 0069 marked
  superseded by 0076; ADR 0011 amended (Google is the geocoder; place IDs
  stored).
- Privacy page and in-app help guide wording updated (the guide's drift guard
  covers quoted control names).

### P5. Backfill (one-off, after the deploy)

A script, dry run first, archived after the real run:

- For every located or addressed row (Items, Stops, Accommodation, Transport
  ends, Markers, Trip Home bases), look up a Google match by name + address
  biased to the current coordinates.
- Accept only within **~1 km** of the old point (**~25 km** for Stops and Home
  bases). Rows with no coordinates yet are attempted unconditionally.
- Venue Items additionally get Opening hours and link filled when empty.
- The dry run prints `row · old → new · distance · verdict`; Cam reads it
  before the real run.
- Production counts on 2026-10-30: ~128 Essentials lookups, 61 Item families
  for Enterprise details. The runbook says to raise the Place Details
  Enterprise daily quota to 100 for the hour of the run and put it back.

## Branch 3 — Travel times

### T1. Local travel mode

A Stop has a **Local travel mode**: Drive or Public transport. When unset it
is inferred — Drive when a car Transport arrives at or leaves the Stop,
otherwise Public transport — and it is editable in the Stop's settings. The
Claude connection gains `set_local_travel_mode`.

### T2. Travel time

A stored **Travel time** per hop: minutes, distance, the way it is travelled
(walk / drive / public transport) and the encoded route line.

- Hops: consecutive located Items on a day, and car Transport legs.
- Keyed by from-point, to-point and mode; public-transport hops also key on
  the departure time (the earlier Item's end). Identical hops are never
  fetched twice — Forks, Duplicates and Undo reuse them.
- Fetched **after the response** (`after()`), from the Routes API, on any plan
  write that changes a hop's ends, times or order — the app's forms and the
  Claude connection alike.
- **Surprise:** on a day with a live Surprise Item the fetch also computes the
  **masked** day's hops (stepping over the Surprise), so a surprised Traveller
  and Share links see real hops, never a lone estimated one. The Surprise
  drift guard gains this case.

### T3. Mode per hop

1. Straight-line distance under ~2 km → ask for a walking route; ≤ 20 minutes
   → it is a walk.
2. Otherwise the Stop's Local travel mode.
3. Car Transport legs always drive.

### T4. Readers

Every reader takes the stored Travel time and falls back to today's
straight-line estimate (`lib/geo.ts`, the Trip's winding factor and average
speed) marked **estimated**:

- Flags: Rule 12 tight connection (and its fix's suggested time) and the long
  driving day.
- Compare's driving minutes; the Plan page's road km.
- Reviews (they read the same rows the Flags do).
- Day map: solid route lines for real hops, dashed straight lines for
  estimated ones.
- Route map: car Transport legs follow the road.

### T5. Claude connection

- Day and plan reads carry each hop's minutes, way of travelling, distance and
  real/estimated.
- The plan-day and check-day prompts and `docs/connect-claude.md` gain one
  line: look venues up on the web; give a full street address.
- Claude triggers no Google call directly: no place search tool, no place-ID
  input. Its saves cost what any save costs (one lookup, the Travel time
  fetch).

## Before the one push

**Rule: nothing in any branch waits on Cam.** Branches are built, tested and
reviewed with no Google key (every map on its fallback list, every lookup on
its no-key path, every Travel time estimated). Every step Cam does by hand
is collected here, after all three branches are merged.

1. Cam creates the `teepee` Google Cloud project, the keys and the Map ID per
   the DEPLOY runbook, and puts them in `.env.local`; the merged `main` is
   checked locally with real maps.
2. Vercel env vars (Production + Preview), quotas, budget alert.
3. Over-quota check (DEPLOY §4j step 11): with a dev key, set the Dynamic Maps
   daily quota very low, load past it, and confirm the app's fallback appears,
   not Google's grey error box.
4. Attribution check (DEPLOY §4j step 11): Google's logo and attribution row is
   not covered on the Your travels card or the desktop Home tile, in both
   themes.
5. Places check (DEPLOY §4j step 11): with the real keys, one pick per field
   kind (Stop/region, Item venue with the hours filling, Transport end, Globe
   pin), then confirm Google's billing report shows **Autocomplete Session
   Usage** — proof that sessions terminate. If they do not, every keystroke
   bills per request.
6. Push `main` → deploy.
7. Backfill (DEPLOY §4j step 12): raise the GetPlace quota to 300 for the hour,
   `npm run backfill:places` (dry run) → Cam reads the rows →
   `npm run backfill:places -- --execute` → put the quota back.

## Not in this work / follow-ups

- A closed-venue Flag and refreshing business status for every Item.
- Per-hop override of the way a hop is travelled.
- Hometracker's quota caps (hometracker repo).
- The compliance refresh cron (G1's revisit trigger).
- Phone, rating, photos, reviews from Places.

## Hand-off from Branch 1 (as built, 2026-10-30)

Inputs for planning Branches 2 and 3, from Branch 1's final review:

- **Google availability for forms (Branch 2).** `mapsConfig()` requires a Map ID, which Places autocomplete does not need — forms need their own gate on the browser key alone. The `APIProvider` lives inside each map frame; forms need their own provider and failure handling. Prefer `useMapsLibrary("places")` over a `libraries` prop (mismatched provider params trigger vis.gl's "already loaded with different parameters" warning).
- **Refused key (Branch 2).** `components/map/maps-auth.ts` (`useMapsAuthFailed()`) owns `window.gm_authFailure` for the whole page. Forms read it; nothing else may assign `window.gm_authFailure`.
- **Autocomplete quota (Branch 2).** The DEPLOY quota table states the rule, not a number, for Autocomplete. Keystroke requests are free inside a session that ends in Place Details and billed per request when the session is abandoned, so a 165/day cap would stop typing after roughly 16 searches. Branch 2 sets the number from current pricing, with debounce and a minimum query length.
- **Route lines (Branch 3).** `MapPolyline` has no `encodedPath`; vis.gl 1.10.1's exported `<Polyline>` does (and deep-compares options) — wrap it or add decoding. The Day map draws one polyline today; Branch 3 needs one per hop (solid real, dashed estimated). The Route map's travelled-leg draw-in interpolates lat/lng linearly; legs crossing the antimeridian sweep the wrong way during the draw.
- **Known, deferred.** A theme flip remounts each map and loses pan/zoom (see `docs/maps-overview.md` §4.2 for why carrying the camera is not a one-liner). A map click does not close an open popup (Leaflet did). The Share page's leg draw-in plays on mount rather than on section reveal.
