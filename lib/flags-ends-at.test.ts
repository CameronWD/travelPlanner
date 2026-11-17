import { describe, expect, it } from "vitest";
import { flagTightConnections, type FlagItem, type FlagStop } from "@/lib/flags";
import { hopKeys, type TravelLookup } from "@/lib/travel-times/hops";

const NOW = new Date("2026-11-01T00:00:00Z");
const DAY = "2026-11-10";
const TOWER = { lat: 51.5055, lng: -0.0754 };
const WESTMINSTER = { lat: 51.5008, lng: -0.122 };
const NEXT = { lat: 51.5007, lng: -0.1246 };
const ok = (minutes: number) => ({ status: "OK" as const, minutes, distanceM: 1000, polyline: null });

const london: FlagStop = {
  id: "london", name: "London", arriveDate: "2026-11-08", departDate: "2026-11-12", timezone: "Europe/London",
  sortOrder: 0, lat: TOWER.lat, lng: TOWER.lng, localTravelMode: "DRIVE",
};
const walk: FlagItem = {
  id: "a", title: "Tower Bridge + South Bank walk", stopId: "london", date: DAY, startTime: "10:00", endTime: "12:00",
  lat: TOWER.lat, lng: TOWER.lng, endLat: WESTMINSTER.lat, endLng: WESTMINSTER.lng,
};
const lunch: FlagItem = { id: "b", title: "Lunch", stopId: "london", date: DAY, startTime: "12:25", endTime: "13:00", lat: NEXT.lat, lng: NEXT.lng };

// One lookup serves both cases: the short walk exists only from the end pin, a slow drive only from the start pin.
const lookup: TravelLookup = new Map([
  [hopKeys(WESTMINSTER, NEXT, "DRIVE", null, NOW)[0], ok(3)],
  [hopKeys(TOWER, NEXT, "DRIVE", null, NOW).find((k) => k.startsWith("DRIVE"))!, ok(40)],
]);
const tight = (items: FlagItem[]) => flagTightConnections(items, [], { windingFactor: 1.5, avgSpeedKph: 80, lookup, travelStops: [london] });

describe("tight connections measure from where a thing Ends at", () => {
  it("raises no Flag with the end pin, measuring the 3 min walk from Westminster", () => {
    expect(tight([walk, lunch])).toEqual([]);
  });

  it("raises tight-a-b without the end pin, measuring the 40 min drive from Tower Bridge", () => {
    expect(tight([{ ...walk, endLat: null, endLng: null }, lunch]).map((f) => f.id)).toEqual(["tight-a-b"]);
  });
});
