import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the createFork server action.
 *
 * Mocks:
 *   - lib/db           → Prisma client (fork, chapter, stop, accommodation, item, transport, cost, $transaction)
 *   - lib/guards       → requireTripAccess, assertForkingAllowed
 *   - lib/trip-phase   → computeTripPhase
 *   - lib/dates        → todayISO
 *   - server/actions/activity → recordActivity
 *   - next/cache       → revalidatePath
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  requireTripAccessMock,
  requireForkAccessMock,
  assertForkingAllowedMock,
  computeTripPhaseMock,
  todayISOMock,
  recordActivityMock,
  revalidatePathMock,
  forkCountMock,
  forkFindManyMock,
  forkCreateMock,
  forkUpdateMock,
  forkDeleteMock,
  chapterFindManyMock,
  chapterCreateMock,
  stopFindManyMock,
  stopCreateMock,
  accommodationFindManyMock,
  accommodationCreateMock,
  itemFindManyMock,
  itemCreateMock,
  transportFindManyMock,
  transportCreateMock,
  costFindManyMock,
  costCreateMock,
  exchangeRateFindManyMock,
  tripFindUniqueMock,
  txMock,
  computePlanMetricsMock,
} = vi.hoisted(() => {
  const forkCountMock = vi.fn();
  const forkFindManyMock = vi.fn().mockResolvedValue([]);
  const forkCreateMock = vi.fn();
  const forkUpdateMock = vi.fn();
  const forkDeleteMock = vi.fn();
  const chapterFindManyMock = vi.fn().mockResolvedValue([]);
  const chapterCreateMock = vi.fn();
  const stopFindManyMock = vi.fn().mockResolvedValue([]);
  const stopCreateMock = vi.fn();
  const accommodationFindManyMock = vi.fn().mockResolvedValue([]);
  const accommodationCreateMock = vi.fn();
  const itemFindManyMock = vi.fn().mockResolvedValue([]);
  const itemCreateMock = vi.fn();
  const transportFindManyMock = vi.fn().mockResolvedValue([]);
  const transportCreateMock = vi.fn();
  const costFindManyMock = vi.fn().mockResolvedValue([]);
  const costCreateMock = vi.fn();
  const exchangeRateFindManyMock = vi.fn().mockResolvedValue([]);
  const tripFindUniqueMock = vi.fn();

  // computePlanMetrics mock — returns a predictable stub metrics object
  const computePlanMetricsMock = vi.fn().mockReturnValue({
    stopCount: 0,
    nightTotal: 0,
    countries: [],
    projectedEnd: null,
    hardEndState: "none",
    budgetHomeMinor: null,
    flagCounts: { warning: 0, info: 0 },
    transitMinutes: 0,
    drivingMinutes: 0,
    flightCount: 0,
    route: [],
  });

  // $transaction executes the callback with a fake tx stub
  const txMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      fork: { create: forkCreateMock },
      chapter: { create: chapterCreateMock },
      stop: { create: stopCreateMock },
      accommodation: { create: accommodationCreateMock },
      item: { create: itemCreateMock },
      transport: { create: transportCreateMock },
      cost: { create: costCreateMock },
    };
    return cb(tx);
  });

  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    }),
    requireForkAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      fork: { id: "fork-1", tripId: "trip-1", name: "Variant 1" },
      trip: { id: "trip-1" },
    }),
    assertForkingAllowedMock: vi.fn(), // no-op by default (forking allowed)
    computeTripPhaseMock: vi.fn().mockReturnValue("planning"),
    todayISOMock: vi.fn().mockReturnValue("2026-07-01"),
    recordActivityMock: vi.fn().mockResolvedValue(undefined),
    revalidatePathMock: vi.fn(),
    forkCountMock,
    forkFindManyMock,
    forkCreateMock,
    forkUpdateMock,
    forkDeleteMock,
    chapterFindManyMock,
    chapterCreateMock,
    stopFindManyMock,
    stopCreateMock,
    accommodationFindManyMock,
    accommodationCreateMock,
    itemFindManyMock,
    itemCreateMock,
    transportFindManyMock,
    transportCreateMock,
    costFindManyMock,
    costCreateMock,
    exchangeRateFindManyMock,
    tripFindUniqueMock,
    txMock,
    computePlanMetricsMock,
  };
});

vi.mock("@/lib/compare", () => ({
  computePlanMetrics: computePlanMetricsMock,
}));

vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
  requireForkAccess: requireForkAccessMock,
  assertForkingAllowed: assertForkingAllowedMock,
}));

vi.mock("@/lib/trip-phase", () => ({
  computeTripPhase: computeTripPhaseMock,
}));

vi.mock("@/lib/dates", () => ({
  todayISO: todayISOMock,
}));

vi.mock("@/server/actions/activity", () => ({
  recordActivity: recordActivityMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: txMock,
    fork: { count: forkCountMock, findMany: forkFindManyMock, create: forkCreateMock, update: forkUpdateMock, delete: forkDeleteMock },
    chapter: { findMany: chapterFindManyMock, create: chapterCreateMock },
    stop: { findMany: stopFindManyMock, create: stopCreateMock },
    accommodation: { findMany: accommodationFindManyMock, create: accommodationCreateMock },
    item: { findMany: itemFindManyMock, create: itemCreateMock },
    transport: { findMany: transportFindManyMock, create: transportCreateMock },
    cost: { findMany: costFindManyMock, create: costCreateMock },
    exchangeRate: { findMany: exchangeRateFindManyMock },
    trip: { findUnique: tripFindUniqueMock },
  },
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks are registered
// ---------------------------------------------------------------------------

import { createFork, renameFork, discardFork, getComparison } from "./forks";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDefaultTrip() {
  tripFindUniqueMock.mockResolvedValue({
    id: "trip-1",
    startDate: "2026-10-01",
    endDate: "2026-10-14",
  });
}

function setupDefaultFork(name = "Variant 1") {
  forkCreateMock.mockResolvedValue({ id: "fork-new", name, tripId: "trip-1", sortOrder: 0 });
}

afterEach(() => {
  vi.clearAllMocks();
  // Reset to default state
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
  assertForkingAllowedMock.mockImplementation(() => undefined);
  computeTripPhaseMock.mockReturnValue("planning");
  todayISOMock.mockReturnValue("2026-07-01");
  forkFindManyMock.mockResolvedValue([]);
  chapterFindManyMock.mockResolvedValue([]);
  stopFindManyMock.mockResolvedValue([]);
  accommodationFindManyMock.mockResolvedValue([]);
  itemFindManyMock.mockResolvedValue([]);
  transportFindManyMock.mockResolvedValue([]);
  costFindManyMock.mockResolvedValue([]);
  exchangeRateFindManyMock.mockResolvedValue([]);
  computePlanMetricsMock.mockReturnValue({
    stopCount: 0,
    nightTotal: 0,
    countries: [],
    projectedEnd: null,
    hardEndState: "none",
    budgetHomeMinor: null,
    flagCounts: { warning: 0, info: 0 },
    transitMinutes: 0,
    drivingMinutes: 0,
    flightCount: 0,
    route: [],
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createFork", () => {
  describe("pre-condition: cap enforcement", () => {
    it("rejects when the fork cap is reached (4 forks exist)", async () => {
      forkCountMock.mockResolvedValue(4);
      setupDefaultTrip();

      const res = await createFork("trip-1", "Plan B");

      expect(res).toEqual({
        success: false,
        error: expect.stringMatching(/limit|cap|maximum/i),
      });
      expect(txMock).not.toHaveBeenCalled();
    });

    it("allows creation when exactly 3 forks exist", async () => {
      forkCountMock.mockResolvedValue(3);
      setupDefaultTrip();
      setupDefaultFork("Variant 4");

      const res = await createFork("trip-1", "Variant 4");
      expect(res).toEqual({ success: true, forkId: "fork-new" });
    });
  });

  describe("pre-condition: phase gate", () => {
    it("rejects in travelling phase", async () => {
      forkCountMock.mockResolvedValue(0);
      setupDefaultTrip();
      computeTripPhaseMock.mockReturnValue("travelling");
      assertForkingAllowedMock.mockImplementation(() => {
        throw new Error("Forking is only available before departure");
      });

      const res = await createFork("trip-1", "Plan B");

      expect(res).toEqual({ success: false, error: expect.any(String) });
      expect(txMock).not.toHaveBeenCalled();
    });

    it("rejects in past phase", async () => {
      forkCountMock.mockResolvedValue(0);
      setupDefaultTrip();
      computeTripPhaseMock.mockReturnValue("past");
      assertForkingAllowedMock.mockImplementation(() => {
        throw new Error("Forking is only available before departure");
      });

      const res = await createFork("trip-1");

      expect(res).toEqual({ success: false, error: expect.any(String) });
      expect(txMock).not.toHaveBeenCalled();
    });
  });

  describe("success path: real plan copy", () => {
    beforeEach(() => {
      forkCountMock.mockResolvedValue(1);
      setupDefaultTrip();
      setupDefaultFork("Plan B");
    });

    it("returns success with new forkId", async () => {
      const res = await createFork("trip-1", "Plan B");
      expect(res).toEqual({ success: true, forkId: "fork-new" });
    });

    it("reads source entities scoped to forkId: null (real plan)", async () => {
      await createFork("trip-1", "Plan B");

      expect(chapterFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
      expect(stopFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
      expect(transportFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
      expect(accommodationFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
      expect(itemFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
      expect(costFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
    });

    it("creates a Fork row with the correct name", async () => {
      await createFork("trip-1", "Plan B");

      expect(forkCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tripId: "trip-1", name: "Plan B" }),
        }),
      );
    });

    it("tags copied chapter rows with the new forkId", async () => {
      chapterFindManyMock.mockResolvedValue([
        { id: "ch-1", name: "Chapter 1", colour: "#fff", startDate: null, endDate: null, sortOrder: 0 },
      ]);
      chapterCreateMock.mockResolvedValue({ id: "new-ch-1" });

      await createFork("trip-1", "Plan B");

      expect(chapterCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tripId: "trip-1", forkId: "fork-new" }),
        }),
      );
    });

    it("remaps stop chapterId via chapterIdMap", async () => {
      chapterFindManyMock.mockResolvedValue([
        { id: "ch-src", name: "Chapter 1", colour: "#fff", startDate: null, endDate: null, sortOrder: 0 },
      ]);
      chapterCreateMock.mockResolvedValue({ id: "ch-new" });

      stopFindManyMock.mockResolvedValue([
        {
          id: "stop-src",
          chapterId: "ch-src",
          name: "Paris",
          country: "FR",
          lat: 48.8, lng: 2.3,
          timezone: "Europe/Paris",
          arriveDate: "2026-10-01", departDate: "2026-10-04",
          nights: 3, pinned: false, sortOrder: 0, chapterSortOrder: 0, notes: null,
        },
      ]);
      stopCreateMock.mockResolvedValue({ id: "stop-new" });

      await createFork("trip-1", "Plan B");

      expect(stopCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ chapterId: "ch-new", forkId: "fork-new" }),
        }),
      );
    });

    it("records CREATED FORK activity", async () => {
      await createFork("trip-1", "Plan B");

      expect(recordActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: "trip-1",
          verb: "CREATED",
          entityType: "FORK",
          entityId: "fork-new",
        }),
      );
    });

    it("revalidates both trip paths", async () => {
      await createFork("trip-1", "Plan B");

      expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/compare");
    });

    it("passes todayISO to computeTripPhase", async () => {
      await createFork("trip-1", "Plan B");

      expect(computeTripPhaseMock).toHaveBeenCalledWith(
        expect.objectContaining({ today: "2026-07-01" }),
      );
    });
  });

  describe("fork-from-fork: sourceForkId param", () => {
    beforeEach(() => {
      forkCountMock.mockResolvedValue(0);
      setupDefaultTrip();
      setupDefaultFork("Child Fork");
    });

    it("scopes source reads to sourceForkId when provided", async () => {
      await createFork("trip-1", "Child Fork", "fork-parent");

      expect(chapterFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ forkId: "fork-parent" }) }),
      );
      expect(stopFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ forkId: "fork-parent" }) }),
      );
      expect(transportFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ forkId: "fork-parent" }) }),
      );
      expect(accommodationFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ forkId: "fork-parent" }) }),
      );
      expect(itemFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ forkId: "fork-parent" }) }),
      );
      expect(costFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ forkId: "fork-parent" }) }),
      );
    });

    it("uses forkId: null when sourceForkId is not provided (default real plan)", async () => {
      await createFork("trip-1", "New Fork");

      expect(chapterFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
      );
    });
  });

  describe("ID-map: transport-owned cost remap", () => {
    it("remaps transport-owned costs to the copied transport id", async () => {
      forkCountMock.mockResolvedValue(0);
      setupDefaultTrip();
      setupDefaultFork("Transport Test Fork");

      // Source transport
      transportFindManyMock.mockResolvedValue([
        {
          id: "transport-src",
          fromStopId: null, toStopId: null,
          mode: "FLIGHT", depPlace: "SYD", arrPlace: "CDG",
          depAt: null, arrAt: null,
          depLat: null, depLng: null, arrLat: null, arrLng: null,
          reference: "QF1", notes: null, sortOrder: 0,
        },
      ]);
      transportCreateMock.mockResolvedValue({ id: "transport-new" });

      // Source cost owned by the transport
      costFindManyMock.mockResolvedValue([
        {
          id: "cost-src",
          estimatedMinor: 150000,
          actualMinor: null,
          currency: "AUD",
          rateToHome: 1,
          paidAt: null,
          ownerType: "TRANSPORT",
          ownerId: "transport-src",
          label: "Flight cost",
          category: "TRANSPORT",
        },
      ]);
      costCreateMock.mockResolvedValue({ id: "cost-new" });

      await createFork("trip-1", "Transport Test Fork");

      // Assert the cost was created with the NEW transport id
      expect(costCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: "transport-new",
            ownerType: "TRANSPORT",
          }),
        }),
      );
    });
  });

  describe("ID-map: accommodation-owned cost remap", () => {
    it("remaps accommodation-owned costs to the copied accommodation id", async () => {
      forkCountMock.mockResolvedValue(0);
      setupDefaultTrip();
      setupDefaultFork("Acc Test Fork");

      stopFindManyMock.mockResolvedValue([
        {
          id: "stop-src",
          chapterId: null, name: "Rome", country: "IT", lat: null, lng: null,
          timezone: null, arriveDate: null, departDate: null, nights: null,
          pinned: false, sortOrder: 0, chapterSortOrder: 0, notes: null,
        },
      ]);
      stopCreateMock.mockResolvedValue({ id: "stop-new" });

      accommodationFindManyMock.mockResolvedValue([
        {
          id: "acc-src",
          stopId: "stop-src",
          name: "Hotel Roma",
          address: null, checkIn: "2026-10-01", checkOut: "2026-10-04", confirmation: null,
          notes: null, lat: null, lng: null,
        },
      ]);
      accommodationCreateMock.mockResolvedValue({ id: "acc-new" });

      costFindManyMock.mockResolvedValue([
        {
          id: "cost-acc-src",
          estimatedMinor: 50000, actualMinor: null,
          currency: "EUR", rateToHome: 1.6,
          paidAt: null, ownerType: "ACCOMMODATION", ownerId: "acc-src",
          label: "Hotel cost", category: "ACCOMMODATION",
        },
      ]);
      costCreateMock.mockResolvedValue({ id: "cost-acc-new" });

      await createFork("trip-1", "Acc Test Fork");

      expect(costCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: "acc-new",
            ownerType: "ACCOMMODATION",
          }),
        }),
      );
    });
  });

  describe("ID-map: OTHER cost (no owner)", () => {
    it("sets ownerId to null for OTHER costs", async () => {
      forkCountMock.mockResolvedValue(0);
      setupDefaultTrip();
      setupDefaultFork("Other Cost Fork");

      costFindManyMock.mockResolvedValue([
        {
          id: "cost-other",
          estimatedMinor: 10000, actualMinor: null,
          currency: "AUD", rateToHome: 1,
          paidAt: null, ownerType: "OTHER", ownerId: null,
          label: "Misc", category: null,
        },
      ]);
      costCreateMock.mockResolvedValue({ id: "cost-other-new" });

      await createFork("trip-1", "Other Cost Fork");

      expect(costCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ownerId: null }),
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// renameFork
// ---------------------------------------------------------------------------

describe("renameFork", () => {
  afterEach(() => {
    vi.clearAllMocks();
    requireForkAccessMock.mockResolvedValue({
      user: { id: "user-1" },
      fork: { id: "fork-1", tripId: "trip-1", name: "Variant 1" },
      trip: { id: "trip-1" },
    });
  });

  it("calls requireForkAccess with the forkId", async () => {
    forkUpdateMock.mockResolvedValue({ id: "fork-1", name: "New Name", tripId: "trip-1" });

    await renameFork("fork-1", "New Name");

    expect(requireForkAccessMock).toHaveBeenCalledWith("fork-1");
  });

  it("returns error for empty name (empty string)", async () => {
    const res = await renameFork("fork-1", "");

    expect(res).toEqual({ success: false, error: expect.any(String) });
    expect(forkUpdateMock).not.toHaveBeenCalled();
  });

  it("returns error for whitespace-only name", async () => {
    const res = await renameFork("fork-1", "   ");

    expect(res).toEqual({ success: false, error: expect.any(String) });
    expect(forkUpdateMock).not.toHaveBeenCalled();
  });

  it("trims and updates with valid name", async () => {
    forkUpdateMock.mockResolvedValue({ id: "fork-1", name: "Trimmed Name", tripId: "trip-1" });

    const res = await renameFork("fork-1", "  Trimmed Name  ");

    expect(res).toEqual({ success: true });
    expect(forkUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "fork-1" },
        data: { name: "Trimmed Name" },
      }),
    );
  });

  it("logs UPDATED FORK activity with trimmed name", async () => {
    forkUpdateMock.mockResolvedValue({ id: "fork-1", name: "Plan B", tripId: "trip-1" });

    await renameFork("fork-1", "Plan B");

    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "FORK",
        entityId: "fork-1",
        entityLabel: "Plan B",
      }),
    );
  });

  it("revalidates both trip paths", async () => {
    forkUpdateMock.mockResolvedValue({ id: "fork-1", name: "Plan B", tripId: "trip-1" });

    await renameFork("fork-1", "Plan B");

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/compare");
  });
});

// ---------------------------------------------------------------------------
// discardFork
// ---------------------------------------------------------------------------

describe("discardFork", () => {
  afterEach(() => {
    vi.clearAllMocks();
    requireForkAccessMock.mockResolvedValue({
      user: { id: "user-1" },
      fork: { id: "fork-1", tripId: "trip-1", name: "Variant 1" },
      trip: { id: "trip-1" },
    });
  });

  it("calls requireForkAccess with the forkId", async () => {
    forkDeleteMock.mockResolvedValue({ id: "fork-1", name: "Variant 1", tripId: "trip-1" });

    await discardFork("fork-1");

    expect(requireForkAccessMock).toHaveBeenCalledWith("fork-1");
  });

  it("deletes the fork by id", async () => {
    forkDeleteMock.mockResolvedValue({ id: "fork-1", name: "Variant 1", tripId: "trip-1" });

    const res = await discardFork("fork-1");

    expect(res).toEqual({ success: true });
    expect(forkDeleteMock).toHaveBeenCalledWith({ where: { id: "fork-1" } });
  });

  it("logs DELETED FORK activity with the fork name from requireForkAccess", async () => {
    forkDeleteMock.mockResolvedValue({ id: "fork-1", name: "Variant 1", tripId: "trip-1" });

    await discardFork("fork-1");

    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "DELETED",
        entityType: "FORK",
        entityId: "fork-1",
        entityLabel: "Variant 1",
      }),
    );
  });

  it("revalidates both trip paths", async () => {
    forkDeleteMock.mockResolvedValue({ id: "fork-1", name: "Variant 1", tripId: "trip-1" });

    await discardFork("fork-1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/compare");
  });
});

// ---------------------------------------------------------------------------
// getComparison
// ---------------------------------------------------------------------------

describe("getComparison", () => {
  const tripRow = {
    id: "trip-1",
    name: "My Trip",
    startDate: "2026-10-01",
    hardEndDate: null,
    homeCurrency: "AUD",
    drivingWindingFactor: 1.3,
    drivingAvgSpeedKph: 80,
  };

  beforeEach(() => {
    tripFindUniqueMock.mockResolvedValue(tripRow);
    exchangeRateFindManyMock.mockResolvedValue([]);
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    });
    tripFindUniqueMock.mockResolvedValue(tripRow);
    forkFindManyMock.mockResolvedValue([]);
    exchangeRateFindManyMock.mockResolvedValue([]);
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    computePlanMetricsMock.mockReturnValue({
      stopCount: 0,
      nightTotal: 0,
      countries: [],
      projectedEnd: null,
      hardEndState: "none",
      budgetHomeMinor: null,
      flagCounts: { warning: 0, info: 0 },
      transitMinutes: 0,
      drivingMinutes: 0,
      flightCount: 0,
      route: [],
    });
  });

  describe("plan list structure", () => {
    it("returns real plan first (forkId null, named 'Real plan') when no forks exist", async () => {
      forkFindManyMock.mockResolvedValue([]);

      const result = await getComparison("trip-1");

      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]).toMatchObject({ forkId: null, name: "Real plan" });
    });

    it("returns real plan then forks in sortOrder", async () => {
      forkFindManyMock.mockResolvedValue([
        { id: "fork-A", name: "Variant A", sortOrder: 0 },
        { id: "fork-B", name: "Variant B", sortOrder: 1 },
      ]);

      const result = await getComparison("trip-1");

      expect(result.plans).toHaveLength(3);
      expect(result.plans[0]).toMatchObject({ forkId: null, name: "Real plan" });
      expect(result.plans[1]).toMatchObject({ forkId: "fork-A", name: "Variant A" });
      expect(result.plans[2]).toMatchObject({ forkId: "fork-B", name: "Variant B" });
    });

    it("includes trip fields on the result", async () => {
      forkFindManyMock.mockResolvedValue([]);

      const result = await getComparison("trip-1");

      expect(result.trip).toMatchObject({ id: "trip-1", name: "My Trip" });
    });
  });

  describe("per-plan scoped loading", () => {
    it("loads the real plan's six collections with forkId: null", async () => {
      forkFindManyMock.mockResolvedValue([]);

      await getComparison("trip-1");

      expect(stopFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
      expect(transportFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
      expect(accommodationFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
      expect(itemFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
      expect(costFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
    });

    it("loads each fork's collections scoped to its forkId", async () => {
      forkFindManyMock.mockResolvedValue([
        { id: "fork-A", name: "Variant A", sortOrder: 0 },
      ]);

      await getComparison("trip-1");

      // The fork's stop query should use forkId: "fork-A"
      expect(stopFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-A" }) }),
      );
      expect(costFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-A" }) }),
      );
    });

    it("loads exchangeRates once (trip-scoped, not per plan)", async () => {
      forkFindManyMock.mockResolvedValue([
        { id: "fork-A", name: "Variant A", sortOrder: 0 },
        { id: "fork-B", name: "Variant B", sortOrder: 1 },
      ]);

      await getComparison("trip-1");

      // Should be called exactly once regardless of plan count
      expect(exchangeRateFindManyMock).toHaveBeenCalledTimes(1);
      expect(exchangeRateFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1" }) }),
      );
    });
  });

  describe("metrics computation", () => {
    it("calls computePlanMetrics for each plan (real + each fork)", async () => {
      forkFindManyMock.mockResolvedValue([
        { id: "fork-A", name: "Variant A", sortOrder: 0 },
      ]);

      await getComparison("trip-1");

      expect(computePlanMetricsMock).toHaveBeenCalledTimes(2);
    });

    it("passes the correct trip fields to computePlanMetrics", async () => {
      forkFindManyMock.mockResolvedValue([]);

      await getComparison("trip-1");

      expect(computePlanMetricsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          trip: expect.objectContaining({
            startDate: "2026-10-01",
            homeCurrency: "AUD",
            drivingWindingFactor: 1.3,
            drivingAvgSpeedKph: 80,
          }),
        }),
      );
    });

    it("passes the real plan's rows (forkId: null) to computePlanMetrics for index 0", async () => {
      const realStops = [
        {
          id: "s-real",
          name: "Sydney",
          country: "AU",
          nights: 3,
          sortOrder: 0,
          arriveDate: "2026-10-01",
          departDate: "2026-10-04",
          pinned: false,
          lat: -33.8,
          lng: 151.2,
          timezone: "Australia/Sydney",
        },
      ];
      // stopFindManyMock returns real stops when called with forkId: null
      stopFindManyMock.mockImplementation((args: { where: { forkId: string | null } }) => {
        if (args.where.forkId === null) return Promise.resolve(realStops);
        return Promise.resolve([]);
      });
      forkFindManyMock.mockResolvedValue([]);

      await getComparison("trip-1");

      expect(computePlanMetricsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          stops: realStops,
        }),
      );
    });

    it("puts computePlanMetrics result as the metrics field of each plan", async () => {
      const stubMetrics = {
        stopCount: 5,
        nightTotal: 14,
        countries: ["AU", "JP"],
        projectedEnd: "2026-10-15",
        hardEndState: "ok" as const,
        budgetHomeMinor: 300000,
        flagCounts: { warning: 1, info: 2 },
        transitMinutes: 120,
        drivingMinutes: 60,
        flightCount: 1,
        route: [],
      };
      computePlanMetricsMock.mockReturnValue(stubMetrics);
      forkFindManyMock.mockResolvedValue([]);

      const result = await getComparison("trip-1");

      expect(result.plans[0].metrics).toEqual(stubMetrics);
    });
  });

  describe("auth", () => {
    it("calls requireTripAccess with tripId", async () => {
      forkFindManyMock.mockResolvedValue([]);

      await getComparison("trip-1");

      expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
    });
  });
});
