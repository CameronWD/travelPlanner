import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  userFind: vi.fn(),
  yourTravels: vi.fn(),
  nextSteps: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { tripMember: { findMany: m.findMany }, user: { findUnique: m.userFind } } }));
vi.mock("@/lib/travel-stats-loader", () => ({ loadYourTravels: m.yourTravels }));
vi.mock("@/lib/next-steps-loader", () => ({ loadNextSteps: m.nextSteps }));

import { loadTripsPage } from "./trips-page-loader";

const TODAY = "2026-09-28";
const stop = (id: string, name: string, lat: number, lng: number, arrive: string, depart: string, sortOrder: number) => ({
  id, name, lat, lng, arriveDate: arrive, departDate: depart, nights: null, sortOrder, timezone: "Europe/Paris", countryCode: "fr",
});
const trip = (over: Record<string, unknown>) => ({
  id: "t", name: "Trip", startDate: null, endDate: null, createdAt: new Date("2026-01-01"), coverImageKey: null,
  coverFocalX: null, coverFocalY: null, homeLat: null, homeLng: null, stops: [], ...over,
});

beforeEach(() => {
  m.userFind.mockResolvedValue({ id: "u", name: "Cameron Williams", image: null, displayName: null, photoKey: null, photoUpdatedAt: null });
  m.yourTravels.mockResolvedValue({ stats: { countries: { done: [], planned: [] }, places: { done: 0, planned: 0 }, trips: { done: 0, planned: 0 }, nightsAway: { done: 0, planned: 0 }, accommodationNights: { done: 0, planned: 0 }, transport: { FLIGHT: { done: 0, planned: 0 }, TRAIN: { done: 0, planned: 0 }, BUS: { done: 0, planned: 0 }, FERRY: { done: 0, planned: 0 }, CAR: { done: 0, planned: 0 } }, distanceKm: { done: 0, planned: 0 }, longestTrip: null, mostVisitedCountry: null, farthestFromHome: null }, mapTrips: [] });
  m.nextSteps.mockResolvedValue([]);
});

describe("loadTripsPage", () => {
  it("first run: no cards, Nothing planned yet, no stops", async () => {
    m.findMany.mockResolvedValue([]);
    const d = await loadTripsPage("u", TODAY);
    expect(d.firstName).toBe("Cameron");
    expect(d.cards).toEqual([]);
    expect(d.counts).toEqual({ upcoming: 0, done: 0 });
    expect(d.anyStops).toBe(false);
  });
  it("builds hero + standard models in carousel order with hues, covers and the next step", async () => {
    m.findMany.mockResolvedValue([
      { role: "owner", trip: trip({ id: "nz", name: "New Zealand", startDate: "2027-04-23", endDate: "2027-05-03", createdAt: new Date("2026-02-01") }) },
      { role: "owner", trip: trip({ id: "eu", name: "Christmas in Europe 2026", startDate: "2026-12-04", endDate: "2027-01-08", createdAt: new Date("2026-01-01"), coverImageKey: "k1", stops: [stop("s1", "London", 51.5, -0.12, "2026-12-08", "2026-12-13", 0), stop("s2", "Rome", 41.9, 12.5, "2026-12-13", "2027-01-08", 1)] }) },
      { role: "member", trip: trip({ id: "old", name: "Bali", startDate: "2025-03-01", endDate: "2025-03-10", createdAt: new Date("2025-01-01") }) },
    ]);
    m.nextSteps.mockResolvedValue([{ id: "nudge-transport-times", title: "Add times to 6 transport legs", href: "/trips/eu/plan", severity: "info", source: "nudge", kind: "transport" }]);
    m.yourTravels.mockResolvedValue({ ...(await m.yourTravels()), mapTrips: [{ id: "eu", name: "Christmas in Europe 2026", dateLabel: "x", when: "upcoming", points: [{ lat: 51.5, lng: -0.12, name: "London" }] }] });
    const d = await loadTripsPage("u", TODAY);
    expect(d.cards.map((c) => c.id)).toEqual(["eu", "nz", "old"]);
    expect(d.cards[0].kind).toBe("up-next");
    expect(d.cards[0].big).toEqual({ value: "67", unit: ["sleeps", "to go"] });
    expect(d.cards[0].dateLine).toBe("4 Dec – 8 Jan · 2 stops");
    expect(d.cards[0].nextStep?.title).toBe("Add times to 6 transport legs");
    expect(d.cards[0].cover.photo?.url).toBe("/api/trips/eu/cover?v=k1");
    expect(d.cards[0].cover.stops.map((s) => s.nights)).toEqual([5, 26]);
    expect(d.cards[0].cover.hue).toBe("teal");    // eu created 2026-01-01: second-oldest
    expect(d.cards[1].kind).toBe("planning");
    expect(d.cards[1].cover.hue).toBe("leaf");    // nz created 2026-02-01: third
    expect(d.cards[2].kind).toBe("done");
    expect(d.cards[2].cover.hue).toBe("coral");   // old created 2025-01-01: oldest → coral
    expect(d.counts).toEqual({ upcoming: 2, done: 1 });
    expect(d.hasDoneTrip).toBe(true);
    expect(d.anyStops).toBe(true);
    expect(d.mapTrips[0].hue).toBe(d.cards[0].cover.hue);
    expect(m.nextSteps).toHaveBeenCalledTimes(1);
  });
});
