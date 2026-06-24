import { describe, expect, it } from "vitest";
import { buildDayMapModel, buildItemDirections, DayMapItemInput, DayMapAccommodationInput, DayMapTransportInput } from "./day-map";

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

  it("routePoints starts with accommodation then ordered items", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Stop A", sortOrder: 1, startTime: "09:00", lat: 10, lng: 20 }),
        makeItem({ id: "i2", title: "Stop B", sortOrder: 2, startTime: "10:00", lat: 11, lng: 21 }),
      ],
      accommodation: makeAccommodation({ id: "a1", name: "Hotel", lat: 9, lng: 19 }),
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

  it("perItemPrev: first located item maps to accommodation", () => {
    const result = buildDayMapModel({
      date: "2026-06-24",
      items: [
        makeItem({ id: "i1", title: "Stop A", sortOrder: 1, lat: 10, lng: 20 }),
      ],
      accommodation: makeAccommodation({ id: "a1", name: "Hotel", lat: 9, lng: 19 }),
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
      accommodation: makeAccommodation({ id: "a1", name: "Hotel", lat: 9, lng: 19 }),
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
      accommodation: makeAccommodation({ id: "a1", name: "Hotel", lat: 48.85, lng: 2.34 }),
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
      accommodation: makeAccommodation({ id: "a1", name: "Hotel", lat: 48.84, lng: 2.33 }),
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
