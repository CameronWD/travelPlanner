import { describe, expect, it } from "vitest";
import { cartoTiles, CARTO_TILES } from "./map-tiles";

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
