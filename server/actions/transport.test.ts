import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for transport server actions.
 *
 * Mocks: lib/db, lib/guards, next/cache, lib/money/fx
 */

const {
  requireTripAccessMock,
  requirePlanAccessMock,
  revalidateTripMock,
  geocodePlaceMock,
  searchPlacesWithStatusMock,
  transportFindUniqueMock,
  transportFindFirstMock,
  transportFindManyMock,
  transportCreateMock,
  transportUpdateMock,
  transportDeleteMock,
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
  queryRawMock,
} = vi.hoisted(() => {
  const queryRawMock = vi.fn().mockResolvedValue([]);
  const costCreateMock = vi.fn().mockResolvedValue({ id: "cost-1" });
  const costUpdateMock = vi.fn().mockResolvedValue({ id: "cost-1" });
  const costDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const costFindManyMock = vi.fn().mockResolvedValue([]);
  const transportUpdateMock = vi.fn().mockResolvedValue({});
  const transportDeleteMock = vi.fn();
  const attachmentFindManyMock = vi.fn().mockResolvedValue([]);
  const attachmentDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const noteDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  // ARCH-DAT-3 (fix round 1, I3): cleanupTargetSideDataTx runs for real here
  // (not stubbed below) and now schedules blob retention INSIDE the tx via
  // scheduleBlobDeletion(keys, tx) — the fake tx needs deletedBlob.createMany
  // so that call has somewhere real to land instead of silently erroring.
  const deletedBlobCreateManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const transactionMock = vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)({
        $queryRaw: queryRawMock,
        transport: { update: transportUpdateMock, delete: transportDeleteMock },
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
        deletedBlob: { createMany: deletedBlobCreateManyMock },
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
    requirePlanAccessMock: vi.fn(async (_tripId: string, forkId?: string | null) => ({
      user: { id: "user-1" },
      membership: { role: "owner" },
      plan: forkId ?? null,
    })),
    revalidateTripMock: vi.fn(),
    geocodePlaceMock: vi.fn().mockResolvedValue(null),
    searchPlacesWithStatusMock: vi.fn().mockResolvedValue({ status: "ok", candidates: [] }),
    transportFindUniqueMock: vi.fn(),
    transportFindFirstMock: vi.fn(),
    transportFindManyMock: vi.fn().mockResolvedValue([]),
    transportCreateMock: vi.fn(),
    transportUpdateMock,
    transportDeleteMock,
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
    queryRawMock,
  };
});

// requireTransportAccess is now a thin adapter over requireRowAccess
// (Task 4) — forward to the same transportFindUniqueMock/requireTripAccessMock
// every test already seeds, so existing mockResolvedValueOnce chains for the
// guard's own lookup keep working unchanged. Transport has no Surprise ref
// (unchanged behaviour), so there's no requireOutsideSurprise call to forward.
const requireRowAccessMock = vi.hoisted(() =>
  vi.fn(async () => {
    const row = await transportFindUniqueMock();
    // Mirror the real guard's load → notFound() short-circuit: this file
    // never mocks next/navigation, so reach for the real notFound(), which
    // throws the same Error (message/digest "NEXT_HTTP_ERROR_FALLBACK;404")
    // production does.
    if (!row) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    const { user, membership } = await requireTripAccessMock(row.tripId);
    return { row, user, membership, surpriseOf: null };
  }),
);
vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
  requirePlanAccess: requirePlanAccessMock,
  requireRowAccess: requireRowAccessMock,
}));
vi.mock("@/lib/revalidate", () => ({ revalidateTrip: revalidateTripMock }));
vi.mock("@/lib/geocode", () => ({
  geocodePlace: geocodePlaceMock,
  searchPlacesWithStatus: searchPlacesWithStatusMock,
}));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/money/fx", () => ({
  resolveRateForTrip: resolveRateForTripMock,
  persistRate: persistRateMock,
}));
vi.mock("@/lib/db", () => ({
  db: {
    transport: {
      findUnique: transportFindUniqueMock,
      findFirst: transportFindFirstMock,
      findMany: transportFindManyMock,
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
      deleteMany: costDeleteManyMock,
    },
    $transaction: transactionMock,
  },
}));

// F4: the rule itself is tested in lib/soft-end.test.ts and the integration
// tier; here only the wiring.
const growTripEndTxMock = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
vi.mock("@/server/actions/trip-window", () => ({
  growTripEndTx: growTripEndTxMock,
  tripWindowScopes: (g: string | null) => (g ? ["trip"] : []),
}));

vi.mock("@/server/actions/target-cleanup", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/actions/target-cleanup")>();
  return {
    ...real,
    cleanupTargetSideData: vi.fn().mockResolvedValue(undefined),
    // cleanupTargetSideDataTx (real) now schedules blob retention inside the
    // tx itself — deleteBlobsBestEffort was deleted (fix round 1, I4).
  };
});

import {
  createTransport,
  updateTransport,
  deleteTransport,
  searchPlacesAction,
  reorderTransports,
} from "./transport";
import { recordActivity } from "@/lib/activity-record";

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

describe("F4: a dated leg grows the soft end", () => {
  it("createTransport runs the rule for its plan after the write", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });

    await createTransport("trip-1", VALID_INPUT);

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", null);
    expect(transportCreateMock.mock.invocationCallOrder[0]).toBeLessThan(growTripEndTxMock.mock.invocationCallOrder[0]);
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "money");
  });

  it("createTransport revalidates the layout when the window grew", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });
    growTripEndTxMock.mockResolvedValueOnce("2026-12-12");

    await createTransport("trip-1", VALID_INPUT);

    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "money", "trip");
  });

  it("a Fork leg passes its Fork (the rule leaves the Trip window alone)", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });

    await createTransport("trip-1", VALID_INPUT, "fork-9");

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", "fork-9");
  });

  it("updateTransport runs the rule for the leg's plan after the write", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-1", tripId: "trip-1", forkId: null });
    transportUpdateMock.mockResolvedValue({ id: "t-1", tripId: "trip-1" });
    growTripEndTxMock.mockResolvedValueOnce("2026-12-12");

    await updateTransport("t-1", { mode: "FLIGHT" });

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", null);
    expect(transportUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(growTripEndTxMock.mock.invocationCallOrder[0]);
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "money", "trip");
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
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "money");
  });

  it("sets sortOrder = max + 1 when transports exist", async () => {
    transportFindFirstMock.mockResolvedValue({ sortOrder: 3 });
    transportCreateMock.mockResolvedValue({ id: "t-2" });

    await createTransport("trip-1", VALID_INPUT);

    expect(transportCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 4 }),
    });
  });

  it("calls requirePlanAccess for access check", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });

    await createTransport("trip-1", VALID_INPUT);

    expect(requirePlanAccessMock).toHaveBeenCalledWith("trip-1", undefined);
    expectAccessCheckedBeforeWrite(requirePlanAccessMock, transportCreateMock);
  });

  it("returns validation error and does not write for invalid mode", async () => {
    const result = await createTransport("trip-1", { mode: "ROCKET" as never });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.mode).toBeDefined();
    }
    expect(transportCreateMock).not.toHaveBeenCalled();
    expect(revalidateTripMock).not.toHaveBeenCalled();
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
      expect(result.errors._).toBeDefined();
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

  it("returns the new Transport's id", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-new" });
    expect(await createTransport("trip-1", VALID_INPUT)).toEqual({ success: true, id: "t-new" });
  });
});

// ---------------------------------------------------------------------------
// P0-1: wall-time strings are interpreted in the endpoint stop's timezone
// ---------------------------------------------------------------------------

describe("createTransport: wall-time tz interpretation (P0-1)", () => {
  it("stores a wall-time string interpreted in the from-stop's timezone", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    stopFindManyMock.mockResolvedValue([
      { id: "s-paris", tripId: "trip-1", forkId: null, timezone: "Europe/Paris" },
      { id: "s-rome", tripId: "trip-1", forkId: null, timezone: "Europe/Rome" },
    ]);
    transportCreateMock.mockResolvedValue({ id: "t-wt-1" });

    await createTransport("trip-1", {
      mode: "TRAIN",
      fromStopId: "s-paris",
      toStopId: "s-rome",
      depAt: "2026-07-01T08:00",
    });

    const createArg = transportCreateMock.mock.calls[0][0];
    expect(createArg.data.depAt.toISOString()).toBe("2026-07-01T06:00:00.000Z");
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
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "money");
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
    expectAccessCheckedBeforeWrite(requireRowAccessMock, transportUpdateMock);
  });

  it("rejects with notFound and writes nothing when the transport doesn't exist", async () => {
    transportFindUniqueMock.mockResolvedValue(null);

    await expect(updateTransport("missing-transport", VALID_INPUT)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

    expect(transportUpdateMock).not.toHaveBeenCalled();
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
    // The guard and the held row both read this one row; the stop check then fails.
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
// P0-1: updateTransport wall-time tz interpretation
// ---------------------------------------------------------------------------

describe("updateTransport: wall-time tz interpretation (P0-1)", () => {
  it("converts a wall-time string via the NEW endpoint's timezone (not a stale/previous one)", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tu-tz-1", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tu-tz-1", mode: "TRAIN" }); // before row
    stopFindManyMock.mockResolvedValue([
      { id: "s-sydney", tripId: "trip-1", forkId: null, timezone: "Australia/Sydney" },
    ]);
    transportUpdateMock.mockResolvedValue({ id: "tu-tz-1", mode: "TRAIN" });

    await updateTransport("tu-tz-1", {
      mode: "TRAIN",
      fromStopId: "s-sydney",
      depAt: "2026-07-01T08:00",
    });

    const updateArg = transportUpdateMock.mock.calls[0][0];
    expect(updateArg.data.depAt.toISOString()).toBe("2026-06-30T22:00:00.000Z"); // AEST = UTC+10
  });

  it("converts arrAt via the to-stop's zone, independent of a differently-zoned dep stop", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tu-tz-2", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tu-tz-2", mode: "TRAIN" }); // before row
    stopFindManyMock.mockResolvedValue([
      { id: "s-paris", tripId: "trip-1", forkId: null, timezone: "Europe/Paris" },
      { id: "s-tokyo", tripId: "trip-1", forkId: null, timezone: "Asia/Tokyo" },
    ]);
    transportUpdateMock.mockResolvedValue({ id: "tu-tz-2", mode: "TRAIN" });

    await updateTransport("tu-tz-2", {
      mode: "TRAIN",
      fromStopId: "s-paris",
      toStopId: "s-tokyo",
      depAt: "2026-07-01T08:00",
      arrAt: "2026-07-01T20:00",
    });

    const updateArg = transportUpdateMock.mock.calls[0][0];
    expect(updateArg.data.depAt.toISOString()).toBe("2026-07-01T06:00:00.000Z"); // Paris CEST = UTC+2
    expect(updateArg.data.arrAt.toISOString()).toBe("2026-07-01T11:00:00.000Z"); // Tokyo JST = UTC+9
  });

  it("interprets the dep wall time in the to-stop's zone on a home-departure leg (no from-stop)", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tu-tz-3", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tu-tz-3", mode: "TRAIN" }); // before row
    stopFindManyMock.mockResolvedValue([
      { id: "s-paris", tripId: "trip-1", forkId: null, timezone: "Europe/Paris" },
    ]);
    transportUpdateMock.mockResolvedValue({ id: "tu-tz-3", mode: "TRAIN" });

    await updateTransport("tu-tz-3", {
      mode: "TRAIN",
      depIsHome: true,
      toStopId: "s-paris",
      depAt: "2026-07-01T08:00",
    });

    const updateArg = transportUpdateMock.mock.calls[0][0];
    expect(updateArg.data.depAt.toISOString()).toBe("2026-07-01T06:00:00.000Z"); // Paris CEST = UTC+2
  });
});

// ---------------------------------------------------------------------------
// Home-end wall times are read in the Trip's Home timezone
// ---------------------------------------------------------------------------

describe("Home-end wall times", () => {
  it("createTransport reads a Home departure in the Trip's Home zone", async () => {
    stopFindManyMock.mockResolvedValue([{ id: "stop-dps", timezone: "Asia/Makassar", tripId: "trip-1", forkId: null }]);
    tripFindUniqueMock.mockResolvedValue({ homeTimezone: "Australia/Brisbane" });
    transportCreateMock.mockResolvedValue({ id: "t-home-1" });

    await createTransport("trip-1", { mode: "FLIGHT", depIsHome: true, toStopId: "stop-dps", depAt: "2026-12-04T17:50" });

    expect(transportCreateMock.mock.calls[0][0].data.depAt).toEqual(new Date("2026-12-04T07:50:00Z"));
  });

  it("falls back to the far end when the Trip has no Home zone", async () => {
    stopFindManyMock.mockResolvedValue([{ id: "stop-dps", timezone: "Asia/Makassar", tripId: "trip-1", forkId: null }]);
    tripFindUniqueMock.mockResolvedValue({ homeTimezone: null });
    transportCreateMock.mockResolvedValue({ id: "t-home-2" });

    await createTransport("trip-1", { mode: "FLIGHT", depIsHome: true, toStopId: "stop-dps", depAt: "2026-12-04T15:50" });

    expect(transportCreateMock.mock.calls[0][0].data.depAt).toEqual(new Date("2026-12-04T07:50:00Z"));
  });

  it("updateTransport reads a Home arrival in the Trip's Home zone", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tu-home-arr", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tu-home-arr", mode: "TRAIN" }); // before row
    stopFindManyMock.mockResolvedValue([
      { id: "stop-rome", tripId: "trip-1", forkId: null, timezone: "Europe/Rome" },
    ]);
    tripFindUniqueMock.mockResolvedValue({ homeTimezone: "Australia/Brisbane" });
    transportUpdateMock.mockResolvedValue({ id: "tu-home-arr", mode: "TRAIN" });

    await updateTransport("tu-home-arr", {
      mode: "TRAIN",
      fromStopId: "stop-rome",
      arrIsHome: true,
      arrAt: "2027-01-08T17:30",
    });

    const updateArg = transportUpdateMock.mock.calls[0][0];
    expect(updateArg.data.arrAt).toEqual(new Date("2027-01-08T07:30:00Z"));
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
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan");
  });

  it("access-checks via transport's tripId", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-1", tripId: "trip-5" });
    transportDeleteMock.mockResolvedValue({});

    await deleteTransport("t-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-5");
    expectAccessCheckedBeforeWrite(requireRowAccessMock, transportDeleteMock);
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

  it("runs delete, cost cleanup and side-data cleanup in one transaction", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-1", tripId: "trip-1", mode: "FLIGHT", reference: "BA490" });
    attachmentFindManyMock.mockResolvedValue([{ storageKey: "k1" }]);
    costFindManyMock.mockResolvedValue([]);

    const result = await deleteTransport("t-1");

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1); // one tx wraps it all
    expect(transportDeleteMock).toHaveBeenCalledWith({ where: { id: "t-1" } });
    expect(attachmentDeleteManyMock).toHaveBeenCalled(); // inside the tx
    expect(noteDeleteManyMock).toHaveBeenCalled();
  });

  it("converts the transport's paid cost to an Other cost", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-1", tripId: "trip-1", mode: "FLIGHT", reference: "BA490" });
    costFindManyMock.mockResolvedValue([
      { id: "c1", paidMinor: 4000, paidAt: null, label: null, ownerType: "TRANSPORT", ownerId: "t-1" },
    ]);

    await deleteTransport("t-1");

    expect(costUpdateMock).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { ownerType: "OTHER", ownerId: null, label: "BA490 (deleted)" },
    });
  });
});

// ---------------------------------------------------------------------------
// revalidation scope
// ---------------------------------------------------------------------------

describe("revalidation: plan scope", () => {
  it("deleteTransport revalidates the trip's plan scope (NAV-02: no longer layout-wide)", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-rv", tripId: "trip-rv", forkId: null });
    transportDeleteMock.mockResolvedValue({});

    await deleteTransport("t-rv");

    expect(revalidateTripMock).toHaveBeenCalledWith("trip-rv", "plan");
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
  it("creates a Cost with ownerType TRANSPORT and the new transport id when costMinor+currency are provided", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-cost-1", mode: "FLIGHT" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.6, persist: null });
    costFindManyMock.mockResolvedValue([]); // not called on create path but reset for clarity

    const result = await createTransport("trip-1", {
      mode: "FLIGHT",
      costMinor: 12000,
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
          costMinor: 12000,
          currency: "EUR",
          rateToHome: 0.6,
        }),
      }),
    );
  });

  it("does NOT create a Cost when no costMinor is provided", async () => {
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
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-persist", mode: "FLIGHT" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({
      rate: 0.55,
      persist: { base: "USD", quote: "AUD", rate: 0.55 },
    });

    await createTransport("trip-1", {
      mode: "FLIGHT",
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
// Inline cost: updateTransport with cost fields
// ---------------------------------------------------------------------------

describe("updateTransport: inline cost update/create", () => {
  it("creates a Cost when transport has 0 existing costs and costMinor is provided", async () => {
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tu-1", tripId: "trip-1", forkId: null }) // requireTransportAccess
      .mockResolvedValueOnce({ id: "tu-1", mode: "FLIGHT" }); // before snapshot
    transportUpdateMock.mockResolvedValue({ id: "tu-1", mode: "TRAIN" });
    costFindManyMock.mockResolvedValue([]); // 0 existing costs
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.6, persist: null });

    const result = await updateTransport("tu-1", {
      mode: "TRAIN",
      costMinor: 7500,
      currency: "EUR",
    });

    expect(result.success).toBe(true);
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: "TRANSPORT",
          ownerId: "tu-1",
          costMinor: 7500,
          currency: "EUR",
        }),
      }),
    );
  });

  it("updates the existing Cost when transport has exactly 1 cost and costMinor is provided", async () => {
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
    transportFindUniqueMock
      .mockResolvedValueOnce({ id: "tu-2b", tripId: "trip-1", forkId: null })
      .mockResolvedValueOnce({ id: "tu-2b", mode: "FLIGHT" });
    transportUpdateMock.mockResolvedValue({ id: "tu-2b", mode: "FLIGHT" });
    costFindManyMock.mockResolvedValue([
      { id: "existing-cost-2b", ownerType: "TRANSPORT", ownerId: "tu-2b" },
    ]);
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.65, persist: null });

    const result = await updateTransport("tu-2b", {
      mode: "FLIGHT",
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

  it("refuses cost fields when transport has >1 existing costs (CostEditor authoritative)", async () => {
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
      costMinor: 5000,
      currency: "AUD",
    });

    // Deviation 9 (card 3.L): refused for every caller, not silently skipped.
    expect(result).toMatchObject({ success: false, errors: { costMinor: [expect.stringMatching(/more than one Cost/)] } });
    expect(transportUpdateMock).not.toHaveBeenCalled();
    expect(costCreateMock).not.toHaveBeenCalled();
    expect(costUpdateMock).not.toHaveBeenCalled();
    // Transaction should not be called for cost when >1 costs
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("does NOT create or update costs when costMinor is absent (even with 0 existing costs)", async () => {
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

describe("updateTransport (PATCH, ADR 0075)", () => {
  const row = {
    id: "t1", tripId: "trip-1", forkId: null,
    mode: "TRAIN", fromStopId: "stop-a", toStopId: "stop-b", anchorStopId: "stop-a", depIsHome: false, arrIsHome: false,
    depPlace: "Roma Termini", arrPlace: null, depAt: new Date("2026-05-04T08:00:00Z"), arrAt: new Date("2026-05-04T11:00:00Z"),
    reference: "FR 9512", notes: null, bookingState: "BOOKED", bookingStateSet: false, bookBy: null,
  };
  beforeEach(() => {
    transportFindUniqueMock.mockResolvedValue(row); // guard row, then the held row
    stopFindManyMock.mockResolvedValue([
      { id: "stop-a", tripId: "trip-1", forkId: null, timezone: "Europe/Rome" },
      { id: "stop-b", tripId: "trip-1", forkId: null, timezone: "Europe/Rome" },
    ]);
    transportUpdateMock.mockResolvedValue({ ...row });
  });

  it("a reference-only patch keeps both ends, the anchor and the instants, reading the row once", async () => {
    await updateTransport("t1", { reference: "FR 9514" });
    expect(transportUpdateMock).toHaveBeenCalledWith({ where: { id: "t1" }, data: expect.objectContaining({
      fromStopId: "stop-a", toStopId: "stop-b", anchorStopId: "stop-a", depPlace: "Roma Termini",
      depAt: new Date("2026-05-04T08:00:00Z"), arrAt: new Date("2026-05-04T11:00:00Z"), reference: "FR 9514",
    }) });
    expect(transportFindUniqueMock).toHaveBeenCalledTimes(2); // guard + held row; auditedUpdate does not re-read
  });

  it("explicit null clears the notes and the departure point", async () => {
    transportFindUniqueMock.mockResolvedValue({ ...row, notes: "coach 4" });
    await updateTransport("t1", { notes: null, depPlace: null });
    expect(transportUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      notes: null, depPlace: null, depLat: null, depLng: null, fromStopId: "stop-a",
    }) }));
  });

  it("costMinor-only on a paid owned Cost keeps it paid (passes the real transportSchema)", async () => {
    costFindManyMock.mockResolvedValue([{ id: "c1", costMinor: 20000, currency: "GBP", paidMinor: 20000, paidAt: new Date("2026-03-01T00:00:00Z") }]);
    const r = await updateTransport("t1", { costMinor: 21000 });
    expect(r).toEqual({ success: true });
    expect(costFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerType: "TRANSPORT", ownerId: "t1" } }));
    expect(costUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1" }, data: expect.objectContaining({
      costMinor: 21000, currency: "GBP", paidMinor: 20000, paidAt: new Date("2026-03-01"),
    }) }));
  });

  it("refuses a book-by date on a leg set to No booking needed, and writes nothing (spec R2)", async () => {
    const r = await updateTransport("t1", { bookingState: "NONE", bookBy: "2027-05-01" });
    expect(r).toEqual({ success: false, errors: { bookBy: ["A book-by date is only for something still to book."] } });
    expect(transportUpdateMock).not.toHaveBeenCalled();
  });

  it("a malformed book-by date is refused by the schema", async () => {
    const r = await updateTransport("t1", { bookingState: "TO_BOOK", bookBy: "May 1" });
    expect(r).toMatchObject({ success: false, errors: { bookBy: [expect.any(String)] } });
    expect(transportUpdateMock).not.toHaveBeenCalled();
  });

  it("an endpoint refusal writes nothing", async () => {
    const r = await updateTransport("t1", { depIsHome: true, fromStopId: "stop-c" });
    expect(r.success).toBe(false);
    expect(transportUpdateMock).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce({ id: "tr2", mode: "FLIGHT", toStopId: "s2", arrPlace: "Gare du Nord" }); // before snapshot
    transportUpdateMock.mockResolvedValue({ id: "tr2", mode: "FLIGHT" });
    // arrIsHome clears the held toStopId/arrPlace; fromStopId "s1" must pass FK validation.
    stopFindManyMock.mockResolvedValue([{ id: "s1", tripId: "trip-1", forkId: null }]);

    const result = await updateTransport("tr2", { mode: "FLIGHT", fromStopId: "s1", arrIsHome: true });

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
      expect(result.errors._).toBeDefined();
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
      expect(result.errors._).toBeDefined();
    }
    expect(transportUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// reorderTransports
// ---------------------------------------------------------------------------

describe("reorderTransports", () => {
  it("writes anchorStopId and sortOrder for each item", async () => {
    // Two legs in trip-1, both anchored to stop-a; reorder moves leg-2 to stop-b
    transportFindManyMock.mockResolvedValue([
      { id: "leg-1", tripId: "trip-1", forkId: null },
      { id: "leg-2", tripId: "trip-1", forkId: null },
    ]);

    const items = [
      { id: "leg-1", anchorStopId: "stop-a", sortOrder: 0 },
      { id: "leg-2", anchorStopId: "stop-b", sortOrder: 0 },
    ];

    const result = await reorderTransports("trip-1", items);

    expect(result.success).toBe(true);
    // transaction called with a callback
    expect(transactionMock).toHaveBeenCalled();
    // transport.update called inside tx for each item
    expect(transportUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "leg-1" },
        data: expect.objectContaining({ anchorStopId: "stop-a", sortOrder: 0 }),
      }),
    );
    expect(transportUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "leg-2" },
        data: expect.objectContaining({ anchorStopId: "stop-b", sortOrder: 0 }),
      }),
    );
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan");
  });

  it("returns success: true with empty items (no-op)", async () => {
    const result = await reorderTransports("trip-1", []);
    expect(result.success).toBe(true);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a leg from another trip", async () => {
    // leg-bad belongs to trip-2, not trip-1
    transportFindManyMock.mockResolvedValue([
      { id: "leg-good", tripId: "trip-1", forkId: null },
      // leg-bad is NOT in the result (it belongs to another trip)
    ]);

    const items = [
      { id: "leg-good", anchorStopId: "stop-a", sortOrder: 0 },
      { id: "leg-bad", anchorStopId: "stop-a", sortOrder: 1 },
    ];

    const result = await reorderTransports("trip-1", items);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.id).toBeDefined();
    }
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("calls requirePlanAccess for auth check", async () => {
    transportFindManyMock.mockResolvedValue([
      { id: "leg-1", tripId: "trip-1", forkId: null },
    ]);
    const items = [{ id: "leg-1", anchorStopId: "stop-a", sortOrder: 0 }];

    await reorderTransports("trip-1", items);

    expect(requirePlanAccessMock).toHaveBeenCalledWith("trip-1", undefined);
    expectAccessCheckedBeforeWrite(requirePlanAccessMock, transportUpdateMock);
  });

  it("scopes the findMany query to the given forkId", async () => {
    transportFindManyMock.mockResolvedValue([
      { id: "leg-f", tripId: "trip-1", forkId: "fork-9" },
    ]);
    const items = [{ id: "leg-f", anchorStopId: "stop-a", sortOrder: 0 }];

    await reorderTransports("trip-1", items, "fork-9");

    expect(transportFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ forkId: "fork-9" }),
      }),
    );
  });

  it("locks the WHOLE plan's transports FOR UPDATE in id order (ADR 0007)", async () => {
    // Previously reorderTransports took no lock at all.
    transportFindManyMock.mockResolvedValue([
      { id: "leg-1", tripId: "trip-1", forkId: null },
    ]);
    const items = [{ id: "leg-1", anchorStopId: "stop-a", sortOrder: 0 }];

    await reorderTransports("trip-1", items);

    expect(queryRawMock).toHaveBeenCalled();
    const lockSql = queryRawMock.mock.calls
      .map((c: unknown[]) => (c[0] as string[]).join("?"))
      .find((s: string) => s.includes("FOR UPDATE"));
    expect(lockSql).toBeDefined();
    expect(lockSql).toContain('FROM "Transport"');
    expect(lockSql).toContain('"tripId" =');
    expect(lockSql).toContain('ORDER BY "id" ASC');
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
