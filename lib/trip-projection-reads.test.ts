import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireTripAccessMock, tripFindUniqueMock, stopFindManyMock, transportFindManyMock } = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "user-1" }, membership: { role: "owner" } }),
  tripFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/db", () => ({
  db: { trip: { findUnique: tripFindUniqueMock }, stop: { findMany: stopFindManyMock }, transport: { findMany: transportFindManyMock } },
}));

import { getTripProjection, loadTripProjection } from "./trip-projection-reads";

beforeEach(() => {
  vi.clearAllMocks();
  transportFindManyMock.mockResolvedValue([]);
});

it("checks Trip access before reading", async () => {
  tripFindUniqueMock.mockResolvedValue(null);
  stopFindManyMock.mockResolvedValue([]);
  await getTripProjection("trip-1");
  expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
});

it("loadTripProjection reads the same projection with no access check (the Review job has no session, spec 2026-10-17 R9)", async () => {
  tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", hardEndDate: null });
  stopFindManyMock.mockResolvedValue([{ id: "a", arriveDate: null, departDate: null, nights: 2, pinned: false, sortOrder: 0 }]);
  const r = await loadTripProjection("trip-1");
  expect(requireTripAccessMock).not.toHaveBeenCalled();
  expect(r.projectedEnd).toBe("2026-07-03");
});

describe("getTripProjection", () => {
  it("returns the projected end and hard end date", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", hardEndDate: "2026-07-10" });
    stopFindManyMock.mockResolvedValue([
      { id: "a", arriveDate: null, departDate: null, nights: 3, pinned: false, sortOrder: 0 },
      { id: "b", arriveDate: null, departDate: null, nights: 4, pinned: false, sortOrder: 1 },
    ]);
    const r = await getTripProjection("trip-1");
    expect(r.projectedEnd).toBe("2026-07-08");
    expect(r.hardEndDate).toBe("2026-07-10");
  });

  it("passes through a null hardEndDate", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", hardEndDate: null });
    stopFindManyMock.mockResolvedValue([{ id: "a", arriveDate: null, departDate: null, nights: 2, pinned: false, sortOrder: 0 }]);
    const r = await getTripProjection("trip-1");
    expect(r.hardEndDate).toBeNull();
    expect(r.projectedEnd).toBe("2026-07-03");
  });

  it("returns a null projectedEnd when there is no anchor", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, hardEndDate: "2026-07-10" });
    stopFindManyMock.mockResolvedValue([{ id: "a", arriveDate: null, departDate: null, nights: 3, pinned: false, sortOrder: 0 }]);
    const r = await getTripProjection("trip-1");
    expect(r.projectedEnd).toBeNull();
    expect(r.hardEndDate).toBe("2026-07-10");
  });

  it("returns nulls without throwing when the trip is not found", async () => {
    tripFindUniqueMock.mockResolvedValue(null);
    stopFindManyMock.mockResolvedValue([]);
    const r = await getTripProjection("trip-1");
    expect(r).toEqual({ projectedEnd: null, hardEndDate: null, deadline: null });
  });

  it("scopes stop query to forkId: null (real plan) when no forkId is provided", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, hardEndDate: null });
    stopFindManyMock.mockResolvedValue([]);
    await getTripProjection("trip-1");
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes stop query to the given forkId when one is supplied", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, hardEndDate: null });
    stopFindManyMock.mockResolvedValue([]);
    await getTripProjection("trip-1", "fork-9");
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: "fork-9" }) }),
    );
  });

  it("resolves the deadline: a dated return leg from the last Stop beats the hard end date (ADR 0068)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", hardEndDate: "2026-07-20" });
    stopFindManyMock.mockResolvedValue([
      { id: "a", arriveDate: null, departDate: null, nights: 3, pinned: false, sortOrder: 0, timezone: null },
      { id: "b", arriveDate: null, departDate: null, nights: 4, pinned: false, sortOrder: 1, timezone: "Europe/Rome" },
    ]);
    transportFindManyMock.mockResolvedValueOnce([
      { mode: "FLIGHT", fromStopId: "b", toStopId: null, depAt: new Date("2026-07-08T09:00:00Z"), arrIsHome: true },
    ]);
    const r = await getTripProjection("trip-1");
    expect(r.hardEndDate).toBe("2026-07-20");
    expect(r.deadline).toEqual({ kind: "return-leg", date: "2026-07-08", mode: "FLIGHT", homeward: true });
  });

  it("falls back to the hard end date when the return leg has no date", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", hardEndDate: "2026-07-20" });
    stopFindManyMock.mockResolvedValue([{ id: "b", arriveDate: null, departDate: null, nights: 4, pinned: false, sortOrder: 0, timezone: null }]);
    transportFindManyMock.mockResolvedValueOnce([{ mode: "FLIGHT", fromStopId: "b", toStopId: null, depAt: null, arrIsHome: true }]);
    expect((await getTripProjection("trip-1")).deadline).toEqual({ kind: "hard-end", date: "2026-07-20" });
  });

  it("reads a Fork's own transports", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, hardEndDate: null });
    stopFindManyMock.mockResolvedValue([]);
    await getTripProjection("trip-1", "fork-9");
    expect(transportFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
  });
});
