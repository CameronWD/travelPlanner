import { describe, expect, it } from "vitest";
import { suggestMarkersForTrip } from "./globe-suggestions";
import type { MarkerView } from "@/components/globe/types";

function marker(id: string, overrides: Partial<MarkerView> = {}): MarkerView {
  return {
    id,
    title: id,
    category: "OTHER",
    note: null,
    link: null,
    timing: null,
    lat: null,
    lng: null,
    city: null,
    country: null,
    countryCode: null,
    ...overrides,
  };
}

describe("suggestMarkersForTrip", () => {
  it("includes only markers whose countryCode matches a stop's", () => {
    const markers = [
      marker("jp", { countryCode: "jp" }),
      marker("fr", { countryCode: "fr" }),
      marker("none", { countryCode: null }),
    ];
    const out = suggestMarkersForTrip({
      markers,
      stops: [{ countryCode: "jp", lat: null, lng: null }],
      addedMarkerIds: [],
    });
    expect(out.map((m) => m.id)).toEqual(["jp"]);
  });

  it("matches country codes case-insensitively", () => {
    const out = suggestMarkersForTrip({
      markers: [marker("jp", { countryCode: "JP" })],
      stops: [{ countryCode: "jp", lat: null, lng: null }],
      addedMarkerIds: [],
    });
    expect(out.map((m) => m.id)).toEqual(["jp"]);
  });

  it("excludes already-added markers", () => {
    const out = suggestMarkersForTrip({
      markers: [marker("a", { countryCode: "jp" }), marker("b", { countryCode: "jp" })],
      stops: [{ countryCode: "jp", lat: null, lng: null }],
      addedMarkerIds: ["a"],
    });
    expect(out.map((m) => m.id)).toEqual(["b"]);
  });

  it("ranks matched markers by proximity to the nearest stop (nearest first)", () => {
    // Stop at Tokyo (35.68, 139.69). 'near' is Tokyo Tower; 'far' is Osaka.
    const markers = [
      marker("far", { countryCode: "jp", lat: 34.69, lng: 135.5 }),
      marker("near", { countryCode: "jp", lat: 35.66, lng: 139.75 }),
    ];
    const out = suggestMarkersForTrip({
      markers,
      stops: [{ countryCode: "jp", lat: 35.68, lng: 139.69 }],
      addedMarkerIds: [],
    });
    expect(out.map((m) => m.id)).toEqual(["near", "far"]);
  });

  it("sorts markers without coordinates last, preserving input order among them", () => {
    const markers = [
      marker("noCoordsA", { countryCode: "jp" }),
      marker("located", { countryCode: "jp", lat: 35.66, lng: 139.75 }),
      marker("noCoordsB", { countryCode: "jp" }),
    ];
    const out = suggestMarkersForTrip({
      markers,
      stops: [{ countryCode: "jp", lat: 35.68, lng: 139.69 }],
      addedMarkerIds: [],
    });
    expect(out.map((m) => m.id)).toEqual(["located", "noCoordsA", "noCoordsB"]);
  });

  it("returns [] when no stop has a countryCode", () => {
    const out = suggestMarkersForTrip({
      markers: [marker("jp", { countryCode: "jp" })],
      stops: [{ countryCode: null, lat: 1, lng: 1 }],
      addedMarkerIds: [],
    });
    expect(out).toEqual([]);
  });
});
