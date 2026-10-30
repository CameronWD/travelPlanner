import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockDb } from "@/test/helpers/db-mock";
import { driveKey, hopKeys, type Pt } from "@/lib/travel-times/hops";

vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("@/test/helpers/db-mock");
  return { db: mockDb(["trip", "stop", "item", "transport", "accommodation", "tripMember", "travelTime"]) };
});
vi.mock("@/lib/google-fetch", () => ({ hasServerKey: () => true }));
vi.mock("@/lib/routes", () => ({ computeRoute: vi.fn() }));
vi.mock("@/lib/google-usage", () => ({ takeGoogleQuota: vi.fn(async () => true) }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/trip-projection-reads", () => ({ getTripProjection: vi.fn() }));

const hidden = vi.hoisted(() => ({ byViewer: {} as Record<string, string[]> }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return {
    ...actual,
    loadSurpriseVisibility: vi.fn(async (_tripId: string, viewerId: string | null) => {
      const ids = hidden.byViewer[viewerId ?? "null"] ?? [];
      return {
        ...actual.NO_SURPRISES,
        hiddenItemIds: ids,
        placeholderItems: ids.map((id) => ({ id, forkId: null, stopId: "tokyo", date: DAY, startTime: "12:30", endTime: "13:30", sortOrder: 0, lat: null, lng: null })),
        where: { ...actual.NO_SURPRISES.where, item: ids.length ? { id: { notIn: ids } } : {} },
      };
    }),
  };
});

import { db as realDb } from "@/lib/db";
import { refreshTripTravelTimes } from "./refresh";
import { loadFlagRows } from "@/lib/flags-loader";

const db = realDb as unknown as MockDb<"trip" | "stop" | "item" | "transport" | "accommodation" | "tripMember" | "travelTime">;

const NOW = new Date("2026-11-01T00:00:00Z");
const DAY = "2026-11-10";
const HOME: Pt = { lat: -27.47, lng: 153.02 };
const TEMPLE: Pt = { lat: 35.71477, lng: 139.79666 };
const DINNER: Pt = { lat: 35.71, lng: 139.8 };
const BAR: Pt = { lat: 35.7056, lng: 139.7967 };
const SHRINE: Pt = { lat: 35.676, lng: 139.6993 };
const HAKONE: Pt = { lat: 35.2324, lng: 139.1069 };
const FUJI: Pt = { lat: 35.3606, lng: 138.7274 };

const TRIP = {
  id: "t1", startDate: "2026-11-08", endDate: "2026-11-14", drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80,
  homeName: null, homeLat: HOME.lat, homeLng: HOME.lng, homeCountryCode: null, homeTimezone: "Australia/Brisbane", roundTrip: true,
};
const stop = (id: string, at: Pt, timezone: string | null, localTravelMode: string | null, arriveDate: string | null) => ({
  id, forkId: null, name: id, lat: at.lat, lng: at.lng, timezone, localTravelMode, arriveDate, departDate: arriveDate,
  sortOrder: 0, nights: 2, pinned: false,
});
const STOPS = [
  stop("tokyo", TEMPLE, "Asia/Tokyo", null, "2026-11-08"),
  // Set to public transport although a Car leg leaves it; with no zone its hop has no departure, so no TRANSIT key.
  stop("hakone", HAKONE, null, "TRANSIT", "2026-11-12"),
  stop("fuji", FUJI, "Asia/Tokyo", "DRIVE", null),
];
const item = (id: string, stopId: string, at: Pt, start: string | null, end: string | null, sortOrder: number, date = DAY) => ({
  id, forkId: null, stopId, date, startTime: start, endTime: end, sortOrder, lat: at.lat, lng: at.lng,
  category: "SIGHTSEEING", title: id, openingHours: null, slotTime: null, arriveByMinutes: null, bookingState: "NONE", bookBy: null,
});
const ITEMS = [
  item("temple", "tokyo", TEMPLE, "10:00", "12:00", 0),
  item("dinner", "tokyo", DINNER, "12:30", "13:30", 0),
  // Tied start with dinner: sortOrder (2) puts "a-bar" after dinner although its id sorts first.
  item("a-bar", "tokyo", BAR, "12:30", "14:00", 2),
  item("shrine", "tokyo", SHRINE, null, null, 1),
  item("onsen", "hakone", HAKONE, "09:00", "10:00", 0, "2026-11-12"),
  item("ropeway", "hakone", { lat: 35.25, lng: 139.02 }, "10:30", "11:00", 0, "2026-11-12"),
  item("lake", "fuji", FUJI, "15:00", "16:00", 0, "2026-11-13"),
  item("cave", "fuji", { lat: 35.45, lng: 138.62 }, "16:30", "17:00", 0, "2026-11-13"),
];
const transport = (id: string, t: Record<string, unknown>) => ({
  id, forkId: null, mode: "CAR", fromStopId: null, toStopId: null, depAt: null, arrAt: null,
  depLat: null, depLng: null, arrLat: null, arrLng: null, depIsHome: false, arrIsHome: false, bookingState: "NONE", bookBy: null, ...t,
});
const POINT: Pt = { lat: 35.24, lng: 139.1 };
const TRANSPORTS = [
  transport("to-hakone", { mode: "TRAIN", fromStopId: "tokyo", toStopId: "hakone" }),
  transport("to-fuji", { fromStopId: "hakone", toStopId: "fuji", depLat: POINT.lat, depLng: POINT.lng }),
  transport("home", { fromStopId: "fuji", arrIsHome: true }),
];

function project<T extends Record<string, unknown>>(rows: T[], args: { select?: Record<string, unknown>; where?: Record<string, unknown> } = {}) {
  const notIn = (args.where?.id as { notIn?: string[] } | undefined)?.notIn ?? [];
  return rows
    .filter((r) => !notIn.includes(r.id as string))
    .filter((r) => args.where?.forkId === undefined || r.forkId === args.where.forkId)
    .map((r) => (args.select ? Object.fromEntries(Object.keys(args.select).filter((k) => k in r).map((k) => [k, r[k]])) : r));
}

const keysAsked = () =>
  db.travelTime.findMany.mock.calls.map(([args]) => new Set((args as { where: { key: { in: string[] } } }).where.key.in));

beforeEach(() => {
  vi.clearAllMocks();
  hidden.byViewer = {};
  db.trip.findUnique.mockImplementation(async (args) => project([TRIP], args)[0]);
  db.stop.findMany.mockImplementation(async (args) => project(STOPS, args));
  db.item.findMany.mockImplementation(async (args) => project(ITEMS, args));
  db.transport.findMany.mockImplementation(async (args) => project(TRANSPORTS, args));
  db.tripMember.findMany.mockResolvedValue([{ userId: "viv" }, { userId: "pat" }]);
  db.travelTime.findMany.mockResolvedValue([]);
});

async function refreshKeys(): Promise<Set<string>> {
  await refreshTripTravelTimes("t1", { now: NOW, dryRun: true });
  const [keys] = keysAsked();
  db.travelTime.findMany.mockClear();
  return keys;
}

describe("loadFlagRows's Travel-time keys", () => {
  it("are exactly the keys the refresh fetches for the same plan", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      const refreshed = await refreshKeys();
      await loadFlagRows("t1", "viv");
      const [read] = keysAsked();

      expect(read).toEqual(refreshed);
      const transitAt = (end: string) => new Date(`${DAY}T${end}:00+09:00`);
      for (const k of [
        ...hopKeys(TEMPLE, DINNER, "TRANSIT", transitAt("12:00"), NOW),
        ...hopKeys(DINNER, BAR, "TRANSIT", transitAt("13:30"), NOW),
        ...hopKeys(FUJI, { lat: 35.45, lng: 138.62 }, "DRIVE", null, NOW),
        driveKey(FUJI, HOME),
        driveKey(POINT, FUJI),
      ]) {
        expect(read).toContain(k);
      }
      expect(read).not.toContain(driveKey(HAKONE, { lat: 35.25, lng: 139.02 }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("for a masked viewer, include the hop that steps over the hidden Surprise and nothing the refresh lacks", async () => {
    hidden.byViewer = { null: ["dinner"], viv: ["dinner"] };
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      const refreshed = await refreshKeys();
      await loadFlagRows("t1", "viv");
      const [read] = keysAsked();

      const stepOver = hopKeys(TEMPLE, BAR, "TRANSIT", new Date(`${DAY}T12:00:00+09:00`), NOW);
      for (const k of stepOver) expect(read).toContain(k);
      for (const k of read) expect(refreshed).toContain(k);
      expect([...read].some((k) => k.includes("35.71000,139.80000"))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
