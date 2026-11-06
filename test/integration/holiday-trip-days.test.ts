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
