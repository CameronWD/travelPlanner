import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the trips server actions.
 *
 * We mock:
 *   - lib/db → so we can assert Prisma call shapes without hitting the database
 *   - lib/guards → so requireUser/requireTripAccess return predictable values
 *   - next/navigation → so redirect() is interceptable (it throws in Next.js)
 *   - next/cache → so revalidatePath is a spy
 */

const {
  requireUserMock,
  requireTripAccessMock,
  redirectMock,
  revalidatePathMock,
  tripCreateMock,
  tripUpdateMock,
  tripDeleteMock,
  tripFindUniqueMock,
  memberCreateMock,
  transactionMock,
  attachmentFindManyMock,
  storageDeleteMock,
} = vi.hoisted(() => {
  const tripCreateMock = vi.fn();
  const tripUpdateMock = vi.fn();
  const tripDeleteMock = vi.fn();
  const tripFindUniqueMock = vi.fn();
  const memberCreateMock = vi.fn();
  const attachmentFindManyMock = vi.fn().mockResolvedValue([]);
  const storageDeleteMock = vi.fn().mockResolvedValue(undefined);

  // $transaction executes the callback synchronously-ish in tests;
  // we simulate it by calling the callback with a fake tx object.
  const transactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      trip: { create: tripCreateMock },
      tripMember: { create: memberCreateMock },
    };
    return cb(tx);
  });

  return {
    requireUserMock: vi.fn(),
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1", email: "you@example.com" },
      membership: { role: "owner" },
    }),
    redirectMock: vi.fn(() => {
      throw new Error("NEXT_REDIRECT");
    }),
    revalidatePathMock: vi.fn(),
    tripCreateMock,
    tripUpdateMock,
    tripDeleteMock,
    tripFindUniqueMock,
    memberCreateMock,
    transactionMock,
    attachmentFindManyMock,
    storageDeleteMock,
  };
});

vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
  requireTripAccess: requireTripAccessMock,
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: transactionMock,
    trip: {
      update: tripUpdateMock,
      delete: tripDeleteMock,
      findUnique: tripFindUniqueMock,
    },
    attachment: {
      findMany: attachmentFindManyMock,
    },
  },
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ delete: storageDeleteMock }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { createTrip, updateTrip, deleteTrip, setTripHardEndDate } from "./trips";

const VALID_INPUT = {
  name: "Japan 2026",
  startDate: "2026-03-01",
  endDate: "2026-03-14",
  homeCurrency: "AUD",
};

const TRIP_ID = "trip-abc";

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createTrip
// ---------------------------------------------------------------------------

describe("createTrip", () => {
  it("creates a Trip and an owner TripMember for the current user on valid input", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });

    const newTrip = { id: "trip-123", name: "Japan 2026" };
    tripCreateMock.mockResolvedValue(newTrip);
    memberCreateMock.mockResolvedValue({});

    // createTrip will call redirect() which throws — catch it.
    await expect(createTrip(VALID_INPUT)).rejects.toThrow("NEXT_REDIRECT");

    // Assert that Trip.create was called with the right payload.
    expect(tripCreateMock).toHaveBeenCalledOnce();
    expect(tripCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Japan 2026",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        homeCurrency: "AUD",
        createdById: "user-1",
      }),
    });

    // Assert that TripMember.create was called with role "owner" for the creator.
    expect(memberCreateMock).toHaveBeenCalledOnce();
    expect(memberCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: newTrip.id,
        userId: "user-1",
        role: "owner",
      }),
    });

    // Assert the redirect goes to the right path.
    expect(redirectMock).toHaveBeenCalledWith(`/trips/${newTrip.id}`);
  });

  it("creates a date-less trip", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripCreateMock.mockResolvedValue({ id: "trip-dateless", name: "Europe someday" });
    memberCreateMock.mockResolvedValue({});

    await expect(createTrip({ name: "Europe someday", homeCurrency: "AUD" })).rejects.toThrow("NEXT_REDIRECT");

    expect(tripCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Europe someday", startDate: null, endDate: null }),
    });
  });

  it("returns a validation error when name is empty", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });

    const result = await createTrip({ ...VALID_INPUT, name: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors.name!.length).toBeGreaterThan(0);
    }

    // No DB calls should have been made.
    expect(tripCreateMock).not.toHaveBeenCalled();
    expect(memberCreateMock).not.toHaveBeenCalled();
  });

  it("returns a validation error when endDate is before startDate", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });

    const result = await createTrip({
      ...VALID_INPUT,
      startDate: "2026-03-14",
      endDate: "2026-03-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.endDate).toBeDefined();
    }
    expect(tripCreateMock).not.toHaveBeenCalled();
  });

  it("returns a validation error for an unknown currency", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });

    const result = await createTrip({
      ...VALID_INPUT,
      homeCurrency: "ZZZ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.homeCurrency).toBeDefined();
    }
    expect(tripCreateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateTrip
// ---------------------------------------------------------------------------

describe("updateTrip", () => {
  it("is access-checked — calls requireTripAccess with the tripId", async () => {
    tripUpdateMock.mockResolvedValue({});

    await updateTrip(TRIP_ID, VALID_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledOnce();
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("updates the trip and returns success on valid input", async () => {
    tripUpdateMock.mockResolvedValue({});

    const result = await updateTrip(TRIP_ID, VALID_INPUT);

    expect(result.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledOnce();
    expect(tripUpdateMock).toHaveBeenCalledWith({
      where: { id: TRIP_ID },
      data: expect.objectContaining({
        name: "Japan 2026",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        homeCurrency: "AUD",
      }),
    });
  });

  it("revalidates trip pages after updating", async () => {
    tripUpdateMock.mockResolvedValue({});

    await updateTrip(TRIP_ID, VALID_INPUT);

    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/settings`);
  });

  it("returns validation error on empty name", async () => {
    const result = await updateTrip(TRIP_ID, { ...VALID_INPUT, name: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeDefined();
    }
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("returns validation error when endDate is before startDate", async () => {
    const result = await updateTrip(TRIP_ID, {
      ...VALID_INPUT,
      startDate: "2026-03-14",
      endDate: "2026-03-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.endDate).toBeDefined();
    }
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("returns validation error for unknown currency", async () => {
    const result = await updateTrip(TRIP_ID, {
      ...VALID_INPUT,
      homeCurrency: "ZZZ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.homeCurrency).toBeDefined();
    }
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteTrip
// ---------------------------------------------------------------------------

describe("deleteTrip", () => {
  it("is access-checked — calls requireTripAccess with the tripId", async () => {
    // owner role — will succeed
    tripDeleteMock.mockResolvedValue({});

    await expect(deleteTrip(TRIP_ID)).rejects.toThrow("NEXT_REDIRECT");

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("deletes the trip and redirects to /trips when caller is owner", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1" },
      membership: { role: "owner" },
    });
    tripDeleteMock.mockResolvedValue({});

    await expect(deleteTrip(TRIP_ID)).rejects.toThrow("NEXT_REDIRECT");

    expect(tripDeleteMock).toHaveBeenCalledOnce();
    expect(tripDeleteMock).toHaveBeenCalledWith({ where: { id: TRIP_ID } });
    expect(redirectMock).toHaveBeenCalledWith("/trips");
  });

  it("deletes attachment blobs before cascading the trip rows away", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1" },
      membership: { role: "owner" },
    });
    attachmentFindManyMock.mockResolvedValueOnce([
      { storageKey: "trips/trip-abc/k1" },
      { storageKey: "trips/trip-abc/k2" },
    ]);
    tripDeleteMock.mockResolvedValue({});

    await expect(deleteTrip(TRIP_ID)).rejects.toThrow("NEXT_REDIRECT");

    expect(storageDeleteMock).toHaveBeenCalledWith("trips/trip-abc/k1");
    expect(storageDeleteMock).toHaveBeenCalledWith("trips/trip-abc/k2");
    expect(tripDeleteMock).toHaveBeenCalledWith({ where: { id: TRIP_ID } });
  });

  it("returns a forbidden error and does NOT delete when caller is a member (not owner)", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-2" },
      membership: { role: "member" },
    });

    const result = await deleteTrip(TRIP_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/owner/i);
    }
    expect(tripDeleteMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setTripHardEndDate
// ---------------------------------------------------------------------------

describe("setTripHardEndDate", () => {
  it("sets the hard end date and revalidates the plan + settings", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    tripUpdateMock.mockResolvedValue({});
    const r = await setTripHardEndDate(TRIP_ID, "2026-07-20");
    expect(r.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: TRIP_ID }, data: { hardEndDate: "2026-07-20" } });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/plan`);
  });

  it("clears the hard end date when given an empty value", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    tripUpdateMock.mockResolvedValue({});
    const r = await setTripHardEndDate(TRIP_ID, "");
    expect(r.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: TRIP_ID }, data: { hardEndDate: null } });
  });

  it("rejects a hard end date before the start date", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    const r = await setTripHardEndDate(TRIP_ID, "2026-06-30");
    expect(r.success).toBe(false);
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });
});
