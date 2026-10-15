import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for loadNavCounts. `lib/flags-loader.ts`'s `loadFlagRows` owns every
 * Flag's row-reading and Surprise-visibility threading now (TB-01, spec
 * 2026-10-14) — loadNavCounts only reads the Wishlist count and the
 * projection itself, so this file mocks `loadFlagRows` (the row read) and
 * `detectFlags` (to assert what reaches it), not the individual Prisma
 * delegates loadFlagRows used to call directly.
 */
const db = vi.hoisted(() => ({
  item: { count: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

const requireTripAccessMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));

const getTripProjectionMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/stops", () => ({ getTripProjection: getTripProjectionMock }));

const loadFlagRowsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/flags-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags-loader")>();
  return { ...actual, loadFlagRows: loadFlagRowsMock };
});

const detectFlagsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags")>();
  return { ...actual, detectFlags: detectFlagsMock };
});

import { loadNavCounts } from "./nav-counts";
import { trip, stop } from "@/test/builders";

const BASE_ROWS = {
  trip: trip(),
  allStops: [stop()],
  transports: [],
  accommodations: [],
  items: [],
  hiddenStopIds: [] as readonly string[],
};

beforeEach(() => {
  requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: {} });
  db.item.count.mockResolvedValue(0);
  loadFlagRowsMock.mockResolvedValue(BASE_ROWS);
  getTripProjectionMock.mockResolvedValue({ projectedEnd: null, hardEndDate: null, deadline: null });
  detectFlagsMock.mockReturnValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadNavCounts", () => {
  it("checks trip access", async () => {
    await loadNavCounts("t1");
    expect(requireTripAccessMock).toHaveBeenCalledWith("t1");
  });

  it("reads Flag rows through loadFlagRows, as the viewer asking", async () => {
    await loadNavCounts("t1");
    expect(loadFlagRowsMock).toHaveBeenCalledWith("t1", "u1");
  });

  it("is flags=0, wishlist=0 for a date-less trip (loadFlagRows returns null; the projection, requested in parallel, is fetched and simply discarded)", async () => {
    loadFlagRowsMock.mockResolvedValue(null);
    db.item.count.mockResolvedValue(0);
    const result = await loadNavCounts("t1");
    expect(result).toEqual({ flags: 0, wishlist: 0 });
    expect(getTripProjectionMock).toHaveBeenCalledWith("t1");
    expect(detectFlagsMock).not.toHaveBeenCalled();
  });

  it("requests loadFlagRows and getTripProjection without awaiting one another (spec 2026-10-06 §C, one wave)", async () => {
    loadFlagRowsMock.mockImplementation(() => new Promise(() => {})); // never settles
    getTripProjectionMock.mockResolvedValue({ projectedEnd: null, hardEndDate: null, deadline: null });
    void loadNavCounts("t1");
    await vi.waitFor(() => expect(getTripProjectionMock).toHaveBeenCalledWith("t1"));
  });

  it("reports the Wishlist count from db.item.count scoped to the real plan and wishlist-idea predicate", async () => {
    db.item.count.mockResolvedValue(4);
    const result = await loadNavCounts("t1");
    expect(result.wishlist).toBe(4);
    expect(db.item.count).toHaveBeenCalledWith({
      where: { tripId: "t1", forkId: null, stopId: null, date: null },
    });
  });

  it("counts the Flags detectFlags returns for the loaded rows", async () => {
    detectFlagsMock.mockReturnValue([
      { id: "f1", severity: "warning", message: "No stay booked", targetType: "STOP" },
      { id: "f2", severity: "info", message: "Short stay", targetType: "STOP" },
    ]);
    db.item.count.mockResolvedValue(2);

    const result = await loadNavCounts("t1");

    expect(result).toEqual({ flags: 2, wishlist: 2 });
  });

  it("TB-01: a Trip row with homeTimezone reaches detectFlags, so the badge matches Summary's Flags list", async () => {
    loadFlagRowsMock.mockResolvedValue({
      ...BASE_ROWS,
      trip: trip({ homeTimezone: "Australia/Sydney" }),
    });

    await loadNavCounts("t1");

    expect(detectFlagsMock).toHaveBeenCalledWith(expect.objectContaining({ homeTimezone: "Australia/Sydney" }));
  });

  it("no longer reads Stops itself — the row read is loadFlagRows' job", async () => {
    await loadNavCounts("t1");
    // db only exposes item.count to this loader now; nothing else to assert
    // against directly, but loadFlagRows (mocked) is the sole row source.
    expect(loadFlagRowsMock).toHaveBeenCalledTimes(1);
  });

  it("forwards the projection's deadline to detectFlags: a return leg before the projected end is a Flag input even with a roomy hard end (ADR 0068)", async () => {
    getTripProjectionMock.mockResolvedValue({
      projectedEnd: "2026-12-07",
      hardEndDate: "2026-12-20",
      deadline: { kind: "return-leg", date: "2026-12-06", mode: "FLIGHT", homeward: true },
    });

    await loadNavCounts("t1");

    expect(detectFlagsMock).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: { kind: "return-leg", date: "2026-12-06", mode: "FLIGHT", homeward: true } }),
    );
  });
});
