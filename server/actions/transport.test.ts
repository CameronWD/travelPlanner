import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for transport server actions.
 *
 * Mocks: lib/db, lib/guards, next/cache
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
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

const VALID_INPUT = {
  mode: "FLIGHT" as const,
};

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
  stopFindManyMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// createTransport
// ---------------------------------------------------------------------------

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
    stopFindManyMock.mockResolvedValue([{ id: "stop-1", tripId: "trip-1" }]);
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
});
