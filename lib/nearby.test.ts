import { describe, it, expect } from "vitest";
import { nearbyWishlistItems, NEARBY_RADIUS_KM } from "./nearby";

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
