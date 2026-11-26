import { describe, expect, it } from "vitest";
import { buildDayMapModel, buildItemDirections, dayMapHops, withDayMapHops, DayMapItemInput, DayMapAccommodationInput, DayMapTransportInput } from "./day-map";
import { driveKey, itemRouteKey, routeKey } from "@/lib/travel-times/hops";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<DayMapItemInput> & { id: string; title: string; sortOrder: number }): DayMapItemInput {
  return {
    lat: null,
    lng: null,
    startTime: null,
    address: null,
    ...overrides,
  };
}

function makeAccommodation(overrides: Partial<DayMapAccommodationInput> & { id: string; name: string }): DayMapAccommodationInput {
  return {
    lat: null,
    lng: null,
    address: null,
    ...overrides,
  };
}

function makeTransport(overrides: Partial<DayMapTransportInput> & { id: string }): DayMapTransportInput {
  return {
    depPlace: null,
    arrPlace: null,
    depLat: null,
    depLng: null,
    arrLat: null,
    arrLng: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildDayMapModel
// ---------------------------------------------------------------------------

describe("buildDayMapModel", () => {
  it("returns empty points when nothing is located", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [makeItem({ id: "i1", title: "No coords", sortOrder: 1 })],
      accommodation: makeAccommodation({ id: "a1", name: "Hotel" }), // no lat/lng
      transports: [],
    });
    expect(result.points).toHaveLength(0);
    expect(result.routePoints).toHaveLength(0);
    expect(result.perItemPrev).toEqual({});
  });

  it("sorts located items by startTime then sortOrder", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i3", title: "C", sortOrder: 1, startTime: "14:00", lat: 3, lng: 3 }),
        makeItem({ id: "i1", title: "A", sortOrder: 2, startTime: "09:00", lat: 1, lng: 1 }),
        makeItem({ id: "i2", title: "B", sortOrder: 1, startTime: "09:00", lat: 2, lng: 2 }),
      ],
      transports: [],
    });
    const items = result.points.filter((p) => p.kind === "item");
    expect(items.map((p) => p.id)).toEqual(["i2", "i1", "i3"]); // B(sort1) before A(sort2) at same time, then C
    expect(items[0].order).toBe(1);
    expect(items[1].order).toBe(2);
    expect(items[2].order).toBe(3);
  });

  it("excludes un-located items (no lat/lng) from points", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Has coords", sortOrder: 1, lat: 10, lng: 20 }),
        makeItem({ id: "i2", title: "No coords", sortOrder: 2 }),
        makeItem({ id: "i3", title: "Partial", sortOrder: 3, lat: 10 }), // no lng
      ],
      transports: [],
    });
    const items = result.points.filter((p) => p.kind === "item");
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("i1");
  });

  it("items without startTime sort after those with startTime", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i2", title: "No time", sortOrder: 1, lat: 2, lng: 2 }),
        makeItem({ id: "i1", title: "Has time", sortOrder: 1, startTime: "10:00", lat: 1, lng: 1 }),
      ],
      transports: [],
    });
    const items = result.points.filter((p) => p.kind === "item");
    expect(items.map((p) => p.id)).toEqual(["i1", "i2"]);
  });

  it("includes accommodation point when located", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [],
      accommodation: makeAccommodation({ id: "a1", name: "Grand Hotel", lat: 48.85, lng: 2.35 }),
      transports: [],
    });
    const acc = result.points.find((p) => p.kind === "accommodation");
    expect(acc).toBeDefined();
    expect(acc!.id).toBe("a1");
    expect(acc!.label).toBe("Grand Hotel");
    expect(acc!.lat).toBe(48.85);
    expect(acc!.lng).toBe(2.35);
    expect(acc!.order).toBeUndefined();
  });

  it("excludes accommodation when not located", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [],
      accommodation: makeAccommodation({ id: "a1", name: "Hotel", lat: null }),
      transports: [],
    });
    expect(result.points.find((p) => p.kind === "accommodation")).toBeUndefined();
  });

  it("excludes accommodation when null", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [],
      accommodation: null,
      transports: [],
    });
    expect(result.points.find((p) => p.kind === "accommodation")).toBeUndefined();
  });

  it("includes transport dep/arr points when coords present", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [],
      transports: [
        makeTransport({ id: "t1", depPlace: "CDG", depLat: 49.01, depLng: 2.55, arrPlace: "LHR", arrLat: 51.47, arrLng: -0.46 }),
      ],
    });
    const dep = result.points.find((p) => p.kind === "transport-dep");
    const arr = result.points.find((p) => p.kind === "transport-arr");
    expect(dep).toBeDefined();
    expect(dep!.label).toBe("CDG");
    expect(dep!.id).toBe("t1");
    expect(arr).toBeDefined();
    expect(arr!.label).toBe("LHR");
    expect(arr!.id).toBe("t1");
  });

  it("uses fallback labels for transport dep/arr when no place names", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [],
      transports: [
        makeTransport({ id: "t1", depLat: 49.01, depLng: 2.55, arrLat: 51.47, arrLng: -0.46 }),
      ],
    });
    const dep = result.points.find((p) => p.kind === "transport-dep");
    const arr = result.points.find((p) => p.kind === "transport-arr");
    expect(dep!.label).toBe("Departure");
    expect(arr!.label).toBe("Arrival");
  });

  it("skips transport dep/arr when coords are missing", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [],
      transports: [
        makeTransport({ id: "t1", depPlace: "CDG" }), // no coords
      ],
    });
    expect(result.points.find((p) => p.kind === "transport-dep")).toBeUndefined();
    expect(result.points.find((p) => p.kind === "transport-arr")).toBeUndefined();
  });

  it("routePoints starts with the Accommodation woken in then ordered items", () => {
    const bed = makeAccommodation({ id: "a1", name: "Hotel", lat: 9, lng: 19 });
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Stop A", sortOrder: 1, startTime: "09:00", lat: 10, lng: 20 }),
        makeItem({ id: "i2", title: "Stop B", sortOrder: 2, startTime: "10:00", lat: 11, lng: 21 }),
      ],
      accommodation: bed,
      start: bed,
      transports: [],
    });
    expect(result.routePoints).toHaveLength(3);
    expect(result.routePoints[0].kind).toBe("accommodation");
    expect(result.routePoints[1].id).toBe("i1");
    expect(result.routePoints[2].id).toBe("i2");
  });

  it("routePoints contains only located items (no accommodation)", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Stop A", sortOrder: 1, lat: 10, lng: 20 }),
      ],
      transports: [],
    });
    expect(result.routePoints).toHaveLength(1);
    expect(result.routePoints[0].kind).toBe("item");
  });

  it("perItemPrev: first located item maps to the Accommodation woken in", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Stop A", sortOrder: 1, lat: 10, lng: 20 }),
      ],
      start: makeAccommodation({ id: "a1", name: "Hotel", lat: 9, lng: 19 }),
      transports: [],
    });
    expect(result.perItemPrev["i1"]).toBeDefined();
    expect(result.perItemPrev["i1"]!.kind).toBe("accommodation");
  });

  it("perItemPrev: second located item maps to first located item", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Stop A", sortOrder: 1, startTime: "09:00", lat: 10, lng: 20 }),
        makeItem({ id: "i2", title: "Stop B", sortOrder: 2, startTime: "10:00", lat: 11, lng: 21 }),
      ],
      start: makeAccommodation({ id: "a1", name: "Hotel", lat: 9, lng: 19 }),
      transports: [],
    });
    expect(result.perItemPrev["i1"]!.kind).toBe("accommodation");
    expect(result.perItemPrev["i2"]!.id).toBe("i1");
  });

  it("perItemPrev: first located item is undefined when no accommodation", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Stop A", sortOrder: 1, lat: 10, lng: 20 }),
      ],
      transports: [],
    });
    expect(result.perItemPrev["i1"]).toBeUndefined();
  });

  it("perItemPrev: un-located items are not keyed", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "No coords", sortOrder: 1 }),
      ],
      transports: [],
    });
    expect("i1" in result.perItemPrev).toBe(false);
  });

  it("item label is the title and address is passed through", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Museum", sortOrder: 1, lat: 1, lng: 2, address: "123 Main St" }),
      ],
      transports: [],
    });
    const point = result.points[0];
    expect(point.label).toBe("Museum");
    expect(point.address).toBe("123 Main St");
  });

  it("points ordering: items first by order, then accommodation, then transport", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Stop A", sortOrder: 1, lat: 1, lng: 1 }),
      ],
      accommodation: makeAccommodation({ id: "a1", name: "Hotel", lat: 9, lng: 9 }),
      transports: [
        makeTransport({ id: "t1", depLat: 49, depLng: 2, arrLat: 51, arrLng: -0.1 }),
      ],
    });
    const kinds = result.points.map((p) => p.kind);
    // items first
    expect(kinds.indexOf("item")).toBeLessThan(kinds.indexOf("accommodation"));
    expect(kinds.indexOf("accommodation")).toBeLessThan(kinds.indexOf("transport-dep"));
  });
});

// ---------------------------------------------------------------------------
// buildItemDirections
// ---------------------------------------------------------------------------

describe("buildItemDirections", () => {
  it("returns direction urls for an item that has a predecessor", () => {
    const model = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Museum", sortOrder: 1, lat: 48.86, lng: 2.35 }),
      ],
      start: makeAccommodation({ id: "a1", name: "Hotel", lat: 48.85, lng: 2.34 }),
      transports: [],
    });
    const dirs = buildItemDirections(model);
    expect(dirs["i1"]).toBeDefined();
    expect(typeof dirs["i1"].google).toBe("string");
    expect(dirs["i1"].google).toContain("google.com/maps/dir");
    expect(typeof dirs["i1"].apple).toBe("string");
    expect(dirs["i1"].apple).toContain("maps.apple.com");
  });

  it("omits the first item when there is no accommodation (no predecessor)", () => {
    const model = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Museum", sortOrder: 1, lat: 48.86, lng: 2.35 }),
      ],
      transports: [],
    });
    const dirs = buildItemDirections(model);
    expect("i1" in dirs).toBe(false);
  });

  it("omits un-located items entirely", () => {
    const model = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "No coords", sortOrder: 1 }),
      ],
      accommodation: makeAccommodation({ id: "a1", name: "Hotel", lat: 48.85, lng: 2.34 }),
      transports: [],
    });
    const dirs = buildItemDirections(model);
    expect("i1" in dirs).toBe(false);
  });

  it("returns entries for the second item (predecessor is first item)", () => {
    const model = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Stop A", sortOrder: 1, startTime: "09:00", lat: 48.85, lng: 2.34 }),
        makeItem({ id: "i2", title: "Stop B", sortOrder: 2, startTime: "11:00", lat: 48.87, lng: 2.36 }),
      ],
      start: makeAccommodation({ id: "a1", name: "Hotel", lat: 48.84, lng: 2.33 }),
      transports: [],
    });
    const dirs = buildItemDirections(model);
    // Both items have predecessors
    expect("i1" in dirs).toBe(true);
    expect("i2" in dirs).toBe(true);
    // i2's google url should contain i1's coords as origin
    expect(dirs["i2"].google).toContain("48.85");
  });
});

describe("place ids in the Day map", () => {
  it("carries Item, stay and Transport place ids onto points, and into the hop link", () => {
    const stay = { id: "a1", name: "Hotel", lat: 2, lng: 2, placeId: "STAY" };
    const model = buildDayMapModel({
      date: "2026-06-10",
      items: [{ id: "i1", title: "Ramen", lat: 1, lng: 1, sortOrder: 0, placeId: "ITEM" }],
      accommodation: stay,
      start: stay,
      transports: [{ id: "t1", depLat: 3, depLng: 3, depPlaceId: "DEP", arrLat: 4, arrLng: 4, arrPlaceId: "ARR" }],
    });
    expect(model.points.map((p) => p.placeId)).toEqual(["ITEM", "STAY", "DEP", "ARR"]);
    const hop = new URL(buildItemDirections(model)["i1"].google!).searchParams;
    expect(hop.get("origin_place_id")).toBe("STAY");
    expect(hop.get("destination_place_id")).toBe("ITEM");
  });
});

describe("dayMapHops", () => {
  const A = { lat: 35.0, lng: 139.0 };
  const B = { lat: 35.2, lng: 139.2 };
  const C = { lat: 35.4, lng: 139.4 };
  const row = (id: string, p: { lat: number; lng: number }, startTime: string, stopId = "s1") => ({
    id, date: "2026-01-02", startTime, endTime: null, sortOrder: 0, lat: p.lat, lng: p.lng, stopId,
  });
  const stops = [
    { id: "s1", localTravelMode: "DRIVE", timezone: "UTC" },
    { id: "s2", localTravelMode: "DRIVE", timezone: "UTC" },
  ];
  const estimateOpts = { windingFactor: 1.3, avgSpeedKph: 60 };
  const modelFor = (items: ReturnType<typeof row>[]) =>
    buildDayMapModel({ date: "2026-01-02", items: items.map((i) => ({ id: i.id, title: i.id, lat: i.lat, lng: i.lng, startTime: i.startTime, sortOrder: 0 })), transports: [] });
  const real = (polyline: string | null) => ({ status: "OK" as const, minutes: 30, distanceM: 30000, polyline });

  it("draws a real hop's polyline and marks a missing row estimated", () => {
    const items = [row("i1", A, "09:00"), row("i2", B, "10:00"), row("i3", C, "11:00")];
    const lookup = new Map([[driveKey(A, B), real("abc")]]);
    expect(dayMapHops(modelFor(items), { dayItems: items, stops, transports: [], lookup, estimateOpts })).toEqual([
      { fromId: "i1", toId: "i2", polyline: "abc", estimated: false, minutes: 30, mode: "drive" },
      { fromId: "i2", toId: "i3", polyline: null, estimated: true, minutes: expect.any(Number), mode: "drive" },
    ]);
  });

  it("keeps an OK row with an empty polyline as a dashed straight hop", () => {
    const items = [row("i1", A, "09:00"), row("i2", B, "10:00")];
    const lookup = new Map([[driveKey(A, B), real("")]]);
    expect(dayMapHops(modelFor(items), { dayItems: items, stops, transports: [], lookup, estimateOpts })[0]).toMatchObject({ polyline: null, estimated: true });
  });

  it("has no row for a pair a Transport joins across Stops", () => {
    const items = [row("i1", A, "09:00", "s1"), row("i2", B, "10:00", "s2")];
    const transports = [{ id: "t1", mode: "CAR", fromStopId: "s1", toStopId: "s2" }];
    const lookup = new Map([[driveKey(A, B), real("abc")]]);
    expect(dayMapHops(modelFor(items), { dayItems: items, stops, transports, lookup, estimateOpts })[0]).toMatchObject({ polyline: null, estimated: true });
  });

  it("hops between things carry their minutes and mode", () => {
    const items = [row("i1", A, "09:00"), row("i2", B, "10:00", "s1"), row("i3", C, "11:00", "s2")];
    const transports = [{ id: "t1", mode: "CAR", fromStopId: "s1", toStopId: "s2" }];
    const lookup = new Map([[driveKey(A, B), real("abc")]]);
    expect(dayMapHops(modelFor(items), { dayItems: items, stops, transports, lookup, estimateOpts }).map(({ minutes, mode }) => ({ minutes, mode }))).toEqual([
      { minutes: 30, mode: "drive" },
      { minutes: null, mode: null },
    ]);
  });
});

describe("the start of the day", () => {
  const NAVONA = { lat: 41.8992, lng: 12.4731 };
  const PANTHEON = { lat: 41.8986, lng: 12.4769 };
  const bed = makeAccommodation({ id: "navona", name: "The Club Navona", ...NAVONA });
  const things = [
    makeItem({ id: "pantheon", title: "Pantheon", sortOrder: 0, startTime: "10:00", ...PANTHEON }),
    makeItem({ id: "trevi", title: "Trevi", sortOrder: 1, startTime: "12:00", lat: 41.9009, lng: 12.4833 }),
  ];

  it("with a start, the route begins at it and the first thing's previous point is it", () => {
    const model = buildDayMapModel({ date: "2026-12-11", items: things, accommodation: bed, start: bed, transports: [] });
    expect(model.routePoints.map((p) => p.id)).toEqual(["navona", "pantheon", "trevi"]);
    expect(model.perItemPrev["pantheon"]?.id).toBe("navona");
    expect(model.points.filter((p) => p.kind === "accommodation")).toHaveLength(1);
  });

  it("with no start, the route is the things alone and tonight's Accommodation is still a point", () => {
    const model = buildDayMapModel({ date: "2026-12-10", items: things, accommodation: bed, transports: [] });
    expect(model.routePoints.map((p) => p.id)).toEqual(["pantheon", "trevi"]);
    expect(model.perItemPrev["pantheon"]).toBeUndefined();
    expect(model.points.filter((p) => p.kind === "accommodation").map((p) => p.id)).toEqual(["navona"]);
  });

  it("a start that is not tonight's Accommodation is its own point", () => {
    const tonight = makeAccommodation({ id: "trastevere", name: "Trastevere flat", lat: 41.8897, lng: 12.4694 });
    const model = buildDayMapModel({ date: "2026-12-13", items: things, accommodation: tonight, start: bed, transports: [] });
    const beds = model.points.filter((p) => p.kind === "accommodation");
    expect(beds).toHaveLength(2);
    expect(new Set(beds.map((p) => p.id)).size).toBe(2);
    expect(model.routePoints[0].id).toBe("navona");
  });

  const stops = [{ id: "rome", localTravelMode: null, timezone: "Europe/Rome" }];
  const dayItems = [{ id: "pantheon", date: "2026-12-11", startTime: "10:00", endTime: null, sortOrder: 0, ...PANTHEON, stopId: "rome" }];
  const accommodations = [{ id: "navona", stopId: "rome", checkIn: "2026-12-10", checkOut: "2026-12-13", ...NAVONA }];
  const startModel = buildDayMapModel({ date: "2026-12-11", items: [things[0]], accommodation: bed, start: bed, transports: [] });
  const estimateOpts = { windingFactor: 1.3, avgSpeedKph: 60 };

  it("dayMapHops puts the start hop first with its minutes and mode", () => {
    const lookup = new Map([[routeKey("WALK", NAVONA, PANTHEON), { status: "OK" as const, minutes: 6, distanceM: 450, polyline: "abc" }]]);
    expect(dayMapHops(startModel, { dayItems, stops, transports: [], lookup, estimateOpts, accommodations, date: "2026-12-11" })[0]).toEqual({
      fromId: "navona", toId: "pantheon", minutes: 6, mode: "walk", estimated: false, polyline: "abc",
    });
  });

  it("a start hop with nothing looked up is an estimate", () => {
    const [hop] = dayMapHops(startModel, { dayItems, stops, transports: [], lookup: new Map(), estimateOpts, accommodations, date: "2026-12-11" });
    expect(hop).toMatchObject({ fromId: "navona", toId: "pantheon", estimated: true, polyline: null });
    expect(hop.minutes).toBeGreaterThan(0);
  });
});

describe("buildItemDirections from here", () => {
  const model = buildDayMapModel({
    date: "2026-06-24",
    items: [makeItem({ id: "i1", title: "Museum", sortOrder: 1, lat: 48.86, lng: 2.35 })],
    transports: [],
  });

  it("routes every located item from where the Traveller is, including the first", () => {
    const dirs = buildItemDirections(model, { fromHere: true, mode: "DRIVE" });
    const g = new URL(dirs["i1"].google!).searchParams;
    expect(g.has("origin")).toBe(false);
    expect(g.get("destination")).toBe("48.86,2.35");
    expect(g.get("travelmode")).toBe("driving");
    expect(dirs["i1"].apple).not.toContain("saddr");
  });

  it("keeps previous-to-this routing when not today", () => {
    const withBed = buildDayMapModel({
      date: "2026-06-24",
      items: [makeItem({ id: "i1", title: "Museum", sortOrder: 1, lat: 48.86, lng: 2.35 })],
      start: makeAccommodation({ id: "a1", name: "Hotel", lat: 48.85, lng: 2.34 }),
      transports: [],
    });
    const g = new URL(buildItemDirections(withBed, { fromHere: false, mode: null })["i1"].google!).searchParams;
    expect(g.get("origin")).toBe("48.85,2.34");
  });
});

describe("Ends at on the Day map", () => {
  const START = { lat: 51.5, lng: -0.12 };
  const END = { lat: 51.51, lng: -0.1 };
  const walk = { id: "w", title: "River walk", lat: START.lat, lng: START.lng, endLat: END.lat, endLng: END.lng, category: "ACTIVITY", startTime: "10:00", sortOrder: 0 };
  const build = (item: typeof walk) => buildDayMapModel({ date: "2026-01-02", items: [item], transports: [] });
  const hopRows = (item: { id: string; endLat?: number; endLng?: number; lat: number; lng: number }) => ({
    items: [{ ...item, date: "2026-01-02", startTime: "10:00", sortOrder: 0, stopId: "s1" }],
    stops: [{ id: "s1", localTravelMode: "WALK", timezone: "UTC" }],
    transports: [],
    accommodations: [],
    trip: { drivingWindingFactor: 1.3, drivingAvgSpeedKph: 60 },
  });
  const key = itemRouteKey(walk)!;

  it("keeps one entry for the Item and carries its end pin and Category", () => {
    const model = build(walk);
    expect(model.points).toHaveLength(1);
    expect(model.points[0]).toMatchObject({ end: END, category: "ACTIVITY" });
  });

  it("the next Item's previous point and directions leave from where the walk ends", () => {
    const lunch = { id: "l", title: "Lunch", lat: 51.52, lng: -0.09, startTime: "12:00", sortOrder: 1 };
    const model = buildDayMapModel({ date: "2026-01-02", items: [walk, lunch], transports: [] });
    expect(model.perItemPrev["l"]).toMatchObject({ lat: END.lat, lng: END.lng });
    const url = new URL(buildItemDirections(model)["l"].google!);
    expect(url.searchParams.get("origin")).toBe(`${END.lat},${END.lng}`);
  });

  it("carries the stored walk route's polyline", () => {
    const lookup = new Map([[key, { status: "OK" as const, minutes: 20, distanceM: 1500, polyline: "abc" }]]);
    expect(withDayMapHops(build(walk), hopRows(walk), "2026-01-02", lookup).points[0].routePolyline).toBe("abc");
  });

  it("has a null route until a row arrives, and ignores a failed row", () => {
    expect(withDayMapHops(build(walk), hopRows(walk), "2026-01-02", new Map()).points[0].routePolyline).toBeNull();
    const failed = new Map([[key, { status: "ERROR" as const, minutes: null, distanceM: null, polyline: "abc" }]]);
    expect(withDayMapHops(build(walk), hopRows(walk), "2026-01-02", failed).points[0].routePolyline).toBeNull();
  });

  it("has no end when it ends where it starts", () => {
    expect(build({ ...walk, endLat: START.lat, endLng: START.lng }).points[0].end).toBeNull();
  });

  it("never produces an end pin for an Item hidden from the viewer", () => {
    const model = buildDayMapModel({ date: "2026-01-02", items: [], transports: [] });
    expect(model.points).toEqual([]);
    expect(withDayMapHops(model, hopRows(walk), "2026-01-02", new Map([[key, { status: "OK" as const, minutes: 20, distanceM: 1500, polyline: "abc" }]])).points).toEqual([]);
  });
});
