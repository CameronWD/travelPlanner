import { afterEach, describe, expect, it, vi } from "vitest";
import { cartoTiles, CARTO_TILES } from "./map-tiles";

const BARE_LIGHT_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const BARE_DARK_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

/**
 * The key is read at module scope (Next inlines NEXT_PUBLIC_* at build time),
 * so the env has to be stubbed BEFORE the module is imported. resetModules +
 * dynamic import gives each case a fresh evaluation.
 *
 * `key` is passed straight to `vi.stubEnv` — pass `undefined` to make the
 * variable genuinely absent (vitest 4 deletes it), or `""` to set it to an
 * explicit empty string. Those are different paths through `API_KEY =
 * process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim() || null` and both need
 * covering separately.
 */
async function loadWith(key: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_CARTO_API_KEY", key);
  return import("./map-tiles");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("cartoTiles", () => {
  it("returns the Positron (light) tiles when not dark", () => {
    expect(cartoTiles(false).url).toContain("light_all");
    expect(cartoTiles(false).subdomains).toBe("abcd");
  });
  it("returns the Dark Matter tiles when dark", () => {
    expect(cartoTiles(true).url).toContain("dark_all");
  });
  it("credits both OpenStreetMap and CARTO", () => {
    expect(CARTO_TILES.light.attribution).toMatch(/OpenStreetMap/);
    expect(CARTO_TILES.light.attribution).toMatch(/CARTO/);
  });
});

describe("cartoTiles — CARTO API key", () => {
  it("appends the key to both light and dark URLs when configured", async () => {
    const m = await loadWith("abc123");
    expect(m.cartoTiles(false).url).toBe(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=abc123",
    );
    expect(m.cartoTiles(true).url).toBe(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=abc123",
    );
  });

  it("leaves the URLs bare when the key is an empty string — unconfigured dev still works", async () => {
    const m = await loadWith("");
    expect(m.cartoTiles(false).url).toBe(BARE_LIGHT_URL);
    expect(m.cartoTiles(true).url).toBe(BARE_DARK_URL);
    expect(m.cartoTiles(false).url).not.toContain("?");
  });

  it("leaves the URLs bare when the key is genuinely absent from the environment", async () => {
    const m = await loadWith(undefined);
    expect(m.cartoTiles(false).url).toBe(BARE_LIGHT_URL);
    expect(m.cartoTiles(true).url).toBe(BARE_DARK_URL);
    expect(m.cartoTiles(false).url).not.toContain("?");
  });

  it("treats a whitespace-only key as unset", async () => {
    const m = await loadWith("   ");
    expect(m.cartoTiles(false).url).not.toContain("key=");
  });

  it("url-encodes the key", async () => {
    const m = await loadWith("a b&c");
    expect(m.cartoTiles(false).url).toContain("?key=a%20b%26c");
  });

  it("keeps the Leaflet placeholders and the retina marker before the query", async () => {
    const m = await loadWith("abc123");
    // Leaflet substitutes {s}/{z}/{x}/{y}/{r}; the query string must sit after .png
    expect(m.cartoTiles(true).url).toMatch(/\{s\}.+\{z\}\/\{x\}\/\{y\}\{r\}\.png\?key=/);
  });

  it("does not disturb attribution or subdomains when keyed", async () => {
    const m = await loadWith("abc123");
    expect(m.cartoTiles(false).subdomains).toBe("abcd");
    expect(m.CARTO_TILES.dark.attribution).toMatch(/CARTO/);
    expect(m.CARTO_TILES.dark.maxZoom).toBe(20);
  });
});
