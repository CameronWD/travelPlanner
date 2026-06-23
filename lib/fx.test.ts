import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mergeRate,
  getRateForTrip,
  resolveRateForTrip,
  persistRate,
  FX_STALE_AFTER_MS,
  isRateStale,
} from "./fx";

// ---------------------------------------------------------------------------
// mergeRate — pure policy, no I/O
// ---------------------------------------------------------------------------

describe("mergeRate", () => {
  it("manual wins even when a fetched rate is present", () => {
    const stored = { rate: 1.5, manual: true, fetchedAt: new Date() };
    const result = mergeRate({ stored, fetched: 2.0 });
    expect(result.rate).toBe(1.5);
    expect(result.source).toBe("manual");
    expect(result.stale).toBe(false);
  });

  it("manual wins when fetched is null", () => {
    const stored = { rate: 1.5, manual: true, fetchedAt: new Date() };
    const result = mergeRate({ stored, fetched: null });
    expect(result.rate).toBe(1.5);
    expect(result.source).toBe("manual");
    expect(result.stale).toBe(false);
  });

  it("uses fetched rate when no stored rate exists", () => {
    const result = mergeRate({ stored: null, fetched: 1.65 });
    expect(result.rate).toBe(1.65);
    expect(result.source).toBe("fetched");
    expect(result.stale).toBe(false);
  });

  it("uses fetched rate when stored is non-manual and fetched is present", () => {
    const stored = { rate: 1.5, manual: false, fetchedAt: new Date() };
    const result = mergeRate({ stored, fetched: 1.65 });
    expect(result.rate).toBe(1.65);
    expect(result.source).toBe("fetched");
    expect(result.stale).toBe(false);
  });

  it("falls back to stale stored rate when fetched is null and stored is non-manual", () => {
    const stored = { rate: 1.5, manual: false, fetchedAt: new Date() };
    const result = mergeRate({ stored, fetched: null });
    expect(result.rate).toBe(1.5);
    expect(result.source).toBe("stale");
    expect(result.stale).toBe(true);
  });

  it("returns source='none' and null rate when both stored and fetched are absent", () => {
    const result = mergeRate({ stored: null, fetched: null });
    expect(result.rate).toBeNull();
    expect(result.source).toBe("none");
    expect(result.stale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getRateForTrip — orchestration with injectable db + fetcher
// ---------------------------------------------------------------------------

/** Minimal shape of a stored ExchangeRate row. */
type StoredRate = {
  id: string;
  tripId: string;
  base: string;
  quote: string;
  rate: number;
  fetchedAt: Date;
  manual: boolean;
};

function makeDb(stored: StoredRate | null) {
  const upsertMock = vi.fn().mockResolvedValue({});
  return {
    exchangeRate: {
      findUnique: vi.fn().mockResolvedValue(stored),
      upsert: upsertMock,
    },
    _upsertMock: upsertMock,
  };
}

describe("getRateForTrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 1 immediately when base === quote (no db, no fetch)", async () => {
    const fetcherMock = vi.fn();
    const db = makeDb(null);

    const result = await getRateForTrip("trip-1", "AUD", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toBe(1);
    expect(fetcherMock).not.toHaveBeenCalled();
    expect(db.exchangeRate.findUnique).not.toHaveBeenCalled();
  });

  it("returns stored manual rate and skips fetcher", async () => {
    const manualRate: StoredRate = {
      id: "r1",
      tripId: "trip-1",
      base: "EUR",
      quote: "AUD",
      rate: 1.6,
      fetchedAt: new Date(),
      manual: true,
    };
    const fetcherMock = vi.fn();
    const db = makeDb(manualRate);

    const result = await getRateForTrip("trip-1", "EUR", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toBe(1.6);
    expect(fetcherMock).not.toHaveBeenCalled();
    expect(db._upsertMock).not.toHaveBeenCalled();
  });

  it("fetches, upserts, and returns fetched rate when no stored rate exists", async () => {
    const fetcherMock = vi.fn().mockResolvedValue(1.65);
    const db = makeDb(null);

    const result = await getRateForTrip("trip-1", "EUR", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toBe(1.65);
    expect(fetcherMock).toHaveBeenCalledWith("EUR", "AUD");
    expect(db._upsertMock).toHaveBeenCalledOnce();
    // Upsert should set manual: false
    const upsertCall = db._upsertMock.mock.calls[0][0];
    expect(upsertCall.create.manual).toBe(false);
    expect(upsertCall.create.rate).toBe(1.65);
  });

  it("fetches, upserts, and returns fetched rate when stored is non-manual", async () => {
    const stale: StoredRate = {
      id: "r1",
      tripId: "trip-1",
      base: "EUR",
      quote: "AUD",
      rate: 1.5,
      fetchedAt: new Date(),
      manual: false,
    };
    const fetcherMock = vi.fn().mockResolvedValue(1.65);
    const db = makeDb(stale);

    const result = await getRateForTrip("trip-1", "EUR", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toBe(1.65);
    expect(fetcherMock).toHaveBeenCalledWith("EUR", "AUD");
    expect(db._upsertMock).toHaveBeenCalledOnce();
  });

  it("returns stale stored rate when fetch fails (returns null)", async () => {
    const stale: StoredRate = {
      id: "r1",
      tripId: "trip-1",
      base: "EUR",
      quote: "AUD",
      rate: 1.5,
      fetchedAt: new Date(),
      manual: false,
    };
    const fetcherMock = vi.fn().mockResolvedValue(null);
    const db = makeDb(stale);

    const result = await getRateForTrip("trip-1", "EUR", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toBe(1.5);
    expect(db._upsertMock).not.toHaveBeenCalled();
  });

  it("returns null when fetch fails and no stored rate exists", async () => {
    const fetcherMock = vi.fn().mockResolvedValue(null);
    const db = makeDb(null);

    const result = await getRateForTrip("trip-1", "EUR", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toBeNull();
  });
});

describe("resolveRateForTrip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns rate 1 and no persist when base === quote (no db, no fetch)", async () => {
    const fetcherMock = vi.fn();
    const db = makeDb(null);

    const result = await resolveRateForTrip("trip-1", "AUD", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toEqual({ rate: 1, persist: null });
    expect(fetcherMock).not.toHaveBeenCalled();
    expect(db.exchangeRate.findUnique).not.toHaveBeenCalled();
  });

  it("returns the manual stored rate and no persist (skips fetch)", async () => {
    const manual: StoredRate = {
      id: "r1", tripId: "trip-1", base: "EUR", quote: "AUD",
      rate: 1.6, fetchedAt: new Date(), manual: true,
    };
    const fetcherMock = vi.fn();
    const db = makeDb(manual);

    const result = await resolveRateForTrip("trip-1", "EUR", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toEqual({ rate: 1.6, persist: null });
    expect(fetcherMock).not.toHaveBeenCalled();
  });

  it("returns a persist descriptor for a fresh fetch and does NOT write", async () => {
    const fetcherMock = vi.fn().mockResolvedValue(1.65);
    const db = makeDb(null);

    const result = await resolveRateForTrip("trip-1", "eur", "aud", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toEqual({ rate: 1.65, persist: { base: "EUR", quote: "AUD", rate: 1.65 } });
    expect(db._upsertMock).not.toHaveBeenCalled(); // resolve never writes
  });

  it("falls back to the stale stored rate with no persist when the fetch fails", async () => {
    const stale: StoredRate = {
      id: "r1", tripId: "trip-1", base: "EUR", quote: "AUD",
      rate: 1.5, fetchedAt: new Date(), manual: false,
    };
    const fetcherMock = vi.fn().mockResolvedValue(null);
    const db = makeDb(stale);

    const result = await resolveRateForTrip("trip-1", "EUR", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toEqual({ rate: 1.5, persist: null });
  });

  it("returns null rate and no persist when the fetch fails and nothing is stored", async () => {
    const fetcherMock = vi.fn().mockResolvedValue(null);
    const db = makeDb(null);

    const result = await resolveRateForTrip("trip-1", "EUR", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toEqual({ rate: null, persist: null });
  });
});

describe("persistRate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts the rate with manual: false against a db-like client", async () => {
    const db = makeDb(null);

    await persistRate(db as never, "trip-1", { base: "EUR", quote: "AUD", rate: 1.65 });

    expect(db._upsertMock).toHaveBeenCalledOnce();
    const call = db._upsertMock.mock.calls[0][0];
    expect(call.where).toEqual({ tripId_base_quote: { tripId: "trip-1", base: "EUR", quote: "AUD" } });
    expect(call.create.manual).toBe(false);
    expect(call.create.rate).toBe(1.65);
    expect(call.update.rate).toBe(1.65);
    expect(call.update.manual).toBeUndefined();
  });

  it("accepts a transaction client (any exchangeRate-bearing client)", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const tx = { exchangeRate: { upsert } };

    await persistRate(tx as never, "trip-1", { base: "USD", quote: "AUD", rate: 1.5 });

    expect(upsert).toHaveBeenCalledOnce();
  });
});

describe("isRateStale", () => {
  it("FX_STALE_AFTER_MS is 24 hours", () => {
    expect(FX_STALE_AFTER_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("returns false for a rate fetched just now", () => {
    const now = 1_000_000_000_000;
    expect(isRateStale(now, now)).toBe(false);
  });

  it("returns false within the threshold (23h old)", () => {
    const now = 1_000_000_000_000;
    expect(isRateStale(now - 23 * 60 * 60 * 1000, now)).toBe(false);
  });

  it("returns false exactly at the threshold (strict >, so 24h is not yet stale)", () => {
    const now = 1_000_000_000_000;
    expect(isRateStale(now - FX_STALE_AFTER_MS, now)).toBe(false);
  });

  it("returns true once older than 24h", () => {
    const now = 1_000_000_000_000;
    expect(isRateStale(now - 25 * 60 * 60 * 1000, now)).toBe(true);
  });
});
