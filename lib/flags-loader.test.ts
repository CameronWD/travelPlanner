import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  stop: { findMany: vi.fn() },
  transport: { findMany: vi.fn() },
  accommodation: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
}));
const requireTripAccess = vi.hoisted(() => vi.fn());
const getTripProjection = vi.hoisted(() => vi.fn());
const detectFlags = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/server/actions/stops", () => ({ getTripProjection }));
vi.mock("@/lib/flags", async (orig) => ({
  ...(await orig<typeof import("./flags")>()),
  detectFlags,
}));

import { loadFlags } from "./flags-loader";

const TRIP_ID = "trip-1";
const notFoundErr = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

const BASE_TRIP = {
  startDate: "2026-01-01",
  endDate: "2026-01-10",
  hardEndDate: null,
  drivingWindingFactor: 1.5,
  drivingAvgSpeedKph: 80,
  homeName: null,
  homeLat: null,
  homeLng: null,
  homeCountryCode: null,
  roundTrip: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
  db.trip.findUnique.mockResolvedValue(BASE_TRIP);
  db.stop.findMany.mockResolvedValue([]);
  db.transport.findMany.mockResolvedValue([]);
  db.accommodation.findMany.mockResolvedValue([]);
  db.item.findMany.mockResolvedValue([]);
  getTripProjection.mockResolvedValue({ projectedEnd: null, hardEndDate: null, deadline: null });
  detectFlags.mockReturnValue([]);
});

describe("loadFlags", () => {
  it("checks access before querying anything", async () => {
    requireTripAccess.mockRejectedValue(notFoundErr());
    await expect(loadFlags(TRIP_ID)).rejects.toThrow();
    expect(db.trip.findUnique).not.toHaveBeenCalled();
  });

  it("reads every Plan query on the real plan (forkId: null)", async () => {
    await loadFlags(TRIP_ID);
    for (const k of ["stop", "transport", "accommodation", "item"] as const) {
      expect(db[k].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripId: TRIP_ID, forkId: null }) }));
    }
  });

  it("a date-less trip returns [] without reading the plan", async () => {
    db.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, startDate: null, endDate: null });
    const result = await loadFlags(TRIP_ID);
    expect(result).toEqual([]);
    expect(db.stop.findMany).not.toHaveBeenCalled();
    expect(getTripProjection).not.toHaveBeenCalled();
  });

  it("gets its own projection via getTripProjection and feeds it to detectFlags", async () => {
    getTripProjection.mockResolvedValue({ projectedEnd: "2026-01-11", hardEndDate: "2026-01-10", deadline: { kind: "hard-end", date: "2026-01-10" } });
    await loadFlags(TRIP_ID);
    expect(getTripProjection).toHaveBeenCalledWith(TRIP_ID);
    expect(detectFlags).toHaveBeenCalledWith(
      expect.objectContaining({
        tripStart: "2026-01-01",
        tripEnd: "2026-01-10",
        projectedEnd: "2026-01-11",
        hardEndDate: "2026-01-10",
        deadline: { kind: "hard-end", date: "2026-01-10" },
      }),
    );
  });

  it("returns detectFlags' result", async () => {
    const flags = [{ id: "f1", severity: "warning" as const, message: "No stay booked", targetType: "STOP" as const }];
    detectFlags.mockReturnValue(flags);
    expect(await loadFlags(TRIP_ID)).toEqual(flags);
  });

  it("derives first/last stop across dated and rough stops together, by sortOrder", async () => {
    db.stop.findMany.mockResolvedValue([
      { id: "s1", name: "Rome", lat: null, lng: null, timezone: "Europe/Rome", arriveDate: "2026-01-02", departDate: "2026-01-05", sortOrder: 0 },
      { id: "s2", name: "Rough idea", lat: null, lng: null, timezone: null, arriveDate: null, departDate: null, sortOrder: 1 },
    ]);
    await loadFlags(TRIP_ID);
    expect(detectFlags).toHaveBeenCalledWith(
      expect.objectContaining({
        roughStopCount: 1,
        homeFirstStop: { id: "s1", name: "Rome", sortOrder: 0 },
        homeLastStop: { id: "s2", name: "Rough idea", sortOrder: 1 },
      }),
    );
  });
});
