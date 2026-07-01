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
} = vi.hoisted(() => {
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
    tripFindUniqueMock: vi.fn(),
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodePlaceMock }));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));
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
  it("sets date and times on the item", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });
    itemUpdateMock.mockResolvedValue({});

    const result = await scheduleItem("item-1", {
      date: "2026-08-10",
      startTime: "10:00",
      endTime: "12:00",
    });

    expect(result.success).toBe(true);
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        date: "2026-08-10",
        startTime: "10:00",
        endTime: "12:00",
      },
    });
  });

  it("allows scheduling without times", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });
    itemUpdateMock.mockResolvedValue({});

    const result = await scheduleItem("item-1", { date: "2026-08-10" });

    expect(result.success).toBe(true);
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        date: "2026-08-10",
        startTime: null,
        endTime: null,
      },
    });
  });

  it("revalidates wishlist and calendar paths", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });
    itemUpdateMock.mockResolvedValue({});

    await scheduleItem("item-1", { date: "2026-08-10" });

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/wishlist");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/calendar");
  });

  it("access-checks via item's tripId", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-3" });
    itemUpdateMock.mockResolvedValue({});

    await scheduleItem("item-1", { date: "2026-08-10" });

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-3");
  });

  it("returns validation error for invalid date format", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });

    const result = await scheduleItem("item-1", {
      date: "not-a-date",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.date).toBeDefined();
    }
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// unscheduleItem
// ---------------------------------------------------------------------------

describe("unscheduleItem", () => {
  it("clears date and times on the item", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });
    itemUpdateMock.mockResolvedValue({});

    const result = await unscheduleItem("item-1");

    expect(result.success).toBe(true);
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        date: null,
        startTime: null,
        endTime: null,
      },
    });
  });

  it("revalidates wishlist and calendar paths", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-1" });
    itemUpdateMock.mockResolvedValue({});

    await unscheduleItem("item-1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/wishlist");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/calendar");
  });

  it("access-checks via item's tripId", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", tripId: "trip-8" });
    itemUpdateMock.mockResolvedValue({});

    await unscheduleItem("item-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-8");
  });

  it("unscheduleItem records date cleared", async () => {
    // requireItemAccess findUnique → { id, tripId }; before-row findUnique → { date: "2026-07-03", ... }
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "item-1", title: "Louvre", date: "2026-07-03", startTime: null, endTime: null }); // before row
    itemUpdateMock.mockResolvedValue({ id: "item-1", title: "Louvre", date: null, startTime: null, endTime: null });

    await unscheduleItem("item-1");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "ITEM",
        entityId: "item-1",
        changes: expect.arrayContaining([expect.objectContaining({ field: "date" })]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// scheduleItem records activity
// ---------------------------------------------------------------------------

describe("scheduleItem records activity", () => {
  it("scheduleItem records an ITEM update with the date change", async () => {
    // requireItemAccess findUnique → { id, tripId }; before-row findUnique → { date: null, ... }
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" }) // requireItemAccess
      .mockResolvedValueOnce({ id: "item-1", title: "Louvre", date: null, startTime: null, endTime: null }); // before row
    itemUpdateMock.mockResolvedValue({ id: "item-1", title: "Louvre", date: "2026-07-03", startTime: null, endTime: null });

    await scheduleItem("item-1", { date: "2026-07-03" });

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
