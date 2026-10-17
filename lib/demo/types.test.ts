import { describe, it, expect } from "vitest";
import {
  toFlagStop,
  toProjectionStop,
  planFlagInput,
  demoLegAnchorKeys,
  demoTripToggles,
  demoBookingColumns,
  type DemoStop,
  type DemoPlan,
  type DemoTransport,
  type DemoTrip,
} from "./types";

const scheduled: DemoStop = {
  key: "s1", name: "Paris", country: "France", countryCode: "fr",
  lat: 48.85, lng: 2.35, timezone: "Europe/Paris",
  arriveDate: "2026-12-29", departDate: "2027-01-03", sortOrder: 0,
};
const rough: DemoStop = { key: "s2", name: "Lucerne", countryCode: "ch", nights: 3, sortOrder: 1 };

describe("demo adapters", () => {
  it("maps a scheduled stop to a FlagStop", () => {
    expect(toFlagStop(scheduled)).toMatchObject({ id: "s1", arriveDate: "2026-12-29", timezone: "Europe/Paris" });
  });
  it("excludes rough stops from FlagStop (returns null)", () => {
    expect(toFlagStop(rough)).toBeNull();
  });
  it("maps any stop to a ProjectionStop (rough included)", () => {
    expect(toProjectionStop(rough)).toEqual({ id: "s2", arriveDate: null, departDate: null, nights: 3, pinned: false, sortOrder: 1 });
  });
  it("planFlagInput assembles a DetectFlagsInput with only scheduled stops", () => {
    const plan: DemoPlan = { stops: [scheduled, rough], chapters: [], transports: [], accommodations: [], items: [], costs: [] };
    const input = planFlagInput(plan, { tripStart: "2026-12-29", tripEnd: "2027-01-03" });
    expect(input.stops).toHaveLength(1);
    expect(input.stops[0].id).toBe("s1");
    expect(input.roughStopCount).toBe(1);
  });
});

describe("demoLegAnchorKeys (spec 2026-10-04 §D)", () => {
  it("gives each leg the stop key of the slot it resolves to in plan order; the head is null", () => {
    // sortOrder: Paris, Lucerne (rough), Rome — but Rome's dates come first,
    // so plan order is Rome, Lucerne, Paris (ADR 0038).
    const rome: DemoStop = { key: "s3", name: "Rome", arriveDate: "2026-12-20", departDate: "2026-12-24", sortOrder: 2 };
    const leg = (key: string, o: Partial<DemoTransport>): DemoTransport => ({ key, mode: "TRAIN", sortOrder: 0, ...o });
    const keys = demoLegAnchorKeys({
      stops: [scheduled, rough, rome],
      transports: [
        leg("t1", { fromStopKey: "s1" }),                        // leaves Paris
        leg("t2", { depPlace: "Zürich", toStopKey: "s1" }),      // arrives at Paris → after Lucerne
        leg("t3", { depIsHome: true, toStopKey: "s3" }),         // arrives at the first Stop → head
        leg("t4", { depPlace: "A", arrPlace: "B" }),             // no Stop at all → head
      ],
    });
    expect([...keys]).toEqual([["t1", "s1"], ["t2", "s2"], ["t3", null], ["t4", null]]);
  });
});

describe("demoTripToggles", () => {
  it("is off when the trip ships neither", () => {
    expect(demoTripToggles({ chapters: [], forks: [] })).toEqual({ forksEnabled: false, chaptersEnabled: false });
    expect(demoTripToggles({ chapters: [] })).toEqual({ forksEnabled: false, chaptersEnabled: false });
  });

  it("switches on what the trip ships", () => {
    const fork = { chapters: [] } as unknown as NonNullable<DemoTrip["forks"]>[number];
    const chapter = {} as DemoTrip["chapters"][number];
    expect(demoTripToggles({ chapters: [chapter], forks: [] })).toEqual({ forksEnabled: false, chaptersEnabled: true });
    expect(demoTripToggles({ chapters: [], forks: [fork] })).toEqual({ forksEnabled: true, chaptersEnabled: false });
  });
});

describe("demoBookingColumns (CONTEXT.md Booking state; spec 2026-10-17 R2)", () => {
  it("derives the state from the reference, as every writer stores it", () => {
    expect(demoBookingColumns("TRANSPORT", {}, "Blue Mountains Line")).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    expect(demoBookingColumns("TRANSPORT", {}, null)).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
    expect(demoBookingColumns("ACCOMMODATION", {}, "HM-44821")).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    expect(demoBookingColumns("ITEM", {}, null)).toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
  });
  it("a chosen state wins, and keeps its book-by date only while To book", () => {
    expect(demoBookingColumns("ITEM", { bookingState: "TO_BOOK", bookBy: "2026-07-20" }, null)).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-07-20" });
    expect(demoBookingColumns("ITEM", { bookingState: "BOOKED", bookBy: "2026-07-20" }, null)).toEqual({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
  });
});
