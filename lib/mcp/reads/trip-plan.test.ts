import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireTripAccess, stopFindMany, transportFindMany, chapterFindMany, itemFindMany, tripFindUnique, dayTitleFindMany } =
  vi.hoisted(() => ({
    requireTripAccess: vi.fn(),
    stopFindMany: vi.fn(),
    transportFindMany: vi.fn(),
    chapterFindMany: vi.fn(),
    itemFindMany: vi.fn(),
    tripFindUnique: vi.fn(),
    dayTitleFindMany: vi.fn(),
  }));

vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUnique },
    stop: { findMany: stopFindMany },
    transport: { findMany: transportFindMany },
    chapter: { findMany: chapterFindMany },
    item: { findMany: itemFindMany },
    dayTitle: { findMany: dayTitleFindMany },
  },
}));

import { loadTripPlanForMcp } from "./trip-plan";

const TRIP_ID = "trip-1";

describe("loadTripPlanForMcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    tripFindUnique.mockResolvedValue({
      name: "Japan",
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      hardEndDate: "2026-01-12",
      homeCurrency: "AUD",
      homeName: "Sydney",
      roundTrip: true,
    });
    stopFindMany.mockResolvedValue([
      {
        id: "stopA",
        name: "Tokyo",
        countryCode: "jp",
        arriveDate: "2026-01-01",
        departDate: "2026-01-03",
        nights: null,
        pinned: false,
        chapterId: null,
        notes: "Bring sunscreen",
        sortOrder: 0,
        accommodations: [],
      },
      {
        id: "stopB",
        name: "Someday Osaka",
        countryCode: "jp",
        arriveDate: null,
        departDate: null,
        nights: 3,
        pinned: false,
        chapterId: null,
        notes: null,
        sortOrder: 1,
        accommodations: [],
      },
    ]);
    transportFindMany.mockResolvedValue([
      {
        id: "t1",
        mode: "FLIGHT",
        fromStopId: null,
        toStopId: "stopA",
        depIsHome: true,
        arrIsHome: false,
        depAt: new Date("2025-12-31T22:00:00Z"),
        arrAt: new Date("2026-01-01T10:00:00Z"),
        reference: "QF1",
      },
    ]);
    chapterFindMany.mockResolvedValue([{ id: "c1", name: "Asia", startDate: "2026-01-01", endDate: "2026-01-10" }]);
    // item.findMany is called twice: things-to-do (date: null) then scheduled (date: not null).
    itemFindMany.mockImplementation(({ where }: { where: { date?: unknown } }) => {
      if (where.date === null) {
        return Promise.resolve([
          {
            id: "item-todo",
            title: "Visit museum",
            category: "ACTIVITY",
            startTime: null,
            endTime: null,
            address: null,
            link: null,
            booking: null,
            notes: null,
            stopId: "stopA",
          },
        ]);
      }
      return Promise.resolve([
        {
          id: "item-arrive",
          title: "Arrive and settle",
          category: "ACTIVITY",
          date: "2026-01-01",
          startTime: null,
          endTime: null,
          address: null,
          link: null,
          booking: null,
          notes: null,
          stopId: "stopA",
        },
        {
          id: "item-breakfast",
          title: "Breakfast",
          category: "FOOD",
          date: "2026-01-02",
          startTime: "10:00",
          endTime: null,
          address: null,
          link: null,
          booking: null,
          notes: null,
          stopId: "stopA",
        },
      ]);
    });
    dayTitleFindMany.mockResolvedValue([{ stopId: "stopA", dayIndex: 0, title: "Day one" }]);
  });

  it("checks access before any db read", async () => {
    await loadTripPlanForMcp(TRIP_ID);
    const accessOrder = requireTripAccess.mock.invocationCallOrder[0]!;
    for (const mock of [tripFindUnique, stopFindMany, transportFindMany, chapterFindMany, itemFindMany, dayTitleFindMany]) {
      expect(mock.mock.invocationCallOrder[0]!).toBeGreaterThan(accessOrder);
    }
  });

  it("scopes every query to the real plan (forkId: null)", async () => {
    await loadTripPlanForMcp(TRIP_ID);
    expect(stopFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }));
    expect(transportFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }));
    expect(chapterFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }));
    for (const call of itemFindMany.mock.calls) {
      expect(call[0].where).toEqual(expect.objectContaining({ forkId: null }));
    }
  });

  it("never resolves or accepts a forkId", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    expect(plan).not.toHaveProperty("forkId");
  });

  it("returns the trip with home base and currency", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    expect(plan.trip).toEqual({
      id: TRIP_ID,
      name: "Japan",
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      hardEndDate: "2026-01-12",
      homeCurrency: "AUD",
      homeBase: "Sydney",
      roundTrip: true,
    });
  });

  it("orders stops in plan order and marks a date-less stop rough", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    expect(plan.stops.map((s) => s.id)).toEqual(["stopA", "stopB"]);
    expect(plan.stops[1]).toMatchObject({ rough: true, nights: 3, arriveDate: null, departDate: null, days: [] });
  });

  it("groups the unscheduled thing-to-do under its Stop, separate from scheduled days", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    const stopA = plan.stops[0]!;
    expect(stopA.thingsToDo).toEqual([
      { id: "item-todo", title: "Visit museum", category: "ACTIVITY", address: null, link: null, booking: null, notes: null },
    ]);
  });

  it("groups scheduled Items under the right day, with the Day title attached", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    const stopA = plan.stops[0]!;
    expect(stopA.days).toHaveLength(3); // arrive..depart inclusive: 01-01, 01-02, 01-03
    expect(stopA.days[0]).toEqual({
      date: "2026-01-01",
      dayTitle: "Day one",
      items: [
        {
          id: "item-arrive",
          title: "Arrive and settle",
          category: "ACTIVITY",
          startTime: null,
          endTime: null,
          address: null,
          link: null,
          booking: null,
          notes: null,
        },
      ],
    });
    expect(stopA.days[1]).toMatchObject({ date: "2026-01-02", dayTitle: null });
    expect(stopA.days[1]!.items[0]).toMatchObject({ id: "item-breakfast", startTime: "10:00" });
    expect(stopA.days[2]).toMatchObject({ date: "2026-01-03", items: [] });
  });

  it("resolves a transport's home/stop endpoints", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    expect(plan.transports).toEqual([
      {
        id: "t1",
        mode: "FLIGHT",
        from: { home: true },
        to: { stopId: "stopA", name: "Tokyo" },
        depAt: new Date("2025-12-31T22:00:00Z").toISOString(),
        arrAt: new Date("2026-01-01T10:00:00Z").toISOString(),
        reference: "QF1",
      },
    ]);
  });

  it("returns chapters", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    expect(plan.chapters).toEqual([{ id: "c1", name: "Asia", startDate: "2026-01-01", endDate: "2026-01-10" }]);
  });

  it("propagates a not-found from requireTripAccess without reading the db", async () => {
    requireTripAccess.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    await expect(loadTripPlanForMcp(TRIP_ID)).rejects.toThrow();
    expect(stopFindMany).not.toHaveBeenCalled();
  });
});
