import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/geo";
import { NEAR_STOP_KM } from "@/lib/schedule-day-options";
import { wishlistNear } from "@/lib/wishlist-near";

const PARIS = { lat: 48.8566, lng: 2.3522 };
const ROME = { lat: 41.9028, lng: 12.4964 };

const stops = [
  { id: "s1", name: "Paris", ...PARIS },
  { id: "s2", name: "Rome", ...ROME },
  { id: "s3", name: "Paris", ...PARIS },
];

const ideas = [
  { id: "colosseum", lat: 41.8902, lng: 12.4922 },
  { id: "louvre", lat: 48.8606, lng: 2.3376 },
  { id: "versailles", lat: 48.8049, lng: 2.1204 },
  { id: "lights" },
  { id: "lisbon", lat: 38.7139, lng: -9.1334 },
];

describe("wishlistNear", () => {
  it("chips are All, each named Stop with something near it in route order, then Elsewhere", () => {
    const { chips } = wishlistNear(ideas, stops);
    expect(chips.map((c) => c.label)).toEqual(["All", "Near Paris", "Near Rome", "Elsewhere"]);
    expect(chips.map((c) => c.count)).toEqual([5, 2, 1, 2]);
  });

  it("two Stops with one name share a chip", () => {
    const { chips } = wishlistNear(ideas, stops);
    expect(chips.filter((c) => c.label === "Near Paris")).toHaveLength(1);
  });

  it("an idea near two differently named Stops is in both chips and labelled with the nearer", () => {
    const near = wishlistNear(
      [{ id: "mid", lat: 48.9, lng: 2.4 }],
      [
        { id: "a", name: "Far", lat: 49.2, lng: 2.4 },
        { id: "b", name: "Close", lat: 48.85, lng: 2.4 },
      ],
    );
    expect(near.inChip("mid", "near:Far")).toBe(true);
    expect(near.inChip("mid", "near:Close")).toBe(true);
    expect(near.nearLabel.get("mid")).toBe("Near Close");
    expect(near.chips.map((c) => c.count)).toEqual([1, 1, 1]);
  });

  it("an idea with no coordinates, or near no Stop, is Elsewhere and has no label", () => {
    const near = wishlistNear(ideas, stops);
    expect(near.inChip("lights", "elsewhere")).toBe(true);
    expect(near.inChip("lisbon", "elsewhere")).toBe(true);
    expect(near.inChip("louvre", "elsewhere")).toBe(false);
    expect(near.nearLabel.has("lights")).toBe(false);
    expect(near.nearLabel.has("lisbon")).toBe(false);
    expect(near.nearLabel.get("louvre")).toBe("Near Paris");
  });

  it("a Stop exactly 50 km away counts as near", () => {
    const edge = { lat: PARIS.lat + (NEAR_STOP_KM / 6371) * (180 / Math.PI), lng: PARIS.lng };
    expect(Math.abs(haversineKm(PARIS, edge) - NEAR_STOP_KM)).toBeLessThan(1e-6);
    const near = wishlistNear([{ id: "edge", ...edge }], [{ id: "s", name: "Paris", ...PARIS }]);
    expect(near.inChip("edge", "near:Paris")).toBe(true);
  });

  it("no chips when every idea is near nothing and there is nothing to choose between", () => {
    expect(wishlistNear([], stops).chips).toEqual([]);
    expect(wishlistNear([ideas[3], ideas[4]], stops).chips).toEqual([]);
  });

  it("inChip all is always true; an unknown chip key is false", () => {
    const near = wishlistNear(ideas, stops);
    expect(near.inChip("lights", "all")).toBe(true);
    expect(near.inChip("louvre", "near:Atlantis")).toBe(false);
  });
});
