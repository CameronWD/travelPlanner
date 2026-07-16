import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for transport server actions.
 *
 * Mocks: lib/db, lib/guards, next/cache, lib/fx
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  geocodePlaceMock,
  searchPlacesWithStatusMock,
  transportFindUniqueMock,
  transportFindFirstMock,
  transportCreateMock,
  transportUpdateMock,
  transportDeleteMock,
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
    searchPlacesWithStatusMock: vi.fn().mockResolvedValue({ status: "ok", candidates: [] }),
    transportFindUniqueMock: vi.fn(),
    transportFindFirstMock: vi.fn(),
    transportCreateMock: vi.fn(),
    transportUpdateMock: vi.fn(),
    transportDeleteMock: vi.fn(),
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
vi.mock("@/lib/geocode", () => ({
  geocodePlace: geocodePlaceMock,
  searchPlacesWithStatus: searchPlacesWithStatusMock,
}));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/fx", () => ({
  resolveRateForTrip: resolveRateForTripMock,
  persistRate: persistRateMock,
}));
vi.mock("@/lib/db", () => ({
  db: {
    transport: {
      findUnique: transportFindUniqueMock,
      findFirst: transportFindFirstMock,
      create: transportCreateMock,
      update: transportUpdateMock,
      delete: transportDeleteMock,
    },
    stop: {
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

vi.mock("@/server/actions/target-cleanup", () => ({
  cleanupTargetSideData: vi.fn().mockResolvedValue(undefined),
}));

import {
  createTransport,
  updateTransport,
  deleteTransport,
  searchPlacesAction,
} from "./transport";
import { recordActivity } from "@/server/actions/activity";

const VALID_INPUT = {
  mode: "FLIGHT" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
  stopFindManyMock.mockResolvedValue([]);
  geocodePlaceMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
  stopFindManyMock.mockResolvedValue([]);
  geocodePlaceMock.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// createTransport
// ---------------------------------------------------------------------------

describe("plan-scope: createTransport sortOrder", () => {
  it("computes sortOrder within the real plan only (forkId null)", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });

    await createTransport("trip-1", VALID_INPUT);

    expect(transportFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: null }),
      }),
    );
  });
});

describe("plan-scope: createTransport stop FK validation", () => {
  it("fetches stop FK validation rows scoped to the real plan (forkId null)", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    stopFindManyMock.mockResolvedValue([{ id: "stop-1", tripId: "trip-1", forkId: null }]);
    transportCreateMock.mockResolvedValue({ id: "t-1" });

    await createTransport("trip-1", { mode: "TRAIN", fromStopId: "stop-1" });

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ forkId: null }),
      }),
    );
  });
});

describe("plan-scope: createTransport with forkId", () => {
  it("creates a transport in the given fork with fork-scoped sortOrder", async () => {
    transportFindFirstMock.mockResolvedValue({ sortOrder: 2 });
    transportCreateMock.mockResolvedValue({ id: "t-9" });

    await createTransport("trip-1", VALID_INPUT, "fork-9");

    expect(transportFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ forkId: "fork-9", sortOrder: 3 }),
    });
  });

  it("writes forkId: null on create when no forkId is passed (real plan)", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-10" });

    await createTransport("trip-1", VALID_INPUT);

    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ forkId: null }),
    });
  });

  it("scopes stop FK validation to the given fork when forkId is provided", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    stopFindManyMock.mockResolvedValue([{ id: "stop-f", tripId: "trip-1", forkId: "fork-9" }]);
    transportCreateMock.mockResolvedValue({ id: "t-9" });

    await createTransport("trip-1", { mode: "TRAIN", fromStopId: "stop-f" }, "fork-9");

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: "fork-9" }) }),
    );
  });

  it("rejects a stop from a different plan (real-plan stop when creating in a fork)", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    // Stop exists but has forkId: null (real plan), not matching the fork we're creating in
    stopFindManyMock.mockResolvedValue([{ id: "stop-1", tripId: "trip-1", forkId: null }]);

    const result = await createTransport("trip-1", { mode: "TRAIN", fromStopId: "stop-1" }, "fork-9");

    expect(result.success).toBe(false);
    expect(transportCreateMock).not.toHaveBeenCalled();
  });
});

describe("createTransport", () => {
  it("creates a transport with sortOrder = 0 when none exist", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });

    const result = await createTransport("trip-1", VALID_INPUT);

    expect(result.success).toBe(true);
    expect(transportCreateMock).toHaveBeenCalledOnce();
    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip-1",
        mode: "FLIGHT",
        sortOrder: 0,
      }),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1", "layout");
  });

  it("sets sortOrder = max + 1 when transports exist", async () => {
    transportFindFirstMock.mockResolvedValue({ sortOrder: 3 });
    transportCreateMock.mockResolvedValue({ id: "t-2" });

    await createTransport("trip-1", VALID_INPUT);

    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 4 }),
    });
  });

  it("calls requireTripAccess for access check", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });

    await createTransport("trip-1", VALID_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
  });

  it("returns validation error and does not write for invalid mode", async () => {
    const result = await createTransport("trip-1", { mode: "ROCKET" as never });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.mode).toBeDefined();
    }
    expect(transportCreateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("validates that fromStopId belongs to the trip", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    // Stop belongs to a different trip
    stopFindManyMock.mockResolvedValue([
      { id: "stop-1", tripId: "other-trip" },
    ]);

    const result = await createTransport("trip-1", {
      mode: "TRAIN",
      fromStopId: "stop-1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors._form).toBeDefined();
    }
    expect(transportCreateMock).not.toHaveBeenCalled();
  });

  it("allows fromStopId when stop belongs to the same trip", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    stopFindManyMock.mockResolvedValue([{ id: "stop-1", tripId: "trip-1", forkId: null }]);
    transportCreateMock.mockResolvedValue({ id: "t-1" });

    const result = await createTransport("trip-1", {
      mode: "TRAIN",
      fromStopId: "stop-1",
    });

    expect(result.success).toBe(true);
    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ fromStopId: "stop-1" }),
    });
  });

  it("geocodes both depPlace and arrPlace and stores all four coords", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });
    // dep first, then arr
    geocodePlaceMock
      .mockResolvedValueOnce({ lat: 51.5074, lng: -0.1278 })
      .mockResolvedValueOnce({ lat: 48.8566, lng: 2.3522 });

    const result = await createTransport("trip-1", {
      mode: "FLIGHT",
      depPlace: "London Heathrow",
      arrPlace: "Paris CDG",
    });

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).toHaveBeenCalledTimes(2);
    expect(geocodePlaceMock).toHaveBeenNthCalledWith(1, "London Heathrow");
    expect(geocodePlaceMock).toHaveBeenNthCalledWith(2, "Paris CDG");
    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        depLat: 51.5074,
        depLng: -0.1278,
        arrLat: 48.8566,
        arrLng: 2.3522,
      }),
    });
  });

  it("only geocodes depPlace when arrPlace is absent; arrLat/arrLng are null", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });
    geocodePlaceMock.mockResolvedValueOnce({ lat: 51.5074, lng: -0.1278 });

    const result = await createTransport("trip-1", {
      mode: "TRAIN",
      depPlace: "London Euston",
    });

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).toHaveBeenCalledOnce();
    expect(geocodePlaceMock).toHaveBeenCalledWith("London Euston");
    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        depLat: 51.5074,
        depLng: -0.1278,
        arrLat: null,
        arrLng: null,
      }),
    });
  });

  it("does not call geocode and stores null coords when neither place is set", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });

    const result = await createTransport("trip-1", VALID_INPUT);

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).not.toHaveBeenCalled();
    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        depLat: null,
        depLng: null,
        arrLat: null,
        arrLng: null,
      }),
    });
  });

  it("still creates when geocode returns null for both places (null coords)", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });
    geocodePlaceMock.mockResolvedValue(null);

    const result = await createTransport("trip-1", {
      mode: "FLIGHT",
      depPlace: "Unknown Dep",
      arrPlace: "Unknown Arr",
    });

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).toHaveBeenCalledTimes(2);
    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        depLat: null,
        depLng: null,
        arrLat: null,
        arrLng: null,
      }),
    });
  });

  it("records CREATED activity with entityLabel from depPlace", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1", mode: "FLIGHT", depPlace: "London Heathrow" });

    await createTransport("trip-1", { mode: "FLIGHT", depPlace: "London Heathrow" });

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "CREATED", entityType: "TRANSPORT", entityLabel: "London Heathrow" }),
    );
  });
});

// ---------------------------------------------------------------------------
// updateTransport
// ---------------------------------------------------------------------------

describe("updateTransport", () => {
  it("updates and revalidates", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-1", tripId: "trip-1" });
    transportUpdateMock.mockResolvedValue({});

    const result = await updateTransport("t-1", { mode: "TRAIN" });

    expect(result.success).toBe(true);
    expect(transportUpdateMock).toHaveBeenCalledWith({
      where: { id: "t-1" },
      data: expect.objectContaining({ mode: "TRAIN" }),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1", "layout");
  });

  it("returns validation error and does not write", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-1", tripId: "trip-1" });

    const result = await updateTransport("t-1", { mode: "INVALID" as never });

    expect(result.success).toBe(false);
    expect(transportUpdateMock).not.toHaveBeenCalled();
  });

  it("checks access via requireTripAccess on the transport's tripId", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-1", tripId: "trip-2" });
    transportUpdateMock.mockResolvedValue({});

    await updateTransport("t-1", VALID_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-2");
  });

  it("records UPDATED activity with changes array", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "t-1", tripId: "trip-1" }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "t-1", mode: "FLIGHT", depPlace: "Heathrow" }); // before row
    transportUpdateMock.mockResolvedValue({ id: "t-1", mode: "TRAIN", depPlace: "Heathrow" });

    await updateTransport("t-1", { mode: "TRAIN" });

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "TRANSPORT",
        changes: expect.arrayContaining([expect.objectContaining({ field: "mode" })]),
      }),
    );
  });

  // I1 — a fork transport must validate its stops against the FORK plan.
  it("scopes stop FK validation to the transport's fork (fork transport → fork stops)", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "ft-1", tripId: "trip-1", forkId: "fork-9" }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "ft-1", mode: "FLIGHT" }); // before row
    stopFindManyMock.mockResolvedValue([{ id: "stop-f", tripId: "trip-1", forkId: "fork-9" }]);
    transportUpdateMock.mockResolvedValue({ id: "ft-1", mode: "TRAIN" });

    const result = await updateTransport("ft-1", { mode: "TRAIN", fromStopId: "stop-f" });

    expect(result.success).toBe(true);
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: "fork-9" }) }),
    );
  });

  it("rejects a fork transport pointing at a real-plan stop", async () => {
    // Validation fails after requireTransportAccess, so only ONE findUnique runs.
    transportFindUniqueMock.mockResolvedValue({ id: "ft-2", tripId: "trip-1", forkId: "fork-9" });
    // Fork scope returns no matching stop (the stop is real-plan, forkId null).
    stopFindManyMock.mockResolvedValue([]);

    const result = await updateTransport("ft-2", { mode: "TRAIN", fromStopId: "stop-real" });

    expect(result.success).toBe(false);
    expect(transportUpdateMock).not.toHaveBeenCalled();
  });

  it("scopes stop FK validation to the real plan for a real-plan transport", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "rt-1", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "rt-1", mode: "FLIGHT" }); // before row
    stopFindManyMock.mockResolvedValue([{ id: "stop-r", tripId: "trip-1", forkId: null }]);
    transportUpdateMock.mockResolvedValue({ id: "rt-1", mode: "TRAIN" });

    const result = await updateTransport("rt-1", { mode: "TRAIN", fromStopId: "stop-r" });

    expect(result.success).toBe(true);
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });
});

// ---------------------------------------------------------------------------
// deleteTransport
// ---------------------------------------------------------------------------

describe("deleteTransport", () => {
  it("deletes and revalidates", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-1", tripId: "trip-1" });
    transportDeleteMock.mockResolvedValue({});

    const result = await deleteTransport("t-1");

    expect(result.success).toBe(true);
    expect(transportDeleteMock).toHaveBeenCalledWith({ where: { id: "t-1" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1", "layout");
  });

  it("access-checks via transport's tripId", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-1", tripId: "trip-5" });
    transportDeleteMock.mockResolvedValue({});

    await deleteTransport("t-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-5");
  });

  it("records DELETED activity with the snapshotted label", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "t-1", tripId: "trip-1" }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "t-1", mode: "FLIGHT", reference: "BA490", depPlace: "Heathrow" }); // doomed label
    transportDeleteMock.mockResolvedValue({});

    await deleteTransport("t-1");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityType: "TRANSPORT", entityLabel: "BA490" }),
    );
  });
});

// ---------------------------------------------------------------------------
// revalidation scope
// ---------------------------------------------------------------------------

describe("revalidation: layout scope", () => {
  it("deleteTransport revalidates with layout scope so sub-routes (e.g. /plan) also refresh", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-rv", tripId: "trip-rv", forkId: null });
    transportDeleteMock.mockResolvedValue({});

    await deleteTransport("t-rv");

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-rv", "layout");
  });
});

// ---------------------------------------------------------------------------
// fork-silent: activity must NOT fire for fork-scoped mutations
// ---------------------------------------------------------------------------

describe("fork-silent: createTransport in a fork does NOT record activity", () => {
  it("does not call recordActivity when forkId is set (fork-scoped create)", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "ft-1", mode: "FLIGHT" });

    await createTransport("trip-1", VALID_INPUT, "fork-x");

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when forkId is null (real-plan create)", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "rt-1", mode: "FLIGHT" });

    await createTransport("trip-1", VALID_INPUT);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "CREATED", entityType: "TRANSPORT" }),
    );
  });
});

describe("fork-silent: updateTransport in a fork does NOT record activity", () => {
  it("does not call recordActivity when transport.forkId is non-null (fork-scoped update)", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "ft-2", tripId: "trip-1", forkId: "fork-x" }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "ft-2", mode: "FLIGHT" }); // before snapshot
    transportUpdateMock.mockResolvedValue({ id: "ft-2", mode: "TRAIN" });

    await updateTransport("ft-2", { mode: "TRAIN" as const });

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when transport.forkId is null (real-plan update)", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "rt-2", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "rt-2", mode: "FLIGHT" }); // before snapshot
    transportUpdateMock.mockResolvedValue({ id: "rt-2", mode: "TRAIN" });

    await updateTransport("rt-2", { mode: "TRAIN" as const });

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "UPDATED", entityType: "TRANSPORT" }),
    );
  });
});

describe("fork-silent: deleteTransport in a fork does NOT record activity", () => {
  it("does not call recordActivity when transport.forkId is non-null (fork-scoped delete)", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "ft-3", tripId: "trip-1", forkId: "fork-x" }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "ft-3", mode: "FLIGHT", reference: null, depPlace: null }); // doomed label
    transportDeleteMock.mockResolvedValue({});

    await deleteTransport("ft-3");

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when transport.forkId is null (real-plan delete)", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "rt-3", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "rt-3", mode: "FLIGHT", reference: null, depPlace: null }); // doomed label
    transportDeleteMock.mockResolvedValue({});

    await deleteTransport("rt-3");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityType: "TRANSPORT" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Inline cost: createTransport with cost fields
// ---------------------------------------------------------------------------

describe("createTransport: inline cost creation", () => {
  it("creates a Cost with ownerType TRANSPORT and the new transport id when estimatedMinor+currency are provided", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-cost-1", mode: "FLIGHT" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.6, persist: null });
    costFindManyMock.mockResolvedValue([]); // not called on create path but reset for clarity

    const result = await createTransport("trip-1", {
      mode: "FLIGHT",
      estimatedMinor: 12000,
      currency: "EUR",
    });

    expect(result.success).toBe(true);
    // trip lookup happened to find home currency
    expect(tripFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "trip-1" } }),
    );
    // resolveRateForTrip called with the cost currency and home currency
    expect(resolveRateForTripMock).toHaveBeenCalledWith(
      "trip-1",
      "EUR",
      "AUD",
      expect.anything(),
    );
    // transaction used to create cost
    expect(transactionMock).toHaveBeenCalled();
    // cost.create called inside the transaction with correct ownerType/ownerId
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: "TRANSPORT",
          ownerId: "t-cost-1",
          estimatedMinor: 12000,
          currency: "EUR",
          rateToHome: 0.6,
        }),
      }),
    );
  });

  it("does NOT create a Cost when no estimatedMinor is provided", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-no-cost", mode: "TRAIN" });

    await createTransport("trip-1", { mode: "TRAIN" });

    expect(transactionMock).not.toHaveBeenCalled();
    expect(costCreateMock).not.toHaveBeenCalled();
  });

  it("snapshots rateToHome=1 when cost currency equals home currency", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-same-cur", mode: "BUS" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1, persist: null });

    await createTransport("trip-1", {
      mode: "BUS",
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
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-persist", mode: "FLIGHT" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({
      rate: 0.55,
      persist: { base: "USD", quote: "AUD", rate: 0.55 },
    });

    await createTransport("trip-1", {
      mode: "FLIGHT",
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
// Inline cost: updateTransport with cost fields
// ---------------------------------------------------------------------------

describe("updateTransport: inline cost update/create", () => {
  it("creates a Cost when transport has 0 existing costs and estimatedMinor is provided", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tu-1", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tu-1", mode: "FLIGHT" }); // before snapshot
    transportUpdateMock.mockResolvedValue({ id: "tu-1", mode: "TRAIN" });
    costFindManyMock.mockResolvedValue([]); // 0 existing costs
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.6, persist: null });

    const result = await updateTransport("tu-1", {
      mode: "TRAIN",
      estimatedMinor: 7500,
      currency: "EUR",
    });

    expect(result.success).toBe(true);
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: "TRANSPORT",
          ownerId: "tu-1",
          estimatedMinor: 7500,
          currency: "EUR",
        }),
      }),
    );
  });

  it("updates the existing Cost when transport has exactly 1 cost and estimatedMinor is provided", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tu-2", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tu-2", mode: "FLIGHT" }); // before snapshot
    transportUpdateMock.mockResolvedValue({ id: "tu-2", mode: "FLIGHT" });
    costFindManyMock.mockResolvedValue([
      { id: "existing-cost-1", ownerType: "TRANSPORT", ownerId: "tu-2" },
    ]); // exactly 1 existing cost
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.65, persist: null });

    const result = await updateTransport("tu-2", {
      mode: "FLIGHT",
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

  it("does NOT touch any costs when transport has >1 existing costs (CostEditor authoritative)", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tu-3", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tu-3", mode: "FLIGHT" }); // before snapshot
    transportUpdateMock.mockResolvedValue({ id: "tu-3", mode: "FLIGHT" });
    costFindManyMock.mockResolvedValue([
      { id: "c-a", ownerType: "TRANSPORT", ownerId: "tu-3" },
      { id: "c-b", ownerType: "TRANSPORT", ownerId: "tu-3" },
    ]); // >1 costs

    const result = await updateTransport("tu-3", {
      mode: "FLIGHT",
      estimatedMinor: 5000,
      currency: "AUD",
    });

    expect(result.success).toBe(true);
    expect(costCreateMock).not.toHaveBeenCalled();
    expect(costUpdateMock).not.toHaveBeenCalled();
    // Transaction should not be called for cost when >1 costs
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("does NOT create or update costs when estimatedMinor is absent (even with 0 existing costs)", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tu-4", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tu-4", mode: "FLIGHT" }); // before snapshot
    transportUpdateMock.mockResolvedValue({ id: "tu-4", mode: "TRAIN" });
    costFindManyMock.mockResolvedValue([]); // 0 existing costs

    await updateTransport("tu-4", { mode: "TRAIN" });

    expect(transactionMock).not.toHaveBeenCalled();
    expect(costCreateMock).not.toHaveBeenCalled();
    expect(costUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Home base endpoint: createTransport
// ---------------------------------------------------------------------------

describe("createTransport: home base departure", () => {
  it("persists depIsHome=true and skips geocoding depPlace, nulls fromStopId/depPlace/depLat/depLng", async () => {
    requireTripAccessMock.mockResolvedValue({ tripId: "t1", userId: "u1" });
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "tr1", mode: "FLIGHT" });
    // depIsHome clears fromStopId, so no stop FK validation for dep side.
    // toStopId "s1" must pass validation.
    stopFindManyMock.mockResolvedValue([{ id: "s1", tripId: "t1", forkId: null }]);

    const result = await createTransport("t1", { mode: "FLIGHT", depIsHome: true, toStopId: "s1" });

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).not.toHaveBeenCalled();
    expect(transportCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          depIsHome: true,
          fromStopId: null,
          depPlace: null,
          depLat: null,
          depLng: null,
        }),
      }),
    );
  });

  it("persists arrIsHome=true and skips geocoding arrPlace, nulls toStopId/arrPlace/arrLat/arrLng", async () => {
    requireTripAccessMock.mockResolvedValue({ tripId: "t1", userId: "u1" });
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "tr2", mode: "FLIGHT" });
    // arrIsHome clears toStopId, so no stop FK validation for arr side.
    // fromStopId "s1" must pass validation.
    stopFindManyMock.mockResolvedValue([{ id: "s1", tripId: "t1", forkId: null }]);

    const result = await createTransport("t1", { mode: "FLIGHT", fromStopId: "s1", arrIsHome: true, arrPlace: "should be ignored" });

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).not.toHaveBeenCalled();
    expect(transportCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          arrIsHome: true,
          toStopId: null,
          arrPlace: null,
          arrLat: null,
          arrLng: null,
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Home base endpoint: updateTransport
// ---------------------------------------------------------------------------

describe("updateTransport: home base departure", () => {
  it("persists depIsHome=true and skips geocoding depPlace, nulls fromStopId/depPlace/depLat/depLng", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tr1", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tr1", mode: "FLIGHT" }); // before snapshot
    transportUpdateMock.mockResolvedValue({ id: "tr1", mode: "FLIGHT" });
    // depIsHome clears fromStopId; toStopId "s1" must pass FK validation.
    stopFindManyMock.mockResolvedValue([{ id: "s1", tripId: "trip-1", forkId: null }]);

    const result = await updateTransport("tr1", { mode: "FLIGHT", depIsHome: true, toStopId: "s1" });

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).not.toHaveBeenCalled();
    expect(transportUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          depIsHome: true,
          fromStopId: null,
          depPlace: null,
          depLat: null,
          depLng: null,
        }),
      }),
    );
  });

  it("persists arrIsHome=true and skips geocoding arrPlace, nulls toStopId/arrPlace/arrLat/arrLng", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tr2", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tr2", mode: "FLIGHT" }); // before snapshot
    transportUpdateMock.mockResolvedValue({ id: "tr2", mode: "FLIGHT" });
    // arrIsHome clears toStopId; fromStopId "s1" must pass FK validation.
    stopFindManyMock.mockResolvedValue([{ id: "s1", tripId: "trip-1", forkId: null }]);

    const result = await updateTransport("tr2", { mode: "FLIGHT", fromStopId: "s1", arrIsHome: true, arrPlace: "should be ignored" });

    expect(result.success).toBe(true);
    expect(geocodePlaceMock).not.toHaveBeenCalled();
    expect(transportUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          arrIsHome: true,
          toStopId: null,
          arrPlace: null,
          arrLat: null,
          arrLng: null,
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// anchorStopId: createTransport persists anchorStopId and validates it
// ---------------------------------------------------------------------------

describe("anchorStopId: createTransport round-trips and validates", () => {
  it("persists anchorStopId when a valid stop is provided", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    // stops: stopA (from) and stopB (anchor)
    stopFindManyMock.mockResolvedValue([
      { id: "stop-a", tripId: "trip-1", forkId: null },
      { id: "stop-b", tripId: "trip-1", forkId: null },
    ]);
    transportCreateMock.mockResolvedValue({ id: "t-anchor-1", mode: "FLIGHT" });

    const result = await createTransport("trip-1", {
      mode: "FLIGHT",
      fromStopId: "stop-a",
      anchorStopId: "stop-b",
    });

    expect(result.success).toBe(true);
    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ anchorStopId: "stop-b" }),
    });
  });

  it("rejects anchorStopId from a different trip (cross-trip stop)", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    // stopFindMany returns empty (no stops matching the given IDs in this plan)
    stopFindManyMock.mockResolvedValue([]);

    const result = await createTransport("trip-1", {
      mode: "FLIGHT",
      anchorStopId: "stop-other-trip",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors._form).toBeDefined();
    }
    expect(transportCreateMock).not.toHaveBeenCalled();
  });

  it("null anchorStopId round-trips as null in create", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    stopFindManyMock.mockResolvedValue([]);
    transportCreateMock.mockResolvedValue({ id: "t-no-anchor", mode: "TRAIN" });

    const result = await createTransport("trip-1", { mode: "TRAIN" });

    expect(result.success).toBe(true);
    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ anchorStopId: null }),
    });
  });
});

describe("anchorStopId: updateTransport persists anchorStopId and validates it", () => {
  it("persists anchorStopId when a valid stop is provided on update", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tu-anchor", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tu-anchor", mode: "FLIGHT" }); // before snapshot
    stopFindManyMock.mockResolvedValue([
      { id: "stop-a", tripId: "trip-1", forkId: null },
      { id: "stop-b", tripId: "trip-1", forkId: null },
    ]);
    transportUpdateMock.mockResolvedValue({ id: "tu-anchor", mode: "FLIGHT" });

    const result = await updateTransport("tu-anchor", {
      mode: "FLIGHT",
      fromStopId: "stop-a",
      anchorStopId: "stop-b",
    });

    expect(result.success).toBe(true);
    expect(transportUpdateMock).toHaveBeenCalledWith({
      where: { id: "tu-anchor" },
      data: expect.objectContaining({ anchorStopId: "stop-b" }),
    });
  });

  it("rejects anchorStopId from a different trip on update", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "tu-bad-anchor", tripId: "trip-1", forkId: null });
    // No matching stops — the anchor stop belongs to another trip
    stopFindManyMock.mockResolvedValue([]);

    const result = await updateTransport("tu-bad-anchor", {
      mode: "FLIGHT",
      anchorStopId: "stop-other-trip",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors._form).toBeDefined();
    }
    expect(transportUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// searchPlacesAction
// ---------------------------------------------------------------------------

describe("searchPlacesAction", () => {
  it("returns candidates from searchPlacesWithStatus for an accessible trip", async () => {
    const candidate = {
      name: "Hakone, Japan",
      lat: 35.2,
      lng: 139.0,
      city: "Hakone",
      country: "Japan",
      countryCode: "jp",
    };
    searchPlacesWithStatusMock.mockResolvedValueOnce({ status: "ok", candidates: [candidate] });

    const result = await searchPlacesAction("trip-1", "Hakone");

    expect(result).toEqual({ status: "ok", candidates: [candidate] });
    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
    expect(searchPlacesWithStatusMock).toHaveBeenCalledWith("Hakone");
  });

  it("returns empty candidates immediately for an empty/whitespace query without calling the geocode mock", async () => {
    const result = await searchPlacesAction("trip-1", "   ");

    expect(result).toEqual({ status: "ok", candidates: [] });
    expect(searchPlacesWithStatusMock).not.toHaveBeenCalled();
  });

  it("rejects when requireTripAccess denies access (inaccessible trip)", async () => {
    requireTripAccessMock.mockRejectedValueOnce(new Error("Not found"));

    await expect(searchPlacesAction("trip-no-access", "Hakone")).rejects.toThrow("Not found");
    expect(searchPlacesWithStatusMock).not.toHaveBeenCalled();
  });
});
