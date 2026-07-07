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
  geocodePlaceDetailedMock,
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
  chapterFindManyMock,
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
        stop: { update: stopUpdateMock, create: stopCreateMock, findMany: stopFindManyMock },
        chapter: { findMany: chapterFindManyMock, update: chapterUpdateMock },
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
  const chapterFindManyMock = vi.fn();

  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    }),
    revalidatePathMock: vi.fn(),
    geocodePlaceMock: vi.fn().mockResolvedValue(null),
    geocodePlaceDetailedMock: vi.fn().mockResolvedValue({ lat: 1, lng: 2, city: "Tokyo", country: "Japan", countryCode: "jp", name: "Tokyo" }),
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
    chapterFindManyMock,
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodePlaceMock, geocodePlaceDetailed: geocodePlaceDetailedMock }));
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
      findMany: chapterFindManyMock,
    },
    $transaction: transactionMock,
  },
}));

import {
  createStop,
  updateStop,
  deleteStop,
  moveStop,
  reorderStops,
  restoreStops,
  setStopDates,
  firmUpSegment,
  firmUpTrip,
  toggleStopPin,
  makeStopRough,
  assignStopToChapter,
  setStopNotes,
  setStopNights,
  getTripProjection,
  recomputeChapterSpans,
} from "./stops";
import { chapterSpan } from "@/lib/chapter-span";
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
  // Default: chapter lookup returns a real-plan chapter (forkId null)
  chapterFindUniqueMock.mockResolvedValue({ id: "ch-1", forkId: null });
  // Default: stop.findMany returns no rows (individual tests override as needed).
  stopFindManyMock.mockResolvedValue([]);
  // Default: chapter.findMany returns no chapters (recomputeChapterSpans is a no-op).
  chapterFindManyMock.mockResolvedValue([]);
  // Default: chapter.update is a no-op.
  chapterUpdateMock.mockResolvedValue({});
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createStop
// ---------------------------------------------------------------------------

describe("plan-scope: createStop sortOrder", () => {
  it("computes sortOrder within the real plan only (forkId null)", async () => {
    stopFindFirstMock.mockResolvedValue({ sortOrder: 2 });
    stopCreateMock.mockResolvedValue({ id: "stop-1", name: "Rome" });

    await createStop("trip-1", ROUGH_INPUT);

    expect(stopFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: null }),
      }),
    );
  });
});

describe("plan-scope: assignStopToChapter sortOrder", () => {
  it("computes chapterSortOrder within the real plan only (forkId null)", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "a", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false })
      .mockResolvedValueOnce({ name: "Rome", chapterId: null });
    stopFindFirstMock.mockResolvedValue({ chapterSortOrder: 3 });
    stopUpdateMock.mockResolvedValue({});
    chapterFindUniqueMock.mockResolvedValue({ name: "Italy" });

    await assignStopToChapter("a", "ch-italy");

    expect(stopFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", chapterId: "ch-italy", forkId: null }),
      }),
    );
  });
});

describe("plan-scope: applyStopDates ripple findMany", () => {
  it("fetches following stops within the real plan only (forkId null)", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "b", tripId: "trip-1", sortOrder: 1, arriveDate: null, departDate: null, nights: null, pinned: false });
    stopFindManyMock.mockResolvedValue([]);
    tripFindUniqueMock.mockResolvedValue({ endDate: "2026-07-10" });
    tripUpdateMock.mockResolvedValue({});

    await setStopDates("b", { arriveDate: "2026-07-12", departDate: "2026-07-15" });

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: null }),
      }),
    );
  });
});

describe("plan-scope: createStop with forkId", () => {
  it("creates a stop in the given fork with fork-scoped sortOrder", async () => {
    stopFindFirstMock.mockResolvedValue({ sortOrder: 1 });
    stopCreateMock.mockResolvedValue({ id: "s9", name: "Bern" });
    chapterFindUniqueMock.mockResolvedValue(null); // no chapter for this test

    await createStop("trip-1", { mode: "rough" as const, name: "Bern", nights: 2 }, "fork-9");

    expect(stopFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ forkId: "fork-9", sortOrder: 2 }),
    });
  });

  it("writes forkId: null on create when no forkId is passed (real plan)", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "s10", name: "Rome" });

    await createStop("trip-1", ROUGH_INPUT);

    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ forkId: null }),
    });
  });

  it("rejects a rough stop whose chapterId belongs to a different plan", async () => {
    chapterFindUniqueMock.mockResolvedValue({ id: "ch-1", forkId: "other-fork" });
    stopFindFirstMock.mockResolvedValue(null);

    const result = await createStop("trip-1", ROUGH_INPUT, "fork-9");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.chapterId).toBeDefined();
    expect(stopCreateMock).not.toHaveBeenCalled();
  });
});

describe("plan-scope: applyStopDates ripple scoped to edited stop's forkId", () => {
  it("fetches following stops scoped to the fork when the edited stop is in a fork", async () => {
    // requireStopAccess returns a fork stop
    stopFindUniqueMock.mockResolvedValue({
      id: "fork-stop-1",
      tripId: "trip-1",
      sortOrder: 0,
      arriveDate: null,
      departDate: null,
      nights: null,
      pinned: false,
      forkId: "fork-9",
    });
    stopFindManyMock.mockResolvedValue([]);
    tripFindUniqueMock.mockResolvedValue({ endDate: "2026-07-20" });
    tripUpdateMock.mockResolvedValue({});

    await setStopDates("fork-stop-1", { arriveDate: "2026-07-12", departDate: "2026-07-15" });

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }),
      }),
    );
  });
});

describe("plan-scope: firmUpSegment/firmUpTrip findMany", () => {
  it("firmUpSegment fetches stops within the real plan only (forkId null)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "rome", sortOrder: 0, chapterId: "it", nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Rome", country: "Italy" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});
    chapterFindUniqueMock.mockResolvedValue({ name: "Italy", startDate: null, endDate: null });
    chapterUpdateMock.mockResolvedValue({});

    await firmUpSegment({ tripId: "trip-1", chapterId: "it" });

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: null }),
      }),
    );
  });
});

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

  it("calls geocodePlaceDetailed when lat/lng are not provided", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "stop-1" });
    geocodePlaceDetailedMock.mockResolvedValue({ lat: 51.5074, lng: -0.1278, city: "London", country: "United Kingdom", countryCode: "gb", name: "London, UK" });

    await createStop("trip-1", VALID_INPUT);

    expect(geocodePlaceDetailedMock).toHaveBeenCalledOnce();
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ lat: 51.5074, lng: -0.1278, countryCode: "gb" }),
    });
  });

  it("stores derived countryCode from geocodePlaceDetailed result", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "stop-1" });
    geocodePlaceDetailedMock.mockResolvedValue({ lat: 35.6762, lng: 139.6503, city: "Tokyo", country: "Japan", countryCode: "jp", name: "Tokyo, Japan" });

    await createStop("trip-1", VALID_INPUT);

    expect(geocodePlaceDetailedMock).toHaveBeenCalledOnce();
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ countryCode: "jp" }),
    });
  });

  it("uses provided lat/lng and skips geocode", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "stop-1" });

    await createStop("trip-1", { ...VALID_INPUT, lat: 10, lng: 20 });

    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
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
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
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
// createStop — afterStopId (insertion anchor)
// ---------------------------------------------------------------------------

describe("createStop with afterStopId", () => {
  // The insert path uses db.$transaction + a SELECT ... FOR UPDATE raw query
  // (mirroring moveStop/reorderStops — ADR 0007). queryRawMock stands in for
  // tx.$queryRaw; stopUpdateMock and stopCreateMock are called via tx.stop.*.

  it("inserts after the anchor stop and bumps later sibling sortOrders", async () => {
    // Siblings: a(0), b(1), c(2). Anchor = "a". New stop should land at sortOrder=1; b→2, c→3.
    // The FOR UPDATE lock returns the same sibling list from queryRawMock.
    queryRawMock.mockResolvedValue([
      { id: "a", sortOrder: 0, chapterId: null, chapterSortOrder: null },
      { id: "b", sortOrder: 1, chapterId: null, chapterSortOrder: null },
      { id: "c", sortOrder: 2, chapterId: null, chapterSortOrder: null },
    ]);
    stopCreateMock.mockResolvedValue({ id: "new-stop", name: "Rome" });
    stopUpdateMock.mockResolvedValue({});

    const result = await createStop("trip-1", { mode: "rough", name: "Rome", nights: 2 }, undefined, "a");

    expect(result.success).toBe(true);
    // The insert path must go through a transaction.
    expect(transactionMock).toHaveBeenCalledOnce();
    // FOR UPDATE lock must be issued.
    expect(queryRawMock).toHaveBeenCalledOnce();
    const sqlParts = queryRawMock.mock.calls[0][0] as string[];
    expect(sqlParts.join(" ")).toContain("FOR UPDATE");
    // New stop lands at sortOrder = 1 (right after anchor "a").
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 1 }),
    });
    // Later siblings b and c are bumped.
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "b" }, data: { sortOrder: 2 } });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "c" }, data: { sortOrder: 3 } });
  });

  it("appends (no bumps) when afterStopId is null", async () => {
    stopFindFirstMock.mockResolvedValue({ sortOrder: 4 });
    stopCreateMock.mockResolvedValue({ id: "new-stop", name: "Rome" });

    const result = await createStop("trip-1", { mode: "rough", name: "Rome", nights: 2 }, undefined, null);

    expect(result.success).toBe(true);
    // Append path does NOT use a transaction.
    expect(transactionMock).not.toHaveBeenCalled();
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 5 }),
    });
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("inherits chapterId and sets chapterSortOrder just after anchor when anchor has chapterId", async () => {
    // Anchor "anchor-1" is in chapter "ch-1" with chapterSortOrder=2.
    queryRawMock.mockResolvedValue([
      { id: "anchor-1", sortOrder: 0, chapterId: "ch-1", chapterSortOrder: 2 },
      { id: "other-1", sortOrder: 1, chapterId: "ch-1", chapterSortOrder: 3 },
    ]);
    stopCreateMock.mockResolvedValue({ id: "new-stop", name: "Venice" });
    stopUpdateMock.mockResolvedValue({});
    // Chapter belongs to the right plan (validated before the tx for explicit chapterId).
    chapterFindUniqueMock.mockResolvedValue({ id: "ch-1", forkId: null });

    const result = await createStop(
      "trip-1",
      { mode: "rough", name: "Venice", nights: 1, chapterId: "ch-1" },
      undefined,
      "anchor-1",
    );

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        chapterId: "ch-1",
        chapterSortOrder: 3, // anchor's chapterSortOrder(2) + 1
      }),
    });
  });

  it("falls back to append when afterStopId is not found in siblings", async () => {
    queryRawMock.mockResolvedValue([
      { id: "a", sortOrder: 0, chapterId: null, chapterSortOrder: null },
      { id: "b", sortOrder: 1, chapterId: null, chapterSortOrder: null },
    ]);
    stopCreateMock.mockResolvedValue({ id: "new-stop", name: "Rome" });

    const result = await createStop("trip-1", { mode: "rough", name: "Rome", nights: 2 }, undefined, "nonexistent");

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 2 }),
    });
    expect(stopUpdateMock).not.toHaveBeenCalled();
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
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
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
      forkId: null,
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
    // SQL must include forkId scoping.
    expect(sqlParts.join(" ")).toContain("forkId");
    // The real-plan branch must emit an IS NULL predicate — the Prisma.Sql
    // fragment for the forkId scope has NO bound values (guards against a future
    // `= NULL` regression, which would never match rows).
    const forkIdSqlArg = queryRawMock.mock.calls[0][2] as { values: unknown[] };
    expect(forkIdSqlArg).toBeTruthy();
    expect(forkIdSqlArg.values).toEqual([]);
  });

  it("moveStop scopes sibling query to the stop's forkId when moving a fork stop", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "fork-stop-2",
      tripId: "trip-1",
      sortOrder: 1,
      arriveDate: null,
      departDate: null,
      nights: null,
      pinned: false,
      forkId: "fork-9",
    });
    const forkStops = [
      { id: "fork-stop-1", sortOrder: 0 },
      { id: "fork-stop-2", sortOrder: 1 },
    ];
    queryRawMock.mockResolvedValue(forkStops);
    stopUpdateMock.mockResolvedValue({});

    const result = await moveStop("fork-stop-2", "up");

    expect(result.success).toBe(true);
    // The SQL template strings must contain the "forkId" column reference.
    const sqlParts = queryRawMock.mock.calls[0][0] as string[];
    expect(sqlParts.join(" ")).toContain("forkId");
    // The Prisma.Sql object for the = ${forkId} branch has a non-empty values array.
    // This distinguishes it from the IS NULL branch (which has no values).
    const forkIdSqlArg = queryRawMock.mock.calls[0][2] as { values: unknown[] };
    expect(forkIdSqlArg).toBeTruthy();
    expect(forkIdSqlArg.values).toEqual(["fork-9"]);
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
    geocodePlaceDetailedMock.mockResolvedValue(null);
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
    geocodePlaceDetailedMock.mockResolvedValue(null);
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
    geocodePlaceDetailedMock.mockResolvedValue(null);
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

  it("ripple preserves downstream scheduled stop span when nights column is null", async () => {
    // Stop A: scheduled 2026-07-01..2026-07-05 (4 nights), sortOrder 0
    // Stop B: scheduled 2026-07-05..2026-07-10 (5-night SPAN), nights: null (never set), not pinned, sortOrder 1
    // Action: setStopNights("a", 2) → A departs 2026-07-03
    // Expected ripple: B arrive = 2026-07-03, B depart = 2026-07-08 (5-night span preserved)
    // Bug: old code used nights: null → flowDates treats it as nights ?? 1 → depart 2026-07-04
    stopFindUniqueMock
      // requireStopAccess for "a"
      .mockResolvedValueOnce({ id: "a", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-07-01", departDate: "2026-07-05", nights: null, pinned: false })
      // applyStopDates before-row for "a"
      .mockResolvedValueOnce({ name: "Alpha", country: "France", arriveDate: "2026-07-01", departDate: "2026-07-05", nights: null });
    stopFindManyMock.mockResolvedValue([
      // Stop B: 5-night span (Jul 5 → Jul 10), nights column null
      { id: "b", sortOrder: 1, nights: null, pinned: false, arriveDate: "2026-07-05", departDate: "2026-07-10" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripFindUniqueMock.mockResolvedValue({ endDate: "2026-07-10" });
    tripUpdateMock.mockResolvedValue({});

    const r = await setStopNights("a", 2);

    expect(r.success).toBe(true);
    // A's new dates: arrive 2026-07-01, depart 2026-07-03
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { arriveDate: "2026-07-01", departDate: "2026-07-03" },
    });
    // B must ripple to arrive 2026-07-03, depart 2026-07-08 (5-night span preserved)
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "b" },
      data: { arriveDate: "2026-07-03", departDate: "2026-07-08" },
    });
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
});

// ---------------------------------------------------------------------------
// reorderStops
// ---------------------------------------------------------------------------

describe("reorderStops", () => {
  it("happy path: rewrites sortOrder + chapterId for rough stops in new order", async () => {
    // Pre-validation: chapter findMany → c1 is a rough chapter (no startDate)
    chapterFindManyMock.mockResolvedValue([{ id: "c1", startDate: null }]);
    // FOR UPDATE lock: returns all three stops belonging to trip t1
    queryRawMock.mockResolvedValue([
      { id: "a", tripId: "t1", arriveDate: null },
      { id: "b", tripId: "t1", arriveDate: null },
      { id: "c", tripId: "t1", arriveDate: null },
    ]);
    stopUpdateMock.mockResolvedValue({});

    const result = await reorderStops("t1", [
      { id: "a", chapterId: null },
      { id: "b", chapterId: "c1" },
      { id: "c", chapterId: null },
    ]);

    expect(result.success).toBe(true);
    // Each stop gets sortOrder = its index; rough stops also get chapterId written
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "a" }, data: { sortOrder: 0, chapterId: null } });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "b" }, data: { sortOrder: 1, chapterId: "c1" } });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "c" }, data: { sortOrder: 2, chapterId: null } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/t1");
  });

  it("rejects a stop not in the trip: no updates and returns failure", async () => {
    // No chapters to validate (no chapterIds in the list)
    chapterFindManyMock.mockResolvedValue([]);
    // FOR UPDATE returns one stop with a DIFFERENT tripId
    queryRawMock.mockResolvedValue([
      { id: "a", tripId: "t1", arriveDate: null },
      { id: "x", tripId: "other-trip", arriveDate: null },
    ]);

    const result = await reorderStops("t1", [
      { id: "a", chapterId: null },
      { id: "x", chapterId: null },
    ]);

    expect(result.success).toBe(false);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses to move a rough stop into a DATED chapter: returns failure, no updates", async () => {
    // chapter c2 has a non-null startDate → dated chapter
    chapterFindManyMock.mockResolvedValue([{ id: "c2", startDate: "2026-07-01" }]);

    const result = await reorderStops("t1", [
      { id: "a", chapterId: "c2" },
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      // The error message must mention "dated chapter"
      const allErrors = Object.values(result.errors).flat().join(" ");
      expect(allErrors).toMatch(/dated chapter/i);
    }
    expect(stopUpdateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  // I3 — chapter validation must be scoped to the plan of the stops being
  // reordered, closing a cross-plan write vector.
  it("scopes chapter validation to the FORK when reordering fork stops", async () => {
    // The stops being reordered belong to fork-9.
    stopFindManyMock.mockResolvedValue([
      { id: "fa", forkId: "fork-9" },
      { id: "fb", forkId: "fork-9" },
    ]);
    chapterFindManyMock.mockResolvedValue([{ id: "fc1", startDate: null }]);
    queryRawMock.mockResolvedValue([
      { id: "fa", tripId: "t1", arriveDate: null },
      { id: "fb", tripId: "t1", arriveDate: null },
    ]);
    stopUpdateMock.mockResolvedValue({});

    const result = await reorderStops("t1", [
      { id: "fa", chapterId: "fc1" },
      { id: "fb", chapterId: null },
    ]);

    expect(result.success).toBe(true);
    // Chapters must be fetched scoped to the fork plan (forkId: fork-9), not the real plan.
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "t1", forkId: "fork-9" }) }),
    );
  });

  it("scopes chapter validation to the REAL plan when reordering real-plan stops", async () => {
    stopFindManyMock.mockResolvedValue([
      { id: "a", forkId: null },
      { id: "b", forkId: null },
    ]);
    chapterFindManyMock.mockResolvedValue([{ id: "c1", startDate: null }]);
    queryRawMock.mockResolvedValue([
      { id: "a", tripId: "t1", arriveDate: null },
      { id: "b", tripId: "t1", arriveDate: null },
    ]);
    stopUpdateMock.mockResolvedValue({});

    const result = await reorderStops("t1", [
      { id: "a", chapterId: "c1" },
      { id: "b", chapterId: null },
    ]);

    expect(result.success).toBe(true);
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "t1", forkId: null }) }),
    );
  });

  it("rejects a reorder payload mixing stops from different plans", async () => {
    stopFindManyMock.mockResolvedValue([
      { id: "a", forkId: null },
      { id: "fb", forkId: "fork-9" },
    ]);

    const result = await reorderStops("t1", [
      { id: "a", chapterId: "c1" },
      { id: "fb", chapterId: "c1" },
    ]);

    expect(result.success).toBe(false);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("writes chapterId AND sortOrder for a DATED (scheduled) stop (ADR 0021: drag into chapter joins it)", async () => {
    // ADR 0021: dated stops can now be dragged into a chapter; chapterId IS written.
    chapterFindManyMock.mockResolvedValue([]);
    // FOR UPDATE: stop "d" has arriveDate set → scheduled
    queryRawMock.mockResolvedValue([
      { id: "d", tripId: "t1", arriveDate: "2026-07-01" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripFindUniqueMock.mockResolvedValue({ startDate: null });

    const result = await reorderStops("t1", [
      { id: "d", chapterId: "some-chapter" },
    ]);

    expect(result.success).toBe(true);
    // ADR 0021: dated stops now also get chapterId written
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "d" }, data: { sortOrder: 0, chapterId: "some-chapter" } });
  });
});

// ---------------------------------------------------------------------------
// Task 10: restoreStops — verbatim revert of a drag (order + chapter + dates)
// for the Undo toast (ADR 0021).
// ---------------------------------------------------------------------------

describe("Task 10: restoreStops — writes each entry verbatim inside the locked tx", () => {
  it("writes sortOrder, chapterId, arriveDate and departDate for every entry", async () => {
    // Derive tripId from the stops being restored (like reorderStops).
    stopFindManyMock.mockResolvedValue([
      { id: "a", tripId: "t1", forkId: null },
      { id: "b", tripId: "t1", forkId: null },
    ]);
    queryRawMock.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    stopUpdateMock.mockResolvedValue({});
    chapterFindManyMock.mockResolvedValue([]);

    const result = await restoreStops([
      { id: "a", sortOrder: 0, chapterId: null, arriveDate: "2026-07-01", departDate: "2026-07-04" },
      { id: "b", sortOrder: 1, chapterId: "c1", arriveDate: null, departDate: null },
    ]);

    expect(result.success).toBe(true);
    // Each entry is written verbatim — no reflow, no derivation.
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { sortOrder: 0, chapterId: null, arriveDate: "2026-07-01", departDate: "2026-07-04" },
    });
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "b" },
      data: { sortOrder: 1, chapterId: "c1", arriveDate: null, departDate: null },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/t1");
  });

  it("locks the stops FOR UPDATE and recomputes chapter spans inside the tx", async () => {
    stopFindManyMock.mockResolvedValue([{ id: "a", tripId: "t1", forkId: null }]);
    queryRawMock.mockResolvedValue([{ id: "a" }]);
    stopUpdateMock.mockResolvedValue({});
    // One chapter so recomputeChapterSpans performs a chapter.update.
    chapterFindManyMock.mockResolvedValue([{ id: "ch-1" }]);
    chapterUpdateMock.mockResolvedValue({});

    const result = await restoreStops([
      { id: "a", sortOrder: 0, chapterId: "ch-1", arriveDate: "2026-07-01", departDate: "2026-07-04" },
    ]);

    expect(result.success).toBe(true);
    // All writes went through the transaction (interactive form).
    expect(transactionMock).toHaveBeenCalled();
    // FOR UPDATE lock was taken.
    expect(queryRawMock).toHaveBeenCalled();
    // recomputeChapterSpans ran (chapter.update fired for ch-1).
    expect(chapterUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ch-1" } }),
    );
  });

  it("returns success with no updates for an empty entries list", async () => {
    const result = await restoreStops([]);
    expect(result.success).toBe(true);
    expect(stopUpdateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("scopes the chapter recompute to the FORK the stops belong to", async () => {
    stopFindManyMock.mockResolvedValue([{ id: "fa", tripId: "t1", forkId: "fork-9" }]);
    queryRawMock.mockResolvedValue([{ id: "fa" }]);
    stopUpdateMock.mockResolvedValue({});
    chapterFindManyMock.mockResolvedValue([]);

    const result = await restoreStops(
      [{ id: "fa", sortOrder: 0, chapterId: null, arriveDate: null, departDate: null }],
      "fork-9",
    );

    expect(result.success).toBe(true);
    // recomputeChapterSpans (inside the tx) fetches chapters scoped to fork-9.
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "t1", forkId: "fork-9" }) }),
    );
  });
});

// ---------------------------------------------------------------------------
// firmUpTrip
// ---------------------------------------------------------------------------

describe("firmUpTrip", () => {
  it("fetches stops from the real plan when no forkId is passed (forkId null)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "rome", sortOrder: 0, chapterId: null, nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Rome", country: "Italy" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});

    await firmUpTrip("trip-1");

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: null }),
      }),
    );
  });

  it("fetches stops scoped to the fork when forkId is passed", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "fork-rome", sortOrder: 0, chapterId: null, nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Rome", country: "Italy" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});

    await firmUpTrip("trip-1", undefined, "fork-9");

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }),
      }),
    );
  });

  it("does NOT record activity when forkId is passed (fork is silent)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "fr1", sortOrder: 0, chapterId: null, nights: 2, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Nice", country: "France" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});

    await firmUpTrip("trip-1", undefined, "fork-9");

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES record activity when no forkId is passed (real plan)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "rp1", sortOrder: 0, chapterId: null, nights: 2, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Nice", country: "France" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});

    await firmUpTrip("trip-1");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "UPDATED", entityType: "STOP" }),
    );
  });

  it("updates chapter spans when firming up a fork with chapters", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "s1", sortOrder: 0, chapterId: "ch-a", nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Rome", country: "Italy" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});
    chapterUpdateMock.mockResolvedValue({});

    const result = await firmUpTrip("trip-1", undefined, "fork-9");

    expect(result.success).toBe(true);
    // The chapter update must be called (chapter span recalculation runs regardless of plan)
    expect(chapterUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ch-a" } }),
    );
  });
});

// ---------------------------------------------------------------------------
// firmUpSegment (fork-scoping)
// ---------------------------------------------------------------------------

describe("firmUpSegment fork-scoping", () => {
  it("fetches stops scoped to the fork when forkId is in args", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "fr", sortOrder: 0, chapterId: "ch-it", nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Rome", country: "Italy" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});
    chapterFindUniqueMock.mockResolvedValue({ name: "Italy", startDate: null, endDate: null });
    chapterUpdateMock.mockResolvedValue({});

    await firmUpSegment({ tripId: "trip-1", chapterId: "ch-it", forkId: "fork-9" });

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }),
      }),
    );
  });

  it("does NOT record activity when forkId is set in args (fork is silent)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "fr2", sortOrder: 0, chapterId: "ch-it", nights: 2, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Venice", country: "Italy" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});
    chapterFindUniqueMock.mockResolvedValue({ name: "Italy", startDate: null, endDate: null });
    chapterUpdateMock.mockResolvedValue({});

    await firmUpSegment({ tripId: "trip-1", chapterId: "ch-it", forkId: "fork-9" });

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES record activity when no forkId in args (real plan, chapter)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "rp2", sortOrder: 0, chapterId: "ch-it", nights: 2, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Venice", country: "Italy" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});
    chapterFindUniqueMock.mockResolvedValue({ name: "Italy", startDate: null, endDate: null });
    chapterUpdateMock.mockResolvedValue({});

    await firmUpSegment({ tripId: "trip-1", chapterId: "ch-it" });

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "UPDATED", entityType: "CHAPTER" }),
    );
  });
});

// ---------------------------------------------------------------------------
// fork-silent: activity must NOT fire for fork-scoped mutations
// ---------------------------------------------------------------------------

describe("fork-silent: createStop in a fork does NOT record activity", () => {
  it("does not call recordActivity when forkId is set (fork-scoped create)", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "fs-1", name: "Bern" });

    await createStop("trip-1", { mode: "rough" as const, name: "Bern", nights: 2 }, "fork-x");

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when forkId is null (real-plan create)", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "rp-1", name: "Paris" });

    await createStop("trip-1", { mode: "rough" as const, name: "Paris", nights: 2 });

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "CREATED", entityType: "STOP" }),
    );
  });
});

describe("fork-silent: updateStop in a fork does NOT record activity", () => {
  it("does not call recordActivity when stop.forkId is non-null (fork-scoped update)", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s1", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false, forkId: "fork-x" }) // requireStopAccess
      .mockResolvedValueOnce({ id: "s1", name: "Old", country: null, nights: 2, arriveDate: null, departDate: null }); // before snapshot
    stopUpdateMock.mockResolvedValue({ id: "s1", name: "New", country: null });

    await updateStop("s1", { mode: "rough" as const, name: "New", nights: 2 });

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when stop.forkId is null (real-plan update)", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s2", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false, forkId: null }) // requireStopAccess
      .mockResolvedValueOnce({ id: "s2", name: "Old", country: null, nights: 2, arriveDate: null, departDate: null }); // before snapshot
    stopUpdateMock.mockResolvedValue({ id: "s2", name: "New", country: null });

    await updateStop("s2", { mode: "rough" as const, name: "New", nights: 2 });

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "UPDATED", entityType: "STOP" }),
    );
  });
});

describe("fork-silent: deleteStop in a fork does NOT record activity", () => {
  it("does not call recordActivity when stop.forkId is non-null (fork-scoped delete)", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s3", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: null, pinned: false, forkId: "fork-x" }) // requireStopAccess
      .mockResolvedValueOnce({ name: "Rome" }); // label fetch
    stopDeleteMock.mockResolvedValue({});

    await deleteStop("s3");

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when stop.forkId is null (real-plan delete)", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s4", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: null, pinned: false, forkId: null }) // requireStopAccess
      .mockResolvedValueOnce({ name: "Rome" }); // label fetch
    stopDeleteMock.mockResolvedValue({});

    await deleteStop("s4");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityType: "STOP" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Task 11: recomputeChapterSpans helper (self-healing chapter date-bands)
// ---------------------------------------------------------------------------

describe("recomputeChapterSpans: direct helper invocation", () => {
  it("sets chapter startDate/endDate to span its dated stops", async () => {
    // Two stops in chapter "ch-1"; one dated stop spans 2026-07-10 → 2026-07-15.
    chapterFindManyMock.mockResolvedValue([{ id: "ch-1" }]);
    stopFindManyMock.mockResolvedValue([
      { id: "s1", chapterId: "ch-1", arriveDate: "2026-07-10", departDate: "2026-07-15" },
      { id: "s2", chapterId: "ch-1", arriveDate: null, departDate: null },
    ]);
    chapterUpdateMock.mockResolvedValue({});

    const fakeTx = {
      chapter: { findMany: chapterFindManyMock, update: chapterUpdateMock },
      stop: { findMany: stopFindManyMock },
    };
    await recomputeChapterSpans(fakeTx as never, "trip-1", null);

    expect(chapterUpdateMock).toHaveBeenCalledWith({
      where: { id: "ch-1" },
      data: { startDate: "2026-07-10", endDate: "2026-07-15" },
    });
  });

  it("clears chapter dates to null when it has no dated stops", async () => {
    chapterFindManyMock.mockResolvedValue([{ id: "ch-1" }]);
    stopFindManyMock.mockResolvedValue([
      { id: "s1", chapterId: "ch-1", arriveDate: null, departDate: null },
    ]);
    chapterUpdateMock.mockResolvedValue({});

    const fakeTx = {
      chapter: { findMany: chapterFindManyMock, update: chapterUpdateMock },
      stop: { findMany: stopFindManyMock },
    };
    await recomputeChapterSpans(fakeTx as never, "trip-1", null);

    expect(chapterUpdateMock).toHaveBeenCalledWith({
      where: { id: "ch-1" },
      data: { startDate: null, endDate: null },
    });
  });

  it("spans the MIN arriveDate and MAX departDate across multiple dated stops", async () => {
    chapterFindManyMock.mockResolvedValue([{ id: "ch-1" }]);
    stopFindManyMock.mockResolvedValue([
      { id: "s1", chapterId: "ch-1", arriveDate: "2026-07-12", departDate: "2026-07-15" },
      { id: "s2", chapterId: "ch-1", arriveDate: "2026-07-08", departDate: "2026-07-12" },
    ]);
    chapterUpdateMock.mockResolvedValue({});

    const fakeTx = {
      chapter: { findMany: chapterFindManyMock, update: chapterUpdateMock },
      stop: { findMany: stopFindManyMock },
    };
    await recomputeChapterSpans(fakeTx as never, "trip-1", null);

    expect(chapterUpdateMock).toHaveBeenCalledWith({
      where: { id: "ch-1" },
      data: { startDate: "2026-07-08", endDate: "2026-07-15" },
    });
  });
});

describe("Task 11: updateStop (scheduled path) recomputes chapter band atomically", () => {
  it("calls recomputeChapterSpans (chapter.update via tx) when dates change", async () => {
    // Stop belongs to chapter "ch-it"; trip is "trip-1".
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s1", tripId: "trip-1", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false, forkId: null }) // requireStopAccess
      .mockResolvedValueOnce({ id: "s1", name: "Rome", country: "Italy", arriveDate: null, departDate: null }); // before snapshot
    stopUpdateMock.mockResolvedValue({ id: "s1", name: "Rome", country: "Italy", arriveDate: "2026-07-10", departDate: "2026-07-13" });
    stopFindManyMock.mockResolvedValue([]); // no following stops
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: "2026-07-20" });
    tripUpdateMock.mockResolvedValue({});

    // Provide chapter findMany / update via the mock chain.
    // transactionMock forwards chapter ops to chapterFindManyMock / chapterUpdateMock.
    chapterFindManyMock.mockResolvedValue([{ id: "ch-it" }]);
    // tx.stop.findMany is called once inside recomputeChapterSpans (no ripple path in updateStop).
    stopFindManyMock.mockResolvedValue([
      { id: "s1", chapterId: "ch-it", arriveDate: "2026-07-10", departDate: "2026-07-13" },
    ]);

    await updateStop("s1", {
      mode: "scheduled",
      name: "Rome",
      country: "Italy",
      timezone: "Europe/Rome",
      arriveDate: "2026-07-10",
      departDate: "2026-07-13",
    });

    expect(chapterUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ startDate: "2026-07-10", endDate: "2026-07-13" }) }),
    );
  });
});

describe("Task 11: makeStopRough clears chapter band when it is the last dated stop", () => {
  it("sets chapter startDate/endDate to null when the last dated chapterId member is made rough", async () => {
    // Stop "s1" is in chapter "ch-1"; it is the only dated stop for that chapter.
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s1", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-07-10", departDate: "2026-07-13", nights: null, pinned: false, forkId: null }) // requireStopAccess
      .mockResolvedValueOnce({ name: "Rome", arriveDate: "2026-07-10", departDate: "2026-07-13", pinned: false, nights: null }); // before snapshot
    stopUpdateMock.mockResolvedValue({});

    // After clearing, no dated members remain for chapter "ch-1".
    chapterFindManyMock.mockResolvedValue([{ id: "ch-1" }]);
    stopFindManyMock.mockResolvedValue([
      { id: "s1", chapterId: "ch-1", arriveDate: null, departDate: null }, // now rough
    ]);
    chapterUpdateMock.mockResolvedValue({});

    await makeStopRough("s1");

    expect(chapterUpdateMock).toHaveBeenCalledWith({
      where: { id: "ch-1" },
      data: { startDate: null, endDate: null },
    });
  });
});

// ---------------------------------------------------------------------------
// Fix round 1: chapterSpan pure helper
// ---------------------------------------------------------------------------

describe("chapterSpan", () => {
  it("returns nulls for an empty array", () => {
    expect(chapterSpan([])).toEqual({ startDate: null, endDate: null });
  });

  it("returns nulls when no stop has both dates", () => {
    expect(
      chapterSpan([
        { arriveDate: "2026-07-01", departDate: null },
        { arriveDate: null, departDate: "2026-07-05" },
        { arriveDate: null, departDate: null },
      ]),
    ).toEqual({ startDate: null, endDate: null });
  });

  it("returns the single stop's dates when only one qualifies", () => {
    expect(
      chapterSpan([
        { arriveDate: null, departDate: null },
        { arriveDate: "2026-07-03", departDate: "2026-07-06" },
      ]),
    ).toEqual({ startDate: "2026-07-03", endDate: "2026-07-06" });
  });

  it("computes min arriveDate and max departDate over unordered stops", () => {
    expect(
      chapterSpan([
        { arriveDate: "2026-07-10", departDate: "2026-07-13" },
        { arriveDate: "2026-07-05", departDate: "2026-07-20" },
        { arriveDate: "2026-07-08", departDate: "2026-07-15" },
      ]),
    ).toEqual({ startDate: "2026-07-05", endDate: "2026-07-20" });
  });

  it("ignores stops that are missing arriveDate or departDate", () => {
    expect(
      chapterSpan([
        { arriveDate: "2026-07-01", departDate: null },      // missing departDate — ignored
        { arriveDate: "2026-07-03", departDate: "2026-07-08" }, // valid
        { arriveDate: null, departDate: "2026-07-15" },      // missing arriveDate — ignored
      ]),
    ).toEqual({ startDate: "2026-07-03", endDate: "2026-07-08" });
  });
});

// ---------------------------------------------------------------------------
// Task 9: reorderStops date reflow (ADR 0021)
// ---------------------------------------------------------------------------

describe("Task 9: reorderStops — reflows dates for scheduled stops and returns changed[]", () => {
  it("returns changed[] with reflowed dates and persists them when a scheduled stop is reordered", async () => {
    // Trip: startDate 2026-07-01 (used as anchor).
    // Two scheduled stops: A arrives 2026-07-01, departs 2026-07-04 (3n); B arrives 2026-07-04, departs 2026-07-06 (2n).
    // New order: B before A. Reflow from 2026-07-01:
    //   B: arrive 2026-07-01, depart 2026-07-03 (changed)
    //   A: arrive 2026-07-03, depart 2026-07-06 (changed)
    chapterFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([
      { id: "a", tripId: "t1", arriveDate: "2026-07-01" },
      { id: "b", tripId: "t1", arriveDate: "2026-07-04" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    // trip.findUnique for anchor resolution
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    // tx.stop.findMany for reflow — returns stops in the REQUESTED new order
    // (reflowReorderedDates needs arriveDate/departDate/pinned/nights on each stop)
    stopFindManyMock.mockResolvedValue([
      { id: "b", arriveDate: "2026-07-04", departDate: "2026-07-06", nights: null, pinned: false, sortOrder: 0 },
      { id: "a", arriveDate: "2026-07-01", departDate: "2026-07-04", nights: null, pinned: false, sortOrder: 1 },
    ]);
    // chapter findMany for recomputeChapterSpans → no chapters
    chapterFindManyMock.mockResolvedValue([]);

    const result = await reorderStops("t1", [
      { id: "b", chapterId: null },
      { id: "a", chapterId: null },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBeDefined();
      expect(result.changed!.length).toBeGreaterThan(0);
      // B should be reflowed to arrive 2026-07-01
      const bChanged = result.changed!.find((c) => c.id === "b");
      expect(bChanged).toBeDefined();
      expect(bChanged!.arriveDate).toBe("2026-07-01");
      expect(bChanged!.departDate).toBe("2026-07-03");
      // A should be reflowed to arrive 2026-07-03
      const aChanged = result.changed!.find((c) => c.id === "a");
      expect(aChanged).toBeDefined();
      expect(aChanged!.arriveDate).toBe("2026-07-03");
      expect(aChanged!.departDate).toBe("2026-07-06");
    }
    // Persists the reflowed dates
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "b" }, data: { arriveDate: "2026-07-01", departDate: "2026-07-03" } });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "a" }, data: { arriveDate: "2026-07-03", departDate: "2026-07-06" } });
  });

  it("does not persist dates for unchanged stops and they are NOT in changed[]", async () => {
    // Only one scheduled stop: reorder is a no-op for dates (anchor = startDate = arriveDate).
    chapterFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([
      { id: "a", tripId: "t1", arriveDate: "2026-07-01" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    stopFindManyMock.mockResolvedValue([
      { id: "a", arriveDate: "2026-07-01", departDate: "2026-07-04", nights: null, pinned: false, sortOrder: 0 },
    ]);
    chapterFindManyMock.mockResolvedValue([]);

    const result = await reorderStops("t1", [{ id: "a", chapterId: null }]);

    expect(result.success).toBe(true);
    if (result.success) {
      // Stop "a" dates are unchanged → not in changed[]
      expect(result.changed).toBeDefined();
      expect(result.changed!.some((c) => c.id === "a")).toBe(false);
    }
    // No date update calls — only sortOrder update
    const dateUpdateCalls = stopUpdateMock.mock.calls.filter(
      (c) => c[0].data.arriveDate !== undefined || c[0].data.departDate !== undefined,
    );
    expect(dateUpdateCalls).toHaveLength(0);
  });

  it("pinned stops are NOT in changed[] and their dates are not overwritten", async () => {
    // Two scheduled stops: pinned P at 2026-07-05 (fixed), flexible F at 2026-07-01.
    // New order: P first, F second. Reflow from anchor 2026-07-01:
    //   P is pinned at 2026-07-05..2026-07-08 → stays fixed, NOT changed.
    //   F lands BEFORE P: arrive 2026-07-01, depart 2026-07-05 → may change from original.
    chapterFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([
      { id: "p", tripId: "t1", arriveDate: "2026-07-05" },
      { id: "f", tripId: "t1", arriveDate: "2026-07-01" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    stopFindManyMock.mockResolvedValue([
      { id: "p", arriveDate: "2026-07-05", departDate: "2026-07-08", nights: null, pinned: true,  sortOrder: 0 },
      { id: "f", arriveDate: "2026-07-01", departDate: "2026-07-05", nights: null, pinned: false, sortOrder: 1 },
    ]);
    chapterFindManyMock.mockResolvedValue([]);

    const result = await reorderStops("t1", [
      { id: "p", chapterId: null },
      { id: "f", chapterId: null },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      // Pinned stop must NOT appear in changed[]
      expect(result.changed!.some((c) => c.id === "p")).toBe(false);
    }
    // Pinned stop's dates must NOT be overwritten
    expect(stopUpdateMock).not.toHaveBeenCalledWith({ where: { id: "p" }, data: expect.objectContaining({ arriveDate: expect.anything() }) });
  });

  it("returns conflicts[] when a pin can't fit after flexible stops overrun it", async () => {
    // Pinned stop at 2026-07-02 (just 1 day after anchor 2026-07-01), flexible stop needs 5 nights before it.
    // Conflict: flexible stop can't fit before the pin.
    chapterFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([
      { id: "big", tripId: "t1", arriveDate: "2026-07-01" },
      { id: "pin", tripId: "t1", arriveDate: "2026-07-02" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    stopFindManyMock.mockResolvedValue([
      // big: 5-night stop, flexible, arriveDate not important for reflow (reflow uses nights from duration)
      { id: "big", arriveDate: "2026-07-01", departDate: "2026-07-06", nights: null, pinned: false, sortOrder: 0 },
      // pin: pinned at 2026-07-02 — can't fit 5 nights before it from 2026-07-01
      { id: "pin", arriveDate: "2026-07-02", departDate: "2026-07-05", nights: null, pinned: true, sortOrder: 1 },
    ]);
    chapterFindManyMock.mockResolvedValue([]);

    const result = await reorderStops("t1", [
      { id: "big", chapterId: null },
      { id: "pin", chapterId: null },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts!.length).toBeGreaterThan(0);
    }
    // Pin's dates must NOT be overwritten — the pin stays fixed even under conflict.
    expect(stopUpdateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pin" }, data: expect.objectContaining({ arriveDate: expect.anything() }) }),
    );
  });

  it("uses earliest arriveDate as anchor when trip.startDate is null", async () => {
    // No trip.startDate; earliest arriveDate among scheduled stops = 2026-07-03.
    chapterFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([
      { id: "x", tripId: "t1", arriveDate: "2026-07-05" },
      { id: "y", tripId: "t1", arriveDate: "2026-07-03" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripFindUniqueMock.mockResolvedValue({ startDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "x", arriveDate: "2026-07-05", departDate: "2026-07-08", nights: null, pinned: false, sortOrder: 0 },
      { id: "y", arriveDate: "2026-07-03", departDate: "2026-07-05", nights: null, pinned: false, sortOrder: 1 },
    ]);
    chapterFindManyMock.mockResolvedValue([]);

    const result = await reorderStops("t1", [
      { id: "x", chapterId: null },
      { id: "y", chapterId: null },
    ]);

    expect(result.success).toBe(true);
    // anchor = 2026-07-03 (earliest arriveDate pre-reorder)
    // new order: x(3n) then y(2n) → x arrive 2026-07-03, depart 2026-07-06; y arrive 2026-07-06, depart 2026-07-08
    if (result.success) {
      const xChanged = result.changed?.find((c) => c.id === "x");
      expect(xChanged?.arriveDate).toBe("2026-07-03");
    }
  });

  it("calls recomputeChapterSpans after persisting reflowed dates", async () => {
    chapterFindManyMock.mockResolvedValue([{ id: "ch1" }]);
    queryRawMock.mockResolvedValue([
      { id: "s", tripId: "t1", arriveDate: "2026-07-01" },
    ]);
    stopUpdateMock.mockResolvedValue({});
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    stopFindManyMock.mockResolvedValue([
      { id: "s", chapterId: "ch1", arriveDate: "2026-07-01", departDate: "2026-07-04", nights: null, pinned: false, sortOrder: 0 },
    ]);

    await reorderStops("t1", [{ id: "s", chapterId: "ch1" }]);

    // recomputeChapterSpans calls tx.chapter.findMany then tx.chapter.update
    expect(chapterFindManyMock).toHaveBeenCalled();
    expect(chapterUpdateMock).toHaveBeenCalled();
  });
});
