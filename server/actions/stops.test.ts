import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the stops server actions.
 *
 * Mocks:
 *   - lib/db          → assert Prisma call shapes without hitting SQLite
 *   - lib/guards      → requireTripAccess returns a predictable membership
 *   - next/cache      → revalidatePath is a spy
 *   - lib/geocode     → never hits the network
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  geocodePlaceMock,
  stopFindFirstMock,
  stopFindUniqueMock,
  stopFindManyMock,
  stopCreateMock,
  stopUpdateMock,
  stopDeleteMock,
  transactionMock,
} = vi.hoisted(() => {
  const stopFindFirstMock = vi.fn();
  const stopFindUniqueMock = vi.fn();
  const stopFindManyMock = vi.fn();
  const stopCreateMock = vi.fn();
  const stopUpdateMock = vi.fn();
  const stopDeleteMock = vi.fn();
  const transactionMock = vi.fn(async (ops: unknown[]) => {
    // For array-form transactions, execute each op
    if (Array.isArray(ops)) {
      return Promise.all(ops);
    }
    return ops;
  });

  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    }),
    revalidatePathMock: vi.fn(),
    geocodePlaceMock: vi.fn().mockResolvedValue(null),
    stopFindFirstMock,
    stopFindUniqueMock,
    stopFindManyMock,
    stopCreateMock,
    stopUpdateMock,
    stopDeleteMock,
    transactionMock,
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodePlaceMock }));
vi.mock("@/lib/db", () => ({
  db: {
    stop: {
      findFirst: stopFindFirstMock,
      findUnique: stopFindUniqueMock,
      findMany: stopFindManyMock,
      create: stopCreateMock,
      update: stopUpdateMock,
      delete: stopDeleteMock,
    },
    $transaction: transactionMock,
  },
}));

import { createStop, updateStop, deleteStop, moveStop } from "./stops";

const VALID_INPUT = {
  name: "London",
  country: "United Kingdom",
  timezone: "Europe/London",
  arriveDate: "2026-07-01",
  departDate: "2026-07-05",
};

afterEach(() => {
  vi.clearAllMocks();
  // Reset requireTripAccess to always succeed
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
});

// ---------------------------------------------------------------------------
// createStop
// ---------------------------------------------------------------------------

describe("createStop", () => {
  it("creates a stop with sortOrder = 0 when no stops exist", async () => {
    stopFindFirstMock.mockResolvedValue(null); // no existing stops
    stopCreateMock.mockResolvedValue({ id: "stop-1" });

    const result = await createStop("trip-1", VALID_INPUT);

    expect(result.success).toBe(true);
    expect(stopCreateMock).toHaveBeenCalledOnce();
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip-1",
        name: "London",
        country: "United Kingdom",
        timezone: "Europe/London",
        arriveDate: "2026-07-01",
        departDate: "2026-07-05",
        sortOrder: 0,
      }),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("sets sortOrder = max + 1 when stops already exist", async () => {
    stopFindFirstMock.mockResolvedValue({ sortOrder: 2 });
    stopCreateMock.mockResolvedValue({ id: "stop-2" });

    await createStop("trip-1", VALID_INPUT);

    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 3 }),
    });
  });

  it("calls geocodePlace when lat/lng are not provided", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "stop-1" });
    geocodePlaceMock.mockResolvedValue({ lat: 51.5074, lng: -0.1278 });

    await createStop("trip-1", VALID_INPUT);

    expect(geocodePlaceMock).toHaveBeenCalledOnce();
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ lat: 51.5074, lng: -0.1278 }),
    });
  });

  it("uses provided lat/lng and skips geocode", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "stop-1" });

    await createStop("trip-1", { ...VALID_INPUT, lat: 10, lng: 20 });

    expect(geocodePlaceMock).not.toHaveBeenCalled();
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ lat: 10, lng: 20 }),
    });
  });

  it("returns validation error and does not write when name is empty", async () => {
    const result = await createStop("trip-1", { ...VALID_INPUT, name: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeDefined();
    }
    expect(stopCreateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns validation error when departDate is before arriveDate", async () => {
    const result = await createStop("trip-1", {
      ...VALID_INPUT,
      arriveDate: "2026-07-10",
      departDate: "2026-07-05",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.departDate).toBeDefined();
    }
    expect(stopCreateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateStop
// ---------------------------------------------------------------------------

describe("updateStop", () => {
  it("updates a stop and revalidates the path", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-1",
      tripId: "trip-1",
      sortOrder: 0,
    });
    stopUpdateMock.mockResolvedValue({});

    const result = await updateStop("stop-1", {
      ...VALID_INPUT,
      name: "Updated London",
    });

    expect(result.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-1" },
      data: expect.objectContaining({ name: "Updated London" }),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("returns validation error and does not write", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-1",
      tripId: "trip-1",
      sortOrder: 0,
    });

    const result = await updateStop("stop-1", { ...VALID_INPUT, name: "" });

    expect(result.success).toBe(false);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteStop
// ---------------------------------------------------------------------------

describe("deleteStop", () => {
  it("deletes a stop and revalidates", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-1",
      tripId: "trip-1",
      sortOrder: 0,
    });
    stopDeleteMock.mockResolvedValue({});

    const result = await deleteStop("stop-1");

    expect(result.success).toBe(true);
    expect(stopDeleteMock).toHaveBeenCalledWith({ where: { id: "stop-1" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
  });
});

// ---------------------------------------------------------------------------
// moveStop
// ---------------------------------------------------------------------------

describe("moveStop", () => {
  const stops = [
    { id: "stop-A", sortOrder: 0 },
    { id: "stop-B", sortOrder: 1 },
    { id: "stop-C", sortOrder: 2 },
  ];

  it("swaps sortOrder with previous stop when moving up", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-B",
      tripId: "trip-1",
      sortOrder: 1,
    });
    stopFindManyMock.mockResolvedValue(stops);
    stopUpdateMock.mockResolvedValue({});

    const result = await moveStop("stop-B", "up");

    expect(result.success).toBe(true);
    // stop-B should get sortOrder 0, stop-A should get sortOrder 1
    expect(transactionMock).toHaveBeenCalledOnce();
    // The two db.stop.update calls should reflect the swap
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-B" },
      data: { sortOrder: 0 },
    });
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-A" },
      data: { sortOrder: 1 },
    });
  });

  it("swaps sortOrder with next stop when moving down", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-B",
      tripId: "trip-1",
      sortOrder: 1,
    });
    stopFindManyMock.mockResolvedValue(stops);
    stopUpdateMock.mockResolvedValue({});

    await moveStop("stop-B", "down");

    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-B" },
      data: { sortOrder: 2 },
    });
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-C" },
      data: { sortOrder: 1 },
    });
  });

  it("is a no-op when moving the first stop up", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-A",
      tripId: "trip-1",
      sortOrder: 0,
    });
    stopFindManyMock.mockResolvedValue(stops);

    const result = await moveStop("stop-A", "up");

    expect(result.success).toBe(true);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("is a no-op when moving the last stop down", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-C",
      tripId: "trip-1",
      sortOrder: 2,
    });
    stopFindManyMock.mockResolvedValue(stops);

    const result = await moveStop("stop-C", "down");

    expect(result.success).toBe(true);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
