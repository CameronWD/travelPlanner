import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockDb } from "@/test/helpers/db-mock";
import { driveKey, hopKeys, type Pt } from "@/lib/travel-times/hops";

vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("@/test/helpers/db-mock");
  return { db: mockDb(["trip", "stop", "item", "transport", "tripMember", "travelTime"]) };
});

const m = vi.hoisted(() => ({
  hasServerKey: vi.fn(() => true),
  computeRoute: vi.fn(),
  takeGoogleQuota: vi.fn(async () => true),
  hidden: {} as Record<string, string[]>,
}));
vi.mock("@/lib/google-fetch", () => ({ hasServerKey: m.hasServerKey }));
vi.mock("@/lib/routes", () => ({ computeRoute: m.computeRoute }));
const parse = vi.hoisted(() => ({ fail: new Set<string>() }));
vi.mock("@/lib/travel-times/hops", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/travel-times/hops")>();
  return { ...actual, parseHopKey: (key: string) => (parse.fail.has(key) ? null : actual.parseHopKey(key)) };
});
vi.mock("@/lib/google-usage", () => ({ takeGoogleQuota: m.takeGoogleQuota }));
vi.mock("@/lib/surprise-visibility", () => ({
  loadSurpriseVisibility: vi.fn(async (_tripId: string, viewerId: string | null) => ({
    hiddenItemIds: m.hidden[viewerId ?? "null"] ?? [],
  })),
}));

import { db as realDb } from "@/lib/db";
import { refreshTripTravelTimes } from "./refresh";

const db = realDb as unknown as MockDb<"trip" | "stop" | "item" | "transport" | "tripMember" | "travelTime">;

const NOW = new Date("2026-11-01T00:00:00Z");
const DAY = "2026-11-10";
const TZ = "Asia/Tokyo";

type Row = { key: string; mode: string; status: string; minutes: number | null; distanceM: number | null; polyline: string | null; fetchedAt: Date };
let table: Map<string, Row>;

type ItemIn = { id: string; at: Pt; start?: string | null; end?: string | null; stopId?: string | null; forkId?: string | null; sortOrder?: number; date?: string };
function item(i: ItemIn) {
  return {
    id: i.id,
    forkId: i.forkId ?? null,
    stopId: i.stopId === undefined ? "s1" : i.stopId,
    date: i.date ?? DAY,
    startTime: i.start ?? null,
    endTime: i.end ?? null,
    sortOrder: i.sortOrder ?? 0,
    lat: i.at.lat,
    lng: i.at.lng,
  };
}

type StopIn = { id: string; forkId?: string | null; mode?: string | null; at?: Pt | null; timezone?: string | null };
function stop(s: StopIn) {
  return {
    id: s.id,
    forkId: s.forkId ?? null,
    localTravelMode: s.mode ?? null,
    lat: s.at === null ? null : (s.at ?? TEMPLE).lat,
    lng: s.at === null ? null : (s.at ?? TEMPLE).lng,
    timezone: s.timezone === undefined ? TZ : s.timezone,
  };
}

function transport(t: Partial<{ forkId: string | null; mode: string; fromStopId: string | null; toStopId: string | null; depLat: number | null; depLng: number | null; arrLat: number | null; arrLng: number | null; depIsHome: boolean; arrIsHome: boolean }>) {
  return {
    id: `t-${Math.random()}`, forkId: null, mode: "CAR", fromStopId: null, toStopId: null,
    depLat: null, depLng: null, arrLat: null, arrLng: null, depIsHome: false, arrIsHome: false,
    ...t,
  };
}

function plan(p: { stops?: ReturnType<typeof stop>[]; items?: ReturnType<typeof item>[]; transports?: ReturnType<typeof transport>[]; members?: string[]; home?: Pt | null }) {
  db.trip.findUnique.mockResolvedValue({ homeLat: p.home?.lat ?? null, homeLng: p.home?.lng ?? null });
  db.stop.findMany.mockResolvedValue(p.stops ?? [stop({ id: "s1" })]);
  db.item.findMany.mockResolvedValue(p.items ?? []);
  db.transport.findMany.mockResolvedValue(p.transports ?? []);
  db.tripMember.findMany.mockResolvedValue((p.members ?? []).map((userId) => ({ userId })));
}

const TEMPLE = { lat: 35.71477, lng: 139.79666 };
const DINNER = { lat: 35.71, lng: 139.8 };
const BAR = { lat: 35.7056, lng: 139.7967 };
const FAR = (n: number): Pt => ({ lat: 35 + n * 0.05, lng: 139 + n * 0.05 });

const dep = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+09:00`);
const keysFor = (from: Pt, to: Pt, mode: "DRIVE" | "TRANSIT", end: string | null) =>
  hopKeys(from, to, mode, end ? dep(end) : null, NOW);

function calledKeys(): string[] {
  return m.computeRoute.mock.calls.map(([from, to, mode, departure]) =>
    mode === "TRANSIT"
      ? hopKeys(from, to, "TRANSIT", departure, NOW).find((k) => k.startsWith("TRANSIT"))!
      : `${mode}|${from.lat.toFixed(5)},${from.lng.toFixed(5)}|${to.lat.toFixed(5)},${to.lng.toFixed(5)}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  parse.fail.clear();
  m.hidden = {};
  m.hasServerKey.mockReturnValue(true);
  m.takeGoogleQuota.mockResolvedValue(true);
  m.computeRoute.mockResolvedValue({ status: "ok", minutes: 7, distanceM: 600, polyline: "abc" });
  table = new Map();
  db.travelTime.findMany.mockImplementation(async ({ where }: { where: { key: { in: string[] } } }) =>
    where.key.in.flatMap((k) => (table.has(k) ? [table.get(k)!] : [])),
  );
  db.travelTime.upsert.mockImplementation(async ({ create, update }: { create: Row; update: Partial<Row> }) => {
    const row = { ...(table.get(create.key) ?? create), ...update, key: create.key, fetchedAt: new Date() } as Row;
    table.set(create.key, row);
    return row;
  });
  plan({});
});

describe("refreshTripTravelTimes", () => {
  it("fetches each missing hop key and stores OK rows", async () => {
    plan({ items: [item({ id: "a", at: TEMPLE, start: "10:00", end: "12:00" }), item({ id: "b", at: DINNER, start: "12:30", end: "14:00" })] });
    const want = keysFor(TEMPLE, DINNER, "TRANSIT", "12:00");
    expect(want.length).toBe(2);

    const out = await refreshTripTravelTimes("t1", { now: NOW });

    expect(out).toEqual({ wanted: 2, fetched: 2, skippedQuota: 0, failed: 0 });
    expect([...table.keys()].sort()).toEqual([...want].sort());
    expect(table.get(want[0])).toMatchObject({ status: "OK", minutes: 7, distanceM: 600, polyline: "abc" });
    expect(m.takeGoogleQuota).toHaveBeenCalledWith("routes", 165);
  });

  it("passes an operator dailyCap override to the quota counter", async () => {
    plan({ items: [item({ id: "a", at: TEMPLE, start: "10:00", end: "12:00" }), item({ id: "b", at: DINNER, start: "12:30", end: "14:00" })] });
    await refreshTripTravelTimes("t1", { now: NOW, dailyCap: 500 });
    expect(m.takeGoogleQuota).toHaveBeenCalledWith("routes", 500);
    expect(m.takeGoogleQuota).not.toHaveBeenCalledWith("routes", 165);
  });

  it("never fetches a TRANSIT key whose departure is past or more than 90 days ahead", async () => {
    plan({
      items: [
        item({ id: "a", at: TEMPLE, start: "10:00", end: "12:00", date: "2026-10-20" }),
        item({ id: "b", at: FAR(1), start: "13:00", end: "14:00", date: "2026-10-20" }),
        item({ id: "c", at: TEMPLE, start: "10:00", end: "12:00", date: "2027-03-01" }),
        item({ id: "d", at: FAR(1), start: "13:00", end: "14:00", date: "2027-03-01" }),
      ],
    });
    await refreshTripTravelTimes("t1", { now: NOW });
    expect(m.computeRoute.mock.calls.map(([, , mode]) => mode)).not.toContain("TRANSIT");
  });

  it("sends exactly what the key encodes: rounded points and the floored TRANSIT departure", async () => {
    plan({ items: [item({ id: "a", at: { lat: 35.714774, lng: 139.796664 }, start: "10:00", end: "12:14" }), item({ id: "b", at: FAR(1), start: "13:00" })] });
    await refreshTripTravelTimes("t1", { now: NOW });
    const [from, to, mode, departure] = m.computeRoute.mock.calls[0];
    expect(mode).toBe("TRANSIT");
    expect(from).toEqual({ lat: 35.71477, lng: 139.79666 });
    expect(to).toEqual(FAR(1));
    expect(departure.toISOString()).toBe("2026-11-10T03:00:00.000Z");
  });

  it("stores a genuine no-route as NONE and never asks again", async () => {
    plan({ items: [item({ id: "a", at: TEMPLE, start: "10:00", end: "12:00" }), item({ id: "b", at: DINNER, start: "12:30", end: "14:00" })] });
    m.computeRoute.mockResolvedValue({ status: "none" });
    await refreshTripTravelTimes("t1", { now: NOW });
    expect([...table.values()].map((r) => r.status)).toEqual(["NONE", "NONE"]);
    expect([...table.values()][0]).toMatchObject({ minutes: null, distanceM: null, polyline: null });

    m.computeRoute.mockClear();
    const again = await refreshTripTravelTimes("t1", { now: NOW });
    expect(m.computeRoute).not.toHaveBeenCalled();
    expect(again).toEqual({ wanted: 0, fetched: 0, skippedQuota: 0, failed: 0 });
  });

  it("stores a failure as an ERROR cooldown, skips it for 24 h, then retries it", async () => {
    plan({ stops: [stop({ id: "s1", mode: "DRIVE" })], items: [item({ id: "a", at: TEMPLE }), item({ id: "b", at: FAR(1), sortOrder: 1 })] });
    m.computeRoute.mockResolvedValue({ status: "error" });
    const first = await refreshTripTravelTimes("t1", { now: NOW });
    const key = driveKey(TEMPLE, FAR(1));
    expect(first).toEqual({ wanted: 1, fetched: 0, skippedQuota: 0, failed: 1 });
    expect(table.get(key)).toMatchObject({ status: "ERROR", mode: "DRIVE", minutes: null });

    m.computeRoute.mockClear();
    table.get(key)!.fetchedAt = new Date(NOW.getTime() - 23 * 3600_000);
    await refreshTripTravelTimes("t1", { now: NOW });
    expect(m.computeRoute).not.toHaveBeenCalled();

    table.get(key)!.fetchedAt = new Date(NOW.getTime() - 25 * 3600_000);
    m.computeRoute.mockResolvedValue({ status: "ok", minutes: 40, distanceM: 30000, polyline: "p" });
    const later = await refreshTripTravelTimes("t1", { now: NOW });
    expect(later.fetched).toBe(1);
    expect(table.get(key)).toMatchObject({ status: "OK", minutes: 40 });
  });

  it("keyless: no quota taken, no call, no rows, only what it wanted", async () => {
    m.hasServerKey.mockReturnValue(false);
    plan({ items: [item({ id: "a", at: TEMPLE, start: "10:00", end: "12:00" }), item({ id: "b", at: DINNER, start: "12:30", end: "14:00" })] });
    const out = await refreshTripTravelTimes("t1", { now: NOW });
    expect(out).toEqual({ wanted: 2, fetched: 0, skippedQuota: 0, failed: 0 });
    expect(m.takeGoogleQuota).not.toHaveBeenCalled();
    expect(m.computeRoute).not.toHaveBeenCalled();
    expect(db.travelTime.upsert).not.toHaveBeenCalled();
  });

  it("a deleted or missing Trip wants nothing", async () => {
    db.trip.findUnique.mockResolvedValue(null);
    expect(await refreshTripTravelTimes("gone", { now: NOW })).toEqual({ wanted: 0, fetched: 0, skippedQuota: 0, failed: 0 });
    expect(db.trip.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "gone", deletedAt: null } }));
    expect(m.computeRoute).not.toHaveBeenCalled();
  });

  it("Review Focus 2: the daily cap reached mid-trip leaves the rest for later, never throws", async () => {
    const items = Array.from({ length: 6 }, (_, i) => item({ id: `i${i}`, at: FAR(i), sortOrder: i }));
    plan({ stops: [stop({ id: "s1", mode: "DRIVE" })], items });
    let granted = 2;
    m.takeGoogleQuota.mockImplementation(async () => granted-- > 0);
    const out = await refreshTripTravelTimes("t1", { now: NOW });
    expect(out).toEqual({ wanted: 5, fetched: 2, skippedQuota: 3, failed: 0 });
    expect(table.size).toBe(2);

    granted = 100;
    const next = await refreshTripTravelTimes("t1", { now: NOW });
    expect(next).toEqual({ wanted: 3, fetched: 3, skippedQuota: 0, failed: 0 });
  });

  it("makes at most 40 calls a run, 4 at a time, in stable key order", async () => {
    const items = Array.from({ length: 60 }, (_, i) => item({ id: `i${i}`, at: FAR(i), sortOrder: i }));
    plan({ stops: [stop({ id: "s1", mode: "DRIVE" })], items });
    let active = 0;
    let peak = 0;
    m.computeRoute.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return { status: "ok", minutes: 30, distanceM: 20000, polyline: "" };
    });

    const out = await refreshTripTravelTimes("t1", { now: NOW });

    expect(out).toEqual({ wanted: 59, fetched: 40, skippedQuota: 0, failed: 0 });
    expect(m.computeRoute).toHaveBeenCalledTimes(40);
    expect(peak).toBe(4);
    const all = items.slice(1).map((it, i) => driveKey(FAR(i), { lat: it.lat, lng: it.lng })).sort();
    expect([...table.keys()].sort()).toEqual(all.slice(0, 40));
    expect(calledKeys().slice(0, 4)).toEqual(all.slice(0, 4));
    expect(table.get(all[0])!.polyline).toBeNull();
  });

  it("a DB failure on one save counts as failed and the run goes on", async () => {
    plan({ stops: [stop({ id: "s1", mode: "DRIVE" })], items: [0, 1, 2].map((i) => item({ id: `i${i}`, at: FAR(i), sortOrder: i })) });
    db.travelTime.upsert.mockRejectedValueOnce(new Error("db down"));
    const out = await refreshTripTravelTimes("t1", { now: NOW });
    expect(out).toEqual({ wanted: 2, fetched: 1, skippedQuota: 0, failed: 1 });
  });

  it("forks are included, each with its own Stop modes and its own car legs", async () => {
    plan({
      stops: [
        stop({ id: "real", at: FAR(10) }),
        stop({ id: "realB", at: FAR(20) }),
        stop({ id: "fork", forkId: "f1", at: FAR(10) }),
        stop({ id: "forkB", forkId: "f1", at: FAR(20) }),
      ],
      items: [
        item({ id: "r1", at: FAR(1), stopId: "real", sortOrder: 0 }),
        item({ id: "r2", at: FAR(2), stopId: "real", sortOrder: 1 }),
        item({ id: "f1a", forkId: "f1", at: FAR(3), stopId: "fork", sortOrder: 0 }),
        item({ id: "f1b", forkId: "f1", at: FAR(4), stopId: "fork", sortOrder: 1 }),
      ],
      transports: [
        transport({ forkId: null, mode: "TRAIN", fromStopId: "real", toStopId: "realB" }),
        transport({ forkId: "f1", mode: "CAR", fromStopId: "fork", toStopId: "forkB" }),
        transport({ forkId: "f1", mode: "CAR", fromStopId: "real", toStopId: "forkB" }),
      ],
    });

    await refreshTripTravelTimes("t1", { now: NOW });

    expect(table.has(driveKey(FAR(1), FAR(2)))).toBe(false);
    expect([...table.keys()].sort()).toEqual([driveKey(FAR(3), FAR(4)), driveKey(FAR(10), FAR(20))].sort());
  });

  it("a car leg from the Home base uses the Home point, a typed point beats the Stop's", async () => {
    const HOME = FAR(30);
    plan({
      home: HOME,
      stops: [stop({ id: "s1", at: FAR(10) }), stop({ id: "s2", at: FAR(20) })],
      transports: [
        transport({ depIsHome: true, toStopId: "s1" }),
        transport({ fromStopId: "s1", toStopId: "s2", arrLat: FAR(25).lat, arrLng: FAR(25).lng }),
        transport({ fromStopId: "s2", toStopId: "s2" }),
      ],
    });
    await refreshTripTravelTimes("t1", { now: NOW });
    expect([...table.keys()].sort()).toEqual([driveKey(HOME, FAR(10)), driveKey(FAR(10), FAR(25))].sort());
  });

  it("skips Item pairs on different Stops that a Transport in the same plan joins", async () => {
    plan({
      stops: [stop({ id: "s1", mode: "DRIVE" }), stop({ id: "s2", mode: "DRIVE" }), stop({ id: "s3", mode: "DRIVE" })],
      items: [
        item({ id: "a", at: FAR(1), stopId: "s1", start: "08:00", end: "09:00" }),
        item({ id: "b", at: FAR(2), stopId: "s2", start: "12:00", end: "13:00" }),
        item({ id: "c", at: FAR(3), stopId: "s3", start: "15:00", end: "16:00" }),
      ],
      transports: [transport({ mode: "FLIGHT", fromStopId: "s2", toStopId: "s1" })],
    });
    await refreshTripTravelTimes("t1", { now: NOW });
    expect([...table.keys()]).toEqual([driveKey(FAR(2), FAR(3))]);
  });

  it("Review Focus 3: a surprised Traveller's day gets the hop that steps over the Surprise", async () => {
    plan({
      members: ["planner", "partner"],
      items: [
        item({ id: "temple", at: TEMPLE, start: "10:00", end: "12:00" }),
        item({ id: "dinner", at: DINNER, start: "12:30", end: "14:00" }),
        item({ id: "bar", at: BAR, start: "15:00", end: "17:00" }),
      ],
    });
    m.hidden = { null: ["dinner"], partner: ["dinner"] };

    await refreshTripTravelTimes("t1", { now: NOW });

    for (const k of [...keysFor(TEMPLE, DINNER, "TRANSIT", "12:00"), ...keysFor(DINNER, BAR, "TRANSIT", "14:00"), ...keysFor(TEMPLE, BAR, "TRANSIT", "12:00")]) {
      expect(table.has(k)).toBe(true);
    }
  });

  it("a Traveller surprised by two of three Surprises on a day gets their exact hops, fetched once", async () => {
    const P = [0, 1, 2, 3, 4].map((i) => ({ lat: 35.7 + i * 0.003, lng: 139.79 }));
    plan({
      members: ["planner", "x"],
      items: ["a", "s1", "s2", "s3", "b"].map((id, i) =>
        item({ id, at: P[i], start: `${String(9 + i).padStart(2, "0")}:00`, end: `${String(9 + i).padStart(2, "0")}:30` }),
      ),
    });
    m.hidden = { null: ["s1", "s2", "s3"], x: ["s1", "s3"] };

    await refreshTripTravelTimes("t1", { now: NOW });

    const xView = [...keysFor(P[0], P[2], "TRANSIT", "09:30"), ...keysFor(P[2], P[4], "TRANSIT", "11:30")];
    for (const k of xView) expect(table.has(k)).toBe(true);
    expect(calledKeys().length).toBe(new Set(calledKeys()).size);
  });

  it("no live Surprise: the per-Traveller views are not loaded", async () => {
    const { loadSurpriseVisibility } = await import("@/lib/surprise-visibility");
    plan({ members: ["a", "b", "c"], items: [item({ id: "a", at: TEMPLE })] });
    await refreshTripTravelTimes("t1", { now: NOW });
    expect(loadSurpriseVisibility).toHaveBeenCalledTimes(1);
    expect(loadSurpriseVisibility).toHaveBeenCalledWith("t1", null, { now: NOW });
  });

  it("an identical key shared by two Trips is fetched once", async () => {
    const items = [item({ id: "a", at: TEMPLE, start: "10:00", end: "12:00" }), item({ id: "b", at: DINNER, start: "12:30", end: "14:00" })];
    plan({ items });
    await refreshTripTravelTimes("t1", { now: NOW });
    expect(m.computeRoute).toHaveBeenCalledTimes(2);

    plan({ items: items.map((i) => ({ ...i, id: `other-${i.id}` })) });
    const out = await refreshTripTravelTimes("t2", { now: NOW });
    expect(m.computeRoute).toHaveBeenCalledTimes(2);
    expect(out.wanted).toBe(0);
  });
  it("reads Items in a fixed order so equal start times always pair the same way", async () => {
    await refreshTripTravelTimes("t1", { now: NOW });
    expect(db.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ date: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }, { id: "asc" }] }),
    );
  });

  it("fetches the real plan's keys before any Fork's, and WALK before DRIVE within a plan", async () => {
    const W = (n: number): Pt => ({ lat: 36 + n * 0.005, lng: 140 });
    const F = (n: number): Pt => ({ lat: 34 + n * 0.005, lng: 138 });
    plan({
      stops: [stop({ id: "s1", mode: "DRIVE" }), stop({ id: "fs", forkId: "f1", mode: "DRIVE" })],
      items: [
        item({ id: "r1", at: W(0), sortOrder: 0 }),
        item({ id: "r2", at: W(1), sortOrder: 1 }),
        item({ id: "f1", forkId: "f1", stopId: "fs", at: F(0), sortOrder: 0 }),
        item({ id: "f2", forkId: "f1", stopId: "fs", at: F(1), sortOrder: 1 }),
      ],
    });
    await refreshTripTravelTimes("t1", { now: NOW });
    const k = (mode: string, a: Pt, b: Pt) => `${mode}|${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
    expect(calledKeys()).toEqual([k("WALK", W(0), W(1)), k("DRIVE", W(0), W(1)), k("WALK", F(0), F(1)), k("DRIVE", F(0), F(1))]);
  });

  it("a key that does not parse never takes quota", async () => {
    plan({ stops: [stop({ id: "s1", mode: "DRIVE" })], items: [0, 1, 2].map((i) => item({ id: `i${i}`, at: FAR(i), sortOrder: i })) });
    parse.fail.add(driveKey(FAR(0), FAR(1)));
    await refreshTripTravelTimes("t1", { now: NOW });
    expect(m.takeGoogleQuota).toHaveBeenCalledTimes(1);
    expect(calledKeys()).toEqual([driveKey(FAR(1), FAR(2))]);
  });

  it("a dry run counts what it would fetch and makes no call and no write", async () => {
    plan({ stops: [stop({ id: "s1", mode: "DRIVE" })], items: [0, 1, 2].map((i) => item({ id: `i${i}`, at: FAR(i), sortOrder: i })) });
    expect(await refreshTripTravelTimes("t1", { now: NOW, dryRun: true })).toEqual({ wanted: 2, fetched: 0, skippedQuota: 0, failed: 0 });
    expect(m.takeGoogleQuota).not.toHaveBeenCalled();
    expect(m.computeRoute).not.toHaveBeenCalled();
    expect(db.travelTime.upsert).not.toHaveBeenCalled();
  });
});
