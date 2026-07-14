/**
 * CARTO basemap tiles — Positron (light) / Dark Matter (dark). Closes the
 * brief's dark-tile gap. See ADR 0033. Attribution credits OpenStreetMap
 * (data) and CARTO (tiles), as CARTO's usage policy requires.
 */
export interface TileConfig {
  url: string;
  attribution: string;
  subdomains: string;
  maxZoom: number;
}

const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>';

export const CARTO_TILES: { light: TileConfig; dark: TileConfig } = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: ATTRIBUTION,
    subdomains: "abcd",
    maxZoom: 20,
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: ATTRIBUTION,
    subdomains: "abcd",
    maxZoom: 20,
  },
};

/** Pick the CARTO tile config for the active theme. */
export function cartoTiles(isDark: boolean): TileConfig {
  return isDark ? CARTO_TILES.dark : CARTO_TILES.light;
}
