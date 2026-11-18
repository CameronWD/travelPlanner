import { describe, expect, it } from "vitest";
import { estimateDriveMinutes, haversineKm } from "@/lib/geo";
import {
  carLegs,
  dayHops,
  departurePoint,
  itemRouteKey,
  driveKey,
  effectiveLocalMode,
  hopInputs,
  hopKeys,
  itemDeparture,
  parseHopKey,
  planHops,
  routeLegPaths,
  planTravelKeys,
  pointKey,
  resolveDriveLeg,
  resolveHop,
  transportEnds,
  type HopItem,
  type TravelLookup,
} from "./hops";

const A = { lat: 35, lng: 135 };
const NEAR = { lat: 35.01, lng: 135 };
const FAR2 = { lat: 35.03, lng: 135 };
const FAR = { lat: 35.1, lng: 135 };
const OPTS = { windingFactor: 1.3, avgSpeedKph: 60 };
const NOW = new Date("2026-11-01T00:00:00.000Z");

function item(id: string, over: Partial<HopItem> = {}): HopItem {
  return { id, date: "2026-11-02", startTime: null, endTime: null, sortOrder: 0, lat: 35, lng: 135, endLat: null, endLng: null, stopId: "s1", ...over };
}

function pairs(hops: { from: HopItem; to: HopItem }[]) {
  return hops.map((h) => `${h.from.id}>${h.to.id}`);
}

function ok(minutes: number, distanceM = 1000, polyline: string | null = "abc") {
  return { status: "OK" as const, minutes, distanceM, polyline };
}

describe("pointKey", () => {
  it("rounds to 5 decimals", () => {
    expect(pointKey({ lat: 35.123456789, lng: -0.1 })).toBe("35.12346,-0.10000");
  });

  it("gives -0 and 0 the same key", () => {
    expect(pointKey({ lat: -0.000001, lng: 0.000001 })).toBe(pointKey({ lat: 0.000001, lng: -0.000001 }));
    expect(pointKey({ lat: -0.000001, lng: 0 })).toBe("0.00000,0.00000");
  });
});

describe("effectiveLocalMode", () => {
  const stop = { id: "s1", localTravelMode: null };

  it("keeps an explicit mode over a car leg", () => {
    const car = [{ mode: "CAR", fromStopId: "s1", toStopId: "s2" }];
    expect(effectiveLocalMode({ id: "s1", localTravelMode: "TRANSIT" }, car)).toBe("TRANSIT");
    expect(effectiveLocalMode({ id: "s1", localTravelMode: "DRIVE" }, [])).toBe("DRIVE");
  });

  it("returns WALK when the Stop says so", () => {
    const car = [{ mode: "CAR", fromStopId: "s1", toStopId: "s2" }];
    expect(effectiveLocalMode({ id: "s1", localTravelMode: "WALK" }, car)).toBe("WALK");
  });

  it("infers DRIVE from a CAR leg leaving or arriving at the Stop", () => {
    expect(effectiveLocalMode(stop, [{ mode: "CAR", fromStopId: "s1", toStopId: "s2" }])).toBe("DRIVE");
    expect(effectiveLocalMode(stop, [{ mode: "CAR", fromStopId: "s0", toStopId: "s1" }])).toBe("DRIVE");
  });

  it("infers TRANSIT without a CAR leg at this Stop", () => {
    expect(effectiveLocalMode(stop, [{ mode: "TRAIN", fromStopId: "s1", toStopId: "s2" }])).toBe("TRANSIT");
    expect(effectiveLocalMode(stop, [{ mode: "CAR", fromStopId: "s2", toStopId: "s3" }])).toBe("TRANSIT");
    expect(effectiveLocalMode(stop, [])).toBe("TRANSIT");
  });

  it("only looks at the plan's own Transports", () => {
    const realPlan = [{ mode: "TRAIN", fromStopId: "s1", toStopId: "s2" }];
    const forkPlan = [{ mode: "CAR", fromStopId: "s1", toStopId: "s2" }];
    expect(effectiveLocalMode(stop, realPlan)).toBe("TRANSIT");
    expect(effectiveLocalMode(stop, forkPlan)).toBe("DRIVE");
  });
});

describe("dayHops", () => {
  it("never pairs Items across days (overnight)", () => {
    const late = item("late", { date: "2026-11-02", startTime: "22:00", endTime: "23:30" });
    const early = item("early", { date: "2026-11-03", startTime: "00:30", endTime: "01:30" });
    expect(dayHops([late, early])).toEqual([]);
  });

  it("dedupes a pair both orders produce", () => {
    const a = item("a", { startTime: "09:00", endTime: "10:00", sortOrder: 0 });
    const b = item("b", { startTime: "11:00", endTime: "12:00", sortOrder: 1 });
    expect(pairs(dayHops([a, b]))).toEqual(["a>b"]);
  });

  it("unions Day-map order with timed order when they differ", () => {
    const a = item("a", { startTime: "09:00", endTime: "10:00", sortOrder: 0 });
    const s = item("s", { startTime: "10:30", endTime: null, sortOrder: 1 });
    const b = item("b", { startTime: "11:00", endTime: "12:00", sortOrder: 2 });
    expect(pairs(dayHops([b, s, a]))).toEqual(["a>s", "s>b", "a>b"]);
  });

  it("puts untimed Items last in Day-map order, by sortOrder", () => {
    const u2 = item("u2", { sortOrder: 2 });
    const u1 = item("u1", { sortOrder: 1 });
    const t = item("t", { startTime: "15:00", sortOrder: 9 });
    expect(pairs(dayHops([u2, t, u1]))).toEqual(["t>u1", "u1>u2"]);
  });

  it("skips Items without a point or a date", () => {
    const a = item("a", { startTime: "09:00", endTime: "10:00" });
    const nowhere = item("nowhere", { startTime: "10:00", endTime: "10:30", lat: null, lng: null });
    const undated = item("undated", { date: null, startTime: "10:15", endTime: "10:45" });
    const b = item("b", { startTime: "11:00", endTime: "12:00" });
    expect(pairs(dayHops([a, nowhere, undated, b]))).toEqual(["a>b"]);
  });

  it("keeps each day's hops separate", () => {
    const a = item("a", { date: "2026-11-02", sortOrder: 0 });
    const b = item("b", { date: "2026-11-02", sortOrder: 1 });
    const c = item("c", { date: "2026-11-03", sortOrder: 0 });
    const d = item("d", { date: "2026-11-03", sortOrder: 1 });
    expect(pairs(dayHops([a, c, b, d]))).toEqual(["a>b", "c>d"]);
  });
});

describe("transportEnds", () => {
  const stops = new Map([
    ["s1", { lat: 1, lng: 1 }],
    ["s2", { lat: 2, lng: 2 }],
    ["nowhere", { lat: null, lng: null }],
  ]);
  const HOME = { lat: 9, lng: 9 };
  const car = { mode: "CAR", fromStopId: "s1", toStopId: "s2" };

  it("ignores legs that are not CAR", () => {
    expect(transportEnds({ ...car, mode: "TRAIN" }, stops, HOME)).toBeNull();
  });

  it("uses the Stops' points when the row has none", () => {
    expect(transportEnds(car, stops, HOME)).toEqual({ from: { lat: 1, lng: 1 }, to: { lat: 2, lng: 2 } });
  });

  it("prefers a typed departure or arrival point over the Stop's", () => {
    const t = { ...car, depLat: 1.5, depLng: 1.6, arrLat: 2.5, arrLng: 2.6 };
    expect(transportEnds(t, stops, HOME)).toEqual({ from: { lat: 1.5, lng: 1.6 }, to: { lat: 2.5, lng: 2.6 } });
  });

  it("uses the Home point for a Home end", () => {
    const fromHome = { mode: "CAR", fromStopId: null, toStopId: "s1", depIsHome: true };
    expect(transportEnds(fromHome, stops, HOME)).toEqual({ from: HOME, to: { lat: 1, lng: 1 } });
    const toHome = { mode: "CAR", fromStopId: "s2", toStopId: null, arrIsHome: true };
    expect(transportEnds(toHome, stops, HOME)).toEqual({ from: { lat: 2, lng: 2 }, to: HOME });
  });

  it("is null when an end does not resolve", () => {
    const fromHome = { mode: "CAR", fromStopId: null, toStopId: "s1", depIsHome: true };
    expect(transportEnds(fromHome, stops, null)).toBeNull();
    expect(transportEnds({ ...car, toStopId: "nowhere" }, stops, HOME)).toBeNull();
    expect(transportEnds({ ...car, fromStopId: null }, stops, HOME)).toBeNull();
  });
});

describe("hopKeys", () => {
  const a = pointKey(A);
  const near = pointKey(NEAR);
  const far = pointKey(FAR2);

  it("asks for a WALK row only under 3 km", () => {
    expect(hopKeys(A, NEAR, "DRIVE", null, NOW)).toEqual([`WALK|${a}|${near}`, `DRIVE|${a}|${near}`]);
    expect(hopKeys(A, FAR2, "DRIVE", null, NOW)).toEqual([`DRIVE|${a}|${far}`]);
  });

  it("wants a WALK key for a hop 2.6 km apart", () => {
    const p = { lat: 35.0234, lng: 135 };
    expect(haversineKm(A, p)).toBeLessThan(3);
    expect(hopKeys(A, p, "DRIVE", null, NOW)[0]).toBe(`WALK|${a}|${pointKey(p)}`);
  });

  it("wants none at 3.1 km", () => {
    const p = { lat: 35.0279, lng: 135 };
    expect(haversineKm(A, p)).toBeGreaterThan(3);
    expect(hopKeys(A, p, "DRIVE", null, NOW)).toEqual([`DRIVE|${a}|${pointKey(p)}`]);
  });

  it("floors a TRANSIT departure to 15 minutes", () => {
    const dep = new Date("2026-11-02T09:14:59.000Z");
    expect(hopKeys(A, FAR2, "TRANSIT", dep, NOW)).toEqual([`TRANSIT|${a}|${far}|2026-11-02T09:00:00.000Z`]);
  });

  it("asks for TRANSIT from now on, never for a past or missing departure", () => {
    expect(hopKeys(A, FAR2, "TRANSIT", NOW, NOW)).toEqual([`TRANSIT|${a}|${far}|2026-11-01T00:00:00.000Z`]);
    expect(hopKeys(A, FAR2, "TRANSIT", new Date(NOW.getTime() - 60_000), NOW)).toEqual([]);
    expect(hopKeys(A, FAR2, "TRANSIT", null, NOW)).toEqual([]);
    expect(hopKeys(A, NEAR, "TRANSIT", null, NOW)).toEqual([`WALK|${a}|${near}`]);
  });

  it("asks for TRANSIT at most 90 days ahead", () => {
    const day = 24 * 60 * 60_000;
    const edge = new Date(NOW.getTime() + 90 * day);
    expect(hopKeys(A, FAR2, "TRANSIT", edge, NOW)).toEqual([`TRANSIT|${a}|${far}|${edge.toISOString()}`]);
    expect(hopKeys(A, FAR2, "TRANSIT", new Date(edge.getTime() + 60_000), NOW)).toEqual([]);
  });

  it("needs no route when both points share a key", () => {
    expect(hopKeys(A, { lat: 35.000001, lng: 135.000001 }, "DRIVE", null, NOW)).toEqual([]);
  });

  it("reads a stored TRANSIT row for any departure, past or beyond 90 days", () => {
    const past = new Date(NOW.getTime() - 3 * 60 * 60_000);
    const later = new Date(NOW.getTime() + 200 * 24 * 60 * 60_000);
    for (const dep of [past, later]) {
      expect(hopKeys(A, FAR2, "TRANSIT", dep, NOW, "read")).toEqual([`TRANSIT|${a}|${far}|${dep.toISOString()}`]);
      expect(hopKeys(A, FAR2, "TRANSIT", dep, NOW, "fetch")).toEqual([]);
    }
    expect(hopKeys(A, FAR2, "TRANSIT", null, NOW, "read")).toEqual([]);
  });
});

describe("planTravelKeys", () => {
  const stops = [{ id: "s1", localTravelMode: "TRANSIT", timezone: "UTC", lat: 35, lng: 135 }];
  const items = [
    item("a", { date: "2026-10-20", startTime: "09:00", endTime: "10:00" }),
    item("b", { date: "2026-10-20", startTime: "11:00", endTime: "12:00", lat: FAR2.lat, lng: FAR2.lng }),
  ];
  const pastKey = `TRANSIT|${pointKey(A)}|${pointKey(FAR2)}|2026-10-20T10:00:00.000Z`;

  it("fetch mode leaves out a past departure's TRANSIT key; read mode keeps it", () => {
    expect([...planTravelKeys({ items, stops, transports: [], home: null }, NOW)]).not.toContain(pastKey);
    expect([...planTravelKeys({ items, stops, transports: [], home: null }, NOW, { purpose: "read" })]).toContain(pastKey);
  });
});

describe("driveKey and parseHopKey", () => {
  it("round-trips every key hopKeys and driveKey produce", () => {
    const from = { lat: 35.123456789, lng: 135.987654321 };
    const to = { lat: 35.130001, lng: 135.99 };
    const dep = new Date("2026-11-02T09:14:59.000Z");
    const keys = [...hopKeys(from, to, "TRANSIT", dep, NOW), ...hopKeys(from, to, "DRIVE", null, NOW), driveKey(from, to)];
    const rounded = { from: { lat: 35.12346, lng: 135.98765 }, to: { lat: 35.13, lng: 135.99 } };
    expect(keys.map(parseHopKey)).toEqual([
      { mode: "WALK", ...rounded, departure: null },
      { mode: "TRANSIT", ...rounded, departure: new Date("2026-11-02T09:00:00.000Z") },
      { mode: "WALK", ...rounded, departure: null },
      { mode: "DRIVE", ...rounded, departure: null },
      { mode: "DRIVE", ...rounded, departure: null },
    ]);
  });

  it("is null for a malformed key", () => {
    for (const key of [
      "",
      "BIKE|1.00000,2.00000|3.00000,4.00000",
      "DRIVE|1.00000,2.00000",
      "DRIVE|1.00000|3.00000,4.00000",
      "DRIVE|x,2.00000|3.00000,4.00000",
      "DRIVE|1.00000,2.00000|3.00000,4.00000|2026-11-02T09:00:00.000Z",
      "TRANSIT|1.00000,2.00000|3.00000,4.00000",
      "TRANSIT|1.00000,2.00000|3.00000,4.00000|not-a-date",
    ]) {
      expect(parseHopKey(key)).toBeNull();
    }
  });
});

describe("resolveHop", () => {
  const walkKey = `WALK|${pointKey(A)}|${pointKey(NEAR)}`;
  const driveKey = `DRIVE|${pointKey(A)}|${pointKey(NEAR)}`;
  const nearKm = haversineKm(A, NEAR);

  it("is a walk when the WALK row is 20 min or less", () => {
    const lookup: TravelLookup = new Map([[walkKey, ok(20, 1400, "walkline")], [driveKey, ok(5)]]);
    expect(resolveHop(A, NEAR, "DRIVE", null, lookup, OPTS)).toEqual({
      minutes: 20,
      distanceKm: 1.4,
      mode: "walk",
      estimated: false,
      polyline: "walkline",
    });
  });

  it("takes the local mode when the walk is 21 min", () => {
    const lookup: TravelLookup = new Map([[walkKey, ok(21)], [driveKey, ok(6, 1800, "driveline")]]);
    expect(resolveHop(A, NEAR, "DRIVE", null, lookup, OPTS)).toEqual({
      minutes: 6,
      distanceKm: 1.8,
      mode: "drive",
      estimated: false,
      polyline: "driveline",
    });
  });

  it("finds rows stored under the keys hopKeys asked for (TRANSIT)", () => {
    const dep = new Date("2026-11-02T09:07:00.000Z");
    const keys = hopKeys(A, NEAR, "TRANSIT", dep, NOW);
    const lookup: TravelLookup = new Map([[keys[0], ok(30)], [keys[1], ok(12, 1500, "bus")]]);
    expect(resolveHop(A, NEAR, "TRANSIT", dep, lookup, OPTS)).toEqual({
      minutes: 12,
      distanceKm: 1.5,
      mode: "transit",
      estimated: false,
      polyline: "bus",
    });
  });

  it("estimates exactly as today when the local row is NONE or ERROR", () => {
    const estimate = { minutes: (nearKm / 4.5) * 60, distanceKm: nearKm, mode: "walk", estimated: true, polyline: null };
    for (const status of ["NONE", "ERROR"] as const) {
      const lookup: TravelLookup = new Map([[driveKey, { status, minutes: null, distanceM: null, polyline: null }]]);
      expect(resolveHop(A, NEAR, "DRIVE", null, lookup, OPTS)).toEqual(estimate);
    }
  });

  it("estimates a drive beyond a 30 min walk at a Drive Stop", () => {
    const km = haversineKm(A, FAR);
    expect(resolveHop(A, FAR, "DRIVE", null, new Map(), OPTS)).toEqual({
      minutes: estimateDriveMinutes(km, OPTS),
      distanceKm: km,
      mode: "drive",
      estimated: true,
      polyline: null,
    });
  });

  it("calls the estimate beyond a 30 min walk public transport at a Public-transport Stop, keeping its minutes", () => {
    const km = haversineKm(A, FAR);
    expect(resolveHop(A, FAR, "TRANSIT", null, new Map(), OPTS)).toEqual({
      minutes: estimateDriveMinutes(km, OPTS),
      distanceKm: km,
      mode: "transit",
      estimated: true,
      polyline: null,
    });
  });

  it("takes a long real walk over the estimate when no local row exists", () => {
    const lookup: TravelLookup = new Map([[walkKey, ok(25, 1900, "longwalk")]]);
    expect(resolveHop(A, NEAR, "DRIVE", null, lookup, OPTS)).toEqual({
      minutes: 25,
      distanceKm: 1.9,
      mode: "walk",
      estimated: false,
      polyline: "longwalk",
    });
  });

  it("takes the real walk for an untimed hop at a TRANSIT Stop", () => {
    const lookup: TravelLookup = new Map([[walkKey, ok(28, 1950, "w")]]);
    expect(resolveHop(A, NEAR, "TRANSIT", null, lookup, OPTS)).toMatchObject({ minutes: 28, mode: "walk", estimated: false });
  });

  it("estimates a TRANSIT hop with no departure and no walk row", () => {
    const hop = resolveHop(A, FAR2, "TRANSIT", null, new Map(), OPTS);
    expect(hop.estimated).toBe(true);
  });

  it("is a zero walk when both points share a key", () => {
    expect(resolveHop(A, { lat: 35.000001, lng: 135 }, "DRIVE", null, new Map(), OPTS)).toEqual({
      minutes: 0,
      distanceKm: 0,
      mode: "walk",
      estimated: false,
      polyline: null,
    });
  });

  it("does not use a WALK row at 3 km or more", () => {
    const far3 = { lat: 35.0279, lng: 135 };
    const lookup: TravelLookup = new Map([[`WALK|${pointKey(A)}|${pointKey(far3)}`, ok(19)]]);
    expect(resolveHop(A, far3, "DRIVE", null, lookup, OPTS).estimated).toBe(true);
  });

  describe("walking about as quick as the Stop's mode", () => {
    const dep = new Date("2026-11-02T09:07:00.000Z");
    const transitKey = hopKeys(A, NEAR, "TRANSIT", dep, NOW)[1];

    it("walks a 22 min hop when public transport takes 20", () => {
      const lookup: TravelLookup = new Map([[walkKey, ok(22)], [transitKey, ok(20)]]);
      expect(resolveHop(A, NEAR, "TRANSIT", dep, lookup, OPTS)).toMatchObject({ minutes: 22, mode: "walk" });
    });

    it("walks a 20 min hop when public transport takes 32", () => {
      const lookup: TravelLookup = new Map([[walkKey, ok(20)], [transitKey, ok(32)]]);
      expect(resolveHop(A, NEAR, "TRANSIT", dep, lookup, OPTS)).toMatchObject({ minutes: 20, mode: "walk" });
    });

    it("takes public transport when the walk is 31 and transit 22", () => {
      const lookup: TravelLookup = new Map([[walkKey, ok(31)], [transitKey, ok(22)]]);
      expect(resolveHop(A, NEAR, "TRANSIT", dep, lookup, OPTS)).toMatchObject({ minutes: 22, mode: "transit" });
    });

    it("still walks a 20 min hop with no local row", () => {
      const lookup: TravelLookup = new Map([[walkKey, ok(20)]]);
      expect(resolveHop(A, NEAR, "TRANSIT", dep, lookup, OPTS)).toMatchObject({ minutes: 20, mode: "walk" });
    });
  });
});

describe("resolveHop at a Walk Stop", () => {
  const walkKey = `WALK|${pointKey(A)}|${pointKey(NEAR)}`;
  const dep = new Date("2026-11-02T09:07:00.000Z");
  const transitKey = hopKeys(A, NEAR, "TRANSIT", dep, NOW)[1];

  it("wants a TRANSIT key as well as WALK", () => {
    expect(hopKeys(A, NEAR, "WALK", dep, NOW)).toEqual(hopKeys(A, NEAR, "TRANSIT", dep, NOW));
    expect(hopKeys(A, NEAR, "WALK", dep, NOW)[0]).toBe(walkKey);
    expect(transitKey).toMatch(/^TRANSIT\|/);
  });

  it("walks a 28 min hop", () => {
    const lookup: TravelLookup = new Map([[walkKey, ok(28)], [transitKey, ok(12)]]);
    expect(resolveHop(A, NEAR, "WALK", dep, lookup, OPTS)).toMatchObject({ minutes: 28, mode: "walk" });
  });

  it("takes public transport for a 34 min walk", () => {
    const lookup: TravelLookup = new Map([[walkKey, ok(34)], [transitKey, ok(12)]]);
    expect(resolveHop(A, NEAR, "WALK", dep, lookup, OPTS)).toMatchObject({ minutes: 12, mode: "transit" });
  });

  it("estimates public transport for a long hop with no rows", () => {
    expect(resolveHop(A, FAR, "WALK", dep, new Map(), OPTS)).toMatchObject({ mode: "transit", estimated: true });
  });
});

describe("resolveDriveLeg", () => {
  const dKey = driveKey(A, NEAR);

  it("uses the DRIVE row, never a WALK row, for a short car leg", () => {
    const lookup: TravelLookup = new Map([[`WALK|${pointKey(A)}|${pointKey(NEAR)}`, ok(10)], [dKey, ok(4, 1300, "car")]]);
    expect(resolveDriveLeg(A, NEAR, lookup, OPTS)).toEqual({
      minutes: 4,
      distanceKm: 1.3,
      mode: "drive",
      estimated: false,
      polyline: "car",
    });
  });

  it("estimates a drive (not a walk) without an OK DRIVE row", () => {
    const km = haversineKm(A, NEAR);
    const lookup: TravelLookup = new Map();
    lookup.set(`WALK|${pointKey(A)}|${pointKey(NEAR)}`, ok(10));
    lookup.set(dKey, { status: "NONE", minutes: null, distanceM: null, polyline: null });
    expect(resolveDriveLeg(A, NEAR, lookup, OPTS)).toEqual({
      minutes: estimateDriveMinutes(km, OPTS),
      distanceKm: km,
      mode: "drive",
      estimated: true,
      polyline: null,
    });
  });

  it("has a DRIVE key and no WALK key", () => {
    expect(driveKey(A, NEAR)).toBe(`DRIVE|${pointKey(A)}|${pointKey(NEAR)}`);
  });

  it("is a zero drive when both points share a key", () => {
    expect(resolveDriveLeg(A, { lat: 35.000001, lng: 135 }, new Map(), OPTS)).toEqual({
      minutes: 0,
      distanceKm: 0,
      mode: "drive",
      estimated: false,
      polyline: null,
    });
  });
});

describe("itemDeparture", () => {
  it("is the Item's date and end time in the Stop's zone", () => {
    const it2 = item("a", { date: "2026-11-02", endTime: "10:00" });
    expect(itemDeparture(it2, "Asia/Tokyo")?.toISOString()).toBe("2026-11-02T01:00:00.000Z");
  });

  it("uses the next day for an Item that ends after midnight", () => {
    const overnight = item("a", { date: "2026-11-02", startTime: "22:00", endTime: "01:00" });
    expect(itemDeparture(overnight, "Asia/Tokyo")?.toISOString()).toBe("2026-11-02T16:00:00.000Z");
  });

  it("is null for a malformed overnight date", () => {
    expect(itemDeparture(item("a", { date: "bad", startTime: "22:00", endTime: "01:00" }), "Asia/Tokyo")).toBeNull();
  });

  it("is null without a date or end time", () => {
    expect(itemDeparture(item("a", { endTime: null }), "Asia/Tokyo")).toBeNull();
    expect(itemDeparture(item("a", { date: null, endTime: "10:00" }), "Asia/Tokyo")).toBeNull();
  });
});

describe("planHops", () => {
  it("drops a pair on two Stops a Transport in the plan joins, either way round", () => {
    const items = [
      item("a", { stopId: "s1", sortOrder: 0 }),
      item("b", { stopId: "s2", sortOrder: 1, lat: 35.01 }),
      item("c", { stopId: "s3", sortOrder: 2, lat: 35.02 }),
    ];
    expect(pairs(planHops(items, [{ mode: "FLIGHT", fromStopId: "s2", toStopId: "s1" }]))).toEqual(["b>c"]);
    expect(pairs(planHops(items, [{ mode: "TRAIN", fromStopId: "s1", toStopId: "s2" }]))).toEqual(["b>c"]);
  });

  it("keeps same-Stop pairs, Stop-less pairs and pairs no Transport joins", () => {
    const items = [
      item("a", { stopId: "s1", sortOrder: 0 }),
      item("b", { stopId: "s1", sortOrder: 1, lat: 35.01 }),
      item("c", { stopId: null, sortOrder: 2, lat: 35.02 }),
      item("d", { stopId: "s2", sortOrder: 3, lat: 35.03 }),
    ];
    expect(pairs(planHops(items, [{ mode: "CAR", fromStopId: "s1", toStopId: "s1" }]))).toEqual(["a>b", "b>c", "c>d"]);
    expect(pairs(planHops(items, [{ mode: "CAR", fromStopId: "s1", toStopId: "s9" }]))).toEqual(["a>b", "b>c", "c>d"]);
  });
});

describe("hopInputs", () => {
  const stopsById = new Map([
    ["s1", { id: "s1", localTravelMode: null, timezone: "Asia/Tokyo" }],
    ["s2", { id: "s2", localTravelMode: "DRIVE", timezone: null }],
  ]);

  it("takes the earlier Item's Stop mode from the plan's Transports and its departure in that Stop's zone", () => {
    const pair = { from: item("a", { startTime: "09:00", endTime: "10:00" }), to: item("b", { lat: 35.01 }) };
    expect(hopInputs(pair, { stopsById, planTransports: [] })).toEqual({
      from: { lat: 35, lng: 135 },
      to: { lat: 35.01, lng: 135 },
      localMode: "TRANSIT",
      departure: new Date("2026-11-02T01:00:00.000Z"),
    });
    const drive = hopInputs(pair, { stopsById, planTransports: [{ mode: "CAR", fromStopId: "s1", toStopId: "s2" }] });
    expect(drive?.localMode).toBe("DRIVE");
  });

  it("no departure without a zone; TRANSIT and no departure without a Stop", () => {
    const end = { startTime: "09:00", endTime: "10:00" };
    expect(hopInputs({ from: item("a", { ...end, stopId: "s2" }), to: item("b") }, { stopsById, planTransports: [] }))
      .toMatchObject({ localMode: "DRIVE", departure: null });
    expect(hopInputs({ from: item("a", { ...end, stopId: null }), to: item("b") }, { stopsById, planTransports: [] }))
      .toMatchObject({ localMode: "TRANSIT", departure: null });
    expect(hopInputs({ from: item("a", { ...end, stopId: "gone" }), to: item("b") }, { stopsById, planTransports: [] }))
      .toMatchObject({ localMode: "TRANSIT", departure: null });
  });

  it("is null when either Item has no point", () => {
    expect(hopInputs({ from: item("a", { lat: null }), to: item("b") }, { stopsById, planTransports: [] })).toBeNull();
    expect(hopInputs({ from: item("a"), to: item("b", { lng: null }) }, { stopsById, planTransports: [] })).toBeNull();
  });
});

describe("carLegs", () => {
  const stopsById = new Map([
    ["s1", { lat: 1, lng: 1 }],
    ["s2", { lat: 2, lng: 2 }],
  ]);
  const HOME = { lat: 9, lng: 9 };

  it("lists every CAR leg whose ends resolve, with its Transport id", () => {
    const legs = carLegs(
      [
        { id: "t1", mode: "CAR", fromStopId: "s1", toStopId: "s2" },
        { id: "t2", mode: "TRAIN", fromStopId: "s1", toStopId: "s2" },
        { id: "t3", mode: "CAR", fromStopId: null, toStopId: "s1", depIsHome: true },
        { id: "t4", mode: "CAR", fromStopId: "s1", toStopId: null },
      ],
      stopsById,
      HOME,
    );
    expect(legs).toEqual([
      { transportId: "t1", from: { lat: 1, lng: 1 }, to: { lat: 2, lng: 2 } },
      { transportId: "t3", from: HOME, to: { lat: 1, lng: 1 } },
    ]);
  });
});

describe("routeLegPaths", () => {
  const stops = [
    { id: "s1", lat: 35.0, lng: 139.0 },
    { id: "s2", lat: 35.5, lng: 139.5 },
  ];
  const A = { lat: 35.0, lng: 139.0 };
  const B = { lat: 35.5, lng: 139.5 };
  const ok = (polyline: string | null) => ({ status: "OK" as const, minutes: 60, distanceM: 70000, polyline });
  const leg = (t: { id: string; mode: string; fromStopId: string; toStopId: string; depLat?: number; depLng?: number }) => ({
    depLat: null, depLng: null, arrLat: null, arrLng: null, depIsHome: false, arrIsHome: false, ...t,
  });

  it("takes the DRIVE row's polyline for a car leg between the Stops", () => {
    const lookup = new Map([
      [driveKey(A, B), ok("road")],
      [`WALK|${pointKey(A)}|${pointKey(B)}`, ok("walk")],
    ]);
    const t = [leg({ id: "t1", mode: "CAR", fromStopId: "s1", toStopId: "s2" })];
    expect(routeLegPaths(stops, t, lookup, null)).toEqual({ "s1>s2": "road" });
  });

  it("skips non-car legs, missing rows, empty polylines and unknown Stops", () => {
    const t = [
      leg({ id: "t1", mode: "TRAIN", fromStopId: "s1", toStopId: "s2" }),
      leg({ id: "t2", mode: "CAR", fromStopId: "s1", toStopId: "s9" }),
    ];
    expect(routeLegPaths(stops, t, new Map([[driveKey(A, B), ok("road")]]), null)).toEqual({});
    const car = [leg({ id: "t3", mode: "CAR", fromStopId: "s1", toStopId: "s2" })];
    expect(routeLegPaths(stops, car, new Map([[driveKey(A, B), ok("")]]), null)).toEqual({});
    expect(routeLegPaths(stops, car, new Map(), null)).toEqual({});
  });

  it("uses a typed departure point's key, so a leg from elsewhere finds its own row", () => {
    const P = { lat: 35.1, lng: 139.1 };
    const t = [leg({ id: "t1", mode: "CAR", fromStopId: "s1", toStopId: "s2", depLat: P.lat, depLng: P.lng })];
    expect(routeLegPaths(stops, t, new Map([[driveKey(A, B), ok("stop")]]), null)).toEqual({});
    expect(routeLegPaths(stops, t, new Map([[driveKey(P, B), ok("typed")]]), null)).toEqual({ "s1>s2": "typed" });
  });
});

describe("Ends at", () => {
  const TOWER = { lat: 51.5055, lng: -0.0754 };
  const WESTMINSTER = { lat: 51.5008, lng: -0.122 };
  const NEXT = { lat: 51.5007, lng: -0.1246 };
  const walk = item("walk", { date: "2026-11-02", startTime: "10:00", endTime: "12:00", lat: TOWER.lat, lng: TOWER.lng, endLat: WESTMINSTER.lat, endLng: WESTMINSTER.lng });
  const next = item("next", { date: "2026-11-02", startTime: "12:10", endTime: "13:00", lat: NEXT.lat, lng: NEXT.lng });
  const stopsById = new Map([["s1", { id: "s1", localTravelMode: null, timezone: "Europe/London" }]]);

  it("measures the next hop from where the thing Ends at", () => {
    const hop = hopInputs({ from: walk, to: next }, { stopsById, planTransports: [] });
    expect(hop?.from).toEqual(WESTMINSTER);
    expect(hopKeys(hop!.from, hop!.to, hop!.localMode, hop!.departure, NOW)[0]).toBe(`WALK|${pointKey(WESTMINSTER)}|${pointKey(NEXT)}`);
  });

  it("measures the hop into it to its start pin", () => {
    const before = item("before", { date: "2026-11-02", startTime: "08:00", endTime: "09:00", lat: NEXT.lat, lng: NEXT.lng });
    expect(hopInputs({ from: before, to: walk }, { stopsById, planTransports: [] })?.to).toEqual(TOWER);
  });

  it("leaves from the pin when there is no end pin, or only half of one", () => {
    expect(departurePoint({ lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
    expect(departurePoint({ lat: 1, lng: 2, endLat: 3, endLng: null })).toEqual({ lat: 1, lng: 2 });
    expect(departurePoint({ lat: 1, lng: 2, endLat: 3, endLng: 4 })).toEqual({ lat: 3, lng: 4 });
  });

  it("itemRouteKey is the walk from the pin to the end pin", () => {
    expect(itemRouteKey(walk)).toBe(`WALK|${pointKey(TOWER)}|${pointKey(WESTMINSTER)}`);
  });

  it("itemRouteKey is null when the end equals the start", () => {
    expect(itemRouteKey({ ...walk, endLat: TOWER.lat, endLng: TOWER.lng })).toBeNull();
  });

  it("itemRouteKey is null when there is no start pin, or no end pin", () => {
    expect(itemRouteKey({ ...walk, lat: null, lng: null })).toBeNull();
    expect(itemRouteKey({ ...walk, endLat: null, endLng: null })).toBeNull();
  });

  it("wants the route key at 4 km", () => {
    const far = { ...walk, endLat: TOWER.lat + 0.036, endLng: TOWER.lng };
    expect(haversineKm(TOWER, { lat: far.endLat, lng: far.endLng })).toBeGreaterThan(3.9);
    const stops = [{ id: "s1", localTravelMode: "TRANSIT", timezone: "Europe/London", lat: TOWER.lat, lng: TOWER.lng }];
    expect([...planTravelKeys({ items: [far], stops, transports: [], home: null }, NOW)]).toContain(itemRouteKey(far));
  });
});

describe("a forced Hop mode", () => {
  const NINE_KM = { lat: 35.081, lng: 135 };
  const dep = new Date("2026-11-02T09:07:00.000Z");

  it("a forced walk uses the 118 min walk row over a 25 min transit row", () => {
    const [transitKey] = hopKeys(A, NINE_KM, "TRANSIT", dep, NOW);
    const walkKey = `WALK|${pointKey(A)}|${pointKey(NINE_KM)}`;
    const lookup: TravelLookup = new Map([[walkKey, ok(118, 9500, "walkline")], [transitKey, ok(25)]]);
    expect(resolveHop(A, NINE_KM, "TRANSIT", dep, lookup, OPTS, "WALK")).toEqual({
      minutes: 118,
      distanceKm: 9.5,
      mode: "walk",
      estimated: false,
      polyline: "walkline",
    });
  });

  it("a forced walk with no row is an estimated walk", () => {
    const km = haversineKm(A, NINE_KM);
    expect(resolveHop(A, NINE_KM, "DRIVE", null, new Map(), OPTS, "WALK")).toEqual({
      minutes: (km / 4.5) * 60,
      distanceKm: km,
      mode: "walk",
      estimated: true,
      polyline: null,
    });
  });

  it("a forced drive with no row is the drive estimate, and a forced transit reads its row", () => {
    const km = haversineKm(A, NINE_KM);
    expect(resolveHop(A, NINE_KM, "TRANSIT", null, new Map(), OPTS, "DRIVE")).toMatchObject({
      minutes: estimateDriveMinutes(km, OPTS),
      mode: "drive",
      estimated: true,
    });
    const [transitKey] = hopKeys(A, NINE_KM, "TRANSIT", dep, NOW);
    expect(resolveHop(A, NINE_KM, "DRIVE", dep, new Map([[transitKey, ok(25)]]), OPTS, "TRANSIT")).toMatchObject({
      minutes: 25,
      mode: "transit",
      estimated: false,
    });
  });

  it("hopKeys with forced WALK wants only the WALK key at 9 km", () => {
    expect(hopKeys(A, NINE_KM, "DRIVE", dep, NOW, "fetch", "WALK")).toEqual([`WALK|${pointKey(A)}|${pointKey(NINE_KM)}`]);
  });

  it("planTravelKeys wants the chosen mode's key for a hop with a Hop mode", () => {
    const stops = [{ id: "s1", localTravelMode: "DRIVE", timezone: "UTC", lat: 35, lng: 135 }];
    const items = [
      item("a", { date: "2026-11-02", startTime: "09:00", endTime: "10:00" }),
      item("b", { date: "2026-11-02", startTime: "11:00", endTime: "12:00", lat: NINE_KM.lat, lng: NINE_KM.lng }),
    ];
    const keys = [...planTravelKeys({ items, stops, transports: [], home: null, hopModes: new Map([["a|b", "WALK"]]) }, NOW)];
    expect(keys).toEqual([`WALK|${pointKey(A)}|${pointKey(NINE_KM)}`]);
  });
});
