import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { flagDisplayMessage } from "@/lib/flags";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: () => { throw new Error("REDIRECT"); } }));
vi.mock("@/lib/guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/guards")>("@/lib/guards");
  const user = { id: "it-mf-user", email: "it-mf@example.test" };
  return {
    ...actual,
    requireUser: vi.fn(async () => user),
    requireTripAccess: vi.fn(async () => ({ user, membership: { role: "owner" } })),
    requireRowAccess: vi.fn(async (_kind: string, id: string) => {
      const { db } = await import("@/lib/db");
      const row = await db.item.findFirst({ where: { id, forkId: null }, select: { id: true, tripId: true } });
      if (!row) throw new Error("NOT_FOUND");
      return { row, user, membership: { role: "owner" }, surpriseOf: null };
    }),
  };
});

import { db } from "@/lib/db";
import { markFlagFine } from "@/server/actions/flag-dismissals";
import { flagsFromRows, loadFlags } from "@/lib/flags-loader";
import { loadMarkedFineRows } from "@/lib/flag-dismissals-read";
import { getDays } from "@/lib/day-view-loader";
import { readPlan } from "@/lib/plan-reads";
import { loadHopModes } from "@/lib/hop-modes";
import { loadTravelLookupFor } from "@/lib/travel-times/read";
import { homePointOf } from "@/lib/travel-times/hops";
import { computeProjection } from "@/lib/trip-projection";
import { tripTodayISO } from "@/lib/trip-today";
import type { FlagAccommodation, FlagItem, FlagTransport } from "@/lib/flags";

// Real Postgres (spec 2026-11-18 T5): the action stores the fingerprint it
// reads through loadFlagRows; Summary (readPlan's rows) and the Day view
// (readDayRows' rows) must work out the same one, or a mark never hides there.
const USER = "it-mf-user";
const TRIP_ID = "it-mf-trip";
const DAY = "2099-06-02";
const FLAG_ID_PREFIX = "tight-";

async function summaryFlags() {
  const rows = await readPlan(TRIP_ID, USER, null);
  const { trip } = rows;
  const [hopModes, markedFine] = await Promise.all([loadHopModes(TRIP_ID), loadMarkedFineRows(TRIP_ID)]);
  const travel = await loadTravelLookupFor({ items: rows.items, stops: rows.stops, transports: rows.transports, home: homePointOf(trip), hopModes });
  return flagsFromRows({
    trip,
    allStops: rows.stops,
    transports: rows.transports as FlagTransport[],
    accommodations: rows.accommodations as FlagAccommodation[],
    items: rows.items as FlagItem[],
    tripStart: trip.startDate!,
    tripEnd: trip.endDate!,
    projection: computeProjection({ trip, stops: rows.stops, transports: rows.transports }),
    hiddenStopIds: rows.visibility.hiddenStopIds,
    hiddenItemIds: rows.visibility.hiddenItemIds,
    today: tripTodayISO(rows.stops, trip.homeTimezone),
    travel,
    hopModes,
    markedFine,
  });
}

async function dayView() {
  const [day] = await getDays(TRIP_ID, [DAY], USER);
  if (typeof day === "string") throw new Error(`getDays returned ${day}`);
  return day;
}

describe.skipIf(process.env.INTEGRATION !== "1")("Marked fine across Summary and the Day view (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "it-mf@example.test", name: "Xanthia Tester" } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Marked fine", homeCurrency: "EUR", createdById: USER,
        startDate: "2099-06-01", endDate: "2099-06-04", homeTimezone: "Europe/Paris",
        members: { create: { userId: USER, role: "owner" } },
      },
    });
    const stop = await db.stop.create({
      data: { tripId: TRIP_ID, name: "IT Paris", timezone: "Europe/Paris", lat: 48.86, lng: 2.337, arriveDate: "2099-06-01", departDate: "2099-06-04", nights: 3, sortOrder: 0 },
    });
    // The earlier thing ends somewhere else (Ends at), so its end pin is the hop's origin on every surface.
    await db.item.create({
      data: {
        tripId: TRIP_ID, stopId: stop.id, title: "IT Louvre", category: "SIGHTSEEING", date: DAY, startTime: "10:00", endTime: "12:00",
        lat: 48.86, lng: 2.337, endLat: 48.861, endLng: 2.337, sortOrder: 0,
      },
    });
    await db.item.create({
      data: { tripId: TRIP_ID, stopId: stop.id, title: "IT Lunch", category: "FOOD", date: DAY, startTime: "12:20", endTime: "13:00", lat: 48.8681, lng: 2.337, sortOrder: 1 },
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("a hop marked through the action is hidden on Summary and on the Day view, and named there as Marked fine", async () => {
    const before = await loadFlags(TRIP_ID, USER);
    const tight = before.shown.find((f) => f.id.startsWith(FLAG_ID_PREFIX));
    expect(tight?.fingerprint).toBeDefined();
    expect((await summaryFlags()).map((f) => f.id)).toContain(tight!.id);
    expect((await dayView()).feasibility.map((f) => f.fine.flagId)).toEqual([tight!.id]);

    expect(await markFlagFine(TRIP_ID, tight!.id, tight!.fingerprint!)).toEqual({ success: true });

    expect((await summaryFlags()).map((f) => f.id)).not.toContain(tight!.id);
    const day = await dayView();
    expect(day.feasibility).toEqual([]);
    expect(day.markedFine).toEqual([{ flagId: tight!.id, message: flagDisplayMessage(tight!), markedByName: "Xanthia" }]);
    expect((await loadFlags(TRIP_ID, USER)).markedFine.map((f) => f.id)).toEqual([tight!.id]);
  });

  it("a stale fingerprint is refused and stores nothing", async () => {
    await db.flagDismissal.deleteMany({ where: { tripId: TRIP_ID } });
    const tight = (await loadFlags(TRIP_ID, USER)).shown.find((f) => f.id.startsWith(FLAG_ID_PREFIX))!;
    expect(await markFlagFine(TRIP_ID, tight.id, `${tight.fingerprint}-old`)).toMatchObject({ success: false });
    expect(await db.flagDismissal.count({ where: { tripId: TRIP_ID } })).toBe(0);
  });
});
