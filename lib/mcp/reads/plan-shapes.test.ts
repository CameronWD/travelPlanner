import { describe, expect, it } from "vitest";
import {
  buildMcpStops,
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
  address: null, link: null, booking: null, notes: null, stopId: null, ...o,
});
const surpriseView = { plannerName: "Cam", forNames: ["Alex"], youAreSurprised: true } as never;

describe("buildMcpStops", () => {
  it("puts a Changeover day's Item under both Stops, each day titled once, and reports it covered", () => {
    const { stops, coveredItemIds } = buildMcpStops({
      stops: [stop(), stop({ id: "s2", name: "Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-06", sortOrder: 1 })],
      thingsToDo: [item({ id: "t1", stopId: "s1" })],
      datedItems: [
        { ...item({ id: "c1", date: "2027-06-04", startTime: "09:00" }), surprise: null },
        { ...item({ id: "far", date: "2027-07-01" }), surprise: null },
      ],
      dayTitles: new Map([["2027-06-04", { title: "Changeover", stopId: "s2" }]]),
      hiddenStopIds: new Set(),
      itemView: () => null,
      filesFor: noFiles,
    });
    expect(stops[0].days.at(-1)).toMatchObject({ date: "2027-06-04", dayTitle: "Changeover", items: [expect.objectContaining({ id: "c1" })] });
    expect(stops[1].days[0]).toMatchObject({ date: "2027-06-04", dayTitle: "Changeover", items: [expect.objectContaining({ id: "c1" })] });
    expect(stops[0].thingsToDo.map((t) => t.id)).toEqual(["t1"]);
    expect([...coveredItemIds]).toEqual(["c1"]);
  });

  it("keeps a hidden Surprise Stop's shell: rough false, dates kept, no days", () => {
    const { stops } = buildMcpStops({
      stops: [stop({ notes: null, surprise: surpriseView })],
      thingsToDo: [], datedItems: [{ ...item({ id: "c1", date: "2027-06-02" }), surprise: null }],
      dayTitles: new Map(), hiddenStopIds: new Set(["s1"]), itemView: () => null, filesFor: noFiles,
    });
    expect(stops[0]).toMatchObject({ rough: false, arriveDate: "2027-06-01", days: [], notes: null, surprise: { youAreSurprised: true } });
  });

  it("a rough Stop has rough true and no days", () => {
    const { stops } = buildMcpStops({
      stops: [stop({ arriveDate: null, departDate: null, nights: 3 })],
      thingsToDo: [], datedItems: [], dayTitles: new Map(), hiddenStopIds: new Set(), itemView: () => null, filesFor: noFiles,
    });
    expect(stops[0]).toMatchObject({ rough: true, nights: 3, days: [] });
  });
});

describe("withPlaceholders", () => {
  it("adds a hidden real-plan Item as a 'Surprise' placeholder on its date, sorted by date", () => {
    const placeholder = {
      id: "p1", tripId: "t", forkId: null, stopId: "s1", date: "2027-06-01", startTime: "19:00", endTime: null,
      title: "Surprise" as const, category: "OTHER" as const, address: null, link: null, booking: null, notes: null,
      lat: null, lng: null, countryCode: null, hiddenFromShares: false, sortOrder: 0, photoAttachmentId: null,
      sourceItemId: null, bookingState: "NONE" as const, bookingStateSet: false as const, bookBy: null,
      slotTime: null, arriveByMinutes: null, refundable: null, openingHours: null, surprise: surpriseView,
    };
    const forkPlaceholder = { ...placeholder, id: "p2", forkId: "f1" };
    const out = withPlaceholders([item({ id: "i2", date: "2027-06-02" })], {
      placeholderItems: [placeholder, forkPlaceholder],
      views: { stops: new Map(), items: new Map() },
    });
    expect(out.map((i) => [i.id, i.title])).toEqual([["p1", "Surprise"], ["i2", "Tour"]]);
  });
});

describe("toMcpItem / toMcpTransport", () => {
  it("toMcpItem carries the date and owning Stop alongside the day-item fields", () => {
    expect(toMcpItem({ ...item({ id: "i1", date: "2027-06-02", stopId: "s1" }), surprise: null }, noFiles)).toEqual({
      id: "i1", title: "Tour", category: "ACTIVITY", startTime: null, endTime: null, address: null, link: null,
      booking: null, notes: null, files: [], surprise: null, date: "2027-06-02", stopId: "s1",
    });
  });

  it("toMcpTransport reads a Home end in the Home timezone and a Stop end in the Stop's", () => {
    const t = toMcpTransport(
      {
        id: "t1", mode: "FLIGHT", fromStopId: null, toStopId: "s1", depIsHome: true, arrIsHome: false,
        depPlace: null, arrPlace: null, depAt: new Date("2027-05-31T22:00:00Z"), arrAt: new Date("2027-06-01T10:00:00Z"),
        reference: "QF1", notes: null,
      },
      { stopNameById: new Map([["s1", "Porto"]]), tzById: new Map([["s1", "Europe/Lisbon"]]), homeTimezone: "Australia/Sydney", filesFor: noFiles },
    );
    expect(t.from).toEqual({ home: true });
    expect(t.to).toEqual({ stopId: "s1", name: "Porto" });
    expect(t.departs).toMatchObject({ localTime: "08:00", localDate: "2027-06-01" });
    expect(t.arrives).toMatchObject({ localTime: "11:00", localDate: "2027-06-01" });
  });
});
