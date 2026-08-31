/**
 * CARTO basemap tiles — Positron (light) / Dark Matter (dark). Closes the
 * brief's dark-tile gap. See ADR 0033. Attribution credits OpenStreetMap
 * (data) and CARTO (tiles), as CARTO's usage policy requires.
 *
 * CARTO began requiring an API key for the raster basemap endpoint in late
 * August 2026 — unauthenticated tiles come back with an "API KEY REQUIRED"
 * watermark baked into the PNG. Keys are free within CARTO's fair-use limit
 * (https://carto.com/basemaps/apikey).
 *
 * The variable is NEXT_PUBLIC_ by necessity: Leaflet fetches tiles from the
 * browser, so the key cannot be kept server-side. There's no CARTO dashboard
 * to restrict it in after the fact — domain scoping is fixed once, when the
 * key is requested (see docs/HANDOFF.md §5). Note that NEXT_PUBLIC_* values
 * are inlined at BUILD time — setting it in a hosting dashboard does nothing
 * until the app is rebuilt.
 *
 * When the key is unset the URLs are left bare: maps still work, watermarked,
 * so local development needs no configuration.
 */
export interface TileConfig {
  url: string;
  attribution: string;
  subdomains: string;
  maxZoom: number;
}

const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>';

const API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim() || null;

/** `?key=…` when a key is configured, otherwise the empty string. */
const KEY_QUERY = API_KEY ? `?key=${encodeURIComponent(API_KEY)}` : "";

export const CARTO_TILES: { light: TileConfig; dark: TileConfig } = {
  light: {
    url: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${KEY_QUERY}`,
    attribution: ATTRIBUTION,
    subdomains: "abcd",
    maxZoom: 20,
  },
  dark: {
    url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${KEY_QUERY}`,
    attribution: ATTRIBUTION,
    subdomains: "abcd",
    maxZoom: 20,
  },
};

/** Pick the CARTO tile config for the active theme. */
export function cartoTiles(isDark: boolean): TileConfig {
  return isDark ? CARTO_TILES.dark : CARTO_TILES.light;
}
