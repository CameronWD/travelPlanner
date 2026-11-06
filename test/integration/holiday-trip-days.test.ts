import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { schedule } = vi.hoisted(() => ({ schedule: vi.fn() }));
vi.mock("@/lib/holidays/cache", async (orig) => ({ ...(await orig<typeof import("@/lib/holidays/cache")>()), scheduleHolidayFeeds: schedule }));

import { db } from "@/lib/db";
import { loadHolidayLines } from "@/lib/holidays/trip-days";

const USER = "it-hol-user";
const TRIP_ID = "it-hol-trip";

describe.skipIf(process.env.INTEGRATION !== "1")("loadHolidayLines (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "hol@example.test", name: "Hol IT" } });
  });

  beforeEach(async () => {
    schedule.mockClear();
    await db.holidayFeed.deleteMany({ where: { countryCode: "de" } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Holidays", homeCurrency: "EUR", createdById: USER,
        startDate: "2026-01-05", endDate: "2026-01-08",
        members: { create: { userId: USER, role: "owner" } },
      },
    });
    await db.stop.create({
      data: {
        tripId: TRIP_ID, name: "IT Munich", country: "Germany", countryCode: "de", region: "Bavaria",
        timezone: "Europe/Berlin", arriveDate: "2026-01-05", departDate: "2026-01-08", sortOrder: 0,
      },
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.holidayFeed.deleteMany({ where: { countryCode: "de" } });
  });

  it("a Bavarian Stop on Epiphany shows one line from a fresh German feed", async () => {
    await db.holidayFeed.create({
      data: {
        countryCode: "de", status: "OK", fetchedAt: new Date(),
        holidays: [{ date: "2026-01-06", name: "Epiphany", kind: "public", regions: ["Baden-Württemberg", "Bavaria", "Saxony-Anhalt"], halfDay: false }],
      },
    });
    const lines = await loadHolidayLines(TRIP_ID, ["2026-01-05", "2026-01-06"]);
    expect(lines.get("2026-01-06")).toEqual(["Epiphany (Germany): public holiday, expect closures"]);
    expect(lines.has("2026-01-05")).toBe(false);
  });

  it("a missing feed shows nothing and schedules the fetch", async () => {
    const lines = await loadHolidayLines(TRIP_ID, ["2026-01-06"]);
    expect(lines.size).toBe(0);
    expect(schedule).toHaveBeenCalledWith(["de"]);
  });
});

const GAP_TRIP = "it-hol-gap-trip";
const FORK_ID = "it-hol-fork";

function feed(countryCode: string, date: string, name: string) {
  return db.holidayFeed.create({
    data: { countryCode, status: "OK", fetchedAt: new Date(), holidays: [{ date, name, kind: "public", regions: null, halfDay: false }] },
  });
}

describe.skipIf(process.env.INTEGRATION !== "1")("loadHolidayLines on Gap days (real Postgres)", () => {
  let berlinStopId: string;
  let tokyoStopId: string;

  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "hol@example.test", name: "Hol IT" } });
  });

  beforeEach(async () => {
    schedule.mockClear();
    await db.holidayFeed.deleteMany({ where: { countryCode: { in: ["de", "fr", "jp"] } } });
    await db.trip.deleteMany({ where: { id: GAP_TRIP } });
    await db.trip.create({
      data: {
        id: GAP_TRIP, name: "IT Holidays Gap", homeCurrency: "EUR", createdById: USER,
        startDate: "2026-03-10", endDate: "2026-03-14",
        homeTimezone: "Europe/Paris", homeCountryCode: "fr", homeRegion: null,
        members: { create: { userId: USER, role: "owner" } },
      },
    });
    const berlin = await db.stop.create({
      data: { tripId: GAP_TRIP, name: "IT Berlin", country: "Germany", countryCode: "de", region: "Berlin", timezone: "Europe/Berlin", arriveDate: "2026-03-10", departDate: "2026-03-10", sortOrder: 0 },
    });
    const tokyo = await db.stop.create({
      data: { tripId: GAP_TRIP, name: "IT Tokyo", country: "Japan", countryCode: "jp", region: "Tokyo", timezone: "Asia/Tokyo", arriveDate: "2026-03-14", departDate: "2026-03-14", sortOrder: 1 },
    });
    berlinStopId = berlin.id;
    tokyoStopId = tokyo.id;
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: GAP_TRIP } });
    await db.holidayFeed.deleteMany({ where: { countryCode: { in: ["de", "fr", "jp"] } } });
  });

  it("an overnight flight lands on the next local date and shows the arrival country's holiday", async () => {
    await feed("jp", "2026-03-12", "IT Landing Day");
    await db.transport.create({
      data: {
        tripId: GAP_TRIP, mode: "FLIGHT", fromStopId: berlinStopId, toStopId: tokyoStopId,
        depAt: new Date("2026-03-11T19:00:00Z"), arrAt: new Date("2026-03-12T01:00:00Z"),
        depCountryCode: "de", arrCountryCode: "jp", arrRegion: "Tokyo",
      },
    });
    const lines = await loadHolidayLines(GAP_TRIP, ["2026-03-11", "2026-03-12"]);
    expect(lines.get("2026-03-12")).toEqual(["IT Landing Day (Japan): public holiday, expect closures"]);
    expect(lines.has("2026-03-11")).toBe(false);
  });

  it("a Gap-day end with no point of its own falls back to its Stop's country", async () => {
    await feed("jp", "2026-03-12", "IT Landing Day");
    await db.transport.create({
      data: {
        tripId: GAP_TRIP, mode: "FLIGHT", fromStopId: berlinStopId, toStopId: tokyoStopId,
        depAt: new Date("2026-03-11T19:00:00Z"), arrAt: new Date("2026-03-12T01:00:00Z"),
      },
    });
    const lines = await loadHolidayLines(GAP_TRIP, ["2026-03-12"]);
    expect(lines.get("2026-03-12")).toEqual(["IT Landing Day (Japan): public holiday, expect closures"]);
  });

  it("a Home end on a Gap day uses the Trip's home country", async () => {
    await feed("fr", "2026-03-11", "IT Home Day");
    await db.transport.create({
      data: {
        tripId: GAP_TRIP, mode: "TRAIN", fromStopId: null, toStopId: berlinStopId, depIsHome: true,
        depAt: new Date("2026-03-11T10:00:00Z"), arrAt: new Date("2026-03-11T14:00:00Z"),
      },
    });
    const lines = await loadHolidayLines(GAP_TRIP, ["2026-03-11"]);
    expect(lines.get("2026-03-11")).toEqual(["IT Home Day (France): public holiday, expect closures"]);
  });

  it("a Fork Stop in another country contributes nothing", async () => {
    await feed("de", "2026-03-12", "IT Fork Day");
    await db.fork.create({ data: { id: FORK_ID, tripId: GAP_TRIP, name: "IT Fork", createdById: USER } });
    await db.stop.create({
      data: { tripId: GAP_TRIP, forkId: FORK_ID, name: "IT Fork Stop", country: "Germany", countryCode: "de", region: "Berlin", timezone: "Europe/Berlin", arriveDate: "2026-03-12", departDate: "2026-03-12", sortOrder: 2 },
    });
    const lines = await loadHolidayLines(GAP_TRIP, ["2026-03-12"]);
    expect(lines.has("2026-03-12")).toBe(false);
  });
});

