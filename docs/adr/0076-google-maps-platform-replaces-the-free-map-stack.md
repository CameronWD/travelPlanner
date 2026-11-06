# 0076 — Google Maps Platform replaces the free map stack

## Status
Accepted (2026-10-30). Decided in the Google Maps grill
(`docs/specs/2026-10-30-google-maps.md`). Supersedes ADR 0028, 0033 and
0069; amends ADR 0011 and 0024. Reverses the "no routing SDK" stance in
`docs/maps-overview.md`.

**Amended 2026-11-06** (`docs/specs/2026-11-06-google-extras.md`):
- **Cost rule, share 1.** The property tracker stopped using Google and its
  keys are deleted, so Teepee takes the whole free allowance. "Half its free
  monthly allowance" becomes "its **share** of the allowance". The share is
  one number in code, now 1. Every daily cap is `allowance × share ÷ 30`, rounded down,
  from one table. Set the share back to 0.5 if another app ever shares the
  billing account again.
- **Static Maps on Share link previews, Print and the Share page are now
  accepted.** This reverses the rejected option below. The Share page keeps
  its live map behind "Explore map". The preview image is fetched
  server-side and counted against the daily cap, never edge-cached, so a
  revoked link stops previewing at once. Serving a Google
  map image inside our own card is the same invite-only storage deviation as
  point 2.
- **Public holidays come from Google Calendar's holiday calendars**, read
  from their public iCal feeds (no key, no Calendar API) and cached per
  country and year. The data check passed on 2026-11-06: the feeds label
  public holidays, observances and their Regions.
- **Two more opt-in/background uses:** What's around (Nearby Search,
  Enterprise fields, only on Trips where a Traveller switched it on) and
  closed-venue re-checks (Place Details Pro, `businessStatus` only, upcoming
  Trips, at most monthly per venue). NearbyCache keeps What's around results
  (names, ratings, hours, addresses, points) for up to two days; same
  invite-only storage deviation as point 2.

## Context

Teepee's maps were one runtime dependency (Leaflet) and free services: CARTO
tiles (watermarked without a key since August 2026), Nominatim for lookups and
Photon for typeahead. Place search was weak for venues, drive times were
straight-line guesses, and every map hand-managed its own lifecycle. Cam runs
Google Maps Platform in hometracker and prefers it.

## Decision

1. **Google for all three layers.** `@vis.gl/react-google-maps` renders every
   map; Places (New) does search, details and the server's venue lookups;
   Geocoding does address and reverse lookups; Routes computes **Travel
   times**. Leaflet, CARTO, Nominatim and Photon go. Partial adoption is not
   an option: Places content may not be shown on a non-Google map.
2. **Storage stance: keep what we fetch.** Coordinates, place IDs and Travel
   times are stored indefinitely. Google's terms allow Places coordinates to
   be cached for 30 days and Routes results not at all; this is a known
   deviation, accepted because Teepee is invite-only (ADR 0057). Every
   Google-sourced coordinate is stored with its place ID so compliance is a
   refresh cron if needed. **Revisit when the sign-in allowlist opens.**
3. **The bill is $0 by construction.** Free usage is per SKU per billing
   account, shared with hometracker. Each API's daily quota is set to half
   its free monthly allowance ÷ 30, so a month inside the quotas stays inside
   the allowance. Exhausted quotas degrade (fallback list, estimated Travel
   time, a save without coordinates) and never fail.
4. **Claude spends nothing on Google directly.** The Claude connection does
   its own research on the web and passes addresses; the server turns them
   into venues with the free IDs-only Text Search.

## Considered options

- *Google Places on Leaflet* — not allowed by the Places terms.
- *Strict compliance* (30-day coordinate refresh, no stored Travel times) —
  Flags are pure read-time functions; without stored times they either call
  Routes per page view or never see real times. Too much machinery for an
  invite-only app.
- *Nominatim as a fallback when Google is down* — two sources, two code paths
  and two attributions for the rare case where an empty coordinate and an
  estimated Travel time already degrade acceptably.
- *Static Maps on Share pages* — every link-preview crawler is a billed call,
  and the page loses its interactive map.
