# Nominatim etiquette via in-memory response caching, not runtime rate limiting

## Context

Every geocode goes to OpenStreetMap's free, shared Nominatim service through
`lib/geocode.ts`. Its usage policy asks callers to send a real contact
(already done via `NOMINATIM_CONTACT`), to stay under ~1 request/second with no
bulk use, and — crucially — to **cache results and not repeat identical
queries**. ADR 0011 already foresaw this: "If volume ever grows, this is the
place that would need a paid geocoder or a cache."

Until now `lib/geocode.ts` cached nothing, so re-searching or re-saving the same
place re-hit Nominatim every time.

Two obvious "compliance" moves were on the table:

1. **A runtime rate limiter (~1 req/sec).** On Vercel serverless this needs a
   *shared* counter across lambda instances (Redis/KV or a Postgres lock),
   because an in-process limiter does nothing when each request may be a fresh
   instance. That is real new infrastructure — and the load never approaches
   1 req/sec: this is a two-person app where geocodes happen at human pace (a
   Search-button click; one lookup per Stop/Accommodation/Transport save), and
   the only place bursts are possible, `scripts/backfill-geocode.ts`, already
   sleeps 1100 ms between calls.
2. **Caching responses.** Directly removes the actual non-compliance (repeat
   queries) with no new infrastructure.

For the cache mechanism itself we considered a durable Postgres table (mirroring
`ExchangeRate`), but that is a new model + migration + read/write wiring for a
handful of lookups. An in-memory `Map` — the pattern `lib/weather.ts` already
uses — collapses the realistic repeat cases within a warm instance and needs
nothing new.

## Decision

- **Cache, don't rate-limit.** Memoise successful Nominatim responses in-process
  in a module-level `Map` keyed by request URL, behind one `cachedFetchJson`
  helper that all three request builders (`geocodePlace`,
  `searchPlacesWithStatus`, `reverseGeocode`) share.
- **Cache successes only, including genuine empty "no match" results.** Never
  cache a failure (network error, 5 s timeout, non-2xx HTTP, unparseable body)
  so a transient outage never sticks and the next call retries.
- **No eviction, no TTL.** Geocoding results are stable and two-user volume
  makes unbounded growth a non-issue (same choice as `lib/weather.ts`).
- **No runtime rate limiter.** The backfill script's existing 1100 ms throttle
  remains the only pacing, as the only path that can burst.

## Consequences

- Repeat lookups of the same place within a running server instance cost zero
  Nominatim requests; the never-throws / null-on-error contract is unchanged.
- The cache is per-instance and does not survive cold starts, so identical
  queries across instances or after a restart still hit Nominatim once each —
  acceptable at this scale, and the door to a durable cache stays open if volume
  grows (as ADR 0011 anticipated).
- A future reader wondering "why is there no 1 req/sec limiter when the policy
  says so?" — this ADR is the answer: it would be cross-instance infrastructure
  for a load that never reaches the limit, so caching carries the etiquette
  instead.
