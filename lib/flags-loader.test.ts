import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  stop: { findMany: vi.fn() },
  transport: { findMany: vi.fn() },
  accommodation: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
}));
const requireTripAccess = vi.hoisted(() => vi.fn());
const getTripProjection = vi.hoisted(() => vi.fn());
const detectFlags = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
const loadSurpriseVisibilityMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});
vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/trip-projection-reads", () => ({ getTripProjection }));
vi.mock("@/lib/flags", async (orig) => ({
  ...(await orig<typeof import("./flags")>()),
  detectFlags,
}));
const tripTodayISO = vi.hoisted(() => vi.fn(() => "2026-01-01"));
vi.mock("@/lib/trip-today", () => ({ tripTodayISO }));

import { loadFlags, flagsFromRows, loadFlagRows, flagsForRows } from "./flags-loader";
import { mergePlanItems } from "@/lib/plan-reads";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE, placeholderItem } from "@/test/helpers/surprise-visibility";
import { trip, datedTripFixture } from "@/test/builders";

const TRIP_ID = "trip-1";
const notFoundErr = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

const BASE_TRIP = {
  startDate: "2026-01-01",
  endDate: "2026-01-10",
  hardEndDate: null,
  drivingWindingFactor: 1.5,
  drivingAvgSpeedKph: 80,
  homeName: null,
  homeLat: null,
  homeLng: null,
  homeCountryCode: null,
  roundTrip: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
  requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
  db.trip.findUnique.mockResolvedValue(BASE_TRIP);
  db.stop.findMany.mockResolvedValue([]);
  db.transport.findMany.mockResolvedValue([]);
  db.accommodation.findMany.mockResolvedValue([]);
  db.item.findMany.mockResolvedValue([]);
  getTripProjection.mockResolvedValue({ projectedEnd: null, hardEndDate: null, deadline: null });
  detectFlags.mockReturnValue([]);
});

describe("loadFlags", () => {
  it("checks access before querying anything", async () => {
    requireTripAccess.mockRejectedValue(notFoundErr());
    await expect(loadFlags(TRIP_ID, "u1")).rejects.toThrow();
    expect(db.trip.findUnique).not.toHaveBeenCalled();
  });

  it("reads every Plan query on the real plan (forkId: null)", async () => {
    await loadFlags(TRIP_ID, "u1");
    for (const k of ["stop", "transport", "accommodation", "item"] as const) {
      expect(db[k].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripId: TRIP_ID, forkId: null }) }));
    }
  });

  it("a date-less trip returns [] without reading the plan (the projection, requested in parallel, is fetched and simply discarded)", async () => {
    db.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, startDate: null, endDate: null });
    const result = await loadFlags(TRIP_ID, "u1");
    expect(result).toEqual([]);
    expect(db.stop.findMany).not.toHaveBeenCalled();
    expect(getTripProjection).toHaveBeenCalledWith(TRIP_ID);
  });

  it("requests getTripProjection without waiting for loadFlagRows to finish (spec 2026-10-06 §C, one wave)", async () => {
    db.trip.findUnique.mockImplementation(() => new Promise(() => {})); // never settles
    getTripProjection.mockResolvedValue({ projectedEnd: null, hardEndDate: null, deadline: null });
    void loadFlags(TRIP_ID, "u1");
    await vi.waitFor(() => expect(getTripProjection).toHaveBeenCalledWith(TRIP_ID));
  });

  it("gets its own projection via getTripProjection and feeds it to detectFlags", async () => {
    getTripProjection.mockResolvedValue({ projectedEnd: "2026-01-11", hardEndDate: "2026-01-10", deadline: { kind: "hard-end", date: "2026-01-10" } });
    await loadFlags(TRIP_ID, "u1");
    expect(getTripProjection).toHaveBeenCalledWith(TRIP_ID);
    expect(detectFlags).toHaveBeenCalledWith(
      expect.objectContaining({
        tripStart: "2026-01-01",
        tripEnd: "2026-01-10",
        projectedEnd: "2026-01-11",
        hardEndDate: "2026-01-10",
        deadline: { kind: "hard-end", date: "2026-01-10" },
      }),
    );
  });

  it("returns detectFlags' result", async () => {
    const flags = [{ id: "f1", severity: "warning" as const, message: "No stay booked", targetType: "STOP" as const }];
    detectFlags.mockReturnValue(flags);
    expect(await loadFlags(TRIP_ID, "u1")).toEqual(flags);
  });

  it("selects the Trip's homeTimezone and feeds it to detectFlags (spec 2026-10-14)", async () => {
    db.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, homeTimezone: "Australia/Brisbane" });
    await loadFlags(TRIP_ID, "u1");
    expect(db.trip.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ homeTimezone: true }) }),
    );
    expect(detectFlags).toHaveBeenCalledWith(expect.objectContaining({ homeTimezone: "Australia/Brisbane" }));
  });

  it("derives first/last stop across dated and rough stops together, by sortOrder", async () => {
    db.stop.findMany.mockResolvedValue([
      { id: "s1", name: "Rome", lat: null, lng: null, timezone: "Europe/Rome", arriveDate: "2026-01-02", departDate: "2026-01-05", sortOrder: 0 },
      { id: "s2", name: "Rough idea", lat: null, lng: null, timezone: null, arriveDate: null, departDate: null, sortOrder: 1 },
    ]);
    await loadFlags(TRIP_ID, "u1");
    expect(detectFlags).toHaveBeenCalledWith(
      expect.objectContaining({
        roughStopCount: 1,
        homeFirstStop: { id: "s1", name: "Rome", sortOrder: 0 },
        homeLastStop: { id: "s2", name: "Rough idea", sortOrder: 1 },
      }),
    );
  });
});

describe("loadFlags — Surprise (ADR 0051)", () => {
  it("reads Accommodations and Items through the viewer's fragments; Stops and Transport whole", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ hiddenStopIds: ["s1"] }));
    await loadFlags(TRIP_ID, "u-viewer");
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith(TRIP_ID, "u-viewer");
    expect(loadSurpriseVisibilityMock.mock.invocationCallOrder[0]).toBeLessThan(db.item.findMany.mock.invocationCallOrder[0]);
    expect(db.accommodation.findMany.mock.calls[0][0].where).toEqual({ tripId: TRIP_ID, forkId: null, ...MARKER_WHERE.accommodation });
    expect(db.item.findMany.mock.calls[0][0].where).toEqual({ tripId: TRIP_ID, forkId: null, ...MARKER_WHERE.item });
    expect(JSON.stringify(db.stop.findMany.mock.calls[0][0])).not.toContain("surpriseMarker");
    expect(JSON.stringify(db.transport.findMany.mock.calls[0][0])).not.toContain("surpriseMarker");
    // The hidden Stops reach detectFlags, so nothing about their inside is raised.
    expect(detectFlags).toHaveBeenCalledWith(expect.objectContaining({ hiddenStopIds: ["s1"] }));
  });
});

describe("flagsFromRows", () => {
  const PROJECTION = { projectedEnd: "2026-01-11", hardEndDate: "2026-01-10", deadline: null };

  it("does no I/O — assembles detectFlags' input straight from the given rows and projection", () => {
    flagsFromRows({
      trip: BASE_TRIP,
      allStops: [{ id: "s1", name: "Rome", lat: null, lng: null, timezone: "Europe/Rome", arriveDate: "2026-01-02", departDate: "2026-01-05", sortOrder: 0 }],
      transports: [],
      accommodations: [],
      items: [],
      tripStart: "2026-01-01",
      tripEnd: "2026-01-10",
      projection: PROJECTION,
      today: "2026-01-01",
    });
    expect(db.trip.findUnique).not.toHaveBeenCalled();
    expect(requireTripAccess).not.toHaveBeenCalled();
    expect(getTripProjection).not.toHaveBeenCalled();
    expect(detectFlags).toHaveBeenCalledWith(
      expect.objectContaining({
        tripStart: "2026-01-01",
        tripEnd: "2026-01-10",
        projectedEnd: "2026-01-11",
        hardEndDate: "2026-01-10",
        deadline: null,
        roughStopCount: 0,
        drivingWindingFactor: 1.5,
        drivingAvgSpeedKph: 80,
      }),
    );
  });

  it("passes the Trip's homeTimezone through to detectFlags (spec 2026-10-14)", () => {
    flagsFromRows({
      trip: { ...BASE_TRIP, homeTimezone: "Australia/Brisbane" },
      allStops: [],
      transports: [],
      accommodations: [],
      items: [],
      tripStart: "2026-01-01",
      tripEnd: "2026-01-10",
      projection: PROJECTION,
      today: "2026-01-01",
    });
    expect(detectFlags).toHaveBeenCalledWith(expect.objectContaining({ homeTimezone: "Australia/Brisbane" }));
  });

  it("is what loadFlags calls internally after its own fetch and its own getTripProjection", async () => {
    getTripProjection.mockResolvedValue(PROJECTION);
    await loadFlags(TRIP_ID, "u1");
    const fromLoadFlags = detectFlags.mock.calls[0][0];
    detectFlags.mockClear();
    flagsFromRows({
      trip: BASE_TRIP,
      allStops: [],
      transports: [],
      accommodations: [],
      items: [],
      tripStart: "2026-01-01",
      tripEnd: "2026-01-10",
      projection: PROJECTION,
      hiddenStopIds: [], // loadFlags passes the viewer's (none hidden here)
      hiddenItemIds: [],
      today: "2026-01-01",
    });
    expect(detectFlags.mock.calls[0][0]).toEqual(fromLoadFlags);
  });
});

describe("loadFlagRows", () => {
  it("TB-01: loadFlagRows carries homeTimezone so every caller's detectFlags gets it", async () => {
    db.trip.findUnique.mockResolvedValueOnce(trip({ homeTimezone: "Australia/Sydney" }));
    db.stop.findMany.mockResolvedValueOnce(datedTripFixture().stops);
    const rows = await loadFlagRows("trip-1", "u1");
    expect(rows?.trip.homeTimezone).toBe("Australia/Sydney");
    expect(db.trip.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ homeTimezone: true }) }));
  });

  it("does not call requireTripAccess — the caller owns the access check", async () => {
    await loadFlagRows(TRIP_ID, "u1");
    expect(requireTripAccess).not.toHaveBeenCalled();
  });

  it("returns null for a date-less trip, without reading the plan", async () => {
    db.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, startDate: null, endDate: null });
    const rows = await loadFlagRows(TRIP_ID, "u1");
    expect(rows).toBeNull();
    expect(db.stop.findMany).not.toHaveBeenCalled();
  });

  it("scopes every plan read to the given Plan (forkId)", async () => {
    await loadFlagRows(TRIP_ID, "u1", "fork-1");
    for (const k of ["stop", "transport", "accommodation", "item"] as const) {
      expect(db[k].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripId: TRIP_ID, forkId: "fork-1" }) }));
    }
  });
});

describe("loadFlagRows — Surprise placeholders (TB-01 follow-up)", () => {
  const HIDDEN = placeholderItem({ id: "hid", stopId: "s1", date: "2026-01-03", startTime: "10:00", endTime: "12:00" });
  const OTHER_PLAN = placeholderItem({ id: "fork-hid", forkId: "fork-9", stopId: "s1", date: "2026-01-04", startTime: "10:00", endTime: "11:00" });
  const STOP = { id: "s1", name: "Rome", lat: null, lng: null, timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-10", sortOrder: 0, nights: null, pinned: false };
  const VISIBLE = {
    id: "vis", stopId: "s1", title: "Lunch", category: "FOOD", date: "2026-01-03", startTime: "11:00", endTime: "13:00", lat: null, lng: null,
    openingHours: null, slotTime: null, arriveByMinutes: null, bookingState: "NONE", bookBy: null,
  };

  beforeEach(() => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ placeholders: [HIDDEN, OTHER_PLAN] }));
    db.stop.findMany.mockResolvedValue([STOP]);
    db.item.findMany.mockResolvedValue([VISIBLE]);
  });

  it("appends this plan's placeholders for hidden root Items, masked to a Flag row", async () => {
    const rows = await loadFlagRows(TRIP_ID, "u-viewer");
    expect(rows?.items).toEqual([
      VISIBLE,
      { id: "hid", stopId: "s1", category: "OTHER", date: "2026-01-03", startTime: "10:00", endTime: "12:00", lat: null, lng: null },
    ]);
  });

  it("only the placeholders of the Plan being read", async () => {
    const rows = await loadFlagRows(TRIP_ID, "u-viewer", "fork-9");
    expect(rows?.items.map((i) => i.id)).toEqual(["vis", "fork-hid"]);
  });

  it("the badge (flagsForRows) counts exactly what the Summary assembly counts", async () => {
    const actual = await vi.importActual<typeof import("./flags")>("./flags");
    detectFlags.mockImplementation(actual.detectFlags);
    const projection = { projectedEnd: null, hardEndDate: null, deadline: null };
    const v = await loadSurpriseVisibilityMock();
    // Planning Flags too (spec 2026-10-17 R7): a museum closed on its day, and
    // a stay still To book six days out (today is 2026-01-01).
    const closedHours = { week: {}, seasons: [], closed: ["2026-01-05"] };
    const CLOSED = { ...VISIBLE, id: "museum", title: "Museum", category: "SIGHTSEEING", date: "2026-01-05", startTime: null, endTime: null };
    const STAY = { id: "stay", stopId: "s1", name: "Casa", checkIn: "2026-01-07", checkOut: "2026-01-09", bookingState: "TO_BOOK", bookBy: null };
    db.item.findMany.mockResolvedValue([VISIBLE, { ...CLOSED, openingHours: JSON.stringify(closedHours) }]);
    db.accommodation.findMany.mockResolvedValue([STAY]);

    const rows = await loadFlagRows(TRIP_ID, "u-viewer");
    const badge = flagsForRows(rows!, projection);
    // The Summary page: readPlan's items (visible rows + mergePlanItems' placeholders).
    const summary = flagsFromRows({
      trip: BASE_TRIP,
      allStops: [STOP],
      transports: [],
      accommodations: [STAY],
      // readPlan hands Summary its Items with the hours already parsed.
      items: mergePlanItems([VISIBLE, { ...CLOSED, openingHours: closedHours }] as never, v, null) as never,
      tripStart: BASE_TRIP.startDate,
      tripEnd: BASE_TRIP.endDate,
      projection,
      hiddenStopIds: v.hiddenStopIds,
      today: "2026-01-01",
      hiddenItemIds: v.hiddenItemIds,
    });

    expect(badge.map((f) => f.id).sort()).toEqual(summary.map((f) => f.id).sort());
    expect(badge.length).toBe(summary.length);
    // The placeholder's slot is counted: its overlap with the visible Item is raised.
    expect(badge.some((f) => f.id.includes("2026-01-03") && /overlap/i.test(f.id))).toBe(true);
    // The equality covers the planning kinds as well.
    expect(badge.map((f) => f.id)).toEqual(expect.arrayContaining(["item-closed-museum", "still-to-book-stay"]));
  });
});

describe("loadFlagRows / flagsFromRows: the planning Flags' ingredients (spec 2026-10-17 R7)", () => {
  const ROW_HOURS = JSON.stringify({ week: { tue: [] }, seasons: [], closed: [] });

  it("selects the Branch 1 columns the six Flags read", async () => {
    await loadFlagRows(TRIP_ID, "u1");
    expect(db.item.findMany.mock.calls[0][0].select).toEqual(expect.objectContaining({
      title: true, openingHours: true, slotTime: true, arriveByMinutes: true, bookingState: true, bookBy: true,
    }));
    expect(db.transport.findMany.mock.calls[0][0].select).toEqual(expect.objectContaining({ bookingState: true, bookBy: true }));
    expect(db.accommodation.findMany.mock.calls[0][0].select).toEqual(expect.objectContaining({ bookingState: true, bookBy: true }));
  });

  it("parses each Item's opening hours once, at the row edge", async () => {
    db.item.findMany.mockResolvedValue([{ id: "i1", stopId: "s1", title: "Museum", date: "2026-01-06", openingHours: ROW_HOURS }]);
    const rows = await loadFlagRows(TRIP_ID, "u1");
    expect(rows?.items[0].openingHours).toEqual({ week: { tue: [] }, seasons: [], closed: [] });
  });

  it("leaves a Wishlist idea's hours unparsed: no Flag reads them (M7)", async () => {
    db.item.findMany.mockResolvedValue([
      { id: "idea", stopId: null, title: "Museum", date: null, openingHours: ROW_HOURS },
      { id: "dated", stopId: null, title: "Museum", date: "2026-01-06", openingHours: ROW_HOURS },
    ]);
    const rows = await loadFlagRows(TRIP_ID, "u1");
    expect(rows?.items.map((i) => i.openingHours)).toEqual([null, { week: { tue: [] }, seasons: [], closed: [] }]);
  });

  it("carries the Trip's own today (from its Stops) and the viewer's hidden Items", async () => {
    const stops = [{ id: "s1", name: "Rome", lat: null, lng: null, timezone: "Europe/Rome", arriveDate: "2026-01-02", departDate: "2026-01-05", sortOrder: 0, nights: null, pinned: false }];
    db.stop.findMany.mockResolvedValue(stops);
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ placeholders: [placeholderItem({ id: "hid" })] }));
    tripTodayISO.mockReturnValueOnce("2026-01-04");
    const rows = await loadFlagRows(TRIP_ID, "u1");
    expect(tripTodayISO).toHaveBeenCalledWith(stops);
    expect(rows?.today).toBe("2026-01-04");
    expect(rows?.hiddenItemIds).toEqual(["hid"]);
  });

  it("flagsFromRows hands today, the hidden Items and every Stop's name (rough included) to detectFlags, reading no clock", () => {
    flagsFromRows({
      trip: BASE_TRIP,
      allStops: [
        { id: "s1", name: "Rome", lat: null, lng: null, timezone: "Europe/Rome", arriveDate: "2026-01-02", departDate: "2026-01-05", sortOrder: 0 },
        { id: "s2", name: "Rough idea", lat: null, lng: null, timezone: null, arriveDate: null, departDate: null, sortOrder: 1 },
      ],
      transports: [], accommodations: [], items: [],
      tripStart: "2026-01-01", tripEnd: "2026-01-10", projection: { projectedEnd: null, hardEndDate: null, deadline: null },
      today: "2026-01-03", hiddenItemIds: ["hid"],
    });
    expect(tripTodayISO).not.toHaveBeenCalled();
    expect(detectFlags).toHaveBeenCalledWith(expect.objectContaining({
      today: "2026-01-03", hiddenItemIds: ["hid"], stopNames: new Map([["s1", "Rome"], ["s2", "Rough idea"]]),
    }));
  });

  it("flagsForRows passes the rows' today and hidden Items", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ placeholders: [placeholderItem({ id: "hid" })] }));
    const rows = await loadFlagRows(TRIP_ID, "u1");
    detectFlags.mockClear();
    flagsForRows(rows!, { projectedEnd: null, hardEndDate: null, deadline: null });
    expect(detectFlags).toHaveBeenCalledWith(expect.objectContaining({ today: "2026-01-01", hiddenItemIds: ["hid"] }));
  });
});
