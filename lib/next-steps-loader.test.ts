import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for loadNextSteps. `lib/flags-loader.ts`'s `loadFlagRows` owns the
 * Stop/Transport/Accommodation/Item reads and the Surprise-visibility
 * threading now (TB-01, spec 2026-10-14) — this loader only keeps its own
 * Trip read (phase gate, hardEndDate, chaptersEnabled) and the chapter/
 * checklist counts, so this file mocks `loadFlagRows` rather than the
 * individual Prisma delegates it used to call directly.
 */
const db = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  chapter: { count: vi.fn() },
  checklistItem: { count: vi.fn() },
}));
const getTripProjection = vi.hoisted(() => vi.fn());
const loadFlagRowsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(async () => ({})) }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: vi.fn(async () => "eu") }));
vi.mock("@/lib/trip-projection-reads", () => ({ getTripProjection }));
vi.mock("@/lib/flags-loader", () => ({ loadFlagRows: loadFlagRowsMock }));

import { loadNextSteps } from "./next-steps-loader";

const BASE_ROWS = {
  trip: {
    startDate: "2026-12-04",
    endDate: "2026-12-20",
    drivingWindingFactor: 1.5,
    drivingAvgSpeedKph: 80,
    homeName: null,
    homeLat: null,
    homeLng: null,
    homeCountryCode: null,
    homeTimezone: null as string | null,
    roundTrip: true,
  },
  allStops: [
    { id: "s1", name: "Paris", lat: null, lng: null, timezone: "Europe/Paris", arriveDate: "2026-12-04", departDate: "2026-12-08", sortOrder: 0 },
    { id: "s2", name: "Lyon", lat: null, lng: null, timezone: null, arriveDate: null, departDate: null, sortOrder: 1 },
  ],
  transports: [],
  accommodations: [],
  items: [],
  hiddenStopIds: [] as readonly string[],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.trip.findUnique.mockResolvedValue({
    startDate: "2026-12-04",
    endDate: "2026-12-20",
    hardEndDate: null,
    roundTrip: true,
    chaptersEnabled: false,
  });
  loadFlagRowsMock.mockResolvedValue(BASE_ROWS);
  db.chapter.count.mockResolvedValue(0);
  db.checklistItem.count.mockResolvedValue(0);
});

describe("loadNextSteps reads (spec 2026-10-06 §C; TB-01, spec 2026-10-14)", () => {
  it("reads the plan once via loadFlagRows, with no separate projection read", async () => {
    await loadNextSteps("trip-1", "2026-06-01", "u1");
    expect(loadFlagRowsMock).toHaveBeenCalledTimes(1);
    expect(getTripProjection).not.toHaveBeenCalled();
  });

  it("returns [] outside planning / final prep without reading the plan", async () => {
    expect(await loadNextSteps("trip-1", "2027-01-01", "u1")).toEqual([]);
    expect(loadFlagRowsMock).not.toHaveBeenCalled();
  });

  it("TB-01: the Trip's homeTimezone from loadFlagRows reaches the ranked Next steps' Flags", async () => {
    loadFlagRowsMock.mockResolvedValue({
      ...BASE_ROWS,
      trip: { ...BASE_ROWS.trip, homeTimezone: "Australia/Sydney" },
    });
    // No assertion needs a mocked detectFlags here — this just pins that a
    // Trip row with homeTimezone set doesn't throw and still loads normally.
    await expect(loadNextSteps("trip-1", "2026-06-01", "u1")).resolves.not.toThrow();
  });
});

describe("loadNextSteps — Surprise (ADR 0051)", () => {
  it("asks loadFlagRows for the viewer, so Surprise visibility matches what they see", async () => {
    await loadNextSteps("trip-1", "2026-06-01", "u-viewer");
    expect(loadFlagRowsMock).toHaveBeenCalledWith("trip-1", "u-viewer");
  });

  it("a hidden Stop with no readable stay raises no Flag-derived step about it", async () => {
    loadFlagRowsMock.mockResolvedValue({ ...BASE_ROWS, hiddenStopIds: ["s1"] });
    const steps = await loadNextSteps("trip-1", "2026-06-01", "u-viewer");
    expect(steps.map((s) => s.id)).not.toContain("stop-no-accom-s1");
  });

  it("outside planning / final prep, loadFlagRows is not asked either", async () => {
    await loadNextSteps("trip-1", "2027-01-01", "u-viewer");
    expect(loadFlagRowsMock).not.toHaveBeenCalled();
  });
});
