import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireTripAccess, readDayRows } = vi.hoisted(() => ({ requireTripAccess: vi.fn(), readDayRows: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/day-reads", () => ({ readDayRows }));

import type { DayRows } from "@/lib/day-view-model";
import { loadDayForMcp } from "./day";

const surprised = { plannerName: "Cam", forNames: ["Alex"], youAreSurprised: true } as never;
const itemRow = (o: Partial<DayRows["items"][number]>): DayRows["items"][number] => ({
  id: "i", title: "T", category: "SIGHTSEEING", date: "2027-06-02", startTime: null, endTime: null, sortOrder: 0, stopId: "s1",
  lat: null, lng: null, address: null, link: null, booking: null, notes: null, hiddenFromShares: false, photoAttachmentId: null, surprise: null, ...o,
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
  accommodations: [{ id: "a1", stopId: "s1", name: "Casa", address: null, checkIn: "2027-06-01", checkOut: "2027-06-04", checkInTime: "15:00", checkOutTime: null, confirmation: "X1", notes: null, lat: null, lng: null }],
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
    readDayRows.mockResolvedValue({ rows, visibility: {}, alongside: null });
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

  it("lists the check-in in the timeline on its day, timed", async () => {
    const day = await loadDayForMcp("trip-1", "2027-06-01");
    if ("success" in day) throw new Error("expected a day");
    expect(day.timeline).toContainEqual({ kind: "check-in", accommodationId: "a1", name: "Casa", time: "15:00" });
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

  it("a non-member's trip is notFound before any read", async () => {
    requireTripAccess.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    await expect(loadDayForMcp("trip-1", "2027-06-02")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(readDayRows).not.toHaveBeenCalled();
  });
});
