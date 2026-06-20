import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the createTrip server action.
 *
 * We mock:
 *   - lib/db → so we can assert Prisma call shapes without hitting SQLite
 *   - lib/guards → so requireUser() returns a predictable user object
 *   - next/navigation → so redirect() is interceptable (it throws in Next.js)
 */

const { requireUserMock, redirectMock, tripCreateMock, memberCreateMock, transactionMock } =
  vi.hoisted(() => {
    const tripCreateMock = vi.fn();
    const memberCreateMock = vi.fn();

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
      redirectMock: vi.fn(() => {
        throw new Error("NEXT_REDIRECT");
      }),
      tripCreateMock,
      memberCreateMock,
      transactionMock,
    };
  });

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: transactionMock,
  },
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { createTrip } from "./trips";

const VALID_INPUT = {
  name: "Japan 2026",
  startDate: "2026-03-01",
  endDate: "2026-03-14",
  homeCurrency: "AUD",
};

afterEach(() => {
  vi.clearAllMocks();
});

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
