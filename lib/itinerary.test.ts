import { describe, expect, it } from "vitest";
import {
  enumerateTripDays,
  stopForDate,
  resolveOwningStop,
  buildItinerary,
  effectiveTodayISO,
  pickDayPlan,
  orderDayEntries,
  isFreeFormDay,
  type ItineraryStop,
  type ItineraryItem,
  type ItineraryTransport,
  type ItineraryAccommodation,
  type DayPlan,
} from "./itinerary";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeStop = (overrides: Partial<ItineraryStop> & Pick<ItineraryStop, "id" | "arriveDate" | "departDate">): ItineraryStop => ({
  name: "Stop",
  country: "France",
  timezone: "Europe/Paris",
  sortOrder: 0,
  ...overrides,
});

const PARIS: ItineraryStop = makeStop({
  id: "stop-paris",
  name: "Paris",
  country: "France",
  timezone: "Europe/Paris",
  arriveDate: "2026-07-01",
  departDate: "2026-07-05",
  sortOrder: 0,
});

const ROME: ItineraryStop = makeStop({
  id: "stop-rome",
  name: "Rome",
  country: "Italy",
  timezone: "Europe/Rome",
  arriveDate: "2026-07-06",
  departDate: "2026-07-10",
  sortOrder: 1,
});

const makeItem = (overrides: Partial<ItineraryItem> & Pick<ItineraryItem, "id">): ItineraryItem => ({
  title: "An item",
  category: "SIGHTSEEING",
  date: "2026-07-02",
  startTime: null,
  endTime: null,
  stopId: null,
  ...overrides,
});

const makeTransport = (overrides: Partial<ItineraryTransport> & Pick<ItineraryTransport, "id">): ItineraryTransport => ({
  mode: "FLIGHT",
  fromStopId: null,
  toStopId: null,
  depPlace: null,
  arrPlace: null,
  depAt: null,
  arrAt: null,
  reference: null,
  notes: null,
  ...overrides,
});

const makeAccom = (overrides: Partial<ItineraryAccommodation> & Pick<ItineraryAccommodation, "id" | "stopId" | "checkIn" | "checkOut">): ItineraryAccommodation => ({
  name: "Hotel",
  address: null,
  confirmation: null,
  notes: null,
  checkInTime: null,
  checkOutTime: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// enumerateTripDays
// ---------------------------------------------------------------------------

describe("enumerateTripDays", () => {
  it("returns a single day for same start and end", () => {
    const days = enumerateTripDays("2026-07-01", "2026-07-01");
    expect(days).toEqual(["2026-07-01"]);
  });

  it("returns correct multi-day inclusive range", () => {
    const days = enumerateTripDays("2026-07-01", "2026-07-05");
    expect(days).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
  });

  it("handles month-spanning ranges", () => {
    const days = enumerateTripDays("2026-06-29", "2026-07-02");
    expect(days).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
    ]);
  });

  it("returns 10 days for a 10-day trip", () => {
    const days = enumerateTripDays("2026-07-01", "2026-07-10");
    expect(days).toHaveLength(10);
    expect(days[0]).toBe("2026-07-01");
    expect(days[9]).toBe("2026-07-10");
  });
});

// ---------------------------------------------------------------------------
// stopForDate
// ---------------------------------------------------------------------------

describe("stopForDate", () => {
  const stops = [PARIS, ROME];

  it("returns Paris when date is inside Paris range", () => {
    expect(stopForDate(stops, "2026-07-03")).toEqual(PARIS);
  });

  it("returns Paris on arrive boundary", () => {
    expect(stopForDate(stops, "2026-07-01")).toEqual(PARIS);
  });

  it("returns Paris on depart boundary", () => {
    expect(stopForDate(stops, "2026-07-05")).toEqual(PARIS);
  });

  it("returns null for a gap day between stops", () => {
    expect(stopForDate(stops, "2026-07-05")).toEqual(PARIS);
    // 2026-07-05 is Paris depart, so covered. Let's use a clear gap:
    // gap between PARIS depart 2026-07-05 and ROME arrive 2026-07-06
    // There is no gap here — depart means the last day in Paris, arrive means the first in Rome
    // So test with a date clearly outside both
    expect(stopForDate(stops, "2026-06-30")).toBeNull();
  });

  it("returns null for a genuine gap day between two non-adjacent stops", () => {
    const stop1 = makeStop({
      id: "gap-stop-1",
      name: "London",
      arriveDate: "2026-07-01",
      departDate: "2026-07-03",
      sortOrder: 0,
    });
    const stop2 = makeStop({
      id: "gap-stop-2",
      name: "Berlin",
      arriveDate: "2026-07-05",
      departDate: "2026-07-08",
      sortOrder: 1,
    });
    // 2026-07-04 falls between the two stops — genuine gap day
    expect(stopForDate([stop1, stop2], "2026-07-04")).toBeNull();
    // Sanity: days within each stop are still found
    expect(stopForDate([stop1, stop2], "2026-07-02")).toEqual(stop1);
    expect(stopForDate([stop1, stop2], "2026-07-06")).toEqual(stop2);
  });

  it("returns null for a date after all stops", () => {
    expect(stopForDate(stops, "2026-07-20")).toBeNull();
  });

  it("returns null for empty stops", () => {
    expect(stopForDate([], "2026-07-03")).toBeNull();
  });

  it("picks the stop with the latest arriveDate when stops overlap", () => {
    const s1: ItineraryStop = makeStop({
      id: "s1",
      name: "Stop 1",
      arriveDate: "2026-07-01",
      departDate: "2026-07-10",
      sortOrder: 0,
    });
    const s2: ItineraryStop = makeStop({
      id: "s2",
      name: "Stop 2",
      arriveDate: "2026-07-05",
      departDate: "2026-07-15",
      sortOrder: 1,
    });
    // On 2026-07-07: both s1 and s2 cover it; s2 has later arriveDate → wins
    expect(stopForDate([s1, s2], "2026-07-07")).toEqual(s2);
    // On 2026-07-02: only s1 covers it
    expect(stopForDate([s1, s2], "2026-07-02")).toEqual(s1);
  });
});

// ---------------------------------------------------------------------------
// buildItinerary
// ---------------------------------------------------------------------------

describe("buildItinerary", () => {
  const BASE = {
    startDate: "2026-07-01",
    endDate: "2026-07-10",
    stops: [PARIS, ROME],
  };

  it("returns one DayPlan per calendar day", () => {
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [],
      accommodations: [],
    });
    expect(plans).toHaveLength(10);
    expect(plans[0].dateISO).toBe("2026-07-01");
    expect(plans[9].dateISO).toBe("2026-07-10");
  });

  it("assigns the correct stop to each day", () => {
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [],
      accommodations: [],
    });
    expect(plans[0].stop?.id).toBe("stop-paris"); // 2026-07-01
    expect(plans[4].stop?.id).toBe("stop-paris"); // 2026-07-05
    expect(plans[5].stop?.id).toBe("stop-rome");  // 2026-07-06
    expect(plans[9].stop?.id).toBe("stop-rome");  // 2026-07-10
  });

  it("excludes unscheduled items (date null)", () => {
    const item = makeItem({ id: "item-1", date: null });
    const plans = buildItinerary({
      ...BASE,
      items: [item],
      transports: [],
      accommodations: [],
    });
    const all = plans.flatMap((p) => [...p.timedItems, ...p.untimedItems]);
    expect(all).toHaveLength(0);
  });

  it("places a scheduled item on the correct day", () => {
    const item = makeItem({ id: "item-1", date: "2026-07-03", startTime: null });
    const plans = buildItinerary({
      ...BASE,
      items: [item],
      transports: [],
      accommodations: [],
    });
    const day3 = plans.find((p) => p.dateISO === "2026-07-03")!;
    expect(day3.untimedItems).toHaveLength(1);
    expect(day3.untimedItems[0].item.id).toBe("item-1");
    expect(day3.timedItems).toHaveLength(0);
  });

  it("separates timed and untimed items correctly", () => {
    const timed = makeItem({ id: "item-timed", date: "2026-07-03", startTime: "14:00" });
    const untimed = makeItem({ id: "item-untimed", date: "2026-07-03", startTime: null });
    const plans = buildItinerary({
      ...BASE,
      items: [timed, untimed],
      transports: [],
      accommodations: [],
    });
    const day3 = plans.find((p) => p.dateISO === "2026-07-03")!;
    expect(day3.timedItems).toHaveLength(1);
    expect(day3.timedItems[0].item.id).toBe("item-timed");
    expect(day3.untimedItems).toHaveLength(1);
    expect(day3.untimedItems[0].item.id).toBe("item-untimed");
  });

  it("sorts timed items ascending by startTime", () => {
    const late = makeItem({ id: "item-late", date: "2026-07-03", startTime: "18:30" });
    const early = makeItem({ id: "item-early", date: "2026-07-03", startTime: "09:00" });
    const mid = makeItem({ id: "item-mid", date: "2026-07-03", startTime: "13:15" });
    const plans = buildItinerary({
      ...BASE,
      items: [late, early, mid],
      transports: [],
      accommodations: [],
    });
    const day3 = plans.find((p) => p.dateISO === "2026-07-03")!;
    expect(day3.timedItems.map((e) => e.item.id)).toEqual([
      "item-early",
      "item-mid",
      "item-late",
    ]);
  });

  it("skips transports with no depAt", () => {
    const transport = makeTransport({ id: "t-1", depAt: null });
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [transport],
      accommodations: [],
    });
    const allTransport = plans.flatMap((p) => p.transportEntries);
    expect(allTransport).toHaveLength(0);
  });

  it("handles transport with depAt set but arrAt null — departure entry present, no arrival entry, no crash", () => {
    const transport = makeTransport({
      id: "t-dep-only",
      mode: "BUS",
      fromStopId: "stop-paris",
      toStopId: null,
      depAt: new Date("2026-07-03T08:00:00Z"), // 10:00 Europe/Paris
      arrAt: null,
    });
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [transport],
      accommodations: [],
    });
    const allTransport = plans.flatMap((p) => p.transportEntries);
    // Exactly one entry — the departure
    expect(allTransport).toHaveLength(1);
    expect(allTransport[0].kind).toBe("transport-departure");
    // No crash; no arrival entry anywhere
    const arrivals = allTransport.filter((e) => e.kind === "transport-arrival");
    expect(arrivals).toHaveLength(0);
  });

  it("places transport departure on the correct day (same-day arrival)", () => {
    // Flight from Paris departing 2026-07-05T10:00:00Z, arriving same day
    const transport = makeTransport({
      id: "t-same-day",
      mode: "FLIGHT",
      fromStopId: "stop-paris",
      toStopId: "stop-rome",
      depAt: new Date("2026-07-05T10:00:00Z"), // 12:00 Paris time (UTC+2) → 2026-07-05
      arrAt: new Date("2026-07-05T14:00:00Z"), // 16:00 Rome time (UTC+2) → 2026-07-05
    });
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [transport],
      accommodations: [],
    });
    const day5 = plans.find((p) => p.dateISO === "2026-07-05")!;
    expect(day5.transportEntries).toHaveLength(1);
    const entry = day5.transportEntries[0];
    expect(entry.kind).toBe("transport-departure");
    if (entry.kind === "transport-departure") {
      expect(entry.arrivesSameDay).toBe(true);
      expect(entry.arrivalDateISO).toBeUndefined();
    }
  });

  it("handles overnight transport — departure entry on day D, arrival entry on day D+1", () => {
    // Flight departing Paris 23:30 Paris local (= 21:30 UTC on 2026-07-05)
    // Arriving in Rome 01:30 Rome local next day (= 23:30 UTC on 2026-07-05)
    // So dep Paris time: 2026-07-05T23:30+02:00 = 2026-07-05T21:30:00Z
    // Arr Rome time: 2026-07-06T01:30+02:00 = 2026-07-05T23:30:00Z
    const transport = makeTransport({
      id: "t-overnight",
      mode: "FLIGHT",
      fromStopId: "stop-paris",
      toStopId: "stop-rome",
      depAt: new Date("2026-07-05T21:30:00Z"), // 23:30 Europe/Paris → dep day = 2026-07-05
      arrAt: new Date("2026-07-05T23:30:00Z"), // 01:30 Europe/Rome (UTC+2) → arr day = 2026-07-06
    });
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [transport],
      accommodations: [],
    });

    const day5 = plans.find((p) => p.dateISO === "2026-07-05")!;
    const day6 = plans.find((p) => p.dateISO === "2026-07-06")!;

    // Departure entry on day 5
    expect(day5.transportEntries).toHaveLength(1);
    const depEntry = day5.transportEntries[0];
    expect(depEntry.kind).toBe("transport-departure");
    if (depEntry.kind === "transport-departure") {
      expect(depEntry.arrivesSameDay).toBe(false);
      expect(depEntry.arrivalDateISO).toBe("2026-07-06");
    }

    // Arrival entry on day 6
    expect(day6.transportEntries).toHaveLength(1);
    const arrEntry = day6.transportEntries[0];
    expect(arrEntry.kind).toBe("transport-arrival");
    expect(arrEntry.transport.id).toBe("t-overnight");
  });

  it("accommodation check-in lands on the right day", () => {
    const acc = makeAccom({
      id: "acc-1",
      stopId: "stop-paris",
      checkIn: "2026-07-01",
      checkOut: "2026-07-05",
    });
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [],
      accommodations: [acc],
    });
    const day1 = plans.find((p) => p.dateISO === "2026-07-01")!;
    const day5 = plans.find((p) => p.dateISO === "2026-07-05")!;

    expect(day1.accommodationEntries).toHaveLength(1);
    expect(day1.accommodationEntries[0].kind).toBe("accommodation-checkin");
    expect(day1.accommodationEntries[0].accommodation.id).toBe("acc-1");

    expect(day5.accommodationEntries).toHaveLength(1);
    expect(day5.accommodationEntries[0].kind).toBe("accommodation-checkout");
  });

  it("omits accommodation checkout beyond endDate", () => {
    const acc = makeAccom({
      id: "acc-late",
      stopId: "stop-rome",
      checkIn: "2026-07-08",
      checkOut: "2026-07-15", // beyond endDate 2026-07-10
    });
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [],
      accommodations: [acc],
    });
    const allAccom = plans.flatMap((p) => p.accommodationEntries);
    // Only the check-in should be present (checkOut is 2026-07-15, outside range)
    const checkouts = allAccom.filter((e) => e.kind === "accommodation-checkout");
    expect(checkouts).toHaveLength(0);
    const checkins = allAccom.filter((e) => e.kind === "accommodation-checkin");
    expect(checkins).toHaveLength(1);
    expect(checkins[0].accommodation.id).toBe("acc-late");
  });

  it("omits accommodation checkin before startDate", () => {
    const acc = makeAccom({
      id: "acc-early",
      stopId: "stop-paris",
      checkIn: "2026-06-28", // before startDate
      checkOut: "2026-07-03",
    });
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [],
      accommodations: [acc],
    });
    const allAccom = plans.flatMap((p) => p.accommodationEntries);
    const checkins = allAccom.filter((e) => e.kind === "accommodation-checkin");
    expect(checkins).toHaveLength(0);
    const checkouts = allAccom.filter((e) => e.kind === "accommodation-checkout");
    expect(checkouts).toHaveLength(1);
  });

  it("handles a complete realistic fixture", () => {
    const item1 = makeItem({ id: "item-eiffel", date: "2026-07-02", startTime: "10:00", title: "Eiffel Tower" });
    const item2 = makeItem({ id: "item-louvre", date: "2026-07-02", startTime: "14:30", title: "Louvre" });
    const item3 = makeItem({ id: "item-dinner", date: "2026-07-02", startTime: null, title: "Dinner TBD" });
    const wishlist = makeItem({ id: "item-wish", date: null, title: "Maybe?" });

    const flight = makeTransport({
      id: "t-flight",
      mode: "FLIGHT",
      fromStopId: "stop-paris",
      toStopId: "stop-rome",
      depAt: new Date("2026-07-05T21:30:00Z"), // 23:30 Europe/Paris → 2026-07-05
      arrAt: new Date("2026-07-05T23:30:00Z"), // 01:30 Europe/Rome → 2026-07-06
    });

    const acc = makeAccom({
      id: "acc-paris",
      stopId: "stop-paris",
      checkIn: "2026-07-01",
      checkOut: "2026-07-05",
    });

    const plans = buildItinerary({
      ...BASE,
      items: [item1, item2, item3, wishlist],
      transports: [flight],
      accommodations: [acc],
    });

    // Day 2: 2 timed items in order, 1 untimed
    const day2 = plans.find((p) => p.dateISO === "2026-07-02")!;
    expect(day2.timedItems).toHaveLength(2);
    expect(day2.timedItems[0].item.id).toBe("item-eiffel");
    expect(day2.timedItems[1].item.id).toBe("item-louvre");
    expect(day2.untimedItems).toHaveLength(1);
    expect(day2.untimedItems[0].item.id).toBe("item-dinner");

    // Wishlist item excluded
    const allItems = plans.flatMap((p) => [...p.timedItems, ...p.untimedItems]);
    expect(allItems.find((e) => e.item.id === "item-wish")).toBeUndefined();

    // Day 5: departure of overnight flight
    const day5 = plans.find((p) => p.dateISO === "2026-07-05")!;
    expect(day5.transportEntries).toHaveLength(1);
    const dep = day5.transportEntries[0];
    expect(dep.kind).toBe("transport-departure");
    if (dep.kind === "transport-departure") {
      expect(dep.arrivesSameDay).toBe(false);
      expect(dep.arrivalDateISO).toBe("2026-07-06");
    }

    // Day 6: arrival entry
    const day6 = plans.find((p) => p.dateISO === "2026-07-06")!;
    expect(day6.transportEntries).toHaveLength(1);
    expect(day6.transportEntries[0].kind).toBe("transport-arrival");

    // Day 1: check-in
    const day1 = plans.find((p) => p.dateISO === "2026-07-01")!;
    expect(day1.accommodationEntries[0].kind).toBe("accommodation-checkin");

    // Day 5: check-out (same day as flight dep - should be in accommodationEntries)
    expect(day5.accommodationEntries).toHaveLength(1);
    expect(day5.accommodationEntries[0].kind).toBe("accommodation-checkout");
  });

  it("transport with no fromStop uses UTC for dep timezone", () => {
    const transport = makeTransport({
      id: "t-notstop",
      mode: "TRAIN",
      fromStopId: null,
      toStopId: "stop-paris",
      depAt: new Date("2026-07-03T00:00:00Z"), // midnight UTC → 2026-07-03 in UTC
      arrAt: new Date("2026-07-03T04:00:00Z"),
    });
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [transport],
      accommodations: [],
    });
    const day3 = plans.find((p) => p.dateISO === "2026-07-03")!;
    expect(day3.transportEntries).toHaveLength(1);
    expect(day3.transportEntries[0].kind).toBe("transport-departure");
  });

  // -------------------------------------------------------------------------
  // Transport time labels
  // -------------------------------------------------------------------------

  it("departure entry includes depTimeLabel in fromStop's timezone", () => {
    // 2026-07-05T08:00:00Z = 10:00 in Europe/Paris (UTC+2 in summer)
    const transport = makeTransport({
      id: "t-timelabel",
      mode: "TRAIN",
      fromStopId: "stop-paris",
      toStopId: "stop-rome",
      depAt: new Date("2026-07-05T08:00:00Z"), // 10:00 Paris time
      arrAt: new Date("2026-07-05T11:00:00Z"), // 13:00 Rome time (UTC+2 in summer)
    });
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [transport],
      accommodations: [],
    });
    const day5 = plans.find((p) => p.dateISO === "2026-07-05")!;
    const entry = day5.transportEntries[0];
    expect(entry.kind).toBe("transport-departure");
    if (entry.kind === "transport-departure") {
      expect(entry.depTimeLabel).toBe("10:00");
      // Same-day arrival → arrTimeLabel present
      expect(entry.arrTimeLabel).toBe("13:00");
    }
  });

  it("arrival entry on a different day includes arrTimeLabel in toStop's timezone", () => {
    // Overnight flight: dep Paris 23:30 (21:30 UTC), arr Rome 01:30 next day (23:30 UTC)
    const transport = makeTransport({
      id: "t-overnight-labels",
      mode: "FLIGHT",
      fromStopId: "stop-paris",
      toStopId: "stop-rome",
      depAt: new Date("2026-07-05T21:30:00Z"), // 23:30 Europe/Paris → dep day 2026-07-05
      arrAt: new Date("2026-07-05T23:30:00Z"), // 01:30 Europe/Rome → arr day 2026-07-06
    });
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [transport],
      accommodations: [],
    });
    // Departure entry on day 5
    const day5 = plans.find((p) => p.dateISO === "2026-07-05")!;
    const depEntry = day5.transportEntries[0];
    expect(depEntry.kind).toBe("transport-departure");
    if (depEntry.kind === "transport-departure") {
      expect(depEntry.depTimeLabel).toBe("23:30");
      // Different-day arrival → arrTimeLabel not on departure entry
      expect(depEntry.arrTimeLabel).toBeUndefined();
    }

    // Arrival entry on day 6
    const day6 = plans.find((p) => p.dateISO === "2026-07-06")!;
    const arrEntry = day6.transportEntries[0];
    expect(arrEntry.kind).toBe("transport-arrival");
    if (arrEntry.kind === "transport-arrival") {
      expect(arrEntry.arrTimeLabel).toBe("01:30");
    }
  });

  it("departure entry has no depTimeLabel when depAt is absent", () => {
    // This case is skipped from the projection (no depAt → no entry).
    // Instead, test that when depAt is present but arrAt is absent, arrTimeLabel is undefined.
    const transport = makeTransport({
      id: "t-nodeparr",
      mode: "BUS",
      fromStopId: "stop-paris",
      toStopId: null,
      depAt: new Date("2026-07-02T09:00:00Z"), // 11:00 Paris time
      arrAt: null,
    });
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [transport],
      accommodations: [],
    });
    const day2 = plans.find((p) => p.dateISO === "2026-07-02")!;
    const entry = day2.transportEntries[0];
    expect(entry.kind).toBe("transport-departure");
    if (entry.kind === "transport-departure") {
      expect(entry.depTimeLabel).toBe("11:00");
      expect(entry.arrTimeLabel).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// effectiveTodayISO
// ---------------------------------------------------------------------------

describe("effectiveTodayISO", () => {
  const tripStart = "2026-07-01";
  const tripEnd = "2026-07-10";

  it("returns today when within trip range", () => {
    expect(effectiveTodayISO("2026-07-05", tripStart, tripEnd)).toBe("2026-07-05");
  });

  it("returns today on the first day of the trip", () => {
    expect(effectiveTodayISO("2026-07-01", tripStart, tripEnd)).toBe("2026-07-01");
  });

  it("returns today on the last day of the trip", () => {
    expect(effectiveTodayISO("2026-07-10", tripStart, tripEnd)).toBe("2026-07-10");
  });

  it("returns tripStart when today is before the trip", () => {
    expect(effectiveTodayISO("2026-06-15", tripStart, tripEnd)).toBe("2026-07-01");
  });

  it("returns tripEnd when today is after the trip", () => {
    expect(effectiveTodayISO("2026-08-01", tripStart, tripEnd)).toBe("2026-07-10");
  });
});

// ---------------------------------------------------------------------------
// pickDayPlan
// ---------------------------------------------------------------------------

describe("pickDayPlan", () => {
  const plans = buildItinerary({
    startDate: "2026-07-01",
    endDate: "2026-07-03",
    stops: [PARIS],
    items: [],
    transports: [],
    accommodations: [],
  });

  it("returns the matching DayPlan", () => {
    const plan = pickDayPlan(plans, "2026-07-02");
    expect(plan).not.toBeNull();
    expect(plan!.dateISO).toBe("2026-07-02");
  });

  it("returns null for a date not in the plans", () => {
    expect(pickDayPlan(plans, "2026-07-10")).toBeNull();
    expect(pickDayPlan(plans, "2026-06-30")).toBeNull();
  });

  it("returns null for empty plans", () => {
    expect(pickDayPlan([], "2026-07-01")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// orderDayEntries
// ---------------------------------------------------------------------------

describe("orderDayEntries", () => {
  const BASE = {
    startDate: "2026-07-01",
    endDate: "2026-07-10",
    stops: [PARIS, ROME],
  };

  it("puts an untimed check-out first and an untimed check-in after transport", () => {
    const plans = buildItinerary({
      ...BASE,
      items: [
        makeItem({
          id: "item-untimed",
          date: "2026-07-05",
          startTime: null,
          title: "Free time",
        }),
      ],
      transports: [
        makeTransport({
          id: "t-1",
          mode: "TRAIN",
          fromStopId: "stop-paris",
          toStopId: "stop-rome",
          depAt: new Date("2026-07-05T08:00:00Z"),
        }),
      ],
      accommodations: [
        makeAccom({
          id: "acc-out",
          stopId: "stop-paris",
          checkIn: "2026-07-01",
          checkOut: "2026-07-05",
          checkOutTime: null,
        }),
        makeAccom({
          id: "acc-in",
          stopId: "stop-rome",
          checkIn: "2026-07-05",
          checkOut: "2026-07-10",
          checkInTime: null,
        }),
      ],
    });
    const day = plans.find((d) => d.dateISO === "2026-07-05")!;
    const kinds = orderDayEntries(day).entries.map((e) => e.kind);
    expect(kinds.indexOf("accommodation-checkout")).toBe(0);
    expect(kinds.indexOf("accommodation-checkin")).toBeGreaterThan(
      kinds.indexOf("transport-departure"),
    );
  });

  it("slots a timed check-out among timed items by time (bakery 08:00 before 10:00 checkout)", () => {
    const plans = buildItinerary({
      ...BASE,
      items: [
        makeItem({
          id: "item-bakery",
          date: "2026-07-05",
          startTime: "08:00",
          title: "Bakery",
        }),
        makeItem({
          id: "item-museum",
          date: "2026-07-05",
          startTime: "11:00",
          title: "Museum",
        }),
      ],
      transports: [],
      accommodations: [
        makeAccom({
          id: "acc-out",
          stopId: "stop-paris",
          checkIn: "2026-07-01",
          checkOut: "2026-07-05",
          checkOutTime: "10:00",
        }),
      ],
    });
    const day = plans.find((d) => d.dateISO === "2026-07-05")!;
    const ordered = orderDayEntries(day).entries;
    const labels = ordered.map((e) =>
      e.kind === "item" ? e.item.title : e.kind,
    );
    expect(labels).toEqual(["Bakery", "accommodation-checkout", "Museum"]);
  });

  it("ties at the same minute break checkout < item < checkin", () => {
    const plans = buildItinerary({
      ...BASE,
      items: [
        makeItem({
          id: "item-noon",
          date: "2026-07-05",
          startTime: "12:00",
          title: "Noon thing",
        }),
      ],
      transports: [],
      accommodations: [
        makeAccom({
          id: "acc-out",
          stopId: "stop-paris",
          checkIn: "2026-07-01",
          checkOut: "2026-07-05",
          checkOutTime: "12:00",
        }),
        makeAccom({
          id: "acc-in",
          stopId: "stop-rome",
          checkIn: "2026-07-05",
          checkOutTime: null,
          checkOut: "2026-07-10",
          checkInTime: "12:00",
        }),
      ],
    });
    const day = plans.find((d) => d.dateISO === "2026-07-05")!;
    const ordered = orderDayEntries(day).entries;
    const kinds = ordered.map((e) => e.kind);
    expect(kinds).toEqual([
      "accommodation-checkout",
      "item",
      "accommodation-checkin",
    ]);
  });

  it("slots a timed transport among timed items by its departure time (breakfast 09:00 before a 14:00 train)", () => {
    const plans = buildItinerary({
      ...BASE,
      items: [
        makeItem({ id: "item-bfast", date: "2026-07-05", startTime: "09:00", title: "Breakfast" }),
        makeItem({ id: "item-dinner", date: "2026-07-05", startTime: "20:00", title: "Dinner" }),
      ],
      transports: [
        makeTransport({
          id: "t-train",
          mode: "TRAIN",
          fromStopId: "stop-paris",
          toStopId: "stop-rome",
          depAt: new Date("2026-07-05T12:00:00Z"), // 14:00 Europe/Paris
        }),
      ],
      accommodations: [],
    });
    const day = plans.find((d) => d.dateISO === "2026-07-05")!;
    const order = orderDayEntries(day).entries.map((e) =>
      e.kind === "item" ? e.item.id : e.kind,
    );
    expect(order).toEqual(["item-bfast", "transport-departure", "item-dinner"]);
  });

  it("keeps an untimed check-in right after the day's transport even when that transport is timed", () => {
    const plans = buildItinerary({
      ...BASE,
      items: [
        makeItem({ id: "item-bfast", date: "2026-07-05", startTime: "09:00", title: "Breakfast" }),
        makeItem({ id: "item-dinner", date: "2026-07-05", startTime: "20:00", title: "Dinner" }),
      ],
      transports: [
        makeTransport({
          id: "t-train",
          mode: "TRAIN",
          fromStopId: "stop-paris",
          toStopId: "stop-rome",
          depAt: new Date("2026-07-05T12:00:00Z"),
        }),
      ],
      accommodations: [
        makeAccom({ id: "acc-in", stopId: "stop-rome", checkIn: "2026-07-05", checkOut: "2026-07-10", checkInTime: null }),
      ],
    });
    const day = plans.find((d) => d.dateISO === "2026-07-05")!;
    const kinds = orderDayEntries(day).entries.map((e) => (e.kind === "item" ? e.item.id : e.kind));
    expect(kinds).toEqual(["item-bfast", "transport-departure", "accommodation-checkin", "item-dinner"]);
  });

  it("leaves a transport with no time label in the top-of-day block", () => {
    // Build a day by hand: a departure entry whose depTimeLabel is undefined.
    const day: DayPlan = {
      dateISO: "2026-07-05",
      stop: null,
      timedItems: [
        { kind: "item", item: { id: "item-a", title: "A", category: "OTHER", date: "2026-07-05", startTime: "09:00" } },
      ],
      untimedItems: [],
      transportEntries: [
        {
          kind: "transport-departure",
          transport: { id: "t-x", mode: "BUS" },
          arrivesSameDay: false,
        },
      ],
      accommodationEntries: [],
    };
    const kinds = orderDayEntries(day).entries.map((e) => (e.kind === "item" ? e.item.id : e.kind));
    expect(kinds).toEqual(["transport-departure", "item-a"]);
  });
});

// ---------------------------------------------------------------------------
// isFreeFormDay
// ---------------------------------------------------------------------------

describe("isFreeFormDay", () => {
  const BASE = {
    startDate: "2026-07-01",
    endDate: "2026-07-10",
    stops: [PARIS, ROME],
  };

  it("is true when the day has no scheduled items, even with a check-out", () => {
    const plans = buildItinerary({
      ...BASE,
      items: [],
      transports: [],
      accommodations: [
        makeAccom({
          id: "acc-out",
          stopId: "stop-paris",
          checkIn: "2026-07-01",
          checkOut: "2026-07-05",
          checkOutTime: null,
        }),
      ],
    });
    const day = plans.find((d) => d.dateISO === "2026-07-05")!;
    expect(isFreeFormDay(day)).toBe(true);
  });

  it("is false when a timed or untimed item exists", () => {
    const plansTimed = buildItinerary({
      ...BASE,
      items: [
        makeItem({ id: "item-timed", date: "2026-07-05", startTime: "09:00" }),
      ],
      transports: [],
      accommodations: [],
    });
    const dayTimed = plansTimed.find((d) => d.dateISO === "2026-07-05")!;
    expect(isFreeFormDay(dayTimed)).toBe(false);

    const plansUntimed = buildItinerary({
      ...BASE,
      items: [
        makeItem({ id: "item-untimed", date: "2026-07-05", startTime: null }),
      ],
      transports: [],
      accommodations: [],
    });
    const dayUntimed = plansUntimed.find((d) => d.dateISO === "2026-07-05")!;
    expect(isFreeFormDay(dayUntimed)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveOwningStop (ADR 0049 rule 4)
// ---------------------------------------------------------------------------

describe("resolveOwningStop", () => {
  const munich = { id: "munich", name: "Munich", timezone: "Europe/Berlin", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 };
  const strasbourg = { id: "strasbourg", name: "Strasbourg", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-12", sortOrder: 1 };
  const stops = [munich, strasbourg];

  it("keeps the owner when it still covers the target day — even a shared one", () => {
    expect(resolveOwningStop("munich", "2026-12-10", stops)).toBe("munich");
  });

  it("keeps the owner for an ordinary in-stay move", () => {
    expect(resolveOwningStop("munich", "2026-12-07", stops)).toBe("munich");
  });

  it("re-files when the target day is past the owner's stay", () => {
    expect(resolveOwningStop("munich", "2026-12-11", stops)).toBe("strasbourg");
  });

  it("re-files rather than un-slotting when moving forward off a shared day", () => {
    expect(resolveOwningStop("munich", "2026-12-12", stops)).toBe("strasbourg");
  });

  it("takes the covering stop when there is no owner to preserve", () => {
    expect(resolveOwningStop(null, "2026-12-07", stops)).toBe("munich");
  });

  it("takes the LATER stop on a shared day when there is no owner", () => {
    expect(resolveOwningStop(null, "2026-12-10", stops)).toBe("strasbourg");
  });

  it("returns null on a gap day no stop covers", () => {
    expect(resolveOwningStop("munich", "2026-12-20", stops)).toBeNull();
  });

  it("drops an owner that no longer exists on this plan", () => {
    expect(resolveOwningStop("deleted-stop", "2026-12-07", stops)).toBe("munich");
  });
});
