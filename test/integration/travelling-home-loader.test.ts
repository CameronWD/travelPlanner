import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, todayISO } from "@/lib/dates";
import { loadTravellingHome } from "@/lib/travelling-home-loader";
import { getDays } from "@/lib/day-view-loader";
import { driveKey } from "@/lib/travel-times/hops";

// Real Postgres (npm run test:integration). Card 3.M's promise: Today (the
// Travelling Home) and the Day view assemble the same day from the same read,
// so for one date and one viewer they agree — Surprise included.
const PLANNER = "it-today-planner";
const MEMBER = "it-today-member";
const TRIP_ID = "it-today-trip";
const STOP_ID = "it-today-vienna";

describe.skipIf(process.env.INTEGRATION !== "1")("Today and the Day view agree (real Postgres)", () => {
  // The Trip spans the real today in UTC (the Stop's zone), so Today is "travelling".
  const today = todayISO();
  const start = addDays(today, -1);
  const end = addDays(today, 3);

  beforeAll(async () => {
    await db.user.upsert({ where: { id: PLANNER }, update: {}, create: { id: PLANNER, email: "today-planner@example.test", name: "Pat" } });
    await db.user.upsert({ where: { id: MEMBER }, update: {}, create: { id: MEMBER, email: "today-member@example.test", name: "Viv" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Today", homeCurrency: "AUD", createdById: PLANNER, startDate: start, endDate: end,
        members: { create: [{ userId: PLANNER, role: "owner" }, { userId: MEMBER, role: "member" }] },
      },
    });
    await db.stop.create({
      data: { id: STOP_ID, tripId: TRIP_ID, name: "IT Vienna", timezone: "UTC", arriveDate: start, departDate: end, nights: 4, sortOrder: 0, lat: 48.2, lng: 16.37 },
    });
    await db.item.createMany({
      data: [
        { tripId: TRIP_ID, stopId: STOP_ID, title: "IT Belvedere", category: "SIGHTSEEING", date: today, startTime: "10:00", sortOrder: 0 },
        { tripId: TRIP_ID, stopId: STOP_ID, title: "IT Opera night", category: "NIGHTLIFE", date: today, startTime: "19:30", sortOrder: 1, surprisePlannerId: PLANNER, surpriseForIds: JSON.stringify([MEMBER]) },
      ],
    });
    await db.accommodation.create({ data: { tripId: TRIP_ID, stopId: STOP_ID, name: "IT Hotel Sacher", checkIn: start, checkOut: end } });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it.each([MEMBER, PLANNER])("the same day's plan for %s", async (viewer) => {
    const home = await loadTravellingHome(TRIP_ID, viewer);
    if (home.kind !== "dated") throw new Error(home.kind);
    expect(home.effectiveDate).toBe(today);
    const [day] = await getDays(TRIP_ID, [today], viewer);
    if (typeof day === "string") throw new Error(day);
    expect(home.dayPlan).toEqual(day.plan);
    expect(home.tonightAccom?.name).toBe("IT Hotel Sacher");
    expect(day.tonight?.name).toBe("IT Hotel Sacher");
    const titles = [...day.plan.timedItems, ...day.plan.untimedItems].map((e) => e.item.title);
    expect(titles).toEqual(viewer === MEMBER ? ["IT Belvedere", "Surprise"] : ["IT Belvedere", "IT Opera night"]);
    // The Opera night carries its Surprise view on both: the member's placeholder is surprised, the planner's is not.
    const opera = [...home.dayPlan!.timedItems, ...home.dayPlan!.untimedItems].find((e) => e.item.startTime === "19:30");
    expect(opera?.item.surprise).toEqual(expect.objectContaining({ plannerId: PLANNER, youAreSurprised: viewer === MEMBER }));
  });

  it("draws the Today Day map with hops: a stored route solid, a missing one estimated", async () => {
    const A = { lat: 48.2, lng: 16.37 };
    const B = { lat: 48.4, lng: 16.6 };
    const C = { lat: 48.6, lng: 16.8 };
    await db.stop.update({ where: { id: STOP_ID }, data: { localTravelMode: "DRIVE" } });
    await db.item.deleteMany({ where: { tripId: TRIP_ID } });
    await db.item.createMany({
      data: [
        { tripId: TRIP_ID, stopId: STOP_ID, title: "IT A", category: "SIGHTSEEING", date: today, startTime: "09:00", sortOrder: 0, ...A },
        { tripId: TRIP_ID, stopId: STOP_ID, title: "IT B", category: "SIGHTSEEING", date: today, startTime: "11:00", sortOrder: 1, ...B },
        { tripId: TRIP_ID, stopId: STOP_ID, title: "IT C", category: "SIGHTSEEING", date: today, startTime: "13:00", sortOrder: 2, ...C },
      ],
    });
    const key = driveKey(A, B);
    await db.travelTime.upsert({
      where: { key },
      update: { status: "OK", minutes: 30, distanceM: 30000, polyline: "_p~iF~ps|U" },
      create: { key, mode: "DRIVE", status: "OK", minutes: 30, distanceM: 30000, polyline: "_p~iF~ps|U" },
    });
    const home = await loadTravellingHome(TRIP_ID, PLANNER).finally(() => db.travelTime.deleteMany({ where: { key } }));
    if (home.kind !== "dated") throw new Error(home.kind);
    expect(home.dayMapModel.hops?.map((h) => [h.polyline, h.estimated])).toEqual([
      ["_p~iF~ps|U", false],
      [null, true],
    ]);
  });
});
