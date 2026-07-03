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
  forkDeleteManyMock,
  chapterFindManyMock,
  chapterCreateMock,
  chapterDeleteManyMock,
  chapterUpdateManyMock,
  stopFindManyMock,
  stopCreateMock,
  stopDeleteManyMock,
  stopUpdateManyMock,
  accommodationFindManyMock,
  accommodationCreateMock,
  accommodationDeleteManyMock,
  accommodationUpdateManyMock,
  itemFindManyMock,
  itemCreateMock,
  itemDeleteManyMock,
  itemUpdateManyMock,
  transportFindManyMock,
  transportCreateMock,
  transportDeleteManyMock,
  transportUpdateManyMock,
  costFindManyMock,
  costCreateMock,
  costDeleteManyMock,
  costUpdateManyMock,
  attachmentFindManyMock,
  exchangeRateFindManyMock,
  tripFindUniqueMock,
  txMock,
  computePlanMetricsMock,
  diffMetricsMock,
} = vi.hoisted(() => {
  const forkCountMock = vi.fn();
  const forkFindManyMock = vi.fn().mockResolvedValue([]);
  const forkCreateMock = vi.fn();
  const forkUpdateMock = vi.fn();
  const forkDeleteMock = vi.fn();
  const forkDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const chapterFindManyMock = vi.fn().mockResolvedValue([]);
  const chapterCreateMock = vi.fn();
  const chapterDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const chapterUpdateManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const stopFindManyMock = vi.fn().mockResolvedValue([]);
  const stopCreateMock = vi.fn();
  const stopDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const stopUpdateManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const accommodationFindManyMock = vi.fn().mockResolvedValue([]);
  const accommodationCreateMock = vi.fn();
  const accommodationDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const accommodationUpdateManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const itemFindManyMock = vi.fn().mockResolvedValue([]);
  const itemCreateMock = vi.fn();
  const itemDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const itemUpdateManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const transportFindManyMock = vi.fn().mockResolvedValue([]);
  const transportCreateMock = vi.fn();
  const transportDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const transportUpdateManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const costFindManyMock = vi.fn().mockResolvedValue([]);
  const costCreateMock = vi.fn();
  const costDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const costUpdateManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const attachmentFindManyMock = vi.fn().mockResolvedValue([]);
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
    legs: [],
  });

  // diffMetrics mock — returns zero deltas
  const diffMetricsMock = vi.fn().mockReturnValue({
    stopCount: 0,
    nightTotal: 0,
    budgetHomeMinor: null,
    flagWarnings: 0,
    flagInfos: 0,
    transitMinutes: 0,
    drivingMinutes: 0,
    flightCount: 0,
    projectedEndDays: null,
  });

  // $transaction executes the callback with a fake tx stub
  const txMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      fork: { create: forkCreateMock, update: forkUpdateMock, deleteMany: forkDeleteManyMock },
      chapter: { create: chapterCreateMock, deleteMany: chapterDeleteManyMock, updateMany: chapterUpdateManyMock },
      stop: { create: stopCreateMock, deleteMany: stopDeleteManyMock, updateMany: stopUpdateManyMock },
      accommodation: { create: accommodationCreateMock, deleteMany: accommodationDeleteManyMock, updateMany: accommodationUpdateManyMock },
      item: { findMany: itemFindManyMock, create: itemCreateMock, deleteMany: itemDeleteManyMock, updateMany: itemUpdateManyMock },
      transport: { create: transportCreateMock, deleteMany: transportDeleteManyMock, updateMany: transportUpdateManyMock },
      cost: { create: costCreateMock, deleteMany: costDeleteManyMock, updateMany: costUpdateManyMock },
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
      trip: { id: "trip-1", startDate: "2026-10-01", endDate: "2026-10-14" },
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
    forkDeleteManyMock,
    chapterFindManyMock,
    chapterCreateMock,
    chapterDeleteManyMock,
    chapterUpdateManyMock,
    stopFindManyMock,
    stopCreateMock,
    stopDeleteManyMock,
    stopUpdateManyMock,
    accommodationFindManyMock,
    accommodationCreateMock,
    accommodationDeleteManyMock,
    accommodationUpdateManyMock,
    itemFindManyMock,
    itemCreateMock,
    itemDeleteManyMock,
    itemUpdateManyMock,
    transportFindManyMock,
    transportCreateMock,
    transportDeleteManyMock,
    transportUpdateManyMock,
    costFindManyMock,
    costCreateMock,
    costDeleteManyMock,
    costUpdateManyMock,
    attachmentFindManyMock,
    exchangeRateFindManyMock,
    tripFindUniqueMock,
    txMock,
    computePlanMetricsMock,
    diffMetricsMock,
  };
});

vi.mock("@/lib/compare", () => ({
  computePlanMetrics: computePlanMetricsMock,
  diffMetrics: diffMetricsMock,
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
    fork: { count: forkCountMock, findMany: forkFindManyMock, create: forkCreateMock, update: forkUpdateMock, delete: forkDeleteMock, deleteMany: forkDeleteManyMock },
    chapter: { findMany: chapterFindManyMock, create: chapterCreateMock, deleteMany: chapterDeleteManyMock, updateMany: chapterUpdateManyMock },
    stop: { findMany: stopFindManyMock, create: stopCreateMock, deleteMany: stopDeleteManyMock, updateMany: stopUpdateManyMock },
    accommodation: { findMany: accommodationFindManyMock, create: accommodationCreateMock, deleteMany: accommodationDeleteManyMock, updateMany: accommodationUpdateManyMock },
    item: { findMany: itemFindManyMock, create: itemCreateMock, deleteMany: itemDeleteManyMock, updateMany: itemUpdateManyMock },
    transport: { findMany: transportFindManyMock, create: transportCreateMock, deleteMany: transportDeleteManyMock, updateMany: transportUpdateManyMock },
    cost: { findMany: costFindManyMock, create: costCreateMock, deleteMany: costDeleteManyMock, updateMany: costUpdateManyMock },
    attachment: { findMany: attachmentFindManyMock },
    exchangeRate: { findMany: exchangeRateFindManyMock },
    trip: { findUnique: tripFindUniqueMock },
  },
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks are registered
// ---------------------------------------------------------------------------

import { createFork, renameFork, discardFork, getComparison, getPromotionPreview, promoteFork, moveFork } from "./forks";

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
  requireForkAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    fork: { id: "fork-1", tripId: "trip-1", name: "Variant 1" },
    trip: { id: "trip-1", startDate: "2026-10-01", endDate: "2026-10-14" },
  });
  assertForkingAllowedMock.mockImplementation(() => undefined);
  computeTripPhaseMock.mockReturnValue("planning");
  todayISOMock.mockReturnValue("2026-07-01");
  forkFindManyMock.mockResolvedValue([]);
  forkDeleteManyMock.mockResolvedValue({ count: 0 });
  chapterFindManyMock.mockResolvedValue([]);
  chapterDeleteManyMock.mockResolvedValue({ count: 0 });
  chapterUpdateManyMock.mockResolvedValue({ count: 0 });
  stopFindManyMock.mockResolvedValue([]);
  stopDeleteManyMock.mockResolvedValue({ count: 0 });
  stopUpdateManyMock.mockResolvedValue({ count: 0 });
  accommodationFindManyMock.mockResolvedValue([]);
  accommodationDeleteManyMock.mockResolvedValue({ count: 0 });
  accommodationUpdateManyMock.mockResolvedValue({ count: 0 });
  itemFindManyMock.mockResolvedValue([]);
  itemDeleteManyMock.mockResolvedValue({ count: 0 });
  itemUpdateManyMock.mockResolvedValue({ count: 0 });
  transportFindManyMock.mockResolvedValue([]);
  transportDeleteManyMock.mockResolvedValue({ count: 0 });
  transportUpdateManyMock.mockResolvedValue({ count: 0 });
  costFindManyMock.mockResolvedValue([]);
  costDeleteManyMock.mockResolvedValue({ count: 0 });
  costUpdateManyMock.mockResolvedValue({ count: 0 });
  attachmentFindManyMock.mockResolvedValue([]);
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
    legs: [],
  });
  diffMetricsMock.mockReturnValue({
    stopCount: 0,
    nightTotal: 0,
    budgetHomeMinor: null,
    flagWarnings: 0,
    flagInfos: 0,
    transitMinutes: 0,
    drivingMinutes: 0,
    flightCount: 0,
    projectedEndDays: null,
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
      // Items: PLAN PLACEMENTS only (ADR 0022: Stop OR date) — trip-wide
      // wishlist ideas (no stop, no date) are never copied.
      expect(itemFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tripId: "trip-1",
            forkId: null,
            OR: [{ stopId: { not: null } }, { date: { not: null } }],
          }),
        }),
      );
      expect(costFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
      );
    });

    it("loads items via the plan-placement predicate so wishlist ideas are excluded but dateless stop things-to-do are copied", async () => {
      await createFork("trip-1", "Plan B");

      const itemCall = itemFindManyMock.mock.calls[0][0];
      // ADR 0022: placement = Stop OR date (not the old date-only filter).
      expect(itemCall.where.OR).toEqual([{ stopId: { not: null } }, { date: { not: null } }]);
    });

    it("copies a dateless stop-attached thing-to-do into the fork (ADR 0022)", async () => {
      // A plan placement with a Stop but NO date — must be copied into the fork.
      stopFindManyMock.mockResolvedValue([
        {
          id: "stop-src", chapterId: null, name: "Kyoto", country: "JP",
          lat: null, lng: null, timezone: null, arriveDate: null, departDate: null,
          nights: null, pinned: false, sortOrder: 0, chapterSortOrder: 0, notes: null,
        },
      ]);
      stopCreateMock.mockResolvedValue({ id: "stop-new" });

      itemFindManyMock.mockResolvedValue([
        {
          id: "todo-1", stopId: "stop-src", date: null, startTime: null, endTime: null,
          title: "Visit Fushimi Inari", category: "SIGHTSEEING",
          address: null, link: null, booking: null, notes: null,
          lat: null, lng: null, sortOrder: 0, sourceItemId: null,
        },
      ]);
      itemCreateMock.mockResolvedValue({ id: "todo-new" });

      await createFork("trip-1", "Plan B");

      // The dateless thing-to-do is created in the fork, remapped onto the new stop.
      expect(itemCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            forkId: "fork-new",
            stopId: "stop-new",
            date: null,
            title: "Visit Fushimi Inari",
          }),
        }),
      );
    });

    it("does NOT copy a cost whose owner (a wishlist idea) was not copied", async () => {
      // An ITEM cost owned by an idea id that is NOT among the copied items must
      // be skipped — otherwise it would become a dangling-owner (ownerId null)
      // cost in the fork.
      costFindManyMock.mockResolvedValue([
        {
          id: "cost-idea",
          estimatedMinor: 5000, actualMinor: null,
          currency: "AUD", rateToHome: 1,
          paidAt: null, ownerType: "ITEM", ownerId: "idea-999",
          label: "Idea cost", category: null,
        },
      ]);
      // No items copied → itemIdMap empty → owner "idea-999" resolves to null.
      itemFindManyMock.mockResolvedValue([]);

      await createFork("trip-1", "Plan B");

      // The idea-owned cost must NOT be created in the fork.
      expect(costCreateMock).not.toHaveBeenCalled();
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
      legs: [],
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
        legs: [],
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

// ---------------------------------------------------------------------------
// getPromotionPreview
// ---------------------------------------------------------------------------

describe("getPromotionPreview", () => {
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
    attachmentFindManyMock.mockResolvedValue([]);
  });

  describe("auth", () => {
    it("calls requireForkAccess with the forkId", async () => {
      await getPromotionPreview("fork-9");

      expect(requireForkAccessMock).toHaveBeenCalledWith("fork-9");
    });
  });

  describe("loss list: PAID_COST", () => {
    it("includes a PAID_COST entry for each cost with paidAt !== null in the real plan", async () => {
      costFindManyMock.mockImplementation((args: { where: { forkId: string | null } }) => {
        if (args.where.forkId === null) {
          return Promise.resolve([
            { id: "cost-paid", label: "Flight deposit", paidAt: "2026-05-01", ownerType: "OTHER", ownerId: null },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await getPromotionPreview("fork-9");

      expect(result.lossList).toContainEqual(
        expect.objectContaining({ kind: "PAID_COST", label: expect.stringContaining("Flight deposit") }),
      );
    });

    it("does NOT include a PAID_COST entry for a cost with paidAt === null", async () => {
      costFindManyMock.mockResolvedValue([
        { id: "cost-unpaid", label: "Visa fee", paidAt: null, ownerType: "OTHER", ownerId: null },
      ]);

      const result = await getPromotionPreview("fork-9");

      expect(result.lossList.filter((l) => l.kind === "PAID_COST")).toHaveLength(0);
    });
  });

  describe("loss list: CONFIRMATION", () => {
    it("includes a CONFIRMATION entry for an accommodation with confirmation !== null", async () => {
      accommodationFindManyMock.mockImplementation((args: { where: { forkId: string | null } }) => {
        if (args.where.forkId === null) {
          return Promise.resolve([
            { id: "acc-1", name: "Hotel Roma", confirmation: "CONF-123", stopId: "stop-1", checkIn: "2026-10-01", checkOut: "2026-10-04" },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await getPromotionPreview("fork-9");

      expect(result.lossList).toContainEqual(
        expect.objectContaining({ kind: "CONFIRMATION", label: expect.stringContaining("Hotel Roma") }),
      );
    });

    it("includes a CONFIRMATION entry for a transport with reference !== null", async () => {
      transportFindManyMock.mockImplementation((args: { where: { forkId: string | null } }) => {
        if (args.where.forkId === null) {
          return Promise.resolve([
            { id: "transport-1", mode: "FLIGHT", reference: "QF1", fromStopId: null, toStopId: null, depAt: null, arrAt: null },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await getPromotionPreview("fork-9");

      expect(result.lossList).toContainEqual(
        expect.objectContaining({ kind: "CONFIRMATION", label: expect.stringContaining("QF1") }),
      );
    });

    it("does NOT include a CONFIRMATION entry for accommodation with confirmation === null", async () => {
      accommodationFindManyMock.mockResolvedValue([
        { id: "acc-1", name: "Hotel Roma", confirmation: null, stopId: "stop-1", checkIn: "2026-10-01", checkOut: "2026-10-04" },
      ]);

      const result = await getPromotionPreview("fork-9");

      expect(result.lossList.filter((l) => l.kind === "CONFIRMATION")).toHaveLength(0);
    });
  });

  describe("loss list: ATTACHMENT", () => {
    it("includes an ATTACHMENT entry for an attachment targeting a real-plan Stop", async () => {
      stopFindManyMock.mockImplementation((args: { where: { forkId: string | null } }) => {
        if (args.where.forkId === null) {
          return Promise.resolve([{ id: "stop-real-1", name: "Paris", country: "FR", nights: 3, sortOrder: 0, arriveDate: null, departDate: null, pinned: false, lat: null, lng: null, timezone: "UTC" }]);
        }
        return Promise.resolve([]);
      });
      attachmentFindManyMock.mockResolvedValue([
        { id: "att-1", filename: "paris-photo.jpg", targetType: "STOP", targetId: "stop-real-1" },
      ]);

      const result = await getPromotionPreview("fork-9");

      expect(result.lossList).toContainEqual(
        expect.objectContaining({ kind: "ATTACHMENT", label: expect.stringContaining("paris-photo.jpg") }),
      );
    });

    it("does NOT include an ATTACHMENT entry for an attachment targeting a fork entity", async () => {
      // Real-plan stop is stop-real-1, attachment targets stop-fork-1 (a fork stop, not real-plan)
      stopFindManyMock.mockImplementation((args: { where: { forkId: string | null } }) => {
        if (args.where.forkId === null) {
          return Promise.resolve([{ id: "stop-real-1", name: "Paris", country: "FR", nights: 3, sortOrder: 0, arriveDate: null, departDate: null, pinned: false, lat: null, lng: null, timezone: "UTC" }]);
        }
        return Promise.resolve([]);
      });
      attachmentFindManyMock.mockResolvedValue([
        { id: "att-2", filename: "fork-photo.jpg", targetType: "STOP", targetId: "stop-fork-1" },
      ]);

      const result = await getPromotionPreview("fork-9");

      expect(result.lossList.filter((l) => l.kind === "ATTACHMENT")).toHaveLength(0);
    });

    it("does NOT include an ATTACHMENT with targetType TRIP (not a plan entity)", async () => {
      attachmentFindManyMock.mockResolvedValue([
        { id: "att-3", filename: "cover.jpg", targetType: "TRIP", targetId: "trip-1" },
      ]);

      const result = await getPromotionPreview("fork-9");

      expect(result.lossList.filter((l) => l.kind === "ATTACHMENT")).toHaveLength(0);
    });
  });

  describe("empty loss list", () => {
    it("returns an empty lossList when the real plan has no paid costs, confirmations, or relevant attachments", async () => {
      const result = await getPromotionPreview("fork-9");

      expect(result.lossList).toHaveLength(0);
    });
  });

  describe("deltas", () => {
    it("computes deltas via diffMetrics(realPlanMetrics, forkMetrics)", async () => {
      const stubDeltas = {
        stopCount: 2,
        nightTotal: -1,
        budgetHomeMinor: 5000,
        flagWarnings: 0,
        flagInfos: 1,
        transitMinutes: 0,
        drivingMinutes: 0,
        flightCount: 1,
        projectedEndDays: 3,
      };
      diffMetricsMock.mockReturnValue(stubDeltas);

      const result = await getPromotionPreview("fork-9");

      expect(result.deltas).toEqual(stubDeltas);
    });

    it("calls diffMetrics with realPlanMetrics as base and forkMetrics as variant", async () => {
      const realMetrics = { stopCount: 3, nightTotal: 7, countries: [], projectedEnd: null, hardEndState: "none" as const, budgetHomeMinor: null, flagCounts: { warning: 0, info: 0 }, transitMinutes: 0, drivingMinutes: 0, flightCount: 0, route: [], legs: [] };
      const forkMetrics = { stopCount: 5, nightTotal: 14, countries: [], projectedEnd: null, hardEndState: "none" as const, budgetHomeMinor: null, flagCounts: { warning: 0, info: 0 }, transitMinutes: 0, drivingMinutes: 0, flightCount: 0, route: [], legs: [] };

      // computePlanMetrics returns different values for each call
      computePlanMetricsMock
        .mockReturnValueOnce(realMetrics)  // first call = real plan
        .mockReturnValueOnce(forkMetrics); // second call = fork

      await getPromotionPreview("fork-9");

      expect(diffMetricsMock).toHaveBeenCalledWith(realMetrics, forkMetrics);
    });
  });
});

// ---------------------------------------------------------------------------
// promoteFork
// ---------------------------------------------------------------------------

describe("promoteFork", () => {
  beforeEach(() => {
    requireForkAccessMock.mockResolvedValue({
      user: { id: "user-1" },
      fork: { id: "fork-9", tripId: "trip-1", name: "Plan B" },
      trip: { id: "trip-1", startDate: "2026-10-01", endDate: "2026-10-14" },
    });
    computeTripPhaseMock.mockReturnValue("planning");
    tripFindUniqueMock.mockResolvedValue({
      id: "trip-1",
      startDate: "2026-10-01",
      endDate: "2026-10-14",
    });
  });

  describe("phase gate", () => {
    it("rejects when the trip is in travelling phase", async () => {
      computeTripPhaseMock.mockReturnValue("travelling");
      assertForkingAllowedMock.mockImplementation(() => {
        throw new Error("Forking is only available before departure");
      });

      const result = await promoteFork("fork-9");

      expect(result).toEqual({ success: false, error: expect.any(String) });
      expect(txMock).not.toHaveBeenCalled();
    });

    it("rejects when the trip is in past phase", async () => {
      computeTripPhaseMock.mockReturnValue("past");
      assertForkingAllowedMock.mockImplementation(() => {
        throw new Error("Forking is only available before departure");
      });

      const result = await promoteFork("fork-9");

      expect(result).toEqual({ success: false, error: expect.any(String) });
      expect(txMock).not.toHaveBeenCalled();
    });

    it("succeeds in planning phase", async () => {
      computeTripPhaseMock.mockReturnValue("planning");

      const result = await promoteFork("fork-9");

      expect(result).toEqual({ success: true });
    });
  });

  describe("transaction: ordering and shape", () => {
    it("deletes old real-plan rows for each entity (step 1)", async () => {
      await promoteFork("fork-9");

      expect(stopDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "trip-1", forkId: null } });
      expect(chapterDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "trip-1", forkId: null } });
      expect(transportDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "trip-1", forkId: null } });
      expect(accommodationDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "trip-1", forkId: null } });
      // Items: PLAN PLACEMENTS only (ADR 0022: Stop OR date) — trip-wide
      // wishlist ideas (no stop, no date) survive.
      expect(itemDeleteManyMock).toHaveBeenCalledWith({
        where: {
          tripId: "trip-1",
          forkId: null,
          OR: [{ stopId: { not: null } }, { date: { not: null } }],
        },
      });
      // Costs: everything EXCEPT ITEM costs owned by surviving ideas.
      expect(costDeleteManyMock).toHaveBeenCalledWith({
        where: {
          tripId: "trip-1",
          forkId: null,
          NOT: { ownerType: "ITEM", ownerId: { in: [] } },
        },
      });
    });

    it("does NOT delete real-plan wishlist ideas (no stop, no date) — only plan placements", async () => {
      await promoteFork("fork-9");

      // The item deleteMany must be scoped to plan placements (Stop OR date), so
      // a both-null idea is never targeted for deletion. ADR 0022.
      expect(itemDeleteManyMock).toHaveBeenCalledWith({
        where: {
          tripId: "trip-1",
          forkId: null,
          OR: [{ stopId: { not: null } }, { date: { not: null } }],
        },
      });
      // It must NOT be the old unscoped shape that would nuke ideas too.
      expect(itemDeleteManyMock).not.toHaveBeenCalledWith({ where: { tripId: "trip-1", forkId: null } });
    });

    it("deletes a dateless stop-attached thing-to-do (stopId set, date null) as a plan placement", async () => {
      // ADR 0022: a dateless stop placement is a plan placement, so the delete
      // predicate must reach it via the `stopId: { not: null }` OR branch. We
      // assert the predicate shape (mock db can't evaluate row matching), which
      // includes the stopId branch that captures a date-null stop placement.
      await promoteFork("fork-9");

      const deleteCall = itemDeleteManyMock.mock.calls.find(
        (c) => c[0]?.where?.forkId === null && Array.isArray(c[0]?.where?.OR),
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall![0].where.OR).toContainEqual({ stopId: { not: null } });
    });

    it("preserves ITEM costs owned by surviving wishlist ideas", async () => {
      // Surviving ideas gathered inside the tx.
      itemFindManyMock.mockResolvedValue([{ id: "idea-1" }, { id: "idea-2" }]);

      await promoteFork("fork-9");

      // ADR 0022: ideas are gathered from real-plan items that are BOTH stopId
      // null AND date null — a dateless stop placement is NOT an idea.
      expect(itemFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tripId: "trip-1", forkId: null, stopId: null, date: null } }),
      );
      // Cost deleteMany excludes ITEM costs owned by those surviving ideas.
      expect(costDeleteManyMock).toHaveBeenCalledWith({
        where: {
          tripId: "trip-1",
          forkId: null,
          NOT: { ownerType: "ITEM", ownerId: { in: ["idea-1", "idea-2"] } },
        },
      });
    });

    it("gathers surviving ideas by the WISHLIST-IDEA predicate, NOT by date alone (a dateless stop placement must not be treated as a surviving idea)", async () => {
      await promoteFork("fork-9");

      // The idea-gather must use the both-null predicate. The OLD shape
      // (date: null only) would wrongly count a dateless stop placement as a
      // surviving idea and preserve its cost. Assert it is NOT used.
      expect(itemFindManyMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { tripId: "trip-1", forkId: null, date: null } }),
      );
    });

    it("retags promoted fork rows to forkId: null for each entity (step 2)", async () => {
      await promoteFork("fork-9");

      expect(stopUpdateManyMock).toHaveBeenCalledWith({ where: { forkId: "fork-9" }, data: { forkId: null } });
      expect(chapterUpdateManyMock).toHaveBeenCalledWith({ where: { forkId: "fork-9" }, data: { forkId: null } });
      expect(transportUpdateManyMock).toHaveBeenCalledWith({ where: { forkId: "fork-9" }, data: { forkId: null } });
      expect(accommodationUpdateManyMock).toHaveBeenCalledWith({ where: { forkId: "fork-9" }, data: { forkId: null } });
      expect(itemUpdateManyMock).toHaveBeenCalledWith({ where: { forkId: "fork-9" }, data: { forkId: null } });
      expect(costUpdateManyMock).toHaveBeenCalledWith({ where: { forkId: "fork-9" }, data: { forkId: null } });
    });

    it("deletes all forks for the trip (step 3)", async () => {
      await promoteFork("fork-9");

      expect(forkDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "trip-1" } });
    });

    it("deletes real-plan rows BEFORE retagging (step 1 precedes step 2)", async () => {
      const callOrder: string[] = [];
      stopDeleteManyMock.mockImplementation(() => { callOrder.push("delete"); return Promise.resolve({ count: 0 }); });
      stopUpdateManyMock.mockImplementation(() => { callOrder.push("update"); return Promise.resolve({ count: 0 }); });

      await promoteFork("fork-9");

      const deleteIdx = callOrder.indexOf("delete");
      const updateIdx = callOrder.indexOf("update");
      expect(deleteIdx).toBeLessThan(updateIdx);
    });

    it("retagging happens BEFORE fork deleteMany (step 2 precedes step 3)", async () => {
      const callOrder: string[] = [];
      stopUpdateManyMock.mockImplementation(() => { callOrder.push("update"); return Promise.resolve({ count: 0 }); });
      forkDeleteManyMock.mockImplementation(() => { callOrder.push("forkDelete"); return Promise.resolve({ count: 0 }); });

      await promoteFork("fork-9");

      const updateIdx = callOrder.indexOf("update");
      const forkDeleteIdx = callOrder.indexOf("forkDelete");
      expect(updateIdx).toBeLessThan(forkDeleteIdx);
    });

    it("runs inside a single db.$transaction call", async () => {
      await promoteFork("fork-9");

      expect(txMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("activity log", () => {
    it("records PROMOTED FORK activity with the fork name", async () => {
      await promoteFork("fork-9");

      expect(recordActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: "trip-1",
          verb: "PROMOTED",
          entityType: "FORK",
          entityId: "fork-9",
          entityLabel: "Plan B",
        }),
      );
    });
  });

  describe("cache invalidation", () => {
    it("revalidates the core trip paths after promotion", async () => {
      await promoteFork("fork-9");

      expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/plan");
      expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/calendar");
      expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/budget");
      expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/summary");
      expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/compare");
    });
  });

  describe("auth", () => {
    it("calls requireForkAccess with the forkId", async () => {
      await promoteFork("fork-9");

      expect(requireForkAccessMock).toHaveBeenCalledWith("fork-9");
    });
  });
});

// ---------------------------------------------------------------------------
// moveFork
// ---------------------------------------------------------------------------

describe("moveFork", () => {
  beforeEach(() => {
    requireForkAccessMock.mockResolvedValue({
      user: { id: "user-1" },
      fork: { id: "fork-b", tripId: "trip-1", name: "Variant B" },
      trip: { id: "trip-1", startDate: null, endDate: null },
    });
    forkFindManyMock.mockResolvedValue([
      { id: "fork-a", sortOrder: 0 },
      { id: "fork-b", sortOrder: 1 },
      { id: "fork-c", sortOrder: 2 },
    ]);
  });

  it("swaps sortOrder with the left neighbour and records no activity", async () => {
    const res = await moveFork("fork-b", "left");
    expect(res).toEqual({ success: true });
    expect(forkUpdateMock).toHaveBeenCalledWith({ where: { id: "fork-b" }, data: { sortOrder: 0 } });
    expect(forkUpdateMock).toHaveBeenCalledWith({ where: { id: "fork-a" }, data: { sortOrder: 1 } });
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("is a no-op at the left edge", async () => {
    requireForkAccessMock.mockResolvedValue({
      user: { id: "user-1" }, fork: { id: "fork-a", tripId: "trip-1", name: "Variant A" },
      trip: { id: "trip-1", startDate: null, endDate: null },
    });
    const res = await moveFork("fork-a", "left");
    expect(res).toEqual({ success: true });
    expect(forkUpdateMock).not.toHaveBeenCalled();
  });

  it("is a no-op at the right edge", async () => {
    requireForkAccessMock.mockResolvedValue({
      user: { id: "user-1" }, fork: { id: "fork-c", tripId: "trip-1", name: "Variant C" },
      trip: { id: "trip-1", startDate: null, endDate: null },
    });
    const res = await moveFork("fork-c", "right");
    expect(res).toEqual({ success: true });
    expect(forkUpdateMock).not.toHaveBeenCalled();
  });

  it("is a no-op when the fork id is not found in the list", async () => {
    requireForkAccessMock.mockResolvedValue({
      user: { id: "user-1" }, fork: { id: "fork-x", tripId: "trip-1", name: "Ghost Fork" },
      trip: { id: "trip-1", startDate: null, endDate: null },
    });
    const res = await moveFork("fork-x", "left");
    expect(res).toEqual({ success: true });
    expect(forkUpdateMock).not.toHaveBeenCalled();
  });
});
