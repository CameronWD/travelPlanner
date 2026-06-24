import { describe, expect, it } from "vitest";
import { mapsUrl, appleMapsUrl, googleDirectionsUrl, appleDirectionsUrl } from "./maps";

// ---------------------------------------------------------------------------
// mapsUrl
// ---------------------------------------------------------------------------

describe("mapsUrl", () => {
  it("returns null when all params are empty", () => {
    expect(mapsUrl({})).toBeNull();
    expect(mapsUrl({ lat: null, lng: null, address: null, label: null })).toBeNull();
  });

  it("uses lat/lng when both are present", () => {
    const url = mapsUrl({ lat: 48.8566, lng: 2.3522, address: "Paris", label: "Paris, France" });
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=48.8566%2C2.3522");
  });

  it("ignores lat/lng if only one is present — falls back to address", () => {
    const url = mapsUrl({ lat: 48.8566, lng: null, address: "Paris, France" });
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=Paris%2C%20France");
  });

  it("uses address when lat/lng are absent", () => {
    const url = mapsUrl({ address: "10 Downing Street, London" });
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=10%20Downing%20Street%2C%20London");
  });

  it("falls back to label when address is absent", () => {
    const url = mapsUrl({ label: "Eiffel Tower" });
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=Eiffel%20Tower");
  });

  it("encodes special characters in the query", () => {
    const url = mapsUrl({ address: "Café & Bistro, Zürich" });
    expect(url).not.toBeNull();
    // The URL should contain an encoded form — no raw & or spaces
    expect(url!).not.toContain(" ");
    expect(url!).toContain("%26");
  });

  it("lat/lng wins over address when both present", () => {
    const url = mapsUrl({ lat: 51.5074, lng: -0.1278, address: "London" });
    expect(url).toContain("51.5074");
    expect(url).not.toContain("London");
  });

  it("address wins over label when both present but no coords", () => {
    const url = mapsUrl({ address: "The Address", label: "The Label" });
    expect(url).toContain("The%20Address");
    expect(url).not.toContain("The%20Label");
  });
});

// ---------------------------------------------------------------------------
// appleMapsUrl
// ---------------------------------------------------------------------------

describe("appleMapsUrl", () => {
  it("returns null when all params are empty", () => {
    expect(appleMapsUrl({})).toBeNull();
    expect(appleMapsUrl({ lat: null, lng: null, address: null, label: null })).toBeNull();
  });

  it("uses ll param when lat/lng are present", () => {
    const url = appleMapsUrl({ lat: 48.8566, lng: 2.3522 });
    expect(url).toContain("https://maps.apple.com/");
    expect(url).toContain("ll=");
    expect(url).toContain("48.8566");
  });

  it("includes label as q param when lat/lng + label provided", () => {
    const url = appleMapsUrl({ lat: 48.8566, lng: 2.3522, label: "Paris" });
    expect(url).toContain("q=Paris");
    expect(url).toContain("ll=");
  });

  it("uses q param from address when no coords", () => {
    const url = appleMapsUrl({ address: "123 Main St, Sydney" });
    expect(url).toBe("https://maps.apple.com/?q=123%20Main%20St%2C%20Sydney");
  });

  it("falls back to label when address is absent and no coords", () => {
    const url = appleMapsUrl({ label: "Colosseum" });
    expect(url).toBe("https://maps.apple.com/?q=Colosseum");
  });

  it("encodes special characters", () => {
    const url = appleMapsUrl({ address: "Rue de la Paix & Co, Paris" });
    expect(url).not.toBeNull();
    expect(url!).not.toContain(" ");
  });

  it("lat/lng wins over address when both present", () => {
    const url = appleMapsUrl({ lat: 41.9028, lng: 12.4964, address: "Rome" });
    expect(url).toContain("ll=");
    expect(url).not.toContain("q=Rome");
  });
});

// ---------------------------------------------------------------------------
// googleDirectionsUrl
// ---------------------------------------------------------------------------

describe("googleDirectionsUrl", () => {
  it("returns null when fewer than 2 points resolve", () => {
    expect(googleDirectionsUrl([])).toBeNull();
    expect(googleDirectionsUrl([{ lat: 48.8566, lng: 2.3522 }])).toBeNull();
    // Unresolvable points (no lat/lng/address/label) don't count
    expect(googleDirectionsUrl([{}, {}])).toBeNull();
  });

  it("2-point: sets origin and destination from coords", () => {
    const url = googleDirectionsUrl([
      { lat: 48.8566, lng: 2.3522 },
      { lat: 51.5074, lng: -0.1278 },
    ]);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("origin")).toBe("48.8566,2.3522");
    expect(parsed.searchParams.get("destination")).toBe("51.5074,-0.1278");
    expect(parsed.searchParams.get("waypoints")).toBeNull();
    expect(parsed.searchParams.get("api")).toBe("1");
    expect(parsed.origin + parsed.pathname).toBe("https://www.google.com/maps/dir/");
  });

  it("3-point: middle goes into waypoints, last is destination", () => {
    const url = googleDirectionsUrl([
      { lat: 48.8566, lng: 2.3522 },
      { lat: 45.4642, lng: 9.19 },
      { lat: 41.9028, lng: 12.4964 },
    ]);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("origin")).toBe("48.8566,2.3522");
    expect(parsed.searchParams.get("destination")).toBe("41.9028,12.4964");
    expect(parsed.searchParams.get("waypoints")).toBe("45.4642,9.19");
  });

  it("multiple waypoints are joined with |", () => {
    const url = googleDirectionsUrl([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ]);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("waypoints")).toBe("1,1|2,2");
  });

  it("text-only points use address as token", () => {
    const url = googleDirectionsUrl([
      { address: "Paris, France" },
      { address: "London, UK" },
    ]);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("origin")).toBe("Paris, France");
    expect(parsed.searchParams.get("destination")).toBe("London, UK");
  });

  it("falls back to label when no address and no coords", () => {
    const url = googleDirectionsUrl([
      { label: "Eiffel Tower" },
      { label: "Big Ben" },
    ]);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("origin")).toBe("Eiffel Tower");
    expect(parsed.searchParams.get("destination")).toBe("Big Ben");
  });

  it("skips unresolvable points in token list", () => {
    // Only 1 resolvable point → null
    const url = googleDirectionsUrl([
      { lat: 48.8566, lng: 2.3522 },
      {},
    ]);
    expect(url).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// appleDirectionsUrl
// ---------------------------------------------------------------------------

describe("appleDirectionsUrl", () => {
  it("returns null when fewer than 2 points resolve", () => {
    expect(appleDirectionsUrl([])).toBeNull();
    expect(appleDirectionsUrl([{ lat: 48.8566, lng: 2.3522 }])).toBeNull();
    expect(appleDirectionsUrl([{}, {}])).toBeNull();
  });

  it("2-point: sets saddr and daddr from coords", () => {
    const url = appleDirectionsUrl([
      { lat: 48.8566, lng: 2.3522 },
      { lat: 51.5074, lng: -0.1278 },
    ]);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("saddr")).toBe("48.8566,2.3522");
    expect(parsed.searchParams.get("daddr")).toBe("51.5074,-0.1278");
    expect(parsed.origin + parsed.pathname).toBe("https://maps.apple.com/");
  });

  it("multi-point degrades to first→last (saddr/daddr)", () => {
    const url = appleDirectionsUrl([
      { lat: 48.8566, lng: 2.3522 },
      { lat: 45.4642, lng: 9.19 },
      { lat: 41.9028, lng: 12.4964 },
    ]);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("saddr")).toBe("48.8566,2.3522");
    expect(parsed.searchParams.get("daddr")).toBe("41.9028,12.4964");
    // No waypoints param
    expect(parsed.searchParams.get("waypoints")).toBeNull();
  });

  it("text-only points use address as token", () => {
    const url = appleDirectionsUrl([
      { address: "Paris, France" },
      { address: "London, UK" },
    ]);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("saddr")).toBe("Paris, France");
    expect(parsed.searchParams.get("daddr")).toBe("London, UK");
  });

  it("falls back to label when no address and no coords", () => {
    const url = appleDirectionsUrl([
      { label: "Eiffel Tower" },
      { label: "Big Ben" },
    ]);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("saddr")).toBe("Eiffel Tower");
    expect(parsed.searchParams.get("daddr")).toBe("Big Ben");
  });
});
