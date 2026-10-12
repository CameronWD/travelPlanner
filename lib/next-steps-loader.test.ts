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
const loadSurpriseVisibilityMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import { loadNextSteps } from "./next-steps-loader";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

beforeEach(() => {
  vi.clearAllMocks();
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
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
    await loadNextSteps("trip-1", "2026-06-01", "u1");
    expect(db.stop.findMany).toHaveBeenCalledTimes(1);
    expect(db.stop.count).not.toHaveBeenCalled();
    expect(db.transport.findMany).toHaveBeenCalledTimes(1);
    expect(getTripProjection).not.toHaveBeenCalled();
  });
  it("returns [] outside planning / final prep without reading the plan", async () => {
    expect(await loadNextSteps("trip-1", "2027-01-01", "u1")).toEqual([]);
    expect(db.stop.findMany).not.toHaveBeenCalled();
  });
});

describe("loadNextSteps — Surprise (ADR 0051)", () => {
  it("reads Items and Accommodation through the viewer's fragments, after the visibility loader", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ hiddenStopIds: ["s1"] }));
    await loadNextSteps("trip-1", "2026-06-01", "u-viewer");
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith("trip-1", "u-viewer");
    expect(loadSurpriseVisibilityMock.mock.invocationCallOrder[0]).toBeLessThan(db.item.findMany.mock.invocationCallOrder[0]);
    expect(db.item.findMany.mock.calls[0][0].where).toEqual({ tripId: "trip-1", forkId: null, ...MARKER_WHERE.item });
    expect(db.accommodation.findMany.mock.calls[0][0].where).toEqual({ tripId: "trip-1", forkId: null, ...MARKER_WHERE.accommodation });
    expect(JSON.stringify(db.stop.findMany.mock.calls[0][0])).not.toContain("surpriseMarker");
  });
  it("outside planning / final prep the visibility loader is not asked either", async () => {
    await loadNextSteps("trip-1", "2027-01-01", "u-viewer");
    expect(loadSurpriseVisibilityMock).not.toHaveBeenCalled();
  });
});
