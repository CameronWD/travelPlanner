import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for items server actions.
 *
 * Mocks: lib/db, lib/guards, next/cache
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  geocodePlaceMock,
  itemFindUniqueMock,
  itemFindFirstMock,
  itemCreateMock,
  itemUpdateMock,
  itemDeleteMock,
  stopFindUniqueMock,
  stopFindManyMock,
  tripFindUniqueMock,
  costFindManyMock,
  costCreateMock,
  costUpdateMock,
  resolveRateForTripMock,
  persistRateMock,
  transactionMock,
} = vi.hoisted(() => {
  const costCreateMock = vi.fn().mockResolvedValue({ id: "cost-1" });
  const costUpdateMock = vi.fn().mockResolvedValue({ id: "cost-1" });
  const transactionMock = vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)({
        cost: { create: costCreateMock, update: costUpdateMock },
        exchangeRate: { upsert: vi.fn().mockResolvedValue({}) },
      });
    }
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg;
  });

  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    }),
    revalidatePathMock: vi.fn(),
    geocodePlaceMock: vi.fn().mockResolvedValue(null),
    itemFindUniqueMock: vi.fn(),
    itemFindFirstMock: vi.fn(),
    itemCreateMock: vi.fn(),
    itemUpdateMock: vi.fn(),
    itemDeleteMock: vi.fn(),
    stopFindUniqueMock: vi.fn(),
    stopFindManyMock: vi.fn().mockResolvedValue([]),
    tripFindUniqueMock: vi.fn().mockResolvedValue({ homeCurrency: "AUD" }),
    costFindManyMock: vi.fn().mockResolvedValue([]),
    costCreateMock,
    costUpdateMock,
    resolveRateForTripMock: vi.fn().mockResolvedValue({ rate: 0.6, persist: null }),
    persistRateMock: vi.fn().mockResolvedValue(undefined),
    transactionMock,
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodePlaceMock }));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/fx", () => ({
  resolveRateForTrip: resolveRateForTripMock,
  persistRate: persistRateMock,
}));
vi.mock("@/lib/db", () => ({
  db: {
    item: {
      findUnique: itemFindUniqueMock,
      findFirst: itemFindFirstMock,
      create: itemCreateMock,
      update: itemUpdateMock,
      delete: itemDeleteMock,
    },
    stop: {
      findUnique: stopFindUniqueMock,
      findMany: stopFindManyMock,
    },
    trip: {
      findUnique: tripFindUniqueMock,
    },
    cost: {
      findMany: costFindManyMock,
      create: costCreateMock,
      update: costUpdateMock,
    },
    $transaction: transactionMock,
  },
}));

import {
  createItem,
  updateItem,
  deleteItem,
  scheduleItem,
  unscheduleItem,
  rescheduleItem,
} from "./items";
import { recordActivity } from "@/server/actions/activity";

const VALID_INPUT = {
  title: "Visit the Museum",
  category: "SIGHTSEEING" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
});

// ---------------------------------------------------------------------------
// createItem
// ---------------------------------------------------------------------------

describe("plan-scope: createItem sortOrder", () => {
  it("computes sortOrder within the real plan only (forkId null)", async () => {
    itemFindFirstMock.mockResolvedValue({ sortOrder: 4 });
    itemCreateMock.mockResolvedValue({ id: "item-1" });

    await createItem("trip-1", VALID_INPUT);

    expect(itemFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: null }),
      }),
    );
  });
});

describe("plan-scope: createItem stop FK validation", () => {
  it("validates stopId is a real-plan stop (forkId null) when provided", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", forkId: null });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });

    await createItem("trip-1", { ...VALID_INPUT, stopId: "stop-1" });

    expect(stopFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "stop-1" }),
        select: expect.objectContaining({ forkId: true }),
      }),
    );
  });

  it("rejects a stop that belongs to a fork (forkId non-null)", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", forkId: "fork-abc" });
    itemFindFirstMock.mockResolvedValue(null);

    const result = await createItem("trip-1", { ...VALID_INPUT, stopId: "stop-1" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.stopId).toBeDefined();
    }
    expect(itemCreateMock).not.toHaveBeenCalled();
  });
});

describe("plan-scope: createItem with forkId", () => {
  it("creates an item in the given fork with fork-scoped sortOrder", async () => {
    itemFindFirstMock.mockResolvedValue({ sortOrder: 3 });
    itemCreateMock.mockResolvedValue({ id: "item-9" });

    await createItem("trip-1", VALID_INPUT, "fork-9");

    expect(itemFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ forkId: "fork-9", sortOrder: 4 }),
    });
  });

  it("creates a plan-owned dateless stop thing-to-do (stopId set, date null, forkId carried) — ADR 0022", async () => {
    // Stop belongs to the fork; item is attached to it with no date.
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", forkId: "fork-9" });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "todo-1" });

    const result = await createItem("trip-1", { ...VALID_INPUT, stopId: "stop-1" }, "fork-9");

    expect(result.success).toBe(true);
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        forkId: "fork-9",
        stopId: "stop-1",
        date: null,
      }),
    });
  });

  it("writes forkId: null on create when no forkId is passed (real plan)", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });

    await createItem("trip-1", VALID_INPUT);

    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ forkId: null }),
    });
  });

  it("rejects a stop from a different plan when forkId is passed", async () => {
    // Stop is real-plan (forkId: null) but creating item in fork-9
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", forkId: null });
    itemFindFirstMock.mockResolvedValue(null);

    const result = await createItem("trip-1", { ...VALID_INPUT, stopId: "stop-1" }, "fork-9");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.stopId).toBeDefined();
    expect(itemCreateMock).not.toHaveBeenCalled();
  });
});

describe("createItem", () => {
  it("creates an item with sortOrder = max + 1", async () => {
    itemFindFirstMock.mockResolvedValue({ sortOrder: 4 });
    itemCreateMock.mockResolvedValue({ id: "item-1" });

    const result = await createItem("trip-1", VALID_INPUT);

    expect(result.success).toBe(true);
    expect(itemCreateMock).toHaveBeenCalledOnce();
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip-1",
        title: "Visit the Museum",
        category: "SIGHTSEEING",
        sortOrder: 5,
      }),
    });
  });

  it("sets sortOrder to 0 when no existing items", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });

    const result = await createItem("trip-1", VALID_INPUT);

    expect(result.success).toBe(true);
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 0 }),
    });
  });

  it("revalidates wishlist and calendar paths", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });

    await createItem("trip-1", VALID_INPUT);

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/wishlist");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/calendar");
  });

  it("access-checks via requireTripAccess", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });

    await createItem("trip-99", VALID_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-99");
  });

  it("rejects a stopId that belongs to a different trip", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-OTHER" });
    itemFindFirstMock.mockResolvedValue(null);

    const result = await createItem("trip-1", {
      ...VALID_INPUT,
      stopId: "stop-1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.stopId).toBeDefined();
    }
    expect(itemCreateMock).not.toHaveBeenCalled();
  });

  it("accepts a stopId that belongs to the same trip", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", forkId: null });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });

    const result = await createItem("trip-1", {
      ...VALID_INPUT,
      stopId: "stop-1",
    });

    expect(result.success).toBe(true);
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ stopId: "stop-1" }),
    });
  });

  it("returns validation error for empty title and does not write", async () => {
    const result = await createItem("trip-1", { ...VALID_INPUT, title: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.title).toBeDefined();
    }
    expect(itemCreateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns validation error for unknown category and does not write", async () => {
    const result = await createItem("trip-1", {
      ...VALID_INPUT,
      // @ts-expect-error intentional bad category
      category: "INVALID",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.category).toBeDefined();
    }
    expect(itemCreateMock).not.toHaveBeenCalled();
  });

  it("geocodes the address when present and stores coords", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });
    geocodePlaceMock.mockResolvedValue({ lat: 48.8566, lng: 2.3522 });

    const result = await createItem("trip-1", {
      ...VALID_INPUT,
      address: "Eiffel Tower, Paris",
    });

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).toHaveBeenCalledOnce();
    expect(geocodePlaceMock).toHaveBeenCalledWith("Eiffel Tower, Paris");
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ lat: 48.8566, lng: 2.3522 }),
    });
  });

  it("does not call geocode and stores null coords when no address", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });

    const result = await createItem("trip-1", VALID_INPUT);

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).not.toHaveBeenCalled();
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ lat: null, lng: null }),
    });
  });

  it("still creates the item when geocode returns null (null coords)", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });
    geocodePlaceMock.mockResolvedValue(null);

    const result = await createItem("trip-1", {
      ...VALID_INPUT,
      address: "Some Unknown Place",
    });

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).toHaveBeenCalledOnce();
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ lat: null, lng: null }),
    });
  });

  it("records CREATED activity with the item title as entityLabel", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1", title: "Visit the Museum" });

    await createItem("trip-1", VALID_INPUT);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "CREATED", entityType: "ITEM", entityLabel: "Visit the Museum" }),
    );
  });
});

// ---------------------------------------------------------------------------
// updateItem
// ---------------------------------------------------------------------------

describe("updateItem", () => {
  it("updates and revalidates", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });
    itemUpdateMock.mockResolvedValue({});

    const result = await updateItem("item-1", {
      ...VALID_INPUT,
      title: "Updated Museum",
    });

    expect(result.success).toBe(true);
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: expect.objectContaining({ title: "Updated Museum" }),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/wishlist");
  });

  it("access-checks via item's tripId", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-5" });
    itemUpdateMock.mockResolvedValue({});

    await updateItem("item-1", VALID_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-5");
  });

  it("returns validation error and does not write", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });

    const result = await updateItem("item-1", { ...VALID_INPUT, title: "" });

    expect(result.success).toBe(false);
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  // I2 — a fork item can be reassigned to a stop in its OWN plan (the fork).
  it("allows reassigning a fork item to a fork stop (same plan)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "fi-1", tripId: "trip-1", forkId: "fork-9" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "fi-1", title: "Old", category: "SIGHTSEEING" }); // before row
    stopFindUniqueMock.mockResolvedValue({ id: "stop-f", tripId: "trip-1", forkId: "fork-9" });
    itemUpdateMock.mockResolvedValue({ id: "fi-1", title: "Visit the Museum", category: "SIGHTSEEING" });

    const result = await updateItem("fi-1", { ...VALID_INPUT, stopId: "stop-f" });

    expect(result.success).toBe(true);
    expect(itemUpdateMock).toHaveBeenCalled();
  });

  it("rejects reassigning a fork item to a real-plan stop (cross-plan)", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "fi-2", tripId: "trip-1", forkId: "fork-9" });
    // Stop is real-plan (forkId null) but item lives in fork-9.
    stopFindUniqueMock.mockResolvedValue({ id: "stop-r", tripId: "trip-1", forkId: null });

    const result = await updateItem("fi-2", { ...VALID_INPUT, stopId: "stop-r" });

    expect(result.success).toBe(false);
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects reassigning a real-plan item to a fork stop (cross-plan)", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "ri-1", tripId: "trip-1", forkId: null });
    stopFindUniqueMock.mockResolvedValue({ id: "stop-f", tripId: "trip-1", forkId: "fork-9" });

    const result = await updateItem("ri-1", { ...VALID_INPUT, stopId: "stop-f" });

    expect(result.success).toBe(false);
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("geocodes address on update when address is present", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });
    itemUpdateMock.mockResolvedValue({});
    geocodePlaceMock.mockResolvedValue({ lat: 51.5074, lng: -0.1278 });

    const result = await updateItem("item-1", {
      ...VALID_INPUT,
      address: "London Eye, London",
    });

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).toHaveBeenCalledOnce();
    expect(geocodePlaceMock).toHaveBeenCalledWith("London Eye, London");
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: expect.objectContaining({ lat: 51.5074, lng: -0.1278 }),
    });
  });

  it("stores null coords on update when no address", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });
    itemUpdateMock.mockResolvedValue({});

    const result = await updateItem("item-1", VALID_INPUT);

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).not.toHaveBeenCalled();
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: expect.objectContaining({ lat: null, lng: null }),
    });
  });

  it("records UPDATED activity with changes array", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "item-1", title: "Old Title", category: "SIGHTSEEING" }); // before row
    itemUpdateMock.mockResolvedValue({ id: "item-1", title: "New Title", category: "SIGHTSEEING" });

    await updateItem("item-1", { ...VALID_INPUT, title: "New Title" });

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "ITEM",
        entityLabel: "New Title",
        changes: expect.arrayContaining([expect.objectContaining({ field: "title" })]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// deleteItem
// ---------------------------------------------------------------------------

describe("deleteItem", () => {
  it("deletes and revalidates", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });
    itemDeleteMock.mockResolvedValue({});

    const result = await deleteItem("item-1");

    expect(result.success).toBe(true);
    expect(itemDeleteMock).toHaveBeenCalledWith({ where: { id: "item-1" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("access-checks via item's tripId", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-7" });
    itemDeleteMock.mockResolvedValue({});

    await deleteItem("item-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-7");
  });

  it("records DELETED activity with the snapshotted title as entityLabel", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ title: "Visit the Museum" }); // doomed label
    itemDeleteMock.mockResolvedValue({});

    await deleteItem("item-1");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityType: "ITEM", entityLabel: "Visit the Museum" }),
    );
  });
});

// ---------------------------------------------------------------------------
// scheduleItem
// ---------------------------------------------------------------------------

describe("scheduleItem", () => {
  // New behaviour (ADR 0019): scheduling a wishlist idea (date===null, forkId===null)
  // creates a placed COPY; scheduling an already-placed item (date != null) keeps in-place update.

  it("scheduling a wishlist idea (date null) creates a placed copy with date and times", async () => {
    // Two findUnique calls: requireItemAccess (returns {id, tripId}), then full item fetch
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" })
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: null, title: "Visit the Museum", category: "SIGHTSEEING" });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-1", title: "Visit the Museum" });

    const result = await scheduleItem("item-1", {
      date: "2026-08-10",
      startTime: "10:00",
      endTime: "12:00",
    }, null);

    expect(result.success).toBe(true);
    expect(itemUpdateMock).not.toHaveBeenCalled(); // idea untouched
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        date: "2026-08-10",
        startTime: "10:00",
        endTime: "12:00",
        sourceItemId: "item-1",
      }),
    });
  });

  it("rescheduling an already-placed item (date non-null) keeps in-place update", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1" })
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1", forkId: null, date: "2026-08-01", title: "Visit the Museum", category: "SIGHTSEEING" });
    itemUpdateMock.mockResolvedValue({ id: "placed-1", date: "2026-08-10", startTime: "10:00", endTime: "12:00" });

    const result = await scheduleItem("placed-1", {
      date: "2026-08-10",
      startTime: "10:00",
      endTime: "12:00",
    }, null);

    expect(result.success).toBe(true);
    expect(itemCreateMock).not.toHaveBeenCalled(); // no copy created
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "placed-1" },
      data: {
        date: "2026-08-10",
        startTime: "10:00",
        endTime: "12:00",
      },
    });
  });

  it("allows scheduling without times (wishlist idea path)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" })
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: null, title: "Visit the Museum", category: "SIGHTSEEING" });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-1" });

    const result = await scheduleItem("item-1", { date: "2026-08-10" }, null);

    expect(result.success).toBe(true);
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        date: "2026-08-10",
        startTime: null,
        endTime: null,
      }),
    });
  });

  it("revalidates wishlist and calendar paths", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" })
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: null, title: "Visit the Museum", category: "SIGHTSEEING" });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-1" });

    await scheduleItem("item-1", { date: "2026-08-10" }, null);

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/wishlist");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/calendar");
  });

  it("access-checks via item's tripId", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-3" })
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-3", forkId: null, date: null, title: "Visit the Museum", category: "SIGHTSEEING" });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-1" });

    await scheduleItem("item-1", { date: "2026-08-10" }, null);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-3");
  });

  it("returns validation error for invalid date format", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });

    const result = await scheduleItem("item-1", {
      date: "not-a-date",
    }, null);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.date).toBeDefined();
    }
    expect(itemUpdateMock).not.toHaveBeenCalled();
    expect(itemCreateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// unscheduleItem
// ---------------------------------------------------------------------------

describe("unscheduleItem", () => {
  // New behaviour (ADR 0019): unschedule DELETES the placed copy, leaving the idea intact.

  it("deletes the placed copy (not update/clear)", async () => {
    // Two findUnique calls: requireItemAccess (returns {id, tripId}), then full item fetch
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" })
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: "2026-08-10", sourceItemId: "idea-1" });
    itemDeleteMock.mockResolvedValue({});

    const result = await unscheduleItem("item-1");

    expect(result.success).toBe(true);
    expect(itemUpdateMock).not.toHaveBeenCalled(); // no update — it's a delete
    expect(itemDeleteMock).toHaveBeenCalledWith({ where: { id: "item-1" } });
  });

  it("revalidates wishlist and calendar paths", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" })
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: "2026-08-10", sourceItemId: "idea-1" });
    itemDeleteMock.mockResolvedValue({});

    await unscheduleItem("item-1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/wishlist");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/calendar");
  });

  it("access-checks via item's tripId", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-8" })
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-8", forkId: null, date: "2026-08-10", sourceItemId: null });
    itemDeleteMock.mockResolvedValue({});

    await unscheduleItem("item-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-8");
  });

  it("unscheduleItem records DELETED activity", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: "2026-07-03", sourceItemId: "idea-1", title: "Louvre" }); // full item row
    itemDeleteMock.mockResolvedValue({});

    await unscheduleItem("item-1");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "DELETED",
        entityType: "ITEM",
        entityId: "item-1",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// scheduleItem records activity
// ---------------------------------------------------------------------------

describe("scheduleItem records activity", () => {
  it("scheduleItem records an ITEM CREATED activity when scheduling a wishlist idea", async () => {
    // New behaviour: scheduling a wishlist idea (date===null, forkId===null) creates a copy
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: null, title: "Louvre", category: "SIGHTSEEING" }); // full item row
    itemFindFirstMock.mockResolvedValue({ sortOrder: 0 });
    itemCreateMock.mockResolvedValue({ id: "placed-1", title: "Louvre" });

    await scheduleItem("item-1", { date: "2026-07-03" }, null);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "CREATED",
        entityType: "ITEM",
      }),
    );
  });

  it("scheduleItem records an ITEM UPDATED activity when rescheduling an already-placed item", async () => {
    // Already placed item (has a date) → keep in-place update behaviour.
    // fullItem is reused as the before snapshot (no second findUnique needed).
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1", forkId: null, date: "2026-07-01", title: "Louvre", category: "SIGHTSEEING", startTime: null, endTime: null }); // full item (determines path AND serves as before)
    itemUpdateMock.mockResolvedValue({ id: "placed-1", title: "Louvre", date: "2026-07-03", startTime: null, endTime: null });

    await scheduleItem("placed-1", { date: "2026-07-03" }, null);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "ITEM",
        entityId: "placed-1",
        changes: expect.arrayContaining([
          expect.objectContaining({ field: "date" }),
        ]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// scheduleItem copy-in placement (ADR 0019)
// ---------------------------------------------------------------------------

describe("scheduleItem copy-in placement", () => {
  it("scheduling a wishlist idea creates a placed copy and leaves the idea", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null, date: null, title: "Louvre", category: "SIGHTSEEING" }); // full item row
    itemFindFirstMock.mockResolvedValue({ sortOrder: 0 });
    itemCreateMock.mockResolvedValue({ id: "placed-1" });
    const res = await scheduleItem("idea-1", { date: "2026-07-02" }, null);
    expect(itemUpdateMock).not.toHaveBeenCalled();          // idea untouched
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ tripId: "trip-1", forkId: null, sourceItemId: "idea-1", date: "2026-07-02", title: "Louvre" }),
    });
    expect(res).toMatchObject({ success: true });
  });

  it("scheduling into a fork places the copy in that fork", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null, date: null, title: "Louvre", category: "SIGHTSEEING" }); // full item row
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-2" });
    await scheduleItem("idea-1", { date: "2026-07-02" }, "fork-9");
    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ forkId: "fork-9", sourceItemId: "idea-1" }) });
  });

  it("unscheduling a placed item deletes the copy, not the idea", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1", forkId: null, date: "2026-07-02", sourceItemId: "idea-1" }); // full item row
    itemDeleteMock.mockResolvedValue({});
    await unscheduleItem("placed-1");
    expect(itemDeleteMock).toHaveBeenCalledWith({ where: { id: "placed-1" } });
  });

  it("copy inherits title, category, stopId, lat, lng, address, link, notes from idea", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({
        id: "idea-1", tripId: "trip-1", forkId: null, date: null,
        title: "Eiffel Tower", category: "SIGHTSEEING",
        stopId: "stop-1", lat: 48.8584, lng: 2.2945,
        address: "Paris", link: "https://example.com", notes: "bring camera",
      }); // full item row
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-3" });
    await scheduleItem("idea-1", { date: "2026-07-02", startTime: "10:00", endTime: "12:00" }, null);
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stopId: "stop-1", lat: 48.8584, lng: 2.2945,
        address: "Paris", link: "https://example.com", notes: "bring camera",
        startTime: "10:00", endTime: "12:00",
      }),
    });
  });

  it("sortOrder for placed copy is max existing placed sortOrder + 1 (scoped to plan)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null, date: null, title: "X", category: "SIGHTSEEING" });
    itemFindFirstMock.mockResolvedValue({ sortOrder: 7 });
    itemCreateMock.mockResolvedValue({ id: "placed-4" });
    await scheduleItem("idea-1", { date: "2026-07-02" }, null);
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 8 }),
    });
  });

  it("unscheduling a directly-created placed item (sourceItemId null) also deletes it", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "placed-direct", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "placed-direct", tripId: "trip-1", forkId: null, date: "2026-07-02", sourceItemId: null }); // full item row
    itemDeleteMock.mockResolvedValue({});
    await unscheduleItem("placed-direct");
    expect(itemDeleteMock).toHaveBeenCalledWith({ where: { id: "placed-direct" } });
  });
});

// ---------------------------------------------------------------------------
// rescheduleItem
// ---------------------------------------------------------------------------

describe("rescheduleItem", () => {
  it("rescheduleItem records the new date", async () => {
    // before-row { date: "2026-07-03" }; update → { date: "2026-07-04", title: "Louvre" }
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "item-1", title: "Louvre", date: "2026-07-03", startTime: null, endTime: null }); // before row
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: "2026-07-10" });
    stopFindManyMock.mockResolvedValue([]);
    itemUpdateMock.mockResolvedValue({ id: "item-1", title: "Louvre", date: "2026-07-04", startTime: null, endTime: null });

    await rescheduleItem("item-1", "2026-07-04");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "ITEM",
        entityId: "item-1",
        changes: expect.arrayContaining([
          expect.objectContaining({ field: "date", to: expect.stringContaining("Jul") }),
        ]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// fork-silent: activity must NOT fire for fork-scoped mutations
// ---------------------------------------------------------------------------

describe("fork-silent: createItem in a fork does NOT record activity", () => {
  it("does not call recordActivity when forkId is set (fork-scoped create)", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "fi-1" });

    await createItem("trip-1", VALID_INPUT, "fork-x");

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when forkId is null (real-plan create)", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "ri-1", title: "Visit the Museum" });

    await createItem("trip-1", VALID_INPUT);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "CREATED", entityType: "ITEM" }),
    );
  });
});

describe("fork-silent: updateItem in a fork does NOT record activity", () => {
  it("does not call recordActivity when item.forkId is non-null (fork-scoped update)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "fi-2", tripId: "trip-1", forkId: "fork-x" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "fi-2", title: "Old", forkId: "fork-x" }); // before snapshot
    itemUpdateMock.mockResolvedValue({ id: "fi-2", title: "New" });

    await updateItem("fi-2", VALID_INPUT);

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when item.forkId is null (real-plan update)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "ri-2", tripId: "trip-1", forkId: null }) // requireItemAccess
      .mockResolvedValueOnce({ id: "ri-2", title: "Old", forkId: null }); // before snapshot
    itemUpdateMock.mockResolvedValue({ id: "ri-2", title: "New" });

    await updateItem("ri-2", VALID_INPUT);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "UPDATED", entityType: "ITEM" }),
    );
  });
});

describe("fork-silent: deleteItem in a fork does NOT record activity", () => {
  it("does not call recordActivity when item.forkId is non-null (fork-scoped delete)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "fi-3", tripId: "trip-1", forkId: "fork-x" }) // requireItemAccess
      .mockResolvedValueOnce({ title: "Visit the Museum" }); // label fetch
    itemDeleteMock.mockResolvedValue({});

    await deleteItem("fi-3");

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when item.forkId is null (real-plan delete)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "ri-3", tripId: "trip-1", forkId: null }) // requireItemAccess
      .mockResolvedValueOnce({ title: "Visit the Museum" }); // label fetch
    itemDeleteMock.mockResolvedValue({});

    await deleteItem("ri-3");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityType: "ITEM" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Inline cost: createItem with cost fields
// ---------------------------------------------------------------------------

describe("createItem: inline cost creation", () => {
  it("creates a Cost with ownerType ITEM and the new item id when estimatedMinor+currency are provided", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-cost-1", title: "Visit the Museum" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.6, persist: null });

    const result = await createItem("trip-1", {
      ...VALID_INPUT,
      estimatedMinor: 12000,
      currency: "EUR",
    });

    expect(result.success).toBe(true);
    expect(tripFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "trip-1" } }),
    );
    expect(resolveRateForTripMock).toHaveBeenCalledWith(
      "trip-1",
      "EUR",
      "AUD",
      expect.anything(),
    );
    expect(transactionMock).toHaveBeenCalled();
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: "ITEM",
          ownerId: "item-cost-1",
          estimatedMinor: 12000,
          currency: "EUR",
          rateToHome: 0.6,
        }),
      }),
    );
  });

  it("does NOT create a Cost when no estimatedMinor is provided", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-no-cost", title: "Visit the Museum" });

    await createItem("trip-1", VALID_INPUT);

    expect(transactionMock).not.toHaveBeenCalled();
    expect(costCreateMock).not.toHaveBeenCalled();
  });

  it("snapshots rateToHome=1 when cost currency equals home currency", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-same-cur", title: "Visit the Museum" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1, persist: null });

    await createItem("trip-1", {
      ...VALID_INPUT,
      estimatedMinor: 5000,
      currency: "AUD",
    });

    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rateToHome: 1 }),
      }),
    );
  });

  it("persists the FX rate inside the transaction when resolveRateForTrip returns a persist descriptor", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-persist", title: "Visit the Museum" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({
      rate: 0.55,
      persist: { base: "USD", quote: "AUD", rate: 0.55 },
    });

    await createItem("trip-1", {
      ...VALID_INPUT,
      estimatedMinor: 8000,
      currency: "USD",
    });

    expect(persistRateMock).toHaveBeenCalledWith(
      expect.anything(), // the tx object
      "trip-1",
      { base: "USD", quote: "AUD", rate: 0.55 },
    );
  });
});

// ---------------------------------------------------------------------------
// Inline cost: updateItem with cost fields
// ---------------------------------------------------------------------------

describe("updateItem: inline cost update/create", () => {
  it("creates a Cost when item has 0 existing costs and estimatedMinor is provided", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "iu-1", tripId: "trip-1", forkId: null }) // requireItemAccess
      .mockResolvedValueOnce({ id: "iu-1", title: "Visit the Museum", category: "SIGHTSEEING" }); // before snapshot
    itemUpdateMock.mockResolvedValue({ id: "iu-1", title: "Visit the Museum", category: "SIGHTSEEING" });
    costFindManyMock.mockResolvedValue([]); // 0 existing costs
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.6, persist: null });

    const result = await updateItem("iu-1", {
      ...VALID_INPUT,
      estimatedMinor: 7500,
      currency: "EUR",
    });

    expect(result.success).toBe(true);
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: "ITEM",
          ownerId: "iu-1",
          estimatedMinor: 7500,
          currency: "EUR",
        }),
      }),
    );
  });

  it("updates the existing Cost when item has exactly 1 cost and estimatedMinor is provided", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "iu-2", tripId: "trip-1", forkId: null }) // requireItemAccess
      .mockResolvedValueOnce({ id: "iu-2", title: "Visit the Museum", category: "SIGHTSEEING" }); // before snapshot
    itemUpdateMock.mockResolvedValue({ id: "iu-2", title: "Visit the Museum", category: "SIGHTSEEING" });
    costFindManyMock.mockResolvedValue([
      { id: "existing-cost-1", ownerType: "ITEM", ownerId: "iu-2" },
    ]); // exactly 1 existing cost
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.65, persist: null });

    const result = await updateItem("iu-2", {
      ...VALID_INPUT,
      estimatedMinor: 9900,
      currency: "USD",
    });

    expect(result.success).toBe(true);
    expect(costUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing-cost-1" },
        data: expect.objectContaining({
          estimatedMinor: 9900,
          currency: "USD",
          rateToHome: 0.65,
        }),
      }),
    );
    expect(costCreateMock).not.toHaveBeenCalled();
  });

  it("does NOT touch any costs when item has >1 existing costs (CostEditor authoritative)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "iu-3", tripId: "trip-1", forkId: null }) // requireItemAccess
      .mockResolvedValueOnce({ id: "iu-3", title: "Visit the Museum", category: "SIGHTSEEING" }); // before snapshot
    itemUpdateMock.mockResolvedValue({ id: "iu-3", title: "Visit the Museum", category: "SIGHTSEEING" });
    costFindManyMock.mockResolvedValue([
      { id: "c-a", ownerType: "ITEM", ownerId: "iu-3" },
      { id: "c-b", ownerType: "ITEM", ownerId: "iu-3" },
    ]); // >1 costs

    const result = await updateItem("iu-3", {
      ...VALID_INPUT,
      estimatedMinor: 5000,
      currency: "AUD",
    });

    expect(result.success).toBe(true);
    expect(costCreateMock).not.toHaveBeenCalled();
    expect(costUpdateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("does NOT create or update costs when estimatedMinor is absent (even with 0 existing costs)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "iu-4", tripId: "trip-1", forkId: null }) // requireItemAccess
      .mockResolvedValueOnce({ id: "iu-4", title: "Visit the Museum", category: "SIGHTSEEING" }); // before snapshot
    itemUpdateMock.mockResolvedValue({ id: "iu-4", title: "Visit the Museum", category: "SIGHTSEEING" });
    costFindManyMock.mockResolvedValue([]); // 0 existing costs

    await updateItem("iu-4", VALID_INPUT);

    expect(transactionMock).not.toHaveBeenCalled();
    expect(costCreateMock).not.toHaveBeenCalled();
    expect(costUpdateMock).not.toHaveBeenCalled();
  });
});
