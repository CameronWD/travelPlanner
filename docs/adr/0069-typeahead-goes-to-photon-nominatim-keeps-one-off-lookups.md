# Typeahead goes to Photon; Nominatim keeps one-off lookups

## Status
Accepted (2026-10-06). Amends ADR 0028.

## Context

ADR 0028 chose response caching over a rate limiter on the premise that
geocodes "happen at human pace (a Search-button click; one lookup per
Stop/Accommodation/Transport save)". That premise no longer holds: the
place combobox (`components/ui/place-combobox.tsx`) has since become a
typeahead that queries from two characters after 350 ms, and firm-up and
New Trip geocode every Stop back to back. Nominatim's usage policy
explicitly forbids client-side autocomplete and asks for at most one
request per second. The failure mode is a silent 403 on TEEPEE's
User-Agent, which would break every geocode in the app at once.

## Decision

- **Typeahead (as-you-type search) goes to Photon** (photon.komoot.io),
  an OpenStreetMap-based geocoder built for autocomplete and free to use.
- **Nominatim stays for one-off lookups**: geocoding a saved place,
  reverse geocoding, and the backfill script. ADR 0028's cache stays in
  front of it.
- **Batch geocodes (firm-up, New Trip) skip Stops that already have
  coordinates** and are spaced to respect the one-per-second rule.
- **Photon is named as a processor on `/privacy`** alongside Nominatim
  and CARTO. ADR 0059's rule stands: adding a processor is a promise to
  Travellers, and this one was judged worth making because the
  alternative (search-on-submit) removes a feature Travellers already use.

## Considered

- **Nominatim with search-on-submit.** No new processor, but a worse
  UX and the batch problem remains.
- **A paid geocoder.** Rejected for the same reasons as every other
  paid dependency in this repo: a key, a bill, and a thing that can be
  absent on a fresh deployment.
