import { describe, expect, it } from "vitest";
import { trip, stop, transport, stay, item, cost, chapter, traveller, datedTripFixture } from "./index";

describe("row builders", () => {
  it("trip() is a dated real-plan Trip with a Home base and a timezone", () => {
    const t = trip();
    expect(t.id).toBe("trip-1");
    expect(t.startDate).toBe("2026-11-01");
    expect(t.endDate).toBe("2026-11-10");
    expect(t.homeName).toBe("Sydney");
    expect(t.homeTimezone).toBe("Australia/Sydney");
    expect(t.forksEnabled).toBe(false);
    expect(t.deletedAt).toBeNull();
  });
  it("overrides win and ids are stable per call", () => {
    expect(stop({ id: "s9", name: "Rome" })).toMatchObject({ id: "s9", name: "Rome", forkId: null });
    expect(stop().id).toBe("stop-1");
    expect(stop({ sortOrder: 2 }).sortOrder).toBe(2);
  });
  it("datedTripFixture() has three dated Stops in order with legs between them", () => {
    const f = datedTripFixture();
    expect(f.stops.map((s) => s.name)).toEqual(["Lisbon", "Madrid", "Barcelona"]);
    expect(f.stops.every((s) => s.arriveDate && s.departDate)).toBe(true);
    expect(f.transports).toHaveLength(2);
    expect(f.transports[0].fromStopId).toBe(f.stops[0].id);
    expect(f.transports[0].toStopId).toBe(f.stops[1].id);
  });
  it("other builders exist with real-plan defaults", () => {
    expect(transport().forkId).toBeNull();
    expect(stay().checkIn).toBe("2026-11-01");
    expect(item().category).toBe("SIGHTSEEING");
    expect(cost().currency).toBe("EUR");
    expect(chapter().colour).toBeTypeOf("string");
    expect(traveller().id).toBe("u1");
  });
});
