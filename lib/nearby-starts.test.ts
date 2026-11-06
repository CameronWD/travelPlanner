import { describe, it, expect } from "vitest";
import { nearbyStartPoints } from "@/lib/day-view-model";

describe("nearbyStartPoints", () => {
  it("orders tonight's stay, the Stop, then located Items, skipping unlocated ones", () => {
    expect(
      nearbyStartPoints({
        tonight: { id: "a1", lat: 1, lng: 2 },
        stop: { id: "s1", name: "Lisbon", lat: 3, lng: 4 },
        items: [
          { id: "i1", title: "Castle", lat: 5, lng: 6 },
          { id: "i2", title: "Nowhere", lat: null, lng: null },
        ],
      }),
    ).toEqual([
      { key: "accommodation:a1", label: "Tonight's stay", from: { kind: "accommodation", id: "a1" } },
      { key: "stop:s1", label: "Lisbon", from: { kind: "stop", id: "s1" } },
      { key: "item:i1", label: "Castle", from: { kind: "item", id: "i1" } },
    ]);
  });

  it("drops an unlocated tonight and Stop", () => {
    expect(
      nearbyStartPoints({ tonight: { id: "a1", lat: null, lng: null }, stop: { id: "s1", name: "Lisbon", lat: 3, lng: null }, items: [] }),
    ).toEqual([]);
  });
});
