import { describe, it, expect } from "vitest";
import { tallyFor, defaultTallyMode, formatKm } from "./tally";
import type { TravelStats } from "@/lib/travel-stats";

const pair = (done: number, planned: number) => ({ done, planned });
const stats: TravelStats = {
  countries: { done: ["fr", "it", "nz"], planned: ["id", "jp"] },
  places: pair(4, 12), trips: pair(1, 3), nightsAway: pair(9, 45), accommodationNights: pair(0, 20),
  transport: { FLIGHT: pair(2, 6), TRAIN: pair(0, 3), BUS: pair(0, 0), FERRY: pair(0, 0), CAR: pair(0, 0) },
  distanceKm: pair(2140, 36309), longestTrip: null, mostVisitedCountry: null, farthestFromHome: null,
};

describe("tallyFor", () => {
  it("been: countries visited + places, nights, km, flights in order, zeros dropped", () => {
    const t = tallyFor(stats, "been");
    expect(t.countries).toBe(3);
    expect(t.headline).toEqual(["countries", "visited"]);
    expect(t.cells).toEqual([
      { key: "places", label: "places", value: "4" },
      { key: "nights", label: "nights away", value: "9" },
      { key: "km", label: "travelled", value: "2,140 km" },
      { key: "flights", label: "flights", value: "2" },
    ]);
  });
  it("planned: on the list + nights booked + trains", () => {
    const t = tallyFor(stats, "planned");
    expect(t.headline).toEqual(["countries", "on the list"]);
    expect(t.cells.map((c) => c.key)).toEqual(["places", "nights", "km", "booked", "flights", "trains"]);
    expect(t.cells.find((c) => c.key === "km")!.value).toBe("36,309 km");
  });
});

describe("defaultTallyMode", () => {
  it("been when a trip is done, else planned", () => {
    expect(defaultTallyMode(true)).toBe("been");
    expect(defaultTallyMode(false)).toBe("planned");
  });
});

describe("formatKm", () => {
  it("thousands separator and short form", () => {
    expect(formatKm(36309)).toBe("36,309 km");
    expect(formatKm(36309, true)).toBe("36k km");
    expect(formatKm(950, true)).toBe("950 km");
  });
});
