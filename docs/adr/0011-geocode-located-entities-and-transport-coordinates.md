# Geocode all located entities on save, and give Transport its own coordinates

## Context

The day-of logistics feature needs a per-day **map** showing where a day's plan
actually is — Items (activities), tonight's Accommodation, and the day's
Transport endpoints — plus one-tap **directions** deep-links out to Google/Apple
Maps. That requires coordinates for those entities.

What we had:

- **Stops** are already auto-geocoded on save via OpenStreetMap Nominatim
  (`lib/geocode.ts` → `geocodePlace`, called from `server/actions/stops.ts`).
- **Items** and **Accommodation** carry `lat`/`lng` columns but were **never
  geocoded** — coordinates existed only if entered by hand (so, in practice,
  almost never).
- **Transport** had **no coordinate columns at all** — only free-text
  `depPlace` / `arrPlace` strings and `fromStop` / `toStop` relations.

We deliberately avoid heavyweight external APIs, and chose **deep-link-only** for
directions (no routing/distance-matrix API, no computed travel time). But a map
still needs points to plot, and most rows had none.

Alternatives considered:

1. **Plot only pre-existing coords; deep-link the rest by text.** Smallest build,
   but the map is empty for essentially everyone until they hand-enter
   coordinates — the feature doesn't land.
2. **Geocode on-demand when the day map renders, cache back.** No new save wiring,
   but couples rendering to the network and makes the first load of a data-heavy
   day slow (Nominatim asks ~1 req/sec, 5 s timeout each).
3. **Approximate Transport points to their from/to Stop's coordinates** (a city,
   not the airport/station) and skip geocoding place strings. No Transport
   schema change, but the transport pins are wrong by tens of kilometres.

## Decision

1. **Geocode every located entity on save**, mirroring the existing Stop flow:
   - **Item** → geocode its `address` when an address is present. No address → no
     geocode.
   - **Accommodation** → geocode its `address` when present.
   - **Transport** → geocode `depPlace` and `arrPlace` when present.
   - We geocode the **bare location string** (not appended with the Stop's
     city/country). Full street addresses self-disambiguate, and keeping the query
     identical between the save actions and the backfill script avoids drift.
     Layering Stop context on top — to help sparse entries like a bare landmark
     name — is a deferred refinement.
   - The edit forms for these entities **do not currently capture manual
     coordinates**, so geocoding populates `lat`/`lng` on save. If manual entry is
     ever added, it should take precedence over the geocode result (as it already
     does for Stops).

2. **Add coordinate columns to Transport** — `depLat` / `depLng` / `arrLat` /
   `arrLng` (all nullable `Float`). Departure and arrival are genuinely different
   locations, so a single point won't do, and the from/to Stop is the wrong place
   (a city, not the terminal).

3. **Backfill existing rows with a one-time, idempotent, throttled script**
   (`scripts/backfill-geocode.ts`), run once after deploy. It only touches rows
   missing coordinates (safe to re-run) and paces requests to respect Nominatim's
   usage policy. We did **not** put the backfill in `prisma migrate deploy` — slow
   network calls do not belong in a migration step.

## Consequences

- **A schema migration is required** (first in a while). `prisma migrate deploy`
  on Vercel applies it automatically; the data backfill is a separate manual step.
- **Saves now do best-effort network I/O.** `geocodePlace` never throws and times
  out at 5 s, so a geocode failure just leaves coords null — the entity still
  saves, still gets a text-based "Open in Maps"/Directions deep-link, and simply
  isn't pinned on the map. This matches how Stops already behave.
- **Nominatim is a shared free service.** On-save geocoding is one request per
  changed address; the backfill is throttled. If volume ever grows, this is the
  place that would need a paid geocoder or a cache.
- **Reversible at a price.** Dropping the feature means a down-migration to remove
  the four Transport columns and removing the geocode calls; the coordinates
  themselves are harmless to leave. The Item/Accommodation `lat`/`lng` columns
  pre-date this and stay regardless.
- **Why Transport has coordinates** is exactly the kind of "wait, why?" a future
  reader will hit — this ADR is the answer.
