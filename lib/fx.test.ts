import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeRate, getRateForTrip } from "./fx";

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
