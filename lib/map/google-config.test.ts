import { afterEach, describe, expect, it, vi } from "vitest";
import { mapsConfig, placesBrowserKey, staticMapId } from "./google-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mapsConfig", () => {
  it("returns null when the browser key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
    expect(mapsConfig()).toBeNull();
  });

  it("returns null when the map id is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    expect(mapsConfig()).toBeNull();
  });

  it("returns both when set", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
    expect(mapsConfig()).toEqual({ apiKey: "k", mapId: "m" });
  });
});

describe("placesBrowserKey", () => {
  it("is the browser key alone, without a map id", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    expect(placesBrowserKey()).toBe("k");
  });

  it("is null when the browser key is empty", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    expect(placesBrowserKey()).toBeNull();
  });
});

describe("staticMapId", () => {
  it("prefers the Static Map ID when set", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_STATIC_MAP_ID", "s");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
    expect(staticMapId()).toBe("s");
  });

  it("falls back to the JS Map ID", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_STATIC_MAP_ID", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
    expect(staticMapId()).toBe("m");
  });

  it("is null with neither", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_STATIC_MAP_ID", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    expect(staticMapId()).toBeNull();
  });
});
