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
