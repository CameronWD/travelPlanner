import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for rates server actions.
 *
 * Mocks: lib/db, lib/guards, lib/fx, next/cache
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  exchangeRateUpsertMock,
  exchangeRateFindUniqueMock,
  exchangeRateUpdateMock,
  getRateForTripMock,
} = vi.hoisted(() => {
  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    }),
    revalidatePathMock: vi.fn(),
    exchangeRateUpsertMock: vi.fn().mockResolvedValue({}),
    exchangeRateFindUniqueMock: vi.fn().mockResolvedValue(null),
    exchangeRateUpdateMock: vi.fn().mockResolvedValue({}),
    getRateForTripMock: vi.fn().mockResolvedValue(1.65),
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    exchangeRate: {
      upsert: exchangeRateUpsertMock,
      findUnique: exchangeRateFindUniqueMock,
      update: exchangeRateUpdateMock,
    },
  },
}));
vi.mock("@/lib/fx", () => ({ getRateForTrip: getRateForTripMock }));

import { setManualRate, clearManualRate, refreshRates } from "./rates";

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
  exchangeRateUpsertMock.mockResolvedValue({});
  exchangeRateUpdateMock.mockResolvedValue({});
  getRateForTripMock.mockResolvedValue(1.65);
});

// ---------------------------------------------------------------------------
// setManualRate
// ---------------------------------------------------------------------------

describe("setManualRate", () => {
  it("access-checks via requireTripAccess", async () => {
    await setManualRate("trip-99", "EUR", "AUD", 1.65);
    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-99");
  });

  it("upserts with manual=true", async () => {
    await setManualRate("trip-1", "EUR", "AUD", 1.65);

    expect(exchangeRateUpsertMock).toHaveBeenCalledOnce();
    const call = exchangeRateUpsertMock.mock.calls[0][0];
    expect(call.create.manual).toBe(true);
    expect(call.create.rate).toBe(1.65);
    expect(call.create.base).toBe("EUR");
    expect(call.create.quote).toBe("AUD");
    expect(call.update.manual).toBe(true);
    expect(call.update.rate).toBe(1.65);
  });

  it("upserts with fetchedAt set to now", async () => {
    const before = Date.now();
    await setManualRate("trip-1", "EUR", "AUD", 1.65);
    const after = Date.now();

    const call = exchangeRateUpsertMock.mock.calls[0][0];
    const fetchedAt: Date = call.create.fetchedAt;
    expect(fetchedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(fetchedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("revalidates the budget path", async () => {
    await setManualRate("trip-1", "EUR", "AUD", 1.65);
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/budget");
  });

  it("returns success", async () => {
    const result = await setManualRate("trip-1", "EUR", "AUD", 1.65);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// clearManualRate
// ---------------------------------------------------------------------------

describe("clearManualRate", () => {
  it("access-checks via requireTripAccess", async () => {
    await clearManualRate("trip-99", "EUR", "AUD");
    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-99");
  });

  it("sets manual=false on the stored rate", async () => {
    await clearManualRate("trip-1", "EUR", "AUD");

    expect(exchangeRateUpdateMock).toHaveBeenCalledOnce();
    const call = exchangeRateUpdateMock.mock.calls[0][0];
    expect(call.where.tripId_base_quote).toEqual({
      tripId: "trip-1",
      base: "EUR",
      quote: "AUD",
    });
    expect(call.data.manual).toBe(false);
  });

  it("revalidates the budget path", async () => {
    await clearManualRate("trip-1", "EUR", "AUD");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/budget");
  });

  it("returns success", async () => {
    const result = await clearManualRate("trip-1", "EUR", "AUD");
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// refreshRates
// ---------------------------------------------------------------------------

describe("refreshRates", () => {
  it("access-checks via requireTripAccess", async () => {
    await refreshRates("trip-99", ["EUR", "JPY"], "AUD");
    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-99");
  });

  it("calls getRateForTrip for each base currency", async () => {
    await refreshRates("trip-1", ["EUR", "JPY", "GBP"], "AUD");
    expect(getRateForTripMock).toHaveBeenCalledTimes(3);
    expect(getRateForTripMock).toHaveBeenCalledWith("trip-1", "EUR", "AUD", expect.anything());
    expect(getRateForTripMock).toHaveBeenCalledWith("trip-1", "JPY", "AUD", expect.anything());
    expect(getRateForTripMock).toHaveBeenCalledWith("trip-1", "GBP", "AUD", expect.anything());
  });

  it("returns a summary with fetched rates", async () => {
    getRateForTripMock.mockResolvedValueOnce(1.65).mockResolvedValueOnce(0.011);
    const result = await refreshRates("trip-1", ["EUR", "JPY"], "AUD");

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({ base: "EUR", rate: 1.65 });
    expect(result.results[1]).toMatchObject({ base: "JPY", rate: 0.011 });
  });

  it("reports null for currencies that failed to fetch", async () => {
    getRateForTripMock.mockResolvedValue(null);
    const result = await refreshRates("trip-1", ["EUR"], "AUD");

    expect(result.results[0]).toMatchObject({ base: "EUR", rate: null });
  });

  it("skips getRateForTrip when base === quote", async () => {
    await refreshRates("trip-1", ["AUD", "EUR"], "AUD");
    // AUD should be skipped; EUR should be fetched
    expect(getRateForTripMock).toHaveBeenCalledTimes(1);
    expect(getRateForTripMock).toHaveBeenCalledWith("trip-1", "EUR", "AUD", expect.anything());
  });

  it("revalidates the budget path", async () => {
    await refreshRates("trip-1", ["EUR"], "AUD");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/budget");
  });
});
