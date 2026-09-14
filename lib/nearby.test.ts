import { describe, it, expect } from "vitest";
import { nearbyWishlistItems, NEARBY_RADIUS_KM, dayIdeasWishlist, STOP_NEARBY_RADIUS_KM } from "./nearby";

const anchors = [{ lat: 41.9028, lng: 12.4964 }]; // Rome centre

describe("nearbyWishlistItems", () => {
  it("returns items within the radius, nearest first, with distance", () => {
    const res = nearbyWishlistItems({
      anchors,
      candidates: [
        { id: "near", title: "Close", category: "FOOD", lat: 41.9035, lng: 12.4970 },   // ~100m
        { id: "far", title: "Far", category: "FOOD", lat: 48.8566, lng: 2.3522 },        // Paris — far
        { id: "mid", title: "Mid", category: "FOOD", lat: 41.9100, lng: 12.5050 },       // ~1.1km
      ],
    });
    expect(res.map((r) => r.id)).toEqual(["near", "mid"]);
    expect(res[0].distanceKm).toBeLessThan(res[1].distanceKm);
    expect(res[0]).toMatchObject({ title: "Close", category: "FOOD" });
  });

  it("returns [] when there are no anchors", () => {
    expect(nearbyWishlistItems({ anchors: [], candidates: [{ id: "x", title: "x", category: "FOOD", lat: 41.9, lng: 12.5 }] })).toEqual([]);
  });

  it("respects a custom radius", () => {
    const res = nearbyWishlistItems({ anchors, candidates: [{ id: "mid", title: "Mid", category: "FOOD", lat: 41.9100, lng: 12.5050 }], radiusKm: 0.5 });
    expect(res).toEqual([]);
    expect(NEARBY_RADIUS_KM).toBe(1.5);
  });
});

describe("dayIdeasWishlist", () => {
  const munich = { lat: 48.14, lng: 11.58, countryCode: "de" };

  it("includes located ideas within 30km as nearby, ordered by distance", () => {
    const res = dayIdeasWishlist({
      stop: munich,
      candidates: [
        // Dachau, ~17km from central Munich
        { id: "dachau", title: "Dachau memorial", category: "SIGHT", lat: 48.26, lng: 11.4342, countryCode: "de" },
        // Marienplatz, ~0.5km from the stop coordinate
        { id: "marienplatz", title: "Marienplatz market", category: "FOOD", lat: 48.1374, lng: 11.5755, countryCode: "de" },
        // Nymphenburg Palace, ~6km from central Munich
        { id: "nymphenburg", title: "Nymphenburg Palace", category: "SIGHT", lat: 48.1583, lng: 11.5033, countryCode: "de" },
      ],
    });
    expect(res.map((r) => r.id)).toEqual(["marienplatz", "nymphenburg", "dachau"]);
    expect(res.every((r) => r.reason === "nearby")).toBe(true);
    expect(res[0].distanceKm).toBeLessThan(res[1].distanceKm!);
    expect(res[1].distanceKm).toBeLessThan(res[2].distanceKm!);
    expect(STOP_NEARBY_RADIUS_KM).toBe(30);
  });

  it("includes far-away same-country ideas as country matches", () => {
    // Nuremberg Christmas markets, ~150km from Munich — outside the 30km radius
    // but still within Germany.
    const res = dayIdeasWishlist({
      stop: munich,
      candidates: [
        { id: "nuremberg", title: "Nuremberg Christmas market", category: "SIGHT", lat: 49.4521, lng: 11.0767, countryCode: "de" },
      ],
    });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: "nuremberg", title: "Nuremberg Christmas market", category: "SIGHT", reason: "country" });
    expect(res[0].distanceKm).toBeGreaterThan(STOP_NEARBY_RADIUS_KM);
  });

  it("includes unlocated, uncountried jots", () => {
    const res = dayIdeasWishlist({
      stop: munich,
      candidates: [
        { id: "mug", title: "Find a Christmas market mug", category: "SHOPPING", lat: null, lng: null, countryCode: null },
      ],
    });
    expect(res).toEqual([
      { id: "mug", title: "Find a Christmas market mug", category: "SHOPPING", distanceKm: null, reason: "unlocated" },
    ]);
  });

  it("excludes ideas that are provably elsewhere", () => {
    const res = dayIdeasWishlist({
      stop: munich,
      candidates: [
        // Located in Paris, a different country and far outside the radius.
        { id: "paris-located", title: "Louvre", category: "SIGHT", lat: 48.8566, lng: 2.3522, countryCode: "fr" },
        // Not located, but tagged for a different country.
        { id: "paris-unlocated", title: "French bakery jot", category: "FOOD", lat: null, lng: null, countryCode: "fr" },
      ],
    });
    expect(res).toEqual([]);
  });

  it("falls back to country+unlocated when the stop has no coordinates", () => {
    const stop = { lat: null, lng: null, countryCode: "de" };
    const res = dayIdeasWishlist({
      stop,
      candidates: [
        // Located, matching country — cannot be "nearby" without stop coordinates,
        // but still matches on country.
        { id: "nuremberg", title: "Nuremberg Christmas market", category: "SIGHT", lat: 49.4521, lng: 11.0767, countryCode: "de" },
        // No location, no country — always surfaces.
        { id: "mug", title: "Find a Christmas market mug", category: "SHOPPING", lat: null, lng: null, countryCode: null },
        // Located, different country — provably elsewhere, excluded.
        { id: "paris-located", title: "Louvre", category: "SIGHT", lat: 48.8566, lng: 2.3522, countryCode: "fr" },
      ],
    });
    expect(res.map((r) => r.id)).toEqual(["nuremberg", "mug"]);
    expect(res.map((r) => r.reason)).toEqual(["country", "unlocated"]);
  });
});
