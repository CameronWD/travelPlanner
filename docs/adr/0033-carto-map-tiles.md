# CARTO map tiles — Positron (light) and Dark Matter (dark)

## Status

Accepted.

## Context

All maps used OpenStreetMap raster tiles, which have no dark variant. This is a gap flagged in the design brief, as dark mode is first-class across the Bold Modular redesign. The app renders maps in both light and dark themes but lacked corresponding dark-mode tile options, forcing the same light tiles in both contexts.

## Decision

Use CARTO Positron (light) and Dark Matter (dark) basemap tiles, selected by the active theme via the shared `lib/map-tiles.ts` helper. The helper exports `cartoTiles(isDark)` to pick the tile config, and `CARTO_TILES` to expose both variants for component use. Attribution credits both OpenStreetMap (data) and CARTO (tiles) in a dual-source attribution string, as CARTO's usage policy requires.

## Consequences

- **Free tier, no API key required.** CARTO's basemaps endpoint is public; no authentication is needed.
- **Dual attribution must be maintained.** The attribution string (visible on every map) credits both OpenStreetMap contributors and CARTO. Removing either violates CARTO's terms.
- **Third-party tile dependency.** Maps now depend on CARTO's CDN and uptime. Mitigated by the shared `lib/map-tiles.ts` helper — there is one place to swap tile sources if CARTO becomes unavailable or policy changes.
- **Supersedes the plain-OSM choice.** Maps are now CARTO-powered, not OSM raster. Complements ADR 0024 (maps are flat Leaflet, not 3D), which remains unchanged.

## Amendment — 2026-08-31: CARTO now requires an API key

The "**Free tier, no API key required**" consequence above no longer holds. In late August 2026 CARTO began requiring an API key for the raster basemap endpoint (`basemaps.cartocdn.com`); unauthenticated tiles are returned with an "API KEY REQUIRED" watermark baked into the image. Nothing is blocked — the map still functions — but the watermark appears on every tile fetched after the change, spreading as cached tiles expire.

**The decision stands.** CARTO Positron and Dark Matter remain the basemaps, and `lib/map-tiles.ts` remains the single swap point that made this a one-file change. The helper now appends `?key=` from `NEXT_PUBLIC_CARTO_API_KEY` when that variable is set, and leaves the URL bare when it is not — so local development works unconfigured, at the cost of the watermark.

Two further consequences:

- **The key is necessarily public.** Leaflet fetches tiles from the browser, so it must be a `NEXT_PUBLIC_` variable and will appear in the client bundle. Restrict it by domain in the CARTO dashboard. It is also inlined at build time, so changing it requires a rebuild.
- **Raster basemaps are slated for retirement** in favour of vector tiles. This amendment buys time; migrating to vector (and to MapLibre in place of Leaflet's raster layer) would supersede this ADR rather than amend it.
