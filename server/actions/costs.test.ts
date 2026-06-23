import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for costs server actions.
 *
 * Mocks: lib/db, lib/guards, lib/fx, next/cache, next/navigation
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  costFindUniqueMock,
  costCreateMock,
  costUpdateMock,
  costDeleteMock,
  tripFindUniqueMock,
  transportFindUniqueMock,
  accommodationFindUniqueMock,
  itemFindUniqueMock,
  resolveRateForTripMock,
  persistRateMock,
  transactionMock,
} = vi.hoisted(() => {
  const costCreateMock = vi.fn();
  const costUpdateMock = vi.fn();
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
    costFindUniqueMock: vi.fn(),
    costCreateMock,
    costUpdateMock,
    costDeleteMock: vi.fn(),
    tripFindUniqueMock: vi.fn(),
    transportFindUniqueMock: vi.fn(),
    accommodationFindUniqueMock: vi.fn(),
    itemFindUniqueMock: vi.fn(),
    resolveRateForTripMock: vi.fn(),
    persistRateMock: vi.fn().mockResolvedValue(undefined),
    transactionMock,
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
vi.mock("@/lib/fx", () => ({
  resolveRateForTrip: resolveRateForTripMock,
  persistRate: persistRateMock,
}));
vi.mock("@/lib/db", () => ({
  db: {
    cost: {
      findUnique: costFindUniqueMock,
      create: costCreateMock,
      update: costUpdateMock,
      delete: costDeleteMock,
    },
    trip: {
      findUnique: tripFindUniqueMock,
    },
    transport: {
      findUnique: transportFindUniqueMock,
    },
    accommodation: {
      findUnique: accommodationFindUniqueMock,
    },
    item: {
      findUnique: itemFindUniqueMock,
    },
    $transaction: transactionMock,
  },
}));

import { createCost, updateCost, deleteCost } from "./costs";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const VALID_TRANSPORT_INPUT = {
  estimatedMinor: 5000,
  currency: "AUD",
  ownerType: "TRANSPORT" as const,
  ownerId: "transport-1",
};

const VALID_OTHER_INPUT = {
  estimatedMinor: 2000,
  currency: "USD",
  ownerType: "OTHER" as const,
  label: "Travel insurance",
};

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
});

// ---------------------------------------------------------------------------
// createCost
// ---------------------------------------------------------------------------

describe("createCost", () => {
  it("creates a cost and snapshots rateToHome = 1 when currency === homeCurrency", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1, persist: null });
    costCreateMock.mockResolvedValue({ id: "cost-1" });

    const result = await createCost("trip-1", {
      ...VALID_TRANSPORT_INPUT,
      currency: "AUD", // same as homeCurrency
    });

    expect(result.success).toBe(true);
    // resolveRateForTrip should be called; persistRate should NOT be called when persist: null
    expect(persistRateMock).not.toHaveBeenCalled();
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rateToHome: 1,
          estimatedMinor: 5000,
          currency: "AUD",
        }),
      }),
    );
  });

  it("creates a cost and snapshots rateToHome by calling resolveRateForTrip when currency !== homeCurrency", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.62, persist: null });
    costCreateMock.mockResolvedValue({ id: "cost-2" });

    const result = await createCost("trip-1", {
      ...VALID_TRANSPORT_INPUT,
      currency: "USD",
    });

    expect(result.success).toBe(true);
    expect(resolveRateForTripMock).toHaveBeenCalledWith("trip-1", "USD", "AUD", expect.objectContaining({ db: expect.anything() }));
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rateToHome: 0.62,
        }),
      }),
    );
  });

  it("stores rateToHome as null when resolveRateForTrip returns null rate", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: null, persist: null });
    costCreateMock.mockResolvedValue({ id: "cost-3" });

    const result = await createCost("trip-1", {
      ...VALID_TRANSPORT_INPUT,
      currency: "EUR",
    });

    expect(result.success).toBe(true);
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rateToHome: null }),
      }),
    );
  });

  it("rejects an owner entity from another trip", async () => {
    // transport belongs to trip-OTHER, not trip-1
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-OTHER" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });

    const result = await createCost("trip-1", VALID_TRANSPORT_INPUT);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.ownerId).toBeDefined();
    }
    expect(costCreateMock).not.toHaveBeenCalled();
  });

  it("rejects when owner entity not found", async () => {
    transportFindUniqueMock.mockResolvedValue(null);
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });

    const result = await createCost("trip-1", VALID_TRANSPORT_INPUT);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.ownerId).toBeDefined();
    }
    expect(costCreateMock).not.toHaveBeenCalled();
  });

  it("creates OTHER cost without checking owner entity", async () => {
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.62, persist: null });
    costCreateMock.mockResolvedValue({ id: "cost-4" });

    const result = await createCost("trip-1", VALID_OTHER_INPUT);

    expect(result.success).toBe(true);
    // No transport/accommodation/item lookup for OTHER costs
    expect(transportFindUniqueMock).not.toHaveBeenCalled();
    expect(accommodationFindUniqueMock).not.toHaveBeenCalled();
    expect(itemFindUniqueMock).not.toHaveBeenCalled();
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: "OTHER",
          label: "Travel insurance",
          ownerId: null,
        }),
      }),
    );
  });

  it("access-checks via requireTripAccess", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-99" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1, persist: null });
    costCreateMock.mockResolvedValue({ id: "cost-5" });

    await createCost("trip-99", VALID_TRANSPORT_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-99");
  });

  it("returns validation errors and does not write for invalid input", async () => {
    const result = await createCost("trip-1", {
      estimatedMinor: -100, // invalid
      currency: "AUD",
      ownerType: "TRANSPORT",
      ownerId: "t-1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.estimatedMinor).toBeDefined();
    }
    expect(costCreateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns validation errors for missing ownerId on entity cost", async () => {
    const result = await createCost("trip-1", {
      estimatedMinor: 1000,
      currency: "AUD",
      ownerType: "TRANSPORT",
      // no ownerId
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.ownerId).toBeDefined();
    }
    expect(costCreateMock).not.toHaveBeenCalled();
  });

  it("revalidates trip overview and budget paths", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1, persist: null });
    costCreateMock.mockResolvedValue({ id: "cost-6" });

    await createCost("trip-1", VALID_TRANSPORT_INPUT);

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/budget");
  });

  it("resolves the rate before opening the transaction (network never holds a tx)", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1.65, persist: { base: "USD", quote: "AUD", rate: 1.65 } });
    costCreateMock.mockResolvedValue({ id: "cost-1" });

    await createCost("trip-1", { ...VALID_TRANSPORT_INPUT, currency: "USD" });

    // invocationCallOrder is a global monotonic counter across all mocks.
    expect(resolveRateForTripMock.mock.invocationCallOrder[0])
      .toBeLessThan(transactionMock.mock.invocationCallOrder[0]);
  });

  it("persists the fetched rate and creates the cost inside one transaction", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1.65, persist: { base: "USD", quote: "AUD", rate: 1.65 } });
    costCreateMock.mockResolvedValue({ id: "cost-1" });

    const result = await createCost("trip-1", { ...VALID_TRANSPORT_INPUT, currency: "USD" });

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(persistRateMock).toHaveBeenCalledWith(
      expect.anything(), // the tx client
      "trip-1",
      { base: "USD", quote: "AUD", rate: 1.65 },
    );
    expect(costCreateMock).toHaveBeenCalledOnce();
    expect(costCreateMock.mock.calls[0][0].data.rateToHome).toBe(1.65);
  });

  it("does not persist a rate when there is nothing fresh to cache", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1, persist: null });
    costCreateMock.mockResolvedValue({ id: "cost-1" });

    await createCost("trip-1", { ...VALID_TRANSPORT_INPUT, currency: "AUD" });

    expect(persistRateMock).not.toHaveBeenCalled();
    expect(costCreateMock).toHaveBeenCalledOnce();
    expect(costCreateMock.mock.calls[0][0].data.rateToHome).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// updateCost
// ---------------------------------------------------------------------------

describe("updateCost", () => {
  it("updates a cost and re-snapshots rateToHome", async () => {
    costFindUniqueMock.mockResolvedValue({ id: "cost-1", tripId: "trip-1" });
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 0.65, persist: null });
    costUpdateMock.mockResolvedValue({});

    const result = await updateCost("cost-1", {
      ...VALID_TRANSPORT_INPUT,
      currency: "EUR",
    });

    expect(result.success).toBe(true);
    expect(resolveRateForTripMock).toHaveBeenCalledWith("trip-1", "EUR", "AUD", expect.anything());
    expect(costUpdateMock).toHaveBeenCalledWith({
      where: { id: "cost-1" },
      data: expect.objectContaining({ rateToHome: 0.65 }),
    });
  });

  it("access-checks via requireCostAccess → requireTripAccess", async () => {
    costFindUniqueMock.mockResolvedValue({ id: "cost-1", tripId: "trip-5" });
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-5" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1, persist: null });
    costUpdateMock.mockResolvedValue({});

    await updateCost("cost-1", VALID_TRANSPORT_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-5");
  });

  it("returns validation errors and does not write", async () => {
    costFindUniqueMock.mockResolvedValue({ id: "cost-1", tripId: "trip-1" });

    const result = await updateCost("cost-1", {
      estimatedMinor: -500,
      currency: "AUD",
      ownerType: "TRANSPORT",
      ownerId: "t-1",
    });

    expect(result.success).toBe(false);
    expect(costUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects owner entity from another trip on update", async () => {
    costFindUniqueMock.mockResolvedValue({ id: "cost-1", tripId: "trip-1" });
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-OTHER" }); // cross-trip
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });

    const result = await updateCost("cost-1", VALID_TRANSPORT_INPUT);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.ownerId).toBeDefined();
    }
    expect(costUpdateMock).not.toHaveBeenCalled();
  });

  it("re-snapshots rate = 1 when updating to same currency as home", async () => {
    costFindUniqueMock.mockResolvedValue({ id: "cost-1", tripId: "trip-1" });
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1, persist: null });
    costUpdateMock.mockResolvedValue({});

    const result = await updateCost("cost-1", {
      ...VALID_TRANSPORT_INPUT,
      currency: "AUD",
    });

    expect(result.success).toBe(true);
    expect(persistRateMock).not.toHaveBeenCalled();
    expect(costUpdateMock).toHaveBeenCalledWith({
      where: { id: "cost-1" },
      data: expect.objectContaining({ rateToHome: 1 }),
    });
  });
});

// ---------------------------------------------------------------------------
// deleteCost
// ---------------------------------------------------------------------------

describe("deleteCost", () => {
  it("deletes a cost and revalidates", async () => {
    costFindUniqueMock.mockResolvedValue({ id: "cost-1", tripId: "trip-1" });
    costDeleteMock.mockResolvedValue({});

    const result = await deleteCost("cost-1");

    expect(result.success).toBe(true);
    expect(costDeleteMock).toHaveBeenCalledWith({ where: { id: "cost-1" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/budget");
  });

  it("access-checks via requireCostAccess → requireTripAccess", async () => {
    costFindUniqueMock.mockResolvedValue({ id: "cost-1", tripId: "trip-7" });
    costDeleteMock.mockResolvedValue({});

    await deleteCost("cost-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-7");
  });
});
