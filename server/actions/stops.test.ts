import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the stops server actions.
 *
 * Mocks:
 *   - lib/db          → assert Prisma call shapes without hitting the database
 *   - lib/guards      → requireTripAccess returns a predictable membership
 *   - next/cache      → revalidatePath is a spy
 *   - lib/geocode     → never hits the network
 *   - lib/firm-up     → flowDates is tested in isolation; here we just verify wiring
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
  queryRawMock,
  transactionMock,
  tripFindUniqueMock,
  tripUpdateMock,
  chapterUpdateMock,
  chapterFindUniqueMock,
} = vi.hoisted(() => {
  const stopFindFirstMock = vi.fn();
  const stopFindUniqueMock = vi.fn();
  const stopFindManyMock = vi.fn();
  const stopCreateMock = vi.fn();
  const stopUpdateMock = vi.fn();
  const stopDeleteMock = vi.fn();
  const queryRawMock = vi.fn();
  const transactionMock = vi.fn(async (arg: unknown) => {
    // Interactive form: invoke the callback with a tx client.
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)({
        $queryRaw: queryRawMock,
        stop: { update: stopUpdateMock },
      });
    }
    // Array form (kept for any batch-transaction callers).
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg;
  });
  const tripFindUniqueMock = vi.fn();
  const tripUpdateMock = vi.fn();
  const chapterUpdateMock = vi.fn();
  const chapterFindUniqueMock = vi.fn();

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
    queryRawMock,
    transactionMock,
    tripFindUniqueMock,
    tripUpdateMock,
    chapterUpdateMock,
    chapterFindUniqueMock,
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodePlaceMock }));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));
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
    trip: {
      findUnique: tripFindUniqueMock,
      update: tripUpdateMock,
    },
    chapter: {
      update: chapterUpdateMock,
      findUnique: chapterFindUniqueMock,
    },
    $transaction: transactionMock,
  },
}));

import {
  createStop,
  updateStop,
  deleteStop,
  moveStop,
  setStopDates,
  firmUpSegment,
  toggleStopPin,
  makeStopRough,
  assignStopToChapter,
  setStopNotes,
  setStopNights,
  getTripProjection,
} from "./stops";
import { recordActivity } from "@/server/actions/activity";

const VALID_INPUT = {
  mode: "scheduled" as const,
  name: "London",
  country: "United Kingdom",
  timezone: "Europe/London",
  arriveDate: "2026-07-01",
  departDate: "2026-07-05",
};

const ROUGH_INPUT = {
  mode: "rough" as const,
  name: "Rome",
  country: "Italy",
  nights: 3,
  chapterId: "ch-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset requireTripAccess to always succeed
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
});

afterEach(() => {
  vi.clearAllMocks();
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

  it("creates a rough stop with nights, chapterId, null dates/timezone", async () => {
    stopFindFirstMock.mockResolvedValue({ sortOrder: 1 });
    stopCreateMock.mockResolvedValue({ id: "stop-9" });
    const result = await createStop("trip-1", ROUGH_INPUT);
    expect(result.success).toBe(true);
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip-1",
        name: "Rome",
        country: "Italy",
        nights: 3,
        chapterId: "ch-1",
        arriveDate: null,
        departDate: null,
        timezone: null,
        pinned: false,
        sortOrder: 2,
      }),
    });
    expect(geocodePlaceMock).not.toHaveBeenCalled();
  });

  it("records CREATED activity for a scheduled stop", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "stop-1", name: "London" });

    await createStop("trip-1", VALID_INPUT);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "CREATED", entityType: "STOP", entityLabel: "London" }),
    );
  });

  it("records CREATED activity for a rough stop", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "stop-9", name: "Rome" });

    await createStop("trip-1", ROUGH_INPUT);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "CREATED", entityType: "STOP", entityLabel: "Rome" }),
    );
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
      arriveDate: "2026-07-01",
      departDate: "2026-07-05",
      nights: null,
      pinned: false,
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
      arriveDate: null,
      departDate: null,
      nights: null,
      pinned: false,
    });

    const result = await updateStop("stop-1", { ...VALID_INPUT, name: "" });

    expect(result.success).toBe(false);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("updates a rough stop with null dates and timezone", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-r",
      tripId: "trip-1",
      sortOrder: 2,
      arriveDate: null,
      departDate: null,
      nights: 3,
      pinned: false,
    });
    stopUpdateMock.mockResolvedValue({});

    const result = await updateStop("stop-r", ROUGH_INPUT);

    expect(result.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-r" },
      data: expect.objectContaining({
        name: "Rome",
        country: "Italy",
        nights: 3,
        chapterId: "ch-1",
        arriveDate: null,
        departDate: null,
        timezone: null,
      }),
    });
    expect(geocodePlaceMock).not.toHaveBeenCalled();
  });

  it("preserves notes and chapter when updating a rough stop", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "s1", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false });
    stopUpdateMock.mockResolvedValue({});
    const result = await updateStop("s1", { mode: "rough", name: "Rome", nights: 4, chapterId: "it", notes: "near station" });
    expect(result.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ name: "Rome", nights: 4, chapterId: "it", notes: "near station", arriveDate: null, departDate: null, timezone: null }),
    });
  });

  it("records UPDATED activity with changes for a scheduled stop", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "stop-1", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-07-01", departDate: "2026-07-05", nights: null, pinned: false }) // requireStopAccess
      .mockResolvedValueOnce({ id: "stop-1", name: "London", country: "United Kingdom", arriveDate: "2026-07-01", departDate: "2026-07-05" }); // before row
    stopUpdateMock.mockResolvedValue({ id: "stop-1", name: "Updated London", country: "United Kingdom", arriveDate: "2026-07-01", departDate: "2026-07-05" });

    await updateStop("stop-1", { ...VALID_INPUT, name: "Updated London" });

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "STOP",
        changes: expect.arrayContaining([expect.objectContaining({ field: "name" })]),
      }),
    );
  });

  it("records UPDATED activity with changes for a rough stop", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "stop-r", tripId: "trip-1", sortOrder: 2, arriveDate: null, departDate: null, nights: 3, pinned: false }) // requireStopAccess
      .mockResolvedValueOnce({ id: "stop-r", name: "Rome", country: "Italy", nights: 3 }); // before row
    stopUpdateMock.mockResolvedValue({ id: "stop-r", name: "Naples", country: "Italy", nights: 3 });

    await updateStop("stop-r", { ...ROUGH_INPUT, name: "Naples" });

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "STOP",
        changes: expect.arrayContaining([expect.objectContaining({ field: "name" })]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// deleteStop
// ---------------------------------------------------------------------------

describe("deleteStop", () => {
  it("deletes a stop and revalidates", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "stop-1", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: null, pinned: false }) // requireStopAccess
      .mockResolvedValueOnce({ name: "London" }); // doomed label
    stopDeleteMock.mockResolvedValue({});

    const result = await deleteStop("stop-1");

    expect(result.success).toBe(true);
    expect(stopDeleteMock).toHaveBeenCalledWith({ where: { id: "stop-1" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("records DELETED activity with the snapshotted label", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "stop-1", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: null, pinned: false }) // requireStopAccess
      .mockResolvedValueOnce({ name: "Paris" }); // doomed label
    stopDeleteMock.mockResolvedValue({});

    await deleteStop("stop-1");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityType: "STOP", entityLabel: "Paris" }),
    );
  });
});

// ---------------------------------------------------------------------------
// moveStop
// ---------------------------------------------------------------------------

describe("moveStop", () => {
  const stops = [
    { id: "stop-1", sortOrder: 0 },
    { id: "stop-2", sortOrder: 1 },
    { id: "stop-3", sortOrder: 2 },
  ];

  it("locks the trip's stops with FOR UPDATE inside a transaction before swapping", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-2",
      tripId: "trip-1",
      sortOrder: 1,
      arriveDate: null,
      departDate: null,
      nights: null,
      pinned: false,
    });
    queryRawMock.mockResolvedValue(stops);
    stopUpdateMock.mockResolvedValue({});

    const result = await moveStop("stop-2", "up");

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(queryRawMock).toHaveBeenCalledOnce();
    const sqlParts = queryRawMock.mock.calls[0][0] as string[];
    expect(sqlParts.join(" ")).toContain("FOR UPDATE");
    // First bound value is the tripId.
    expect(queryRawMock.mock.calls[0][1]).toBe("trip-1");
  });

  it("swaps sortOrder with the previous stop when moving up", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-2",
      tripId: "trip-1",
      sortOrder: 1,
      arriveDate: null,
      departDate: null,
      nights: null,
      pinned: false,
    });
    queryRawMock.mockResolvedValue(stops);
    stopUpdateMock.mockResolvedValue({});

    await moveStop("stop-2", "up");

    expect(stopUpdateMock).toHaveBeenCalledTimes(2);
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "stop-2" }, data: { sortOrder: 0 } });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "stop-1" }, data: { sortOrder: 1 } });
  });

  it("swaps sortOrder with the next stop when moving down", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-2",
      tripId: "trip-1",
      sortOrder: 1,
      arriveDate: null,
      departDate: null,
      nights: null,
      pinned: false,
    });
    queryRawMock.mockResolvedValue(stops);
    stopUpdateMock.mockResolvedValue({});

    await moveStop("stop-2", "down");

    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "stop-2" }, data: { sortOrder: 2 } });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "stop-3" }, data: { sortOrder: 1 } });
  });

  it("is a no-op when already at the top", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-1",
      tripId: "trip-1",
      sortOrder: 0,
      arriveDate: null,
      departDate: null,
      nights: null,
      pinned: false,
    });
    queryRawMock.mockResolvedValue(stops);

    const result = await moveStop("stop-1", "up");

    expect(result.success).toBe(true);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("is a no-op when already at the bottom", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-3",
      tripId: "trip-1",
      sortOrder: 2,
      arriveDate: null,
      departDate: null,
      nights: null,
      pinned: false,
    });
    queryRawMock.mockResolvedValue(stops);

    const result = await moveStop("stop-3", "down");

    expect(result.success).toBe(true);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("moveStop records a reorder summary only when a swap happens", async () => {
    // requireStopAccess → { id:"s1", tripId:"trip-1", sortOrder:0, ... }
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s1", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: null, pinned: false })
      // name findUnique → { name:"Rome" }
      .mockResolvedValueOnce({ name: "Rome" });
    // $queryRaw siblings → [{ id:"s1", sortOrder:0 }, { id:"s2", sortOrder:1 }]
    queryRawMock.mockResolvedValue([{ id: "s1", sortOrder: 0 }, { id: "s2", sortOrder: 1 }]);
    stopUpdateMock.mockResolvedValue({});

    await moveStop("s1", "down");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "STOP",
        entityId: "s1",
        changes: { summary: expect.stringContaining("Moved Rome") },
      }),
    );
  });

  it("moveStop records nothing on a no-op (no neighbour)", async () => {
    // siblings → [{ id:"s1", sortOrder:0 }] only
    stopFindUniqueMock.mockResolvedValueOnce({ id: "s1", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: null, pinned: false });
    queryRawMock.mockResolvedValue([{ id: "s1", sortOrder: 0 }]);

    await moveStop("s1", "up");

    expect(recordActivity).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setStopDates
// ---------------------------------------------------------------------------

describe("setStopDates", () => {
  it("sets the stop's dates and ripples following dated non-pinned stops", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "b", tripId: "trip-1", sortOrder: 1, arriveDate: null, departDate: null, nights: null, pinned: false });
    stopFindManyMock.mockResolvedValue([
      { id: "c", sortOrder: 2, nights: 2, pinned: false, arriveDate: "2026-07-20", departDate: "2026-07-22" },
      { id: "d", sortOrder: 3, nights: null, pinned: true, arriveDate: "2026-07-25", departDate: "2026-07-28" },
      { id: "e", sortOrder: 4, nights: 3, pinned: false, arriveDate: null, departDate: null },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripFindUniqueMock.mockResolvedValue({ endDate: "2026-07-10" });
    tripUpdateMock.mockResolvedValue({});
    const result = await setStopDates("b", { arriveDate: "2026-07-12", departDate: "2026-07-15" });
    expect(result.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "b" }, data: { arriveDate: "2026-07-12", departDate: "2026-07-15" } });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "c" }, data: { arriveDate: "2026-07-15", departDate: "2026-07-17" } });
    const updatedIds = stopUpdateMock.mock.calls.map((c) => c[0].where.id);
    expect(updatedIds).not.toContain("d");
    expect(updatedIds).not.toContain("e");
    // The trip's endDate (currently 2026-07-10) is grown to cover the furthest
    // depart in the rippled run — the pinned stop d departs 2026-07-28, which is
    // the latest — so no stop drops out of dated views. (d's own dates aren't
    // rewritten, but the window must still span it.)
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: "trip-1" }, data: { endDate: "2026-07-28" } });
  });

  it("rejects when departDate is before arriveDate and writes nothing", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "b", tripId: "trip-1", sortOrder: 1, arriveDate: "2026-07-01", departDate: "2026-07-03", nights: null, pinned: false });
    const result = await setStopDates("b", { arriveDate: "2026-07-15", departDate: "2026-07-12" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.departDate).toBeDefined();
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("setStopDates records ONE update for the edited stop only", async () => {
    // requireStopAccess findUnique
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s1", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false })
      // before-row findUnique
      .mockResolvedValueOnce({ name: "Rome", country: "Italy", arriveDate: null, departDate: null, nights: 2 });
    stopUpdateMock.mockResolvedValue({});
    // stop.findMany (following) → [] (no ripple)
    stopFindManyMock.mockResolvedValue([]);
    // trip.findUnique → { endDate: null }
    tripFindUniqueMock.mockResolvedValue({ endDate: null });
    tripUpdateMock.mockResolvedValue({});

    await setStopDates("s1", { arriveDate: "2026-07-03", departDate: "2026-07-06" });

    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "STOP",
        entityId: "s1",
        changes: expect.arrayContaining([
          expect.objectContaining({ field: "arriveDate" }),
          expect.objectContaining({ field: "departDate" }),
        ]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// firmUpSegment
// ---------------------------------------------------------------------------

describe("firmUpSegment", () => {
  it("flows rough chapter stops from the preceding scheduled stop and sets chapter dates", async () => {
    // Trip already starts 2026-07-03 but has no endDate yet.
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-03", endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "a", sortOrder: 0, chapterId: null, nights: null, pinned: false, arriveDate: "2026-07-06", departDate: "2026-07-10", timezone: "Europe/Paris", name: "Paris", country: "France" },
      { id: "rome", sortOrder: 1, chapterId: "it", nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Rome", country: "Italy" },
      { id: "venice", sortOrder: 2, chapterId: "it", nights: 2, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Venice", country: "Italy" },
    ]);
    geocodePlaceMock.mockResolvedValue(null);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});
    chapterUpdateMock.mockResolvedValue({});
    const result = await firmUpSegment({ tripId: "trip-1", chapterId: "it" });
    expect(result.success).toBe(true);
    // Conflicts are surfaced on success (none here).
    if (result.success) expect(result.conflicts).toEqual([]);
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "rome" }, data: expect.objectContaining({ arriveDate: "2026-07-10", departDate: "2026-07-13", timezone: "Europe/Paris" }) });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "venice" }, data: expect.objectContaining({ arriveDate: "2026-07-13", departDate: "2026-07-15" }) });
    expect(chapterUpdateMock).toHaveBeenCalledWith({ where: { id: "it" }, data: { startDate: "2026-07-10", endDate: "2026-07-15" } });
    // The trip's window grows to cover the last flowed depart (venice → 2026-07-15);
    // the existing startDate (2026-07-03) is preserved.
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: "trip-1" }, data: { startDate: "2026-07-03", endDate: "2026-07-15" } });
  });

  it("returns an error when the trip is date-less and nothing precedes the segment", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "rome", sortOrder: 0, chapterId: "it", nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Rome", country: "Italy" },
    ]);
    const result = await firmUpSegment({ tripId: "trip-1", chapterId: "it" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.anchorDate).toBeDefined();
    expect(stopUpdateMock).not.toHaveBeenCalled();
    expect(chapterUpdateMock).not.toHaveBeenCalled();
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("firmUpSegment on a chapter records ONE chapter update", async () => {
    // trip.findUnique → { startDate:"2026-07-01", endDate:null }
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    // stop.findMany → two rough stops in chap-it (arriveDate null)
    stopFindManyMock.mockResolvedValue([
      { id: "rome", sortOrder: 0, chapterId: "chap-it", nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Rome", country: "Italy" },
      { id: "venice", sortOrder: 1, chapterId: "chap-it", nights: 2, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Venice", country: "Italy" },
    ]);
    geocodePlaceMock.mockResolvedValue(null);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});
    // chapter before findUnique → { name:"Italy", startDate:null, endDate:null }
    chapterFindUniqueMock.mockResolvedValue({ name: "Italy", startDate: null, endDate: null });
    chapterUpdateMock.mockResolvedValue({});

    await firmUpSegment({ tripId: "trip-1", chapterId: "chap-it" });

    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "UPDATED", entityType: "CHAPTER" }),
    );
  });

  it("ungrouped firmUpSegment records one stop summary", async () => {
    // chapterId omitted → ungrouped; two rough ungrouped stops
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "s1", sortOrder: 0, chapterId: null, nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Rome", country: "Italy" },
      { id: "s2", sortOrder: 1, chapterId: null, nights: 2, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Venice", country: "Italy" },
    ]);
    geocodePlaceMock.mockResolvedValue(null);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});

    await firmUpSegment({ tripId: "trip-1" });

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "STOP",
        changes: { summary: expect.stringContaining("Firmed up") },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// toggleStopPin
// ---------------------------------------------------------------------------

describe("toggleStopPin", () => {
  it("pins a scheduled stop", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "a", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-07-03", departDate: "2026-07-06", nights: null, pinned: false })
      .mockResolvedValueOnce({ name: "Paris" });
    stopUpdateMock.mockResolvedValue({});
    const r = await toggleStopPin("a");
    expect(r.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "a" }, data: { pinned: true } });
  });
  it("refuses to pin a rough stop (no dates to fix)", async () => {
    stopFindUniqueMock.mockResolvedValueOnce({ id: "a", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: 3, pinned: false });
    const r = await toggleStopPin("a");
    expect(r.success).toBe(false);
  });
  it("toggleStopPin records a Pinned change", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s1", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-07-03", departDate: "2026-07-06", nights: null, pinned: false })
      .mockResolvedValueOnce({ name: "Rome" });
    stopUpdateMock.mockResolvedValue({});
    await toggleStopPin("s1");
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "STOP",
        changes: [{ field: "pinned", label: "Pinned", from: "Not pinned", to: "Pinned" }],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// makeStopRough
// ---------------------------------------------------------------------------

describe("makeStopRough", () => {
  it("clears dates/timezone/pin and keeps nights from the prior duration", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "a", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-07-03", departDate: "2026-07-06", nights: null, pinned: false })
      .mockResolvedValueOnce({ name: "Rome", arriveDate: "2026-07-03", departDate: "2026-07-06", pinned: false, nights: null });
    stopUpdateMock.mockResolvedValue({});
    await makeStopRough("a");
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { arriveDate: null, departDate: null, timezone: null, pinned: false, nights: 3 },
    });
  });

  it("keeps the stored nights when the stop was already rough", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "a", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: 4, pinned: false })
      .mockResolvedValueOnce({ name: "Rome", arriveDate: null, departDate: null, pinned: false, nights: 4 });
    stopUpdateMock.mockResolvedValue({});
    await makeStopRough("a");
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { arriveDate: null, departDate: null, timezone: null, pinned: false, nights: 4 },
    });
  });

  it("makeStopRough records dates cleared", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s1", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-07-03", departDate: "2026-07-06", nights: null, pinned: false })
      .mockResolvedValueOnce({ name: "Rome", arriveDate: "2026-07-03", departDate: "2026-07-06", pinned: false, nights: null });
    stopUpdateMock.mockResolvedValue({});
    await makeStopRough("s1");
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "STOP",
        entityId: "s1",
        changes: expect.arrayContaining([expect.objectContaining({ field: "arriveDate" })]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// assignStopToChapter
// ---------------------------------------------------------------------------

describe("assignStopToChapter", () => {
  it("sets chapterId and appends to the end of that chapter's order", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "a", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false })
      .mockResolvedValueOnce({ name: "Rome", chapterId: null });
    stopFindFirstMock.mockResolvedValue({ chapterSortOrder: 4 });
    stopUpdateMock.mockResolvedValue({});
    chapterFindUniqueMock.mockResolvedValue({ name: "Italy" });
    await assignStopToChapter("a", "it");
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "a" }, data: { chapterId: "it", chapterSortOrder: 5 } });
  });

  it("assignStopToChapter records a Chapter change with resolved names", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s1", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false })
      .mockResolvedValueOnce({ name: "Rome", chapterId: null });
    stopFindFirstMock.mockResolvedValue(null);
    stopUpdateMock.mockResolvedValue({});
    chapterFindUniqueMock.mockResolvedValue({ name: "Italy" });
    await assignStopToChapter("s1", "chap-it");
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "STOP",
        entityId: "s1",
        changes: [{ field: "chapter", label: "Chapter", from: "", to: "Italy" }],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// setStopNotes
// ---------------------------------------------------------------------------

describe("setStopNotes", () => {
  it("trims and writes notes, records activity, revalidates", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "s1", tripId: "t1", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false });
    stopUpdateMock.mockResolvedValue({ id: "s1", tripId: "t1", notes: "Book ferry" });
    const r = await setStopNotes("s1", "  Book ferry  ");
    expect(r).toEqual({ success: true });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "s1" }, data: { notes: "Book ferry" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/t1");
  });

  it("stores null for an empty note", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "s1", tripId: "t1", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false });
    stopUpdateMock.mockResolvedValue({ id: "s1", tripId: "t1", notes: null });
    await setStopNotes("s1", "   ");
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "s1" }, data: { notes: null } });
  });
});

// ---------------------------------------------------------------------------
// setStopNights
// ---------------------------------------------------------------------------

describe("setStopNights", () => {
  it("rejects negative and non-integer values", async () => {
    const r = await setStopNights("s1", -1);
    expect(r).toEqual({ success: false, errors: { nights: ["Nights must be between 0 and 366"] } });
    expect(stopUpdateMock).not.toHaveBeenCalled();
    expect(await setStopNights("s1", 1.5)).toEqual({ success: false, errors: { nights: ["Nights must be between 0 and 366"] } });
  });

  it("updates the nights field for a rough stop", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "s1", tripId: "t1", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false });
    stopUpdateMock.mockResolvedValue({ id: "s1", tripId: "t1", nights: 5 });
    const r = await setStopNights("s1", 5);
    expect(r).toEqual({ success: true });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "s1" }, data: { nights: 5 } });
  });

  it("recomputes depart date for a scheduled stop (ripple path)", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "s1", tripId: "t1", sortOrder: 0, arriveDate: "2026-07-12", departDate: "2026-07-14", nights: 2, pinned: false });
    stopFindManyMock.mockResolvedValue([]);
    tripFindUniqueMock.mockResolvedValue({ endDate: "2026-07-20" });
    stopUpdateMock.mockResolvedValue({});
    const r = await setStopNights("s1", 3);
    expect(r.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "s1" }, data: { arriveDate: "2026-07-12", departDate: "2026-07-15" } });
  });
});

// ---------------------------------------------------------------------------
// getTripProjection
// ---------------------------------------------------------------------------

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
    expect(r).toEqual({ projectedEnd: null, hardEndDate: null });
  });
});
