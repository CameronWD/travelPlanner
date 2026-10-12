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
const loadSurpriseVisibilityMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});
vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/server/actions/stops", () => ({ getTripProjection }));
vi.mock("@/lib/flags", async (orig) => ({
  ...(await orig<typeof import("./flags")>()),
  detectFlags,
}));

import { loadFlags, flagsFromRows } from "./flags-loader";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

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
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
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
    await expect(loadFlags(TRIP_ID, "u1")).rejects.toThrow();
    expect(db.trip.findUnique).not.toHaveBeenCalled();
  });

  it("reads every Plan query on the real plan (forkId: null)", async () => {
    await loadFlags(TRIP_ID, "u1");
    for (const k of ["stop", "transport", "accommodation", "item"] as const) {
      expect(db[k].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripId: TRIP_ID, forkId: null }) }));
    }
  });

  it("a date-less trip returns [] without reading the plan", async () => {
    db.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, startDate: null, endDate: null });
    const result = await loadFlags(TRIP_ID, "u1");
    expect(result).toEqual([]);
    expect(db.stop.findMany).not.toHaveBeenCalled();
    expect(getTripProjection).not.toHaveBeenCalled();
  });

  it("gets its own projection via getTripProjection and feeds it to detectFlags", async () => {
    getTripProjection.mockResolvedValue({ projectedEnd: "2026-01-11", hardEndDate: "2026-01-10", deadline: { kind: "hard-end", date: "2026-01-10" } });
    await loadFlags(TRIP_ID, "u1");
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
    expect(await loadFlags(TRIP_ID, "u1")).toEqual(flags);
  });

  it("derives first/last stop across dated and rough stops together, by sortOrder", async () => {
    db.stop.findMany.mockResolvedValue([
      { id: "s1", name: "Rome", lat: null, lng: null, timezone: "Europe/Rome", arriveDate: "2026-01-02", departDate: "2026-01-05", sortOrder: 0 },
      { id: "s2", name: "Rough idea", lat: null, lng: null, timezone: null, arriveDate: null, departDate: null, sortOrder: 1 },
    ]);
    await loadFlags(TRIP_ID, "u1");
    expect(detectFlags).toHaveBeenCalledWith(
      expect.objectContaining({
        roughStopCount: 1,
        homeFirstStop: { id: "s1", name: "Rome", sortOrder: 0 },
        homeLastStop: { id: "s2", name: "Rough idea", sortOrder: 1 },
      }),
    );
  });
});

describe("loadFlags — Surprise (ADR 0051)", () => {
  it("reads Accommodations and Items through the viewer's fragments; Stops and Transport whole", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ hiddenStopIds: ["s1"] }));
    await loadFlags(TRIP_ID, "u-viewer");
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith(TRIP_ID, "u-viewer");
    expect(loadSurpriseVisibilityMock.mock.invocationCallOrder[0]).toBeLessThan(db.item.findMany.mock.invocationCallOrder[0]);
    expect(db.accommodation.findMany.mock.calls[0][0].where).toEqual({ tripId: TRIP_ID, forkId: null, ...MARKER_WHERE.accommodation });
    expect(db.item.findMany.mock.calls[0][0].where).toEqual({ tripId: TRIP_ID, forkId: null, ...MARKER_WHERE.item });
    expect(JSON.stringify(db.stop.findMany.mock.calls[0][0])).not.toContain("surpriseMarker");
    expect(JSON.stringify(db.transport.findMany.mock.calls[0][0])).not.toContain("surpriseMarker");
  });
});

describe("flagsFromRows", () => {
  const PROJECTION = { projectedEnd: "2026-01-11", hardEndDate: "2026-01-10", deadline: null };

  it("does no I/O — assembles detectFlags' input straight from the given rows and projection", () => {
    flagsFromRows({
      trip: BASE_TRIP,
      allStops: [{ id: "s1", name: "Rome", lat: null, lng: null, timezone: "Europe/Rome", arriveDate: "2026-01-02", departDate: "2026-01-05", sortOrder: 0 }],
      transports: [],
      accommodations: [],
      items: [],
      tripStart: "2026-01-01",
      tripEnd: "2026-01-10",
      projection: PROJECTION,
    });
    expect(db.trip.findUnique).not.toHaveBeenCalled();
    expect(requireTripAccess).not.toHaveBeenCalled();
    expect(getTripProjection).not.toHaveBeenCalled();
    expect(detectFlags).toHaveBeenCalledWith(
      expect.objectContaining({
        tripStart: "2026-01-01",
        tripEnd: "2026-01-10",
        projectedEnd: "2026-01-11",
        hardEndDate: "2026-01-10",
        deadline: null,
        roughStopCount: 0,
        drivingWindingFactor: 1.5,
        drivingAvgSpeedKph: 80,
      }),
    );
  });

  it("is what loadFlags calls internally after its own fetch and its own getTripProjection", async () => {
    getTripProjection.mockResolvedValue(PROJECTION);
    await loadFlags(TRIP_ID, "u1");
    const fromLoadFlags = detectFlags.mock.calls[0][0];
    detectFlags.mockClear();
    flagsFromRows({
      trip: BASE_TRIP,
      allStops: [],
      transports: [],
      accommodations: [],
      items: [],
      tripStart: "2026-01-01",
      tripEnd: "2026-01-10",
      projection: PROJECTION,
    });
    expect(detectFlags.mock.calls[0][0]).toEqual(fromLoadFlags);
  });
});
