import { describe, expect, it } from "vitest";
import { locatedTravelMapTrips } from "./travel-map-trips";

describe("locatedTravelMapTrips", () => {
  it("keeps only Trips with at least one located point", () => {
    const located = { id: "t1", points: [{ lat: 1, lng: 2, name: "Tokyo" }] };
    const unlocated = { id: "t2", points: [] };

    expect(locatedTravelMapTrips([located, unlocated])).toEqual([located]);
  });

  it("returns an empty array when no Trip has a located point", () => {
    expect(locatedTravelMapTrips([{ id: "t1", points: [] }])).toEqual([]);
  });

  it("returns an empty array for an empty input", () => {
    expect(locatedTravelMapTrips([])).toEqual([]);
  });
});
