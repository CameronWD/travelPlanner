import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for transport server actions.
 *
 * Mocks: lib/db, lib/guards, next/cache
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  geocodePlaceMock,
  transportFindUniqueMock,
  transportFindFirstMock,
  transportCreateMock,
  transportUpdateMock,
  transportDeleteMock,
  stopFindManyMock,
} = vi.hoisted(() => {
  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    }),
    revalidatePathMock: vi.fn(),
    geocodePlaceMock: vi.fn().mockResolvedValue(null),
    transportFindUniqueMock: vi.fn(),
    transportFindFirstMock: vi.fn(),
    transportCreateMock: vi.fn(),
    transportUpdateMock: vi.fn(),
    transportDeleteMock: vi.fn(),
    stopFindManyMock: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodePlaceMock }));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));
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
  },
}));

import {
  createTransport,
  updateTransport,
  deleteTransport,
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
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
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
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
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
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
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
