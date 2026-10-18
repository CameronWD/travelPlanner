import { describe, expect, it } from "vitest";
import { withOpeningHours } from "@/lib/opening-hours-stored";
import { serializeOpeningHours } from "@/lib/validations/opening-hours";
import { withTryList } from "@/lib/try-list-stored";
import type { HoursSpan, OpeningHours } from "@/lib/opening-hours";
import type { SurpriseView } from "@/lib/surprise";
import {
  buildMcpStops,
  owningStopRef,
  toMcpItem,
  toMcpTransport,
  withPlaceholders,
  type McpItemRow,
  type McpStopRow,
} from "./plan-shapes";

const noFiles = () => [];
const stop = (o: Partial<McpStopRow> = {}): McpStopRow => ({
  id: "s1", name: "Porto", countryCode: "pt", timezone: "Europe/Lisbon",
  arriveDate: "2027-06-01", departDate: "2027-06-04", nights: null, pinned: false,
  chapterId: null, notes: "Port lodges", sortOrder: 0, accommodations: [], surprise: null, ...o,
});
const item = (o: Partial<McpItemRow> = {}): McpItemRow => ({
  id: "i1", title: "Tour", category: "ACTIVITY", date: null, startTime: null, endTime: null,
  address: null, link: null, booking: null, notes: null, stopId: null, bookingState: "NONE", bookBy: null,
  openingHours: null, tryList: null, ...o,
});
const surpriseView = { plannerName: "Cam", forNames: ["Alex"], youAreSurprised: true } as never;
// Fix round 1 (controller ruling): `toMcpItem` and `buildMcpStops`'s
// `datedItems` now take rows whose `openingHours` and `tryList` have already
// been parsed at the row edge (`withOpeningHours`, `withTryList`), same as
// production (`withPlaceholders`, `loadItemForMcp`) — never a raw string
// wearing the parsed type.
const datedItem = (o: Partial<McpItemRow> = {}, surprise: SurpriseView | null = null) => ({ ...withTryList(withOpeningHours(item(o))), surprise });

describe("buildMcpStops", () => {
  it("puts a Changeover day's Item under both Stops, each day titled once, and reports it covered", () => {
    const { stops, coveredItemIds } = buildMcpStops({
      stops: [stop(), stop({ id: "s2", name: "Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-06", sortOrder: 1 })],
      thingsToDo: [item({ id: "t1", stopId: "s1" })],
      datedItems: [
        datedItem({ id: "c1", date: "2027-06-04", startTime: "09:00" }),
        datedItem({ id: "far", date: "2027-07-01" }),
      ],
      dayTitles: new Map([["2027-06-04", { title: "Changeover", stopId: "s2" }]]),
      hiddenStopIds: new Set(),
      itemView: () => null,
      filesFor: noFiles,
      stopNameById: new Map(),
    });
    expect(stops[0].days.at(-1)).toMatchObject({ date: "2027-06-04", dayTitle: "Changeover", items: [expect.objectContaining({ id: "c1" })] });
    expect(stops[1].days[0]).toMatchObject({ date: "2027-06-04", dayTitle: "Changeover", items: [expect.objectContaining({ id: "c1" })] });
    expect(stops[0].thingsToDo.map((t) => t.id)).toEqual(["t1"]);
    expect([...coveredItemIds]).toEqual(["c1"]);
  });

  it("keeps a hidden Surprise Stop's shell: rough false, dates kept, no days", () => {
    const { stops } = buildMcpStops({
      stops: [stop({ notes: null, surprise: surpriseView })],
      thingsToDo: [], datedItems: [datedItem({ id: "c1", date: "2027-06-02" })],
      dayTitles: new Map(), hiddenStopIds: new Set(["s1"]), itemView: () => null, filesFor: noFiles,
      stopNameById: new Map(),
    });
    expect(stops[0]).toMatchObject({ rough: false, arriveDate: "2027-06-01", days: [], notes: null, surprise: { youAreSurprised: true } });
  });

  it("a rough Stop has rough true and no days", () => {
    const { stops } = buildMcpStops({
      stops: [stop({ arriveDate: null, departDate: null, nights: 3 })],
      thingsToDo: [], datedItems: [], dayTitles: new Map(), hiddenStopIds: new Set(), itemView: () => null, filesFor: noFiles,
      stopNameById: new Map(),
    });
    expect(stops[0]).toMatchObject({ rough: true, nights: 3, days: [] });
  });

  // Task D.13 (CONTEXT.md "Changeover day", ADR 0049, R5).
  it("on a Changeover day each Stop lists the Item with its one owning Stop (ADR 0049)", () => {
    const { stops } = buildMcpStops({
      stops: [stop(), stop({ id: "s2", name: "Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-06", sortOrder: 1 })],
      thingsToDo: [],
      datedItems: [
        datedItem({ id: "lunch", date: "2027-06-04", startTime: "12:00", stopId: "s1" }),
        datedItem({ id: "train", date: "2027-06-04", startTime: "09:00" }),
      ],
      dayTitles: new Map(), hiddenStopIds: new Set(), itemView: () => null, filesFor: noFiles,
      stopNameById: new Map([["s1", "Porto"], ["s2", "Lisbon"]]),
    });
    const owners = (items: { id: string; owningStop: unknown }[]) => Object.fromEntries(items.map((i) => [i.id, i.owningStop]));
    expect(owners(stops[0].days.at(-1)!.items)).toEqual({ train: null, lunch: { id: "s1", name: "Porto" } });
    expect(owners(stops[1].days[0].items)).toEqual({ train: null, lunch: { id: "s1", name: "Porto" } });
  });
});

const placeholder = (o: { id?: string; forkId?: string | null } = {}) => ({
  id: "p1", tripId: "t", forkId: null, stopId: "s1", date: "2027-06-01", startTime: "19:00", endTime: null,
  title: "Surprise" as const, category: "OTHER" as const, address: null, link: null, booking: null, notes: null,
  lat: null, lng: null, countryCode: null, hiddenFromShares: false, sortOrder: 0, photoAttachmentId: null,
  sourceItemId: null, bookingState: "NONE" as const, bookingStateSet: false as const, bookBy: null,
  slotTime: null, arriveByMinutes: null, refundable: null, openingHours: null, tryList: null, surprise: surpriseView,
  ...o,
});

describe("withPlaceholders", () => {
  it("adds a hidden real-plan Item as a 'Surprise' placeholder on its date, sorted by date", () => {
    const out = withPlaceholders([item({ id: "i2", date: "2027-06-02" })], {
      placeholderItems: [placeholder(), placeholder({ id: "p2", forkId: "f1" })],
      views: { stops: new Map(), items: new Map() },
    });
    expect(out.map((i) => [i.id, i.title])).toEqual([["p1", "Surprise"], ["i2", "Tour"]]);
  });
});

// Task D.11 (CONTEXT.md "Opening hours"). The brief's fixture used the
// Section D brief's assumed shape (weekly/closedDates, numeric weekday keys);
// d-as-built.md is authoritative, so this uses S's actual vocabulary instead:
// `week` keyed sun..sat (absent = not known, [] = closed) and `closed`.
describe("opening hours (CONTEXT.md Opening hours)", () => {
  const span: HoursSpan[] = [["10:00", "18:00"]];
  const hours: OpeningHours = { week: { sun: [], mon: span, tue: span, wed: span, thu: span, fri: span, sat: span }, seasons: [], closed: [] };

  // Fix round 1 (controller ruling): goes through the real stored-string
  // path end to end — `item()`'s `openingHours` is the column (a JSON
  // string, or null/unreadable text), never an already-parsed object.
  it("a thing to do and a day item read the stored hours; a bad stored value reads as none", () => {
    const { stops } = buildMcpStops({
      stops: [stop()],
      thingsToDo: [item({ id: "t1", stopId: "s1", openingHours: serializeOpeningHours(hours) })],
      datedItems: [datedItem({ id: "d1", date: "2027-06-02", openingHours: '{"week":"?"}' })],
      dayTitles: new Map(), hiddenStopIds: new Set(), itemView: () => null, filesFor: noFiles,
      stopNameById: new Map(),
    });
    expect(stops[0].thingsToDo[0].openingHours).toEqual(hours);
    expect(stops[0].days.find((d) => d.date === "2027-06-02")!.items[0].openingHours).toBeNull();
  });

  it("a hidden Surprise's placeholder never carries hours", () => {
    const out = withPlaceholders([], {
      placeholderItems: [placeholder()],
      views: { stops: new Map(), items: new Map() },
    });
    expect(out[0].openingHours).toBeNull();
  });
});

describe("toMcpItem / toMcpTransport", () => {
  it("toMcpItem carries the date and owning Stop alongside the day-item fields", () => {
    expect(
      toMcpItem(datedItem({ id: "i1", date: "2027-06-02", stopId: "s1" }), noFiles, new Map([["s1", "Porto"]])),
    ).toEqual({
      id: "i1", title: "Tour", category: "ACTIVITY", startTime: null, endTime: null, address: null, link: null,
      booking: null, notes: null, files: [], surprise: null, date: "2027-06-02", stopId: "s1",
      bookingState: "NONE", bookBy: null, slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN",
      openingHours: null, tryList: null, owningStop: { id: "s1", name: "Porto" },
    });
  });

  it("every shape carries Booking state; a placeholder is never To book", () => {
    expect(toMcpItem(datedItem({ id: "i1", date: "2027-06-02", stopId: "s1", bookingState: "TO_BOOK", bookBy: "2027-05-01" }), noFiles, new Map()))
      .toMatchObject({ bookingState: "TO_BOOK", bookBy: "2027-05-01" });
    const [p] = withPlaceholders([], { views: { stops: new Map(), items: new Map() }, placeholderItems: [placeholder({ id: "p1" })] });
    expect(p).toMatchObject({ bookingState: "NONE", bookBy: null });
  });

  it("owningStopRef is null with no Stop", () => {
    expect(owningStopRef(null, new Map())).toBeNull();
  });

  // Fix round 1 (controller ruling): no invented prose when a name is missing.
  it("owningStopRef is null, not invented prose, when the stopId has no entry in names", () => {
    expect(owningStopRef("s9", new Map())).toBeNull();
  });

  it("toMcpTransport reads a Home end in the Home timezone and a Stop end in the Stop's", () => {
    const t = toMcpTransport(
      {
        id: "t1", mode: "FLIGHT", fromStopId: null, toStopId: "s1", depIsHome: true, arrIsHome: false,
        depPlace: null, arrPlace: null, depAt: new Date("2027-05-31T22:00:00Z"), arrAt: new Date("2027-06-01T10:00:00Z"),
        reference: "QF1", notes: null, bookingState: "TO_BOOK", bookBy: "2027-05-01",
      },
      { stopNameById: new Map([["s1", "Porto"]]), tzById: new Map([["s1", "Europe/Lisbon"]]), homeTimezone: "Australia/Sydney", filesFor: noFiles },
    );
    expect(t.from).toEqual({ home: true });
    expect(t.to).toEqual({ stopId: "s1", name: "Porto" });
    expect(t.departs).toMatchObject({ localTime: "08:00", localDate: "2027-06-01" });
    expect(t.arrives).toMatchObject({ localTime: "11:00", localDate: "2027-06-01" });
    expect(t).toMatchObject({ bookingState: "TO_BOOK", bookBy: "2027-05-01" });
  });
});

describe("Slot time in the Claude reads (R3)", () => {
  it("a thing to do and a day item read the slot, the margin and refundability", () => {
    const row = datedItem({ id: "i1", date: "2027-06-02", startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: false });
    expect(toMcpItem(row, noFiles, new Map())).toMatchObject({ startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" });
    const { stops } = buildMcpStops({
      stops: [stop()], thingsToDo: [item({ id: "t1", stopId: "s1", slotTime: "19:30", refundable: true })], datedItems: [],
      dayTitles: new Map(), hiddenStopIds: new Set(), itemView: () => null, filesFor: noFiles,
      stopNameById: new Map(),
    });
    expect(stops[0].thingsToDo[0]).toMatchObject({ slotTime: "19:30", arriveByMinutes: null, refundable: "YES" });
  });
  it("a row read without the columns says none / UNKNOWN", () => {
    expect(toMcpItem(datedItem(), noFiles, new Map())).toMatchObject({ slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN" });
  });
});

describe("Try list (CONTEXT.md Try list)", () => {
  const list = [{ id: "e1", text: "Francesinha", tried: true }];

  it("a thing to do and a day item read the stored list; an unreadable one reads as none", () => {
    const { stops } = buildMcpStops({
      stops: [stop()],
      thingsToDo: [item({ id: "t1", stopId: "s1", tryList: JSON.stringify(list) })],
      datedItems: [datedItem({ id: "d1", date: "2027-06-02", tryList: "nope" })],
      dayTitles: new Map(), hiddenStopIds: new Set(), itemView: () => null, filesFor: noFiles,
      stopNameById: new Map(),
    });
    expect(stops[0].thingsToDo[0].tryList).toEqual(list);
    expect(stops[0].days.find((d) => d.date === "2027-06-02")!.items[0].tryList).toBeNull();
  });

  it("toMcpItem carries it; a hidden Surprise's placeholder never does", () => {
    expect(toMcpItem(datedItem({ id: "i1", date: "2027-06-02", tryList: JSON.stringify(list) }), noFiles, new Map()).tryList).toEqual(list);
    const out = withPlaceholders([], { placeholderItems: [placeholder()], views: { stops: new Map(), items: new Map() } });
    expect(out[0].tryList).toBeNull();
  });
});
