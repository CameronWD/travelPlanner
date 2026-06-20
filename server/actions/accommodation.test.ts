import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for accommodation server actions.
 *
 * Mocks: lib/db, lib/guards, next/cache
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  accFindUniqueMock,
  accCreateMock,
  accUpdateMock,
  accDeleteMock,
  stopFindUniqueMock,
} = vi.hoisted(() => {
  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    }),
    revalidatePathMock: vi.fn(),
    accFindUniqueMock: vi.fn(),
    accCreateMock: vi.fn(),
    accUpdateMock: vi.fn(),
    accDeleteMock: vi.fn(),
    stopFindUniqueMock: vi.fn(),
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    accommodation: {
      findUnique: accFindUniqueMock,
      create: accCreateMock,
      update: accUpdateMock,
      delete: accDeleteMock,
    },
    stop: {
      findUnique: stopFindUniqueMock,
    },
  },
}));

import {
  createAccommodation,
  updateAccommodation,
  deleteAccommodation,
} from "./accommodation";

const VALID_INPUT = {
  stopId: "stop-1",
  name: "Grand Hotel",
  checkIn: "2026-07-01",
  checkOut: "2026-07-04",
};

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
});

// ---------------------------------------------------------------------------
// createAccommodation
// ---------------------------------------------------------------------------

describe("createAccommodation", () => {
  it("creates and revalidates (tripId derived from stop)", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1" });
    accCreateMock.mockResolvedValue({ id: "acc-1" });

    const result = await createAccommodation(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(accCreateMock).toHaveBeenCalledOnce();
    expect(accCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip-1",
        stopId: "stop-1",
        name: "Grand Hotel",
        checkIn: "2026-07-01",
        checkOut: "2026-07-04",
      }),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("access-checks via the stop's tripId", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-2" });
    accCreateMock.mockResolvedValue({ id: "acc-1" });

    await createAccommodation(VALID_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-2");
  });

  it("returns error when stop not found", async () => {
    stopFindUniqueMock.mockResolvedValue(null);

    const result = await createAccommodation(VALID_INPUT);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.stopId).toBeDefined();
    }
    expect(accCreateMock).not.toHaveBeenCalled();
  });

  it("returns validation error for missing name and does not write", async () => {
    const result = await createAccommodation({ ...VALID_INPUT, name: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeDefined();
    }
    expect(accCreateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns validation error when checkOut < checkIn", async () => {
    const result = await createAccommodation({
      ...VALID_INPUT,
      checkIn: "2026-07-05",
      checkOut: "2026-07-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.checkOut).toBeDefined();
    }
    expect(accCreateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateAccommodation
// ---------------------------------------------------------------------------

describe("updateAccommodation", () => {
  it("updates and revalidates", async () => {
    accFindUniqueMock.mockResolvedValue({ id: "acc-1", tripId: "trip-1" });
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1" });
    accUpdateMock.mockResolvedValue({});

    const result = await updateAccommodation("acc-1", {
      ...VALID_INPUT,
      name: "Updated Hotel",
    });

    expect(result.success).toBe(true);
    expect(accUpdateMock).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: expect.objectContaining({ name: "Updated Hotel" }),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("returns validation error and does not write", async () => {
    accFindUniqueMock.mockResolvedValue({ id: "acc-1", tripId: "trip-1" });

    const result = await updateAccommodation("acc-1", { ...VALID_INPUT, name: "" });

    expect(result.success).toBe(false);
    expect(accUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects stopId that belongs to a different trip", async () => {
    accFindUniqueMock.mockResolvedValue({ id: "acc-1", tripId: "trip-1" });
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-99" });

    const result = await updateAccommodation("acc-1", VALID_INPUT);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.stopId).toBeDefined();
    }
    expect(accUpdateMock).not.toHaveBeenCalled();
  });

  it("access-checks via accommodation's tripId", async () => {
    accFindUniqueMock.mockResolvedValue({ id: "acc-1", tripId: "trip-3" });
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-3" });
    accUpdateMock.mockResolvedValue({});

    await updateAccommodation("acc-1", VALID_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-3");
  });
});

// ---------------------------------------------------------------------------
// deleteAccommodation
// ---------------------------------------------------------------------------

describe("deleteAccommodation", () => {
  it("deletes and revalidates", async () => {
    accFindUniqueMock.mockResolvedValue({ id: "acc-1", tripId: "trip-1" });
    accDeleteMock.mockResolvedValue({});

    const result = await deleteAccommodation("acc-1");

    expect(result.success).toBe(true);
    expect(accDeleteMock).toHaveBeenCalledWith({ where: { id: "acc-1" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("access-checks via accommodation's tripId", async () => {
    accFindUniqueMock.mockResolvedValue({ id: "acc-1", tripId: "trip-4" });
    accDeleteMock.mockResolvedValue({});

    await deleteAccommodation("acc-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-4");
  });
});
