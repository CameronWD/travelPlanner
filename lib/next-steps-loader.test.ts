import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  stop: { findMany: vi.fn(), count: vi.fn() },
  transport: { findMany: vi.fn() },
  accommodation: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  chapter: { count: vi.fn() },
  checklistItem: { count: vi.fn() },
}));
const getTripProjection = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(async () => ({})) }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: vi.fn(async () => "eu") }));
vi.mock("@/server/actions/stops", () => ({ getTripProjection }));

import { loadNextSteps } from "./next-steps-loader";

beforeEach(() => {
  vi.clearAllMocks();
  db.trip.findUnique.mockResolvedValue({
    startDate: "2026-12-04", endDate: "2026-12-20", hardEndDate: null, roundTrip: true, homeName: null, homeLat: null,
    homeLng: null, homeCountryCode: null, drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80, chaptersEnabled: false,
  });
  db.stop.findMany.mockResolvedValue([
    { id: "s1", name: "Paris", lat: null, lng: null, timezone: "Europe/Paris", arriveDate: "2026-12-04", departDate: "2026-12-08", sortOrder: 0, nights: 4, pinned: false },
    { id: "s2", name: "Lyon", lat: null, lng: null, timezone: null, arriveDate: null, departDate: null, sortOrder: 1, nights: 2, pinned: false },
  ]);
  db.transport.findMany.mockResolvedValue([]);
  db.accommodation.findMany.mockResolvedValue([]);
  db.item.findMany.mockResolvedValue([]);
  db.chapter.count.mockResolvedValue(0);
  db.checklistItem.count.mockResolvedValue(0);
});

describe("loadNextSteps reads (spec 2026-10-06 §C)", () => {
  it("reads Stops and Transports once each, with no separate projection read", async () => {
    await loadNextSteps("trip-1", "2026-06-01");
    expect(db.stop.findMany).toHaveBeenCalledTimes(1);
    expect(db.stop.count).not.toHaveBeenCalled();
    expect(db.transport.findMany).toHaveBeenCalledTimes(1);
    expect(getTripProjection).not.toHaveBeenCalled();
  });
  it("returns [] outside planning / final prep without reading the plan", async () => {
    expect(await loadNextSteps("trip-1", "2027-01-01")).toEqual([]);
    expect(db.stop.findMany).not.toHaveBeenCalled();
  });
});
