import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for items server actions.
 *
 * Mocks: lib/db, lib/guards, next/cache
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  geocodePlaceDetailedMock,
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
  costDeleteManyMock,
  attachmentFindManyMock,
  attachmentDeleteManyMock,
  noteDeleteManyMock,
  resolveRateForTripMock,
  persistRateMock,
  transactionMock,
  markerFindUniqueMock,
  getUserGlobeMock,
} = vi.hoisted(() => {
  const costCreateMock = vi.fn().mockResolvedValue({ id: "cost-1" });
  const costUpdateMock = vi.fn().mockResolvedValue({ id: "cost-1" });
  const costDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const costFindManyMock = vi.fn().mockResolvedValue([]);
  const itemDeleteMock = vi.fn();
  const attachmentFindManyMock = vi.fn().mockResolvedValue([]);
  const attachmentDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const noteDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const transactionMock = vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)({
        item: { delete: itemDeleteMock },
        cost: {
          findMany: costFindManyMock,
          create: costCreateMock,
          update: costUpdateMock,
          deleteMany: costDeleteManyMock,
        },
        attachment: {
          findMany: attachmentFindManyMock,
          deleteMany: attachmentDeleteManyMock,
        },
        note: { deleteMany: noteDeleteManyMock },
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
    geocodePlaceDetailedMock: vi.fn().mockResolvedValue(null),
    itemFindUniqueMock: vi.fn(),
    itemFindFirstMock: vi.fn(),
    itemCreateMock: vi.fn(),
    itemUpdateMock: vi.fn(),
    itemDeleteMock,
    stopFindUniqueMock: vi.fn(),
    stopFindManyMock: vi.fn().mockResolvedValue([]),
    tripFindUniqueMock: vi.fn().mockResolvedValue({ homeCurrency: "AUD" }),
    costFindManyMock,
    costCreateMock,
    costUpdateMock,
    costDeleteManyMock,
    attachmentFindManyMock,
    attachmentDeleteManyMock,
    noteDeleteManyMock,
    resolveRateForTripMock: vi.fn().mockResolvedValue({ rate: 0.6, persist: null }),
    persistRateMock: vi.fn().mockResolvedValue(undefined),
    transactionMock,
    markerFindUniqueMock: vi.fn(),
    getUserGlobeMock: vi.fn(),
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/geocode", () => ({ geocodePlaceDetailed: geocodePlaceDetailedMock }));
vi.mock("@/lib/globe", () => ({ getUserGlobe: getUserGlobeMock }));
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
      deleteMany: costDeleteManyMock,
    },
    marker: {
      findUnique: markerFindUniqueMock,
    },
    $transaction: transactionMock,
  },
}));

vi.mock("@/server/actions/target-cleanup", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/actions/target-cleanup")>();
  return {
    ...real,
    cleanupTargetSideData: vi.fn().mockResolvedValue(undefined),
    deleteBlobsBestEffort: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  createItem,
  updateItem,
  deleteItem,
  scheduleItem,
  unscheduleItem,
  rescheduleItem,
  addMarkerToWishlist,
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
  getUserGlobeMock.mockResolvedValue({ id: "g1" });
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

  it("revalidates the whole trip layout so the Budget reflects inline cost edits", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });

    await createItem("trip-1", VALID_INPUT);

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1", "layout");
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
    geocodePlaceDetailedMock.mockResolvedValue({
      lat: 48.8566,
      lng: 2.3522,
      city: "Paris",
      country: "France",
      countryCode: "fr",
      name: "Eiffel Tower, Paris",
    });

    const result = await createItem("trip-1", {
      ...VALID_INPUT,
      address: "Eiffel Tower, Paris",
    });

    expect(result.success).toBe(true);
    expect(geocodePlaceDetailedMock).toHaveBeenCalledOnce();
    expect(geocodePlaceDetailedMock).toHaveBeenCalledWith("Eiffel Tower, Paris");
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ lat: 48.8566, lng: 2.3522, countryCode: "fr" }),
    });
  });

  it("does not call geocode and stores null coords/countryCode when no address", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });

    const result = await createItem("trip-1", VALID_INPUT);

    expect(result.success).toBe(true);
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ lat: null, lng: null, countryCode: null }),
    });
  });

  it("still creates the item when geocode returns null (null coords/countryCode)", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });
    geocodePlaceDetailedMock.mockResolvedValue(null);

    const result = await createItem("trip-1", {
      ...VALID_INPUT,
      address: "Some Unknown Place",
    });

    expect(result.success).toBe(true);
    expect(geocodePlaceDetailedMock).toHaveBeenCalledOnce();
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ lat: null, lng: null, countryCode: null }),
    });
  });

  it("lowercases an uppercase countryCode from the geocoder", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1" });
    geocodePlaceDetailedMock.mockResolvedValue({
      lat: 48.8566,
      lng: 2.3522,
      city: "Paris",
      country: "France",
      countryCode: "FR",
      name: "Eiffel Tower, Paris",
    });

    await createItem("trip-1", { ...VALID_INPUT, address: "Eiffel Tower, Paris" });

    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ countryCode: "fr" }),
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
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1", "layout");
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
    geocodePlaceDetailedMock.mockResolvedValue({
      lat: 51.5074,
      lng: -0.1278,
      city: "London",
      country: "United Kingdom",
      countryCode: "gb",
      name: "London Eye, London",
    });

    const result = await updateItem("item-1", {
      ...VALID_INPUT,
      address: "London Eye, London",
    });

    expect(result.success).toBe(true);
    expect(geocodePlaceDetailedMock).toHaveBeenCalledOnce();
    expect(geocodePlaceDetailedMock).toHaveBeenCalledWith("London Eye, London");
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: expect.objectContaining({ lat: 51.5074, lng: -0.1278, countryCode: "gb" }),
    });
  });

  it("stores null coords/countryCode on update when no address", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });
    itemUpdateMock.mockResolvedValue({});

    const result = await updateItem("item-1", VALID_INPUT);

    expect(result.success).toBe(true);
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: expect.objectContaining({ lat: null, lng: null, countryCode: null }),
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
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1", "layout");
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

  it("runs delete, cost cleanup and side-data cleanup in one transaction", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1", title: "Colosseum" });
    attachmentFindManyMock.mockResolvedValue([{ storageKey: "k1" }]);
    costFindManyMock.mockResolvedValue([]);

    const result = await deleteItem("item-1");

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1); // one tx wraps it all
    expect(itemDeleteMock).toHaveBeenCalledWith({ where: { id: "item-1" } });
    expect(attachmentDeleteManyMock).toHaveBeenCalled(); // inside the tx
    expect(noteDeleteManyMock).toHaveBeenCalled();
  });

  it("converts the item's paid cost to an Other cost", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1", title: "Colosseum" });
    costFindManyMock.mockResolvedValue([
      { id: "c1", paidMinor: 4000, paidAt: null, label: null, ownerType: "ITEM", ownerId: "item-1" },
    ]);

    await deleteItem("item-1");

    expect(costUpdateMock).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { ownerType: "OTHER", ownerId: null, label: "Colosseum (deleted)" },
    });
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
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: null, stopId: null, title: "Visit the Museum", category: "SIGHTSEEING" });
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
    // ADR 0049 rule 4: the in-place branch now writes stopId too (there are
    // no stops here, so resolveOwningStop has nothing to preserve or resolve
    // to and returns null) — it used to leave stopId untouched entirely.
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "placed-1" },
      data: {
        date: "2026-08-10",
        stopId: null,
        startTime: "10:00",
        endTime: "12:00",
      },
    });
  });

  it("allows scheduling without times (wishlist idea path)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" })
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: null, stopId: null, title: "Visit the Museum", category: "SIGHTSEEING" });
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

  it("revalidates the whole trip layout so the Budget reflects inline cost edits", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" })
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: null, stopId: null, title: "Visit the Museum", category: "SIGHTSEEING" });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-1" });

    await scheduleItem("item-1", { date: "2026-08-10" }, null);

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1", "layout");
  });

  it("access-checks via item's tripId", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-3" })
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-3", forkId: null, date: null, stopId: null, title: "Visit the Museum", category: "SIGHTSEEING" });
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

  // ADR 0049 rule 4 — an Item keeps its owning Stop while that Stop still
  // covers the date, including a Changeover day the next Stop also claims.
  it("in-place reschedule onto a shared changeover day KEEPS the owning stop", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "i1", tripId: "trip-1" })
      .mockResolvedValueOnce({ id: "i1", tripId: "trip-1", forkId: null, date: "2026-12-09", stopId: "munich", title: "Dinner" });
    stopFindManyMock.mockResolvedValue([
      { id: "munich", name: "Munich", timezone: "Europe/Berlin", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 },
      { id: "strasbourg", name: "Strasbourg", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-12", sortOrder: 1 },
    ]);
    itemUpdateMock.mockResolvedValue({ id: "i1" });

    await scheduleItem("i1", { date: "2026-12-10" }, null);

    expect(itemUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ date: "2026-12-10", stopId: "munich" }) }),
    );
  });

  it("in-place reschedule past the owner's stay re-files to the covering stop", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "i1", tripId: "trip-1" })
      .mockResolvedValueOnce({ id: "i1", tripId: "trip-1", forkId: null, date: "2026-12-10", stopId: "munich", title: "Dinner" });
    stopFindManyMock.mockResolvedValue([
      { id: "munich", name: "Munich", timezone: "Europe/Berlin", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 },
      { id: "strasbourg", name: "Strasbourg", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-12", sortOrder: 1 },
    ]);
    itemUpdateMock.mockResolvedValue({ id: "i1" });

    await scheduleItem("i1", { date: "2026-12-11" }, null);

    expect(itemUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stopId: "strasbourg" }) }),
    );
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

  it("revalidates the whole trip layout so the Budget reflects inline cost edits", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" })
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: "2026-08-10", sourceItemId: "idea-1" });
    itemDeleteMock.mockResolvedValue({});

    await unscheduleItem("item-1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1", "layout");
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

  // Merged from the former "unscheduleItem semantics (P1-5, grilling 2026-09-07)"
  // describe block (final-review Finding 8): same subject, kept as one block.
  it("deletes only the placement when the item is a placed copy", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1", sourceItemId: "idea-1", date: "2026-07-02", title: "Colosseum" });
    itemDeleteMock.mockResolvedValue({});

    const result = await unscheduleItem("placed-1");

    expect(result).toMatchObject({ success: true, mode: "placement-removed", sourceItemId: "idea-1" });
    expect(itemDeleteMock).toHaveBeenCalledWith({ where: { id: "placed-1" } });
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("clears only the date on a direct-created item (un-slot, ADR 0038)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "direct-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "direct-1", tripId: "trip-1", sourceItemId: null, date: "2026-07-02", stopId: "stop-1", title: "Dinner" });

    const result = await unscheduleItem("direct-1");

    expect(result).toMatchObject({ success: true, mode: "unslotted", sourceItemId: null });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "direct-1" }, data: { date: null } });
    expect(itemDeleteMock).not.toHaveBeenCalled();
  });

  // Final-review Finding 1: the placement-removed branch used to be a bare
  // db.item.delete, orphaning the placement's Notes/Attachments/Costs. It must
  // now mirror deleteItem's shape: one tx wrapping the delete + cost cleanup +
  // side-data cleanup, then best-effort blob deletion after commit.
  it("wraps the placement-removed delete in a transaction with cost and side-data cleanup", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1", sourceItemId: "idea-1", date: "2026-07-02", title: "Colosseum" });
    attachmentFindManyMock.mockResolvedValue([{ storageKey: "k1" }]);
    costFindManyMock.mockResolvedValue([]);

    const result = await unscheduleItem("placed-1");

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1); // one tx wraps it all
    expect(itemDeleteMock).toHaveBeenCalledWith({ where: { id: "placed-1" } });
    expect(attachmentDeleteManyMock).toHaveBeenCalled(); // inside the tx
    expect(noteDeleteManyMock).toHaveBeenCalled();
  });

  it("converts the placement's paid cost to an Other cost instead of orphaning it", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1", sourceItemId: "idea-1", date: "2026-07-02", title: "Colosseum" });
    costFindManyMock.mockResolvedValue([
      { id: "c1", paidMinor: 4000, paidAt: null, label: null, ownerType: "ITEM", ownerId: "placed-1" },
    ]);

    await unscheduleItem("placed-1");

    expect(costUpdateMock).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { ownerType: "OTHER", ownerId: null, label: "Colosseum (deleted)" },
    });
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
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1", forkId: null, date: null, stopId: null, title: "Louvre", category: "SIGHTSEEING" }); // full item row
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
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null, date: null, stopId: null, title: "Louvre", category: "SIGHTSEEING" }); // full item row
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
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null, date: null, stopId: null, title: "Louvre", category: "SIGHTSEEING" }); // full item row
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

  it("copy inherits title, category, lat, lng, countryCode, address, link, notes from idea", async () => {
    // NB: a genuine Wishlist idea can never carry a stopId (ADR 0022 / CONTEXT.md:
    // "attached to no Stop and no day") — an item with a stopId is a stop-attached
    // thing-to-do, not an idea, so it takes the in-place branch (see the
    // "scheduleItem classification" describe block). stopId is asserted here as
    // null to document that the copy path still passes it through faithfully.
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({
        id: "idea-1", tripId: "trip-1", forkId: null, date: null,
        title: "Eiffel Tower", category: "SIGHTSEEING",
        stopId: null, lat: 48.8584, lng: 2.2945, countryCode: "fr",
        address: "Paris", link: "https://example.com", notes: "bring camera",
      }); // full item row
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-3" });
    await scheduleItem("idea-1", { date: "2026-07-02", startTime: "10:00", endTime: "12:00" }, null);
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stopId: null, lat: 48.8584, lng: 2.2945, countryCode: "fr",
        address: "Paris", link: "https://example.com", notes: "bring camera",
        startTime: "10:00", endTime: "12:00",
      }),
    });
  });

  it("sortOrder for placed copy is max existing placed sortOrder + 1 (scoped to plan)", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null, date: null, stopId: null, title: "X", category: "SIGHTSEEING" });
    itemFindFirstMock.mockResolvedValue({ sortOrder: 7 });
    itemCreateMock.mockResolvedValue({ id: "placed-4" });
    await scheduleItem("idea-1", { date: "2026-07-02" }, null);
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 8 }),
    });
  });

  it("unscheduling a directly-created placed item (sourceItemId null) un-slots it instead of deleting (grilling 2026-09-07)", async () => {
    // Superseded assumption from the pre-fix design: a direct-created item used
    // to be deleted outright on unschedule. Decision 2 (2026-09-07) changed this
    // to clear the date in place so the item survives as a thing-to-do/Wishlist
    // idea rather than being destroyed. See the "unscheduleItem" describe block
    // below for the full mode-classification coverage.
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "placed-direct", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "placed-direct", tripId: "trip-1", forkId: null, date: "2026-07-02", sourceItemId: null, stopId: null }); // full item row
    itemUpdateMock.mockResolvedValue({});
    const result = await unscheduleItem("placed-direct");
    expect(result).toMatchObject({ success: true, mode: "unslotted", sourceItemId: null });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "placed-direct" }, data: { date: null } });
    expect(itemDeleteMock).not.toHaveBeenCalled();
  });
});

describe("scheduleItem classification", () => {
  it("treats a stop-attached thing-to-do as in-place scheduling, not copy-in", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "todo-1", date: null, stopId: "stop-1", forkId: null, title: "Dinner" });
    await scheduleItem("todo-1", { date: "2026-07-02" });
    expect(itemCreateMock).not.toHaveBeenCalled();       // no copy
    expect(itemUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "todo-1" } }),
    );
  });

  it("still copies in a true wishlist idea (no date, no stop)", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "idea-1", date: null, stopId: null, forkId: null, title: "Idea", category: "SIGHTSEEING" });
    itemFindFirstMock.mockResolvedValue({ sortOrder: 4 });
    await scheduleItem("idea-1", { date: "2026-07-02" });
    expect(itemCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sourceItemId: "idea-1", date: "2026-07-02" }) }),
    );
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
  it("creates a Cost with ownerType ITEM and the new item id when costMinor+currency are provided", async () => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-cost-1", title: "Visit the Museum" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.6, persist: null });

    const result = await createItem("trip-1", {
      ...VALID_INPUT,
      costMinor: 12000,
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
          costMinor: 12000,
          currency: "EUR",
          rateToHome: 0.6,
        }),
      }),
    );
  });

  it("does NOT create a Cost when no costMinor is provided", async () => {
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
      costMinor: 5000,
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
      costMinor: 8000,
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
  it("creates a Cost when item has 0 existing costs and costMinor is provided", async () => {
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "iu-1", tripId: "trip-1", forkId: null }) // requireItemAccess
      .mockResolvedValueOnce({ id: "iu-1", title: "Visit the Museum", category: "SIGHTSEEING" }); // before snapshot
    itemUpdateMock.mockResolvedValue({ id: "iu-1", title: "Visit the Museum", category: "SIGHTSEEING" });
    costFindManyMock.mockResolvedValue([]); // 0 existing costs
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.6, persist: null });

    const result = await updateItem("iu-1", {
      ...VALID_INPUT,
      costMinor: 7500,
      currency: "EUR",
    });

    expect(result.success).toBe(true);
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: "ITEM",
          ownerId: "iu-1",
          costMinor: 7500,
          currency: "EUR",
        }),
      }),
    );
  });

  it("updates the existing Cost when item has exactly 1 cost and costMinor is provided", async () => {
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
      costMinor: 9900,
      currency: "USD",
    });

    expect(result.success).toBe(true);
    expect(costUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing-cost-1" },
        data: expect.objectContaining({
          costMinor: 9900,
          currency: "USD",
          rateToHome: 0.65,
        }),
      }),
    );
    expect(costCreateMock).not.toHaveBeenCalled();
  });

  it("un-ticking Paid (paidMinor omitted) leaves the existing paid amount untouched rather than nulling it", async () => {
    // CONTEXT.md "Paid": un-marking leaves the paid amount in place as
    // history. The dialog now sends paidMinor: undefined (never null) when
    // Paid is un-ticked — Prisma must not receive a `paidMinor` key at all
    // here, or it would null out the existing amount on save.
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "iu-2b", tripId: "trip-1", forkId: null })
      .mockResolvedValueOnce({ id: "iu-2b", title: "Visit the Museum", category: "SIGHTSEEING" });
    itemUpdateMock.mockResolvedValue({ id: "iu-2b", title: "Visit the Museum", category: "SIGHTSEEING" });
    costFindManyMock.mockResolvedValue([
      { id: "existing-cost-2b", ownerType: "ITEM", ownerId: "iu-2b" },
    ]);
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.65, persist: null });

    const result = await updateItem("iu-2b", {
      ...VALID_INPUT,
      costMinor: 9900,
      currency: "USD",
      paidMinor: undefined,
      paidAt: null,
    });

    expect(result.success).toBe(true);
    const call = costUpdateMock.mock.calls[0][0];
    expect(call.data).not.toHaveProperty("paidMinor");
    expect(call.data.paidAt).toBeNull();
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
      costMinor: 5000,
      currency: "AUD",
    });

    expect(result.success).toBe(true);
    expect(costCreateMock).not.toHaveBeenCalled();
    expect(costUpdateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("does NOT create or update costs when costMinor is absent (even with 0 existing costs)", async () => {
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

// ---------------------------------------------------------------------------
// addMarkerToWishlist
// ---------------------------------------------------------------------------

const MARKER = {
  id: "m1",
  globeId: "g1",
  title: "Tokyo Tower",
  category: "SIGHTSEEING",
  note: null,
  link: null,
  timing: "late Sept",
  lat: 35.6586,
  lng: 139.7454,
  city: "Tokyo",
  country: "Japan",
  countryCode: "jp",
};

describe("addMarkerToWishlist", () => {
  it("returns an error and creates nothing when the marker is not on the user's globe", async () => {
    markerFindUniqueMock.mockResolvedValue({ ...MARKER, globeId: "other" });
    const res = await addMarkerToWishlist("m1", "t1");
    expect(res.success).toBe(false);
    expect(itemCreateMock).not.toHaveBeenCalled();
  });

  it("returns an error when the user has no globe", async () => {
    getUserGlobeMock.mockResolvedValueOnce(null);
    markerFindUniqueMock.mockResolvedValue(MARKER);
    const res = await addMarkerToWishlist("m1", "t1");
    expect(res.success).toBe(false);
    expect(itemCreateMock).not.toHaveBeenCalled();
  });

  it("creates an unscheduled wishlist item from the marker with provenance", async () => {
    markerFindUniqueMock.mockResolvedValue(MARKER);
    itemFindFirstMock
      .mockResolvedValueOnce(null) // dedupe check: none exists
      .mockResolvedValueOnce({ sortOrder: 4 }); // max sortOrder
    itemCreateMock.mockResolvedValue({ id: "i1", title: "Tokyo Tower" });

    const res = await addMarkerToWishlist("m1", "t1");

    expect(res.success).toBe(true);
    expect(itemCreateMock).toHaveBeenCalledTimes(1);
    const data = itemCreateMock.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tripId: "t1",
      forkId: null,
      stopId: null,
      date: null,
      sourceMarkerId: "m1",
      title: "Tokyo Tower",
      category: "SIGHTSEEING",
      lat: 35.6586,
      lng: 139.7454,
      countryCode: "jp",
      address: "Tokyo, Japan",
      notes: "(when: late Sept)",
      sortOrder: 5,
    });
  });

  it("logs the same CREATED/ITEM activity as a manual add", async () => {
    markerFindUniqueMock.mockResolvedValue(MARKER);
    itemFindFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ sortOrder: 0 });
    itemCreateMock.mockResolvedValue({ id: "i1", title: "Tokyo Tower" });

    await addMarkerToWishlist("m1", "t1");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "t1", verb: "CREATED", entityType: "ITEM", entityId: "i1" }),
    );
  });

  it("is idempotent — does not duplicate when the marker is already in the wishlist", async () => {
    markerFindUniqueMock.mockResolvedValue(MARKER);
    itemFindFirstMock.mockResolvedValueOnce({ id: "existing" }); // dedupe hit
    const res = await addMarkerToWishlist("m1", "t1");
    expect(res.success).toBe(true);
    expect(itemCreateMock).not.toHaveBeenCalled();
  });
});
