import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireTripAccess: vi.fn(),
  requireRealPlanRow: vi.fn(),
  loadSurpriseVisibility: vi.fn(),
  loadTripAttachments: vi.fn(),
  readMcpCosts: vi.fn(),
  readMcpNotes: vi.fn(),
  itemFindFirst: vi.fn(),
  transportFindUnique: vi.fn(),
  tripFindUnique: vi.fn(),
  stopFindMany: vi.fn(),
  accommodationFindFirst: vi.fn(),
  chapterFindUnique: vi.fn(),
  itemFindMany: vi.fn(),
  loadDayTitles: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: m.requireTripAccess }));
vi.mock("../real-plan", () => ({ requireRealPlanRow: m.requireRealPlanRow }));
vi.mock("./attachments", () => ({ loadTripAttachments: m.loadTripAttachments }));
vi.mock("./costs", () => ({ readMcpCosts: m.readMcpCosts }));
vi.mock("./notes", () => ({ readMcpNotes: m.readMcpNotes }));
vi.mock("@/lib/day-titles-loader", () => ({ loadDayTitles: m.loadDayTitles }));
vi.mock("@/lib/db", () => ({
  db: {
    item: { findFirst: m.itemFindFirst, findMany: m.itemFindMany },
    transport: { findUnique: m.transportFindUnique },
    trip: { findUnique: m.tripFindUnique },
    stop: { findMany: m.stopFindMany },
    accommodation: { findFirst: m.accommodationFindFirst },
    chapter: { findUnique: m.chapterFindUnique },
  },
}));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: m.loadSurpriseVisibility };
});

import { NO_SURPRISES } from "@/lib/surprise-visibility";
import {
  loadAccommodationForMcp, loadChapterForMcp, loadItemForMcp, loadStopForMcp, loadTransportForMcp, loadTripSummaryForMcp, readMcpStops,
} from "./entities";

const nf = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
const file = { id: "f1", title: "Ticket.pdf" };
const cost = { id: "c1" };
const note = { id: "n1", body: "Book ahead" };

beforeEach(() => {
  vi.clearAllMocks();
  m.requireRealPlanRow.mockResolvedValue({ tripId: "trip-1" });
  m.requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
  m.loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
  m.readMcpCosts.mockResolvedValue({ homeCurrency: "AUD", today: "2026-10-16", costs: [cost] });
  m.readMcpNotes.mockResolvedValue([note]);
});

describe("loadItemForMcp", () => {
  it("returns the Item's get_trip_plan slice with its date and Stop, Costs, files and the Notes on it", async () => {
    m.itemFindFirst.mockResolvedValue({
      id: "i1", title: "Castle", category: "SIGHTSEEING", date: "2027-06-02", startTime: "10:00", endTime: null,
      address: "Sintra", link: null, booking: "#448", notes: "Be there 15 min early", stopId: "s1",
      bookingState: "BOOKED", bookBy: null,
    });
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map([["ITEM:i1", [file]]]) });
    const out = await loadItemForMcp("i1");
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("item", "i1");
    expect(m.loadTripAttachments).toHaveBeenCalledWith("trip-1", NO_SURPRISES, { targetIds: ["i1"] });
    expect(m.readMcpCosts).toHaveBeenCalledWith("trip-1", NO_SURPRISES, { ownerType: "ITEM", ownerId: "i1" });
    expect(m.readMcpNotes).toHaveBeenCalledWith("trip-1", NO_SURPRISES, { targetType: "ITEM", targetId: "i1" });
    expect(out).toEqual({
      id: "i1", title: "Castle", category: "SIGHTSEEING", startTime: "10:00", endTime: null, address: "Sintra",
      link: null, booking: "#448", notes: "Be there 15 min early", bookingState: "BOOKED", bookBy: null,
      slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN", openingHours: null,
      files: [file], surprise: null, date: "2027-06-02", stopId: "s1", costs: [cost], notesOnItem: [note],
    });
  });

  it("a Fork's Item, a hidden Surprise Item or a made-up id is notFound before any read", async () => {
    m.requireRealPlanRow.mockRejectedValue(nf());
    await expect(loadItemForMcp("i1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(m.itemFindFirst).not.toHaveBeenCalled();
  });
});

describe("loadTransportForMcp", () => {
  it("returns the leg's get_trip_plan slice, each end in its own zone, with its Costs", async () => {
    m.tripFindUnique.mockResolvedValue({ homeTimezone: "Australia/Sydney" });
    m.transportFindUnique.mockResolvedValue({
      id: "t1", mode: "FLIGHT", fromStopId: null, toStopId: "s1", depIsHome: true, arrIsHome: false,
      depPlace: null, arrPlace: null, depAt: new Date("2027-05-31T22:00:00Z"), arrAt: new Date("2027-06-01T10:00:00Z"),
      reference: "QF1", notes: null,
    });
    m.stopFindMany.mockResolvedValue([{ id: "s1", name: "Porto", timezone: "Europe/Lisbon" }]);
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map() });
    const out = await loadTransportForMcp("t1");
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("transport", "t1");
    expect(out).toMatchObject({
      id: "t1", from: { home: true }, to: { stopId: "s1", name: "Porto" },
      departs: { localTime: "08:00" }, arrives: { localTime: "11:00" }, reference: "QF1", files: [], costs: [cost],
    });
  });
});

describe("loadAccommodationForMcp", () => {
  it("returns the stay's get_trip_plan slice plus its Stop and Costs, Surprise fragment applied", async () => {
    m.accommodationFindFirst.mockResolvedValue({
      id: "a1", stopId: "s1", name: "Casa", address: null, checkIn: "2027-06-01", checkOut: "2027-06-04", confirmation: "X1", notes: null,
    });
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map() });
    const out = await loadAccommodationForMcp("a1");
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("accommodation", "a1");
    expect(out).toEqual({
      id: "a1", name: "Casa", address: null, checkIn: "2027-06-01", checkOut: "2027-06-04", confirmation: "X1", notes: null,
      files: [], stopId: "s1", costs: [cost],
    });
  });

  it("is notFound when the visibility fragment filters it out", async () => {
    m.accommodationFindFirst.mockResolvedValue(null);
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map() });
    await expect(loadAccommodationForMcp("a1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});

describe("loadChapterForMcp / loadTripSummaryForMcp", () => {
  it("reads one real-plan Chapter in get_trip_plan's chapters shape", async () => {
    m.chapterFindUnique.mockResolvedValue({ id: "ch1", name: "Portugal", startDate: null, endDate: null });
    expect(await loadChapterForMcp("ch1")).toEqual({ id: "ch1", name: "Portugal", startDate: null, endDate: null });
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("chapter", "ch1");
  });

  it("reads the Trip as get_trip_plan's trip, with the Trip's own files", async () => {
    m.tripFindUnique.mockResolvedValue({
      name: "Europe", startDate: "2027-06-01", endDate: "2027-06-07", hardEndDate: null, homeCurrency: "AUD",
      homeName: "Brisbane", homeTimezone: "Australia/Brisbane", roundTrip: true,
    });
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map([["TRIP:trip-1", [file]]]) });
    const out = await loadTripSummaryForMcp("trip-1");
    expect(m.requireTripAccess).toHaveBeenCalledWith("trip-1");
    expect(m.loadTripAttachments).toHaveBeenCalledWith("trip-1", NO_SURPRISES, { tripFiles: true });
    expect(out).toEqual({
      id: "trip-1", name: "Europe", startDate: "2027-06-01", endDate: "2027-06-07", hardEndDate: null, homeCurrency: "AUD",
      homeBase: "Brisbane", homeTimezone: "Australia/Brisbane", roundTrip: true, files: [file],
    });
  });
});

describe("readMcpStops / loadStopForMcp", () => {
  const porto = {
    id: "s1", name: "Porto", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04",
    nights: null, pinned: false, chapterId: null, notes: "Port lodges", sortOrder: 0,
    accommodations: [{ id: "a1", name: "Casa", address: null, checkIn: "2027-06-01", checkOut: "2027-06-04", confirmation: null, notes: null }],
  };
  beforeEach(() => {
    // stop.findMany: the Stops asked for (selects accommodations) vs the neighbours that title their days.
    m.stopFindMany.mockImplementation(async (args: { select: Record<string, unknown> }) =>
      "accommodations" in args.select ? [porto] : [{ id: "s1", arriveDate: "2027-06-01", departDate: "2027-06-04" }, { id: "s2", arriveDate: "2027-06-04", departDate: "2027-06-06" }],
    );
    // item.findMany: things to do (date null) vs the dated Items in the Stops' ranges.
    m.itemFindMany.mockImplementation(async (args: { where: { date?: unknown } }) =>
      args.where.date === null
        ? [{ id: "t1", title: "Port tasting", category: "FOOD", startTime: null, endTime: null, address: null, link: null, booking: null, notes: null, stopId: "s1" }]
        : [{ id: "c1", title: "Train", category: "GETTING_AROUND", date: "2027-06-04", startTime: "09:00", endTime: null, address: null, link: null, booking: null, notes: null, stopId: null }],
    );
    m.loadDayTitles.mockResolvedValue(new Map([["2027-06-04", { title: "Changeover", stopId: "s2" }]]));
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map() });
  });

  it("builds the Stop with its Accommodation, things to do and days, titles resolved across overlapping neighbours", async () => {
    const stop = await loadStopForMcp("s1");
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("stop", "s1");
    expect(m.loadDayTitles).toHaveBeenCalledWith([
      { id: "s1", arriveDate: "2027-06-01", departDate: "2027-06-04" },
      { id: "s2", arriveDate: "2027-06-04", departDate: "2027-06-06" },
    ]);
    expect(stop).toMatchObject({
      id: "s1", rough: false, notes: "Port lodges",
      accommodations: [expect.objectContaining({ id: "a1", files: [] })],
      thingsToDo: [expect.objectContaining({ id: "t1" })],
    });
    expect(stop.days.map((d) => d.date)).toEqual(["2027-06-01", "2027-06-02", "2027-06-03", "2027-06-04"]);
    expect(stop.days[3]).toMatchObject({ dayTitle: "Changeover", items: [expect.objectContaining({ id: "c1" })] });
  });

  it("readMcpStops shows a hidden Surprise Stop as its shell — no days, notes blanked — without refusing", async () => {
    m.loadSurpriseVisibility.mockResolvedValue({
      ...NO_SURPRISES, isEmpty: false, hiddenStopIds: ["s1"],
      views: { stops: new Map([["s1", { plannerName: "Cam", forNames: ["Alex"], youAreSurprised: true }]]), items: new Map() },
    });
    const [shell] = await readMcpStops("trip-1", ["s1"]);
    expect(shell).toMatchObject({ id: "s1", arriveDate: "2027-06-01", notes: null, days: [], surprise: { youAreSurprised: true } });
    expect(m.requireRealPlanRow).not.toHaveBeenCalled();
  });

  it("readMcpStops of no ids reads nothing", async () => {
    expect(await readMcpStops("trip-1", [])).toEqual([]);
    expect(m.stopFindMany).not.toHaveBeenCalled();
  });

  it("loadStopForMcp on a refused id is notFound before any read", async () => {
    m.requireRealPlanRow.mockRejectedValue(nf());
    await expect(loadStopForMcp("s1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(m.stopFindMany).not.toHaveBeenCalled();
  });
});
