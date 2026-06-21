import { describe, expect, it } from "vitest";
import { mapsUrl, appleMapsUrl } from "./maps";

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
