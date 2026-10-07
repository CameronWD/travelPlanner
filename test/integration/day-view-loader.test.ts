import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getDay } from "@/lib/day-view-loader";

// Real Postgres (npm run test:integration). The seed test for the loaders
// spec 2026-10-06 §B/§C reshaped: their unit tests mock the db and count
// queries, so only a real database proves every select, relation filter and
// groupBy is one Postgres accepts.
const USER = "it-day-user";
const TRIP_ID = "it-day-trip";
const STOP_ID = "it-day-lisbon";

describe.skipIf(process.env.INTEGRATION !== "1")("getDay (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "day@example.test", name: "Day IT" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades stops, items, day titles
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Day", homeCurrency: "AUD", createdById: USER,
        startDate: "2027-05-01", endDate: "2027-05-04",
        members: { create: { userId: USER, role: "owner" } },
      },
    });
    await db.stop.create({
      data: {
        id: STOP_ID, tripId: TRIP_ID, name: "IT Lisbon", country: "Portugal", countryCode: "pt",
        timezone: "Europe/Lisbon", arriveDate: "2027-05-01", departDate: "2027-05-04", sortOrder: 0,
        lat: 38.72, lng: -9.14,
      },
    });
    await db.item.create({
      data: { tripId: TRIP_ID, stopId: STOP_ID, title: "IT Pastéis de Belém", category: "FOOD", date: "2027-05-02", sortOrder: 0 },
    });
    await db.dayTitle.create({ data: { stopId: STOP_ID, dayIndex: 1, title: "IT Belém day" } });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("projects one day from the Trip's real rows", async () => {
    const day = await getDay(TRIP_ID, "2027-05-02", USER);
    if (typeof day === "string") throw new Error(`getDay returned ${day}`);
    expect(day.stop?.name).toBe("IT Lisbon");
    expect(day.dayNumber).toBe(2);
    expect(day.totalDays).toBe(4);
    expect(day.prevDate).toBe("2027-05-01");
    expect(day.nextDate).toBe("2027-05-03");
    expect(day.dayTitle).toBe("IT Belém day");
    expect(JSON.stringify(day.ordered)).toContain("IT Pastéis de Belém");
    expect(day.strip.dates.find((d) => d.iso === "2027-05-02")?.count).toBe(1);
  });

  it("serves the Day page's three neighbouring days from one Trip", async () => {
    const days = await Promise.all(["2027-05-01", "2027-05-02", "2027-05-03"].map((d) => getDay(TRIP_ID, d, USER)));
    expect(days.map((d) => (typeof d === "string" ? d : d.dayNumber))).toEqual([1, 2, 3]);
  });

  it("answers out-of-range far outside the Trip", async () => {
    expect(await getDay(TRIP_ID, "2030-01-01", USER)).toBe("out-of-range");
  });
});
