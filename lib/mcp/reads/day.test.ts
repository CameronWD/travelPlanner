import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireTripAccess, readDayRows, stopFindMany } = vi.hoisted(() => ({
  requireTripAccess: vi.fn(),
  readDayRows: vi.fn(),
  stopFindMany: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/day-reads", () => ({ readDayRows }));
// `readDayRows` is mocked wholesale, so it never actually calls the
// `alongside` callback `loadDayForMcp` passes it (the real one queries
// `db.stop.findMany` for every real-plan Stop's name, R5's owningStop fix
// round 1); each test sets `alongside` directly on `readDayRows`'s resolved
// value instead. This mock exists only so the module import doesn't throw
// for lack of a DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: { stop: { findMany: stopFindMany } } }));

import type { DayRows } from "@/lib/day-view-model";
import { loadDayForMcp } from "./day";

const surprised = { plannerName: "Cam", forNames: ["Alex"], youAreSurprised: true } as never;
const itemRow = (o: Partial<DayRows["items"][number]>): DayRows["items"][number] => ({
  id: "i", title: "T", category: "SIGHTSEEING", date: "2027-06-02", startTime: null, endTime: null, sortOrder: 0, stopId: "s1",
  lat: null, lng: null, address: null, link: null, booking: null, notes: null, hiddenFromShares: false, photoAttachmentId: null, surprise: null,
  bookingState: "NONE", bookingStateSet: false, bookBy: null, slotTime: null, arriveByMinutes: null, refundable: null, openingHours: null, tryList: null, ...o,
});
const rows: DayRows = {
  trip: { name: "Porto", startDate: "2027-06-01", endDate: "2027-06-04", homeCurrency: "AUD", homeName: "Brisbane", homeTimezone: "Australia/Brisbane", chaptersEnabled: false, roundTrip: true },
  startDate: "2027-06-01",
  endDate: "2027-06-04",
  stops: [{ id: "s1", name: "Porto", country: "Portugal", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04", sortOrder: 0, lat: null, lng: null, surprise: null }],
  items: [
    itemRow({ id: "tour", title: "Port lodge tour", startTime: "10:00" }),
    itemRow({ id: "market", title: "Bolhão market" }),
    itemRow({ id: "p1", title: "Surprise", category: "OTHER", startTime: "19:00", surprise: surprised }),
  ],
  transports: [],
  accommodations: [{ id: "a1", stopId: "s1", name: "Casa", address: null, checkIn: "2027-06-01", checkOut: "2027-06-04", checkInTime: "15:00", checkOutTime: null, confirmation: "X1", notes: null, lat: null, lng: null, bookingState: "BOOKED", bookingStateSet: false, bookBy: null }],
  wishlist: [],
  attachments: [{ id: "f1", filename: "tour.pdf", title: null, mime: "application/pdf", size: 1, url: "u", uploadedById: "u1", createdAt: new Date(), targetId: "tour" }],
  chapters: [],
  dayTitles: [{ stopId: "s1", dayIndex: 1, title: "Ribeira day" }],
  thingsToDo: [],
};

describe("loadDayForMcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    readDayRows.mockResolvedValue({ rows, visibility: {}, alongside: [{ id: "s1", name: "Porto" }] });
  });

  it("reads the day as the Day view assembles it, the viewer's Surprise masking included", async () => {
    const day = await loadDayForMcp("trip-1", "2027-06-02");
    expect(readDayRows).toHaveBeenCalledWith("trip-1", "u1", expect.any(Function));
    expect(day).toMatchObject({
      date: "2027-06-02", dayNumber: 2, totalDays: 4, dayTitle: "Ribeira day", travelDay: false,
      stop: { id: "s1", name: "Porto", timezone: "Europe/Lisbon", surprise: null },
      tonight: { id: "a1", name: "Casa", nightOf: { night: 2, of: 3 } },
    });
    if ("success" in day) throw new Error("expected a day");
    expect(day.timeline.map((e) => (e.kind === "item" ? e.item.id : e.kind))).toEqual(["tour", "p1"]);
    expect(day.timeline[0]).toMatchObject({ kind: "item", item: { title: "Port lodge tour", files: [{ id: "f1", title: "tour.pdf" }] } });
    expect(day.timeline[1]).toMatchObject({ kind: "item", item: { title: "Surprise", surprise: { youAreSurprised: true } } });
    expect(day.anytime.map((i) => i.id)).toEqual(["market"]);
  });

  // Fix round 1 (controller ruling): get_day's own `rows.stops` holds only
  // dated Stops, so an Item owned by a rough Stop used to get no name for
  // owningStop (owningStopRef's old fallback prose). The `alongside` names
  // list (every real-plan Stop, rough ones included) fixes that.
  it("an Item owned by a rough Stop (not in rows.stops) still gets its real name for owningStop", async () => {
    readDayRows.mockResolvedValue({
      rows: { ...rows, items: [...rows.items, itemRow({ id: "daytrip", title: "Somewhere else", stopId: "rough1", startTime: "15:00" })] },
      visibility: {},
      alongside: [{ id: "s1", name: "Porto" }, { id: "rough1", name: "IT Somewhere else" }],
    });
    const day = await loadDayForMcp("trip-1", "2027-06-02");
    if ("success" in day) throw new Error("expected a day");
    const entry = day.timeline.find((e) => e.kind === "item" && e.item.id === "daytrip");
    expect(entry).toMatchObject({ item: { owningStop: { id: "rough1", name: "IT Somewhere else" } } });
  });

  it("lists the check-in in the timeline on its day, timed", async () => {
    const day = await loadDayForMcp("trip-1", "2027-06-01");
    if ("success" in day) throw new Error("expected a day");
    expect(day.timeline).toContainEqual({ kind: "check-in", accommodationId: "a1", name: "Casa", time: "15:00", bookingState: "BOOKED", bookBy: null });
  });

  it("legs, check-ins, check-outs and tonight carry Booking state and book-by, as get_trip_plan's legs and stays do", async () => {
    const leg = {
      // An overnight bus: departs 22:00 on the 3rd, arrives 01:00 on the 4th (Lisbon, UTC+1).
      id: "leg1", mode: "BUS", fromStopId: "s1", toStopId: null, depPlace: null, arrPlace: "Lisbon",
      depAt: new Date("2027-06-03T21:00:00Z"), arrAt: new Date("2027-06-04T00:00:00Z"), depLat: null, depLng: null, arrLat: null, arrLng: null,
      reference: null, notes: null, sortOrder: 0, anchorStopId: null, depIsHome: false, arrIsHome: false,
      bookingState: "TO_BOOK" as const, bookingStateSet: false, bookBy: "2027-05-01",
    };
    const stay = { ...rows.accommodations[0]!, bookingState: "TO_BOOK" as const, bookBy: "2027-05-10", confirmation: null };
    readDayRows.mockResolvedValue({ rows: { ...rows, transports: [leg], accommodations: [stay] }, visibility: {}, alongside: [{ id: "s1", name: "Porto" }] });
    const dep = await loadDayForMcp("trip-1", "2027-06-03");
    if ("success" in dep) throw new Error("expected a day");
    expect(dep.timeline).toContainEqual(expect.objectContaining({ kind: "departure", transportId: "leg1", bookingState: "TO_BOOK", bookBy: "2027-05-01" }));
    const day = await loadDayForMcp("trip-1", "2027-06-04");
    if ("success" in day) throw new Error("expected a day");
    expect(day.timeline).toContainEqual(expect.objectContaining({ kind: "arrival", transportId: "leg1", bookingState: "TO_BOOK", bookBy: "2027-05-01" }));
    expect(day.timeline).toContainEqual(expect.objectContaining({ kind: "check-out", accommodationId: "a1", bookingState: "TO_BOOK", bookBy: "2027-05-10" }));
    const first = await loadDayForMcp("trip-1", "2027-06-02");
    if ("success" in first) throw new Error("expected a day");
    expect(first.tonight).toMatchObject({ id: "a1", bookingState: "TO_BOOK", bookBy: "2027-05-10" });
  });

  it("a date outside the trip is a tool error naming the range, not a clamp", async () => {
    expect(await loadDayForMcp("trip-1", "2027-06-09")).toEqual({
      success: false,
      errors: { date: ["2027-06-09 is outside the trip, which runs 2027-06-01 to 2027-06-04."] },
    });
  });

  it("a dateless trip is a tool error", async () => {
    readDayRows.mockResolvedValue("dateless");
    expect(await loadDayForMcp("trip-1", "2027-06-02")).toMatchObject({ success: false, errors: { date: [expect.stringMatching(/no dates yet/)] } });
  });

  it("a trip with a start date but no end date is the same no-dates tool error, not a one-day trip", async () => {
    readDayRows.mockResolvedValue({ rows: { ...rows, trip: { ...rows.trip, endDate: null }, endDate: rows.startDate }, visibility: {}, alongside: [{ id: "s1", name: "Porto" }] });
    expect(await loadDayForMcp("trip-1", "2027-06-01")).toEqual({
      success: false,
      errors: { date: ["This trip has no dates yet, so it has no days. Read it with get_trip_plan."] },
    });
  });

  it("a non-member's trip is notFound before any read", async () => {
    requireTripAccess.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    await expect(loadDayForMcp("trip-1", "2027-06-02")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(readDayRows).not.toHaveBeenCalled();
  });
});
