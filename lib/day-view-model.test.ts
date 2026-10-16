import { describe, it, expect } from "vitest";
import { dayHeading, dayEyebrow, daySubLine, nightOfStay, tripDays, dotsFor, stopLine, planCountLabel, dayIdeasRows, forecastOpensOn, buildDayModel, type DayRows } from "@/lib/day-view-model";

const T = { start: "2026-12-04", end: "2027-01-08" };

describe("dayHeading (review focus 1)", () => {
  it("no year inside the first year", () => expect(dayHeading("2026-12-12", T.start, T.end)).toBe("Sat 12 Dec"));
  it("year once the trip crosses into the next", () => expect(dayHeading("2027-01-02", T.start, T.end)).toBe("Sat 2 Jan 2027"));
  it("no year on a single-year trip", () => expect(dayHeading("2026-07-20", "2026-07-10", "2026-07-30")).toBe("Mon 20 Jul"));
});

describe("dayEyebrow", () => {
  it("chapter", () => expect(dayEyebrow({ dayNumber: 9, totalDays: 36, chapterName: "Europe", country: "France", travelDay: false })).toBe("DAY 9 OF 36 · EUROPE"));
  it("travel day wins", () => expect(dayEyebrow({ dayNumber: 11, totalDays: 36, chapterName: "Europe", country: "France", travelDay: true })).toBe("DAY 11 OF 36 · TRAVEL DAY"));
  it("country when no chapter", () => expect(dayEyebrow({ dayNumber: 9, totalDays: 36, chapterName: null, country: "France", travelDay: false })).toBe("DAY 9 OF 36 · FRANCE"));
  it("bare when no stop (review focus 2)", () => expect(dayEyebrow({ dayNumber: 9, totalDays: 36, chapterName: null, country: null, travelDay: false })).toBe("DAY 9 OF 36"));
});

describe("daySubLine", () => {
  const base = { stopName: "Strasbourg", country: "France", zone: "GMT+1", nightOf: { night: 3, of: 4 }, travel: null, compact: false };
  it("desktop", () => expect(daySubLine(base)).toBe("Strasbourg, France · GMT+1 · night 3 of 4"));
  it("phone drops the country", () => expect(daySubLine({ ...base, compact: true })).toBe("Strasbourg · GMT+1 · night 3 of 4"));
  it("travel day", () => expect(daySubLine({ ...base, travel: { from: "Strasbourg", to: "Colmar", toZone: "GMT+1" } })).toBe("Strasbourg → Colmar · GMT+1"));
  it("zone change", () => expect(daySubLine({ ...base, travel: { from: "Paris", to: "Vienna", toZone: "GMT+2" } })).toBe("Paris → Vienna · GMT+1 → GMT+2"));
  it("no stop → empty", () => expect(daySubLine({ ...base, stopName: null, country: null, zone: null, nightOf: null })).toBe(""));
});

describe("nightOfStay (review focus 3)", () => {
  it("counts nights inclusively from check-in", () => {
    expect(nightOfStay("2026-12-12", "2026-12-10", "2026-12-14")).toEqual({ night: 3, of: 4 });
    expect(nightOfStay("2026-12-10", "2026-12-10", "2026-12-14")).toEqual({ night: 1, of: 4 });
  });
  it("check-out day is not a night", () => expect(nightOfStay("2026-12-14", "2026-12-10", "2026-12-14")).toBeNull());
});

describe("tripDays (spec D1: the strip holds every day of the Trip)", () => {
  it("every day from start to end inclusive", () => expect(tripDays("2026-12-04", "2026-12-08")).toEqual(["2026-12-04", "2026-12-05", "2026-12-06", "2026-12-07", "2026-12-08"]));
  it("a one-day trip is one chip", () => expect(tripDays("2026-07-10", "2026-07-10")).toEqual(["2026-07-10"]));
  it("the December trip is 36 days", () => expect(tripDays(T.start, T.end)).toHaveLength(36));
});

it("dotsFor caps at 3", () => { expect(dotsFor(0)).toBe(0); expect(dotsFor(2)).toBe(2); expect(dotsFor(7)).toBe(3); });

describe("stopLine (spec 2026-09-29 D3)", () => {
  const stops = [
    { id: "p", name: "Paris", arriveDate: "2026-12-06", departDate: "2026-12-10", sortOrder: 0 },
    { id: "s", name: "Strasbourg", arriveDate: "2026-12-10", departDate: "2026-12-13", sortOrder: 1 },
    { id: "c", name: "Colmar", arriveDate: "2026-12-13", departDate: "2026-12-15", sortOrder: 2 },
  ];
  it("no Home base: one segment per Stop; the last Stop keeps its depart day; the day after is an unlabelled Gap day", () => {
    const line = stopLine({ days: tripDays("2026-12-08", "2026-12-16"), stops, transports: [], homeName: null, roundTrip: true });
    expect(line.homeStart).toBeNull();
    expect(line.homeEnd).toBeNull();
    expect(line.segments).toEqual([
      { kind: "stop", name: "Paris", startIndex: 0, span: 2, hueIndex: 0 },
      { kind: "stop", name: "Strasbourg", startIndex: 2, span: 3, hueIndex: 1 },
      { kind: "stop", name: "Colmar", startIndex: 5, span: 3, hueIndex: 2 },
      { kind: "gap", startIndex: 8, span: 1, mode: null, label: null },
    ]);
  });
  it("a Gap day between Stops is a dashed stretch carrying the covering Transport's mode and route", () => {
    const two = [
      { id: "d", name: "Denpasar", arriveDate: "2026-12-05", departDate: "2026-12-09", sortOrder: 0 },
      { id: "r", name: "Rome", arriveDate: "2026-12-11", departDate: "2026-12-15", sortOrder: 1 },
    ];
    const flight = { fromStopId: "d", toStopId: "r", depPlace: null, arrPlace: null, depIsHome: false, arrIsHome: false, mode: "FLIGHT" as const };
    const line = stopLine({ days: tripDays("2026-12-05", "2026-12-14"), stops: two, transports: [flight], homeName: null, roundTrip: true });
    expect(line.segments).toEqual([
      { kind: "stop", name: "Denpasar", startIndex: 0, span: 5, hueIndex: 0 },
      { kind: "gap", startIndex: 5, span: 1, mode: "FLIGHT", label: "Denpasar → Rome" },
      { kind: "stop", name: "Rome", startIndex: 6, span: 4, hueIndex: 1 },
    ]);
  });
  it("Home base: dots at both ends labelled with its name (never 'Home'); the outbound Gap day uses the leg's real endpoint", () => {
    const one = [{ id: "d", name: "Denpasar", arriveDate: "2026-12-05", departDate: "2026-12-09", sortOrder: 0 }];
    const out = { fromStopId: null, toStopId: "d", depPlace: "Brisbane", arrPlace: null, depIsHome: false, arrIsHome: false, mode: "FLIGHT" as const };
    const line = stopLine({ days: tripDays("2026-12-04", "2026-12-09"), stops: one, transports: [out], homeName: "Gold Coast", roundTrip: true });
    expect(line.homeStart).toBe("Gold Coast");
    expect(line.homeEnd).toBe("Gold Coast");
    expect(line.segments[0]).toEqual({ kind: "gap", startIndex: 0, span: 1, mode: "FLIGHT", label: "Brisbane → Denpasar" });
    expect(JSON.stringify(line)).not.toContain('"Home"');
  });
  it("a home-flagged leg is labelled with the Home base's name", () => {
    const one = [{ id: "r", name: "Rome", arriveDate: "2027-01-01", departDate: "2027-01-07", sortOrder: 0 }];
    const ret = { fromStopId: "r", toStopId: null, depPlace: null, arrPlace: null, depIsHome: false, arrIsHome: true, mode: "FLIGHT" as const };
    const line = stopLine({ days: tripDays("2027-01-01", "2027-01-08"), stops: one, transports: [ret], homeName: "Gold Coast", roundTrip: true });
    expect(line.segments.at(-1)).toEqual({ kind: "gap", startIndex: 7, span: 1, mode: "FLIGHT", label: "Rome → Gold Coast" });
  });
  it("one-way trip: a Home base dot at the start only", () => {
    const line = stopLine({ days: tripDays("2026-12-08", "2026-12-09"), stops, transports: [], homeName: "Gold Coast", roundTrip: false });
    expect(line.homeStart).toBe("Gold Coast");
    expect(line.homeEnd).toBeNull();
  });
});

it("planCountLabel", () => { expect(planCountLabel(0)).toBe("Nothing planned yet"); expect(planCountLabel(1)).toBe("1 thing"); expect(planCountLabel(3)).toBe("3 things"); });

describe("dayIdeasRows (spec decision 5)", () => {
  const todo = [{ id: "a", title: "Cathédrale", category: "SIGHTSEEING", startTime: "12:30" }];
  const wish = [
    { id: "b", title: "Christkindelsmärik", category: "SIGHTSEEING", distanceKm: 0.3, reason: "nearby" as const },
    { id: "c", title: "Petite France walk", category: "WALK", distanceKm: 1.2, reason: "nearby" as const },
    { id: "d", title: "Kehl bridge", category: "SIGHTSEEING", distanceKm: null, reason: "country" as const },
  ];
  it("things to do first, three total, counts the rest", () => {
    const r = dayIdeasRows({ stopName: "Strasbourg", thingsToDo: todo, wishlist: wish });
    expect(r.rows.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(r.more).toBe(1);
    // `all` carries every candidate, in the same order, for the inline "See all".
    expect(r.all).toHaveLength(4);
    expect(r.all.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(r.eyebrow).toBe("IDEAS FOR STRASBOURG");
    expect(r.rows[0].hint).toBe("from 12:30");
    expect(r.rows[1].hint).toBe("≈300 m away");
    expect(r.rows[2].hint).toBe("1.2 km away");
  });
  it("wishlist only → wishlist eyebrow", () => expect(dayIdeasRows({ stopName: "Strasbourg", thingsToDo: [], wishlist: wish }).eyebrow).toBe("FROM YOUR WISHLIST IN STRASBOURG"));
  it("nothing → no eyebrow", () => expect(dayIdeasRows({ stopName: "Strasbourg", thingsToDo: [], wishlist: [] })).toEqual({ rows: [], all: [], more: 0, eyebrow: null }));
});

it("forecastOpensOn is 15 days before", () => expect(forecastOpensOn("2027-01-02")).toBe("Fri 18 Dec"));

describe("buildDayModel (card 3.M)", () => {
  const stop = (o: Partial<DayRows["stops"][number]> & { id: string; name: string; arriveDate: string; departDate: string; sortOrder: number }) => ({
    country: "France", countryCode: "FR", timezone: "Europe/Paris", lat: 48.57, lng: 7.75, surprise: null, ...o,
  });
  const item = (o: Partial<DayRows["items"][number]> & { id: string; date: string }) => ({
    title: `Item ${o.id}`, category: "SIGHTSEEING", startTime: null, endTime: null, sortOrder: 0, stopId: "s-stras",
    lat: null, lng: null, address: null, link: null, booking: null, notes: null, hiddenFromShares: false,
    photoAttachmentId: null, surprise: null, ...o,
  });
  const SURPRISED = { plannerId: "u-pat", plannerName: "Pat", forIds: ["u-viv"], forNames: ["Viv"], youAreSurprised: true };
  const HOTEL = {
    id: "a-corbeau", stopId: "s-stras", name: "Hôtel Cour du Corbeau", address: "6 Rue des Couples", checkIn: "2026-12-10",
    checkOut: "2026-12-13", checkInTime: null, checkOutTime: null, confirmation: null, notes: null, lat: 48.5795, lng: 7.7498,
  };
  function rows(over: Partial<DayRows> = {}): DayRows {
    return {
      trip: { name: "Xmas", startDate: "2026-12-04", endDate: "2026-12-20", homeCurrency: "AUD", homeName: "Brisbane", homeTimezone: null, chaptersEnabled: true, roundTrip: true },
      startDate: "2026-12-04",
      endDate: "2026-12-20",
      stops: [
        stop({ id: "s-paris", name: "Paris", arriveDate: "2026-12-06", departDate: "2026-12-10", sortOrder: 0, lat: 48.8566, lng: 2.3522 }),
        stop({ id: "s-stras", name: "Strasbourg", arriveDate: "2026-12-10", departDate: "2026-12-13", sortOrder: 1 }),
      ],
      items: [
        item({ id: "i-photo", date: "2026-12-11", startTime: "09:00", lat: 48.58, lng: 7.75, photoAttachmentId: "att-1" }),
        item({ id: "i-secret", date: "2026-12-11", title: "Surprise", category: "OTHER", surprise: SURPRISED }),
      ],
      transports: [],
      accommodations: [HOTEL],
      wishlist: [
        { id: "w-near", title: "Petite France walk", category: "SIGHTSEEING", lat: 48.5809, lng: 7.7406, countryCode: "FR" },
        { id: "w-cc", title: "Tarte flambée", category: "FOOD", lat: null, lng: null, countryCode: "FR" },
      ],
      attachments: [
        { id: "att-1", filename: "a.jpg", title: null, mime: "image/jpeg", size: 1, url: "/api/attachments/att-1", uploadedById: "u-1", createdAt: new Date("2026-11-01T00:00:00Z"), targetId: "i-photo" },
      ],
      chapters: [{ id: "c-alsace", name: "Alsace", colour: "sky", startDate: "2026-12-10", endDate: "2026-12-13", sortOrder: 0 }],
      dayTitles: [{ stopId: "s-stras", dayIndex: 1, title: "Market day" }],
      thingsToDo: [{ id: "t-market", title: "Christkindelsmärik", category: "SHOPPING", startTime: "17:00", endTime: null, stopId: "s-stras" }],
      ...over,
    };
  }

  it("a planned day: its plan, Stop, title, Chapter, number, tonight, map, photo and Surprise view", () => {
    const m = buildDayModel(rows(), "2026-12-11");
    expect(m.date).toBe("2026-12-11");
    expect(m.dayPlan?.dateISO).toBe("2026-12-11");
    expect(m.hasEntries).toBe(true);
    expect(m.freeForm).toBe(false);
    expect(m.dayStop?.id).toBe("s-stras");
    expect(m.dayTitle).toEqual({ title: "Market day", stopId: "s-stras" });
    expect(m.chapter?.name).toBe("Alsace");
    expect(m.dayNumber).toBe(8);
    expect(m.totalDays).toBe(17);
    expect(m.tonight?.id).toBe("a-corbeau");
    expect(m.accommodations.map((a) => a.id)).toEqual(["a-corbeau"]);
    expect(m.dayMap.points.map((p) => p.id)).toContain("i-photo");
    expect(Object.keys(m.itemDirections)).toContain("i-photo");
    expect(m.nearby.map((n) => n.id)).toEqual(["w-near"]);
    expect(m.thingsToDo).toEqual([]); // a planned day offers no things to do
    expect(m.attachmentsByTarget["i-photo"]?.map((a) => a.id)).toEqual(["att-1"]);
    const planned = [...m.dayPlan!.timedItems, ...m.dayPlan!.untimedItems].map((e) => e.item);
    expect(planned.find((i) => i.id === "i-photo")?.photoUrl).toBe("/api/attachments/att-1");
    expect(planned.find((i) => i.id === "i-secret")).toMatchObject({ title: "Surprise", surprise: SURPRISED });
  });

  it("a free-form day with a Stop: that Stop's things to do and its Wishlist ideas", () => {
    const m = buildDayModel(rows(), "2026-12-12");
    expect(m.freeForm).toBe(true);
    expect(m.hasEntries).toBe(false);
    expect(m.thingsToDo).toEqual([{ id: "t-market", title: "Christkindelsmärik", category: "SHOPPING", startTime: "17:00", endTime: null }]);
    expect(m.ideasWishlist.map((w) => w.id)).toEqual(["w-near", "w-cc"]);
  });

  it("a gap day: no Stop, no tonight, no ideas", () => {
    const m = buildDayModel(rows(), "2026-12-16");
    expect(m.dayStop).toBeNull();
    expect(m.tonight).toBeNull();
    expect(m.thingsToDo).toEqual([]);
    expect(m.ideasWishlist).toEqual([]);
  });

  it("a date outside the Trip has no plan", () => {
    expect(buildDayModel(rows(), "2027-01-01").dayPlan).toBeNull();
  });

  it("the itinerary covers every stay, not just the day's (TB-10): a check-in shows on its own day whatever day is asked for", () => {
    const m = buildDayModel(rows(), "2026-12-05");
    expect(m.accommodations).toEqual([]);
    const checkInDay = m.itinerary.find((d) => d.dateISO === "2026-12-10");
    expect(checkInDay?.accommodationEntries.map((e) => e.kind)).toEqual(["accommodation-checkin"]);
  });

  it("days of one read share one itinerary, built once", () => {
    const r = rows();
    expect(buildDayModel(r, "2026-12-11").itinerary).toBe(buildDayModel(r, "2026-12-12").itinerary);
    expect(buildDayModel(rows(), "2026-12-11").itinerary).not.toBe(buildDayModel(r, "2026-12-11").itinerary);
  });

  it("a Trip with Chapters off has no Chapter", () => {
    expect(buildDayModel(rows({ chapters: [] }), "2026-12-11").chapter).toBeNull();
  });
});
