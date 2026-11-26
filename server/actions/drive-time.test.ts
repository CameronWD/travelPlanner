import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility } from "@/test/helpers/surprise-visibility";

const m = vi.hoisted(() => ({
  requirePlanAccess: vi.fn(),
  driveTimeNow: vi.fn(),
  loadSurpriseVisibility: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("@/test/helpers/db-mock");
  return { db: mockDb(["trip", "stop"]) };
});
vi.mock("@/lib/guards", () => ({ requirePlanAccess: m.requirePlanAccess }));
vi.mock("@/lib/travel-times/refresh", () => ({ driveTimeNow: m.driveTimeNow }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/surprise-visibility")>()),
  loadSurpriseVisibility: m.loadSurpriseVisibility,
}));

import { db as realDb } from "@/lib/db";
import type { MockDb } from "@/test/helpers/db-mock";
import { driveTimeForEnds } from "./drive-time";

const db = realDb as unknown as MockDb<"trip" | "stop">;

const BNE = { lat: -27.4698, lng: 153.0251 };
const TWD = { lat: -28.1766, lng: 153.5414 };
const TRIP = { homeLat: -27.5, homeLng: 153.0, drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80 };
const REAL = { minutes: 72, distanceKm: 95, mode: "drive", estimated: false, polyline: null };

function stops(rows: Record<string, { lat: number | null; lng: number | null }>) {
  db.stop.findFirst.mockImplementation(async ({ where }: { where: { id: string; tripId: string; forkId: string | null } }) =>
    where.tripId === "trip-1" && where.forkId === null ? (rows[where.id] ?? null) : null,
  );
}

describe("driveTimeForEnds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requirePlanAccess.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" }, plan: null });
    m.loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
    m.driveTimeNow.mockResolvedValue(REAL);
    db.trip.findUnique.mockResolvedValue(TRIP);
    stops({ bne: BNE, twd: TWD });
  });

  it("checks plan access and resolves a Stop on this trip and plan", async () => {
    expect(await driveTimeForEnds("trip-1", null, { stopId: "bne" }, { stopId: "twd" })).toEqual({ minutes: 72, roadKm: 95, estimated: false });
    expect(m.requirePlanAccess).toHaveBeenCalledWith("trip-1", undefined);
    expect(m.requirePlanAccess.mock.invocationCallOrder[0]).toBeLessThan(db.stop.findFirst.mock.invocationCallOrder[0]);
    expect(m.requirePlanAccess.mock.invocationCallOrder[0]).toBeLessThan(db.trip.findUnique.mock.invocationCallOrder[0]);
    expect(db.stop.findFirst).toHaveBeenCalledWith({ where: { id: "bne", tripId: "trip-1", forkId: null }, select: { lat: true, lng: true } });
    expect(m.driveTimeNow).toHaveBeenCalledWith(BNE, TWD, { windingFactor: 1.5, avgSpeedKph: 80 });
  });

  it("reads a Fork's Stops from that Fork", async () => {
    m.requirePlanAccess.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" }, plan: "fork-1" });
    await driveTimeForEnds("trip-1", "fork-1", { stopId: "bne" }, { stopId: "twd" });
    expect(m.requirePlanAccess).toHaveBeenCalledWith("trip-1", "fork-1");
    expect(db.stop.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "bne", tripId: "trip-1", forkId: "fork-1" } }));
  });

  it("never looks anything up for a trip the caller can't access", async () => {
    m.requirePlanAccess.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    await expect(driveTimeForEnds("trip-2", null, { stopId: "bne" }, { stopId: "twd" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(db.stop.findFirst).not.toHaveBeenCalled();
    expect(db.trip.findUnique).not.toHaveBeenCalled();
    expect(m.driveTimeNow).not.toHaveBeenCalled();
  });

  it("returns null for a Stop not on the trip, without a lookup", async () => {
    expect(await driveTimeForEnds("trip-1", null, { stopId: "elsewhere" }, { stopId: "twd" })).toBeNull();
    expect(m.driveTimeNow).not.toHaveBeenCalled();
  });

  it("returns null for a Stop with no point, without a lookup", async () => {
    stops({ bne: BNE, twd: { lat: null, lng: null } });
    expect(await driveTimeForEnds("trip-1", null, { stopId: "bne" }, { stopId: "twd" })).toBeNull();
    expect(m.driveTimeNow).not.toHaveBeenCalled();
  });

  it("returns null for a Stop hidden by a Surprise, without reading it or a lookup", async () => {
    m.loadSurpriseVisibility.mockResolvedValue(hiddenVisibility({ viewerId: "u1", hiddenStopIds: ["twd"] }));
    expect(await driveTimeForEnds("trip-1", null, { stopId: "bne" }, { stopId: "twd" })).toBeNull();
    expect(m.loadSurpriseVisibility).toHaveBeenCalledWith("trip-1", "u1");
    expect(db.stop.findFirst).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "twd" }) }));
    expect(m.driveTimeNow).not.toHaveBeenCalled();
  });

  it("resolves Home from the trip's own point", async () => {
    await driveTimeForEnds("trip-1", null, { home: true }, { stopId: "twd" });
    expect(db.trip.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "trip-1", deletedAt: null } }));
    expect(m.driveTimeNow).toHaveBeenCalledWith({ lat: -27.5, lng: 153.0 }, TWD, { windingFactor: 1.5, avgSpeedKph: 80 });
  });

  it("returns null for a Home end when the trip has no Home point", async () => {
    db.trip.findUnique.mockResolvedValue({ ...TRIP, homeLat: null, homeLng: null });
    expect(await driveTimeForEnds("trip-1", null, { home: true }, { stopId: "twd" })).toBeNull();
    expect(m.driveTimeNow).not.toHaveBeenCalled();
  });

  it("takes a point end as given", async () => {
    await driveTimeForEnds("trip-1", null, { lat: -27.47, lng: 153.03 }, { stopId: "twd" });
    expect(m.driveTimeNow).toHaveBeenCalledWith({ lat: -27.47, lng: 153.03 }, TWD, expect.anything());
  });

  it("returns null for two ends at the same point", async () => {
    expect(await driveTimeForEnds("trip-1", null, { stopId: "bne" }, { lat: BNE.lat, lng: BNE.lng })).toBeNull();
    expect(m.driveTimeNow).not.toHaveBeenCalled();
  });

  it("returns null for a point with lat 91", async () => {
    expect(await driveTimeForEnds("trip-1", null, { lat: 91, lng: 153 }, { stopId: "twd" })).toBeNull();
    expect(m.driveTimeNow).not.toHaveBeenCalled();
  });

  it("returns null for ends that are not one of the three shapes", async () => {
    const bad = [
      { lat: Number.NaN, lng: 153 },
      { lat: -27, lng: 181 },
      { lat: "-27", lng: "153" },
      { home: "yes" },
      { stopId: 7 },
      null,
      { minutes: 5 },
    ];
    for (const end of bad) {
      expect(await driveTimeForEnds("trip-1", null, end as never, { stopId: "twd" })).toBeNull();
    }
    expect(m.driveTimeNow).not.toHaveBeenCalled();
  });

  it("winds an estimate with the trip's own factor", async () => {
    db.trip.findUnique.mockResolvedValue({ ...TRIP, drivingWindingFactor: 1.3, drivingAvgSpeedKph: 70 });
    m.driveTimeNow.mockResolvedValue({ minutes: 80, distanceKm: 100, mode: "drive", estimated: true, polyline: null });
    expect(await driveTimeForEnds("trip-1", null, { stopId: "bne" }, { stopId: "twd" })).toEqual({ minutes: 80, roadKm: 130, estimated: true });
    expect(m.driveTimeNow).toHaveBeenCalledWith(BNE, TWD, { windingFactor: 1.3, avgSpeedKph: 70 });
  });
});
