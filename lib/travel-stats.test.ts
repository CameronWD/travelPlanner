import { describe, expect, it } from "vitest";
import { computeTravelStats, type TravelTrip } from "./travel-stats";

const TODAY = "2026-06-15";

// SYD (home base for the past + current trips) — used for farthestFromHome.
const SYD = { lat: -33.8688, lng: 151.2093 };
const CDG = { lat: 49.0097, lng: 2.5479 };
const FCO = { lat: 41.8003, lng: 12.2389 };
const NRT = { lat: 35.7719, lng: 140.3928 };

// Past trip: Paris (fr) + Rome (it), one flight SYD→CDG, one train CDG→FCO.
const pastTrip: TravelTrip = {
  id: "t1",
  name: "Europe 2025",
  startDate: "2025-01-01",
  endDate: "2025-01-10",
  home: SYD,
  stops: [
    { id: "s1", name: "Paris", countryCode: "FR", lat: CDG.lat, lng: CDG.lng, arriveDate: "2025-01-01", departDate: "2025-01-05" },
    { id: "s2", name: "Rome", countryCode: "IT", lat: FCO.lat, lng: FCO.lng, arriveDate: "2025-01-05", departDate: "2025-01-10" },
  ],
  transports: [
    { mode: "FLIGHT", depAt: "2025-01-01", from: SYD, to: CDG },
    { mode: "TRAIN", depAt: "2025-01-05", from: CDG, to: FCO },
  ],
  accommodations: [
    { checkIn: "2025-01-01", checkOut: "2025-01-05" },
    { checkIn: "2025-01-05", checkOut: "2025-01-10" },
  ],
};

// Current trip: Tokyo (jp), today falls mid-trip.
const currentTrip: TravelTrip = {
  id: "t2",
  name: "Japan 2026",
  startDate: "2026-06-10",
  endDate: "2026-06-20",
  home: SYD,
  stops: [
    { id: "s3", name: "Tokyo", countryCode: "JP", lat: NRT.lat, lng: NRT.lng, arriveDate: "2026-06-10", departDate: "2026-06-20" },
  ],
  transports: [
    { mode: "FLIGHT", depAt: "2026-06-10", from: SYD, to: NRT },
  ],
  accommodations: [
    { checkIn: "2026-06-10", checkOut: "2026-06-20" },
  ],
};

// Future trip: Lisbon (pt), entirely after today. No Home base set.
const futureTrip: TravelTrip = {
  id: "t3",
  name: "Portugal 2027",
  startDate: "2027-03-01",
  endDate: "2027-03-08",
  home: null,
  stops: [
    { id: "s4", name: "Lisbon", countryCode: "PT", lat: -9, lng: 38, arriveDate: "2027-03-01", departDate: "2027-03-08" },
  ],
  transports: [],
  accommodations: [
    { checkIn: "2027-03-01", checkOut: "2027-03-08" },
  ],
};

describe("computeTravelStats", () => {
  it("splits countries into done/planned, planned excluding done", () => {
    const stats = computeTravelStats([pastTrip, currentTrip, futureTrip], TODAY);
    expect(stats.countries.done).toEqual(["fr", "it", "jp"]);
    expect(stats.countries.planned).toEqual(["pt"]);
  });

  it("counts trips done vs planned by startDate <= today", () => {
    const stats = computeTravelStats([pastTrip, currentTrip, futureTrip], TODAY);
    expect(stats.trips).toEqual({ done: 2, planned: 1 });
  });

  it("counts places (Stops) done vs planned", () => {
    const stats = computeTravelStats([pastTrip, currentTrip, futureTrip], TODAY);
    // done: Paris, Rome, Tokyo (arriveDate <= today) — planned: Lisbon
    expect(stats.places).toEqual({ done: 3, planned: 1 });
  });

  it("counts Transport by mode, done when depAt date <= today", () => {
    const stats = computeTravelStats([pastTrip, currentTrip, futureTrip], TODAY);
    expect(stats.transport.FLIGHT).toEqual({ done: 2, planned: 0 });
    expect(stats.transport.TRAIN).toEqual({ done: 1, planned: 0 });
    expect(stats.transport.BUS).toEqual({ done: 0, planned: 0 });
    expect(stats.transport.FERRY).toEqual({ done: 0, planned: 0 });
    expect(stats.transport.CAR).toEqual({ done: 0, planned: 0 });
  });

  it("splits nightsAway across the current trip at today", () => {
    const stats = computeTravelStats([pastTrip, currentTrip, futureTrip], TODAY);
    // past trip: 9 nights done, 0 planned
    // current trip: 5 done (10th-15th), 5 planned (15th-20th)
    // future trip: 0 done, 7 planned
    expect(stats.nightsAway).toEqual({ done: 14, planned: 12 });
  });

  it("splits accommodationNights the same way", () => {
    const stats = computeTravelStats([pastTrip, currentTrip, futureTrip], TODAY);
    expect(stats.accommodationNights).toEqual({ done: 14, planned: 12 });
  });

  it("computes distanceKm split done/planned over legs with both endpoints", () => {
    const stats = computeTravelStats([pastTrip, currentTrip, futureTrip], TODAY);
    // done legs: SYD->CDG, CDG->FCO, SYD->NRT (all depAt <= today)
    const expectedDone =
      haversine(SYD, CDG) + haversine(CDG, FCO) + haversine(SYD, NRT);
    expect(stats.distanceKm.done).toBeCloseTo(expectedDone, 0);
    expect(stats.distanceKm.planned).toBe(0);
  });

  it("picks the longest trip among done (started) trips", () => {
    const stats = computeTravelStats([pastTrip, currentTrip, futureTrip], TODAY);
    // past: 9 nights, current (full length, started): 10 nights -> current wins
    expect(stats.longestTrip).toEqual({ tripId: "t2", name: "Japan 2026", nights: 10 });
  });

  it("picks the most-visited country among done Stops", () => {
    const stats = computeTravelStats([pastTrip, currentTrip, futureTrip], TODAY);
    // fr:1, it:1, jp:1 -> tie, first encountered (fr) wins
    expect(stats.mostVisitedCountry).toEqual({ code: "fr", stops: 1 });
  });

  it("computes farthestFromHome only over trips with a Home base, among done Stops", () => {
    const stats = computeTravelStats([pastTrip, currentTrip, futureTrip], TODAY);
    // done stops with a home: Paris/Rome (home SYD), Tokyo (home SYD)
    // Lisbon has no home base and is planned anyway -> excluded either way
    const farthest = [
      { name: "Paris", km: haversine(SYD, CDG) },
      { name: "Rome", km: haversine(SYD, FCO) },
      { name: "Tokyo", km: haversine(SYD, NRT) },
    ].reduce((a, b) => (b.km > a.km ? b : a));
    expect(stats.farthestFromHome?.stopName).toBe(farthest.name);
    expect(stats.farthestFromHome?.km).toBeCloseTo(farthest.km, 0);
  });

  it("treats a rough Stop (no dates) as planned", () => {
    const roughTrip: TravelTrip = {
      id: "t4",
      name: "Idea trip",
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      home: null,
      stops: [
        { id: "s5", name: "Somewhere", countryCode: "de", lat: null, lng: null, arriveDate: null, departDate: null },
      ],
      transports: [],
      accommodations: [],
    };
    const stats = computeTravelStats([roughTrip], TODAY);
    expect(stats.places).toEqual({ done: 0, planned: 1 });
    expect(stats.countries.planned).toEqual(["de"]);
  });

  it("handles a Trip with no dates (contributes no done/planned nights, counts as planned)", () => {
    const datelessTrip: TravelTrip = {
      id: "t5",
      name: "Someday",
      startDate: null,
      endDate: null,
      home: null,
      stops: [],
      transports: [],
      accommodations: [],
    };
    const stats = computeTravelStats([datelessTrip], TODAY);
    expect(stats.trips).toEqual({ done: 0, planned: 1 });
    expect(stats.nightsAway).toEqual({ done: 0, planned: 0 });
    expect(stats.longestTrip).toBeNull();
  });

  it("returns zeros and nulls for empty input", () => {
    const stats = computeTravelStats([], TODAY);
    expect(stats).toEqual({
      countries: { done: [], planned: [] },
      places: { done: 0, planned: 0 },
      trips: { done: 0, planned: 0 },
      nightsAway: { done: 0, planned: 0 },
      accommodationNights: { done: 0, planned: 0 },
      transport: {
        FLIGHT: { done: 0, planned: 0 },
        TRAIN: { done: 0, planned: 0 },
        BUS: { done: 0, planned: 0 },
        FERRY: { done: 0, planned: 0 },
        CAR: { done: 0, planned: 0 },
      },
      distanceKm: { done: 0, planned: 0 },
      longestTrip: null,
      mostVisitedCountry: null,
      farthestFromHome: null,
    });
  });

  it("ignores OTHER mode for transport counts but includes it in distance", () => {
    const otherTrip: TravelTrip = {
      id: "t6",
      name: "Ferry-less",
      startDate: "2025-06-01",
      endDate: "2025-06-05",
      home: null,
      stops: [],
      transports: [{ mode: "OTHER", depAt: "2025-06-01", from: CDG, to: FCO }],
      accommodations: [],
    };
    const stats = computeTravelStats([otherTrip], TODAY);
    expect(stats.transport.FLIGHT.done).toBe(0);
    expect(stats.transport.TRAIN.done).toBe(0);
    expect(stats.transport.BUS.done).toBe(0);
    expect(stats.transport.FERRY.done).toBe(0);
    expect(stats.transport.CAR.done).toBe(0);
    expect(stats.distanceKm.done).toBeCloseTo(haversine(CDG, FCO), 0);
  });
});

// Local copy of haversine (avoids importing the module under test's own dependency
// just to assert against itself) — same formula as lib/geo.ts, used only to compute
// expected values in these tests.
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
