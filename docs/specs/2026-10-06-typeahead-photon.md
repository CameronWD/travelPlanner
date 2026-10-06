# Spec — The place typeahead goes to Photon; Nominatim keeps one-off lookups (2026-10-06)

**Status:** agreed with Cam 2026-10-06; not yet built.
**Branch:** `chore/codebase-audit-2026-10-06`. Target `main`.
Terminology follows `CONTEXT.md` (no changes). New ADR: **0069** (amends 0028).

**Why.** ADR 0028 skipped a rate limiter because geocodes happened "at human pace". The place combobox (`components/ui/place-combobox.tsx`) has since become a typeahead (fires from 2 characters after 350 ms), and firm-up / re-flow geocode every Stop back to back. Nominatim's policy forbids autocomplete and asks for ≤1 request/second; the failure mode is a silent 403 against our User-Agent that breaks every geocode at once.

**Scope decided in session:** only the as-you-type combobox moves to Photon. The Globe marker form and the Transport location picker search on a button press and stay on Nominatim. No fallback from Photon to Nominatim on error (that would recreate the violation); the combobox's existing error state shows instead.

**Out of scope:** a paid geocoder; a durable cache; search-on-submit for the combobox; any migration.

---

## A · Photon client in `lib/geocode.ts`

- New `searchPlacesTypeahead(query, limit = 5): Promise<PlaceSearchOutcome>` calling `https://photon.komoot.io/api?q=…&limit=…&lang=en`.
- Same contract as `searchPlacesWithStatus`: never throws; `{ status: "error" }` on network error, timeout (5 s), non-2xx, or a body that is not a GeoJSON FeatureCollection; `{ status: "ok", candidates: [] }` on no match.
- Reuses `cachedFetchJson` (successes cached by URL, failures never cached). The User-Agent header is harmless to Photon and stays.
- Maps each feature to the existing `GeoCandidate`: `lat`/`lng` from `geometry.coordinates` (`[lng, lat]` order); `city` from `properties.city ?? town ?? village ?? locality`; `country` from `properties.country`; `countryCode` lower-cased from `properties.countrycode`; `name` composed as `name, city, country` with blanks and duplicates dropped (Photon has no `display_name`). Features without numeric coordinates are skipped.
- Tests mirror the Nominatim ones: success mapping, coordinate order, empty, non-ok, thrown fetch, non-FeatureCollection body, `lang=en` in the URL, cache hit.

## B · The combobox's action uses Photon

- `findPlaces` in `server/actions/places.ts` calls `searchPlacesTypeahead` instead of `searchPlacesWithStatus`. Still session-gated, still 200-char cap, still 5 results.
- `searchPlacesAction` in `server/actions/globe.ts` and `server/actions/transport.ts` are unchanged.
- The combobox component is unchanged.

## C · Batch geocodes respect Nominatim

- The two loops in `server/actions/stops.ts` (re-flow ~line 925, firm-up ~line 1053) skip the geocode when the Stop already has `lat` and `lng`, writing only the dates/timezone for that Stop.
- Where a geocode does run, consecutive Nominatim calls in one loop are spaced ≥1000 ms apart (a small `paceNominatim()` helper in `lib/geocode.ts`, process-local, no-op for the first call). `locateRoughStops` in `server/actions/trips.ts` already skips located Stops; it gains the same spacing.
- Tests: a loop with all Stops located makes zero geocode calls; a loop with two unlocated Stops makes two.

## D · Privacy page names Photon

- `app/privacy/page.tsx`: the processor entry becomes "OpenStreetMap (Nominatim), Photon (komoot) and CARTO — turn place names you type into map coordinates (Photon for as-you-type search, Nominatim when a place is saved), and draw the map tiles …". Update `app/privacy/page.test.tsx` to match.

## E · Docs

- ADR 0028: add "Amended by ADR 0069 (2026-10-06)" to its status/heading.
- `docs/HANDOFF.md` §Overview Maps row and `.env.example` comment: note Photon needs no key.
