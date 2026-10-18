import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { loadHomePlanningData, type HomeTripInput } from "@/lib/desktop-home-loader";
import { addDays } from "@/lib/dates";
import { todayISOInZone } from "@/lib/tz";

// Branch 2 final fix wave, I4, against the real Postgres: the migration's
// statement (run here narrowed to this test's Trip) re-derives every unchosen
// drive (a CAR leg) with no reference as No booking needed, leaves a chosen
// state, a drive with a reference and every other mode alone, and is
// idempotent. Afterwards Home's Still to book and the "Still to book close to
// the day" Flag no longer carry the drive.
const TRIP_ID = "it-trip-drive-default";
const OWNER = "it-dd-owner";
const MIGRATION = "prisma/migrations/20261018120000_drive_booking_default/migration.sql";
const TZ = "Europe/Lisbon";
const today = todayISOInZone(TZ);
const D = (n: number) => addDays(today, n);
const TRIP: HomeTripInput = {
  id: TRIP_ID, startDate: D(3), endDate: D(10), homeCurrency: "EUR", drivingWindingFactor: 1.3, drivingAvgSpeedKph: 80,
  homeName: null, homeLat: null, homeLng: null, homeCountryCode: null, homeTimezone: null, roundTrip: false, chaptersEnabled: false,
};

function statements(): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const begin = sql.indexOf("-- drive-booking-default:begin");
  const end = sql.indexOf("-- drive-booking-default:end");
  if (begin < 0 || end < begin) throw new Error("markers missing");
  return sql
    .slice(begin, end)
    .split(";")
    .map((s) => s.replace(/--.*$/gm, "").trim())
    .filter(Boolean)
    .map((s) => `${s} AND "tripId" = '${TRIP_ID}'`);
}

async function run() {
  for (const s of statements()) await db.$executeRawUnsafe(s);
}

async function states() {
  const rows = await db.transport.findMany({ where: { tripId: TRIP_ID }, select: { id: true, bookingState: true, bookingStateSet: true, bookBy: true } });
  return Object.fromEntries(rows.map((r) => [r.id, [r.bookingState, r.bookingStateSet, r.bookBy]]));
}

describe.skipIf(process.env.INTEGRATION !== "1")("drive Booking state default migration (I4, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: OWNER }, update: {}, create: { id: OWNER, email: `${OWNER}@example.test`, name: OWNER } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT Drive default", homeCurrency: "EUR", createdById: OWNER, startDate: D(3), endDate: D(10), roundTrip: false,
        members: { create: { userId: OWNER, role: "owner" } } },
    });
    await db.stop.createMany({ data: [
      { id: "it-dd-porto", tripId: TRIP_ID, name: "IT Porto", timezone: TZ, arriveDate: D(3), departDate: D(6), nights: 3, sortOrder: 0 },
      { id: "it-dd-douro", tripId: TRIP_ID, name: "IT Douro", timezone: TZ, arriveDate: D(6), departDate: D(10), nights: 4, sortOrder: 1 },
    ] });
    // The shape the old build wrote: every unchosen leg without a reference was To book.
    const leg = { tripId: TRIP_ID, fromStopId: "it-dd-porto", toStopId: "it-dd-douro", depAt: new Date(`${D(6)}T08:00:00Z`) };
    await db.transport.createMany({ data: [
      { ...leg, id: "it-dd-drive", mode: "CAR", reference: null, bookingState: "TO_BOOK", bookingStateSet: false, bookBy: D(1), sortOrder: 0 },
      { ...leg, id: "it-dd-drive-blank", mode: "CAR", reference: "   ", bookingState: "TO_BOOK", bookingStateSet: false, sortOrder: 1 },
      { ...leg, id: "it-dd-rental", mode: "CAR", reference: "HERTZ-123", bookingState: "BOOKED", bookingStateSet: false, sortOrder: 2 },
      { ...leg, id: "it-dd-drive-chosen", mode: "CAR", reference: null, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: D(2), sortOrder: 3 },
      { ...leg, id: "it-dd-train", mode: "TRAIN", reference: null, bookingState: "TO_BOOK", bookingStateSet: false, sortOrder: 4 },
    ] });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("re-derives only unchosen drives with no reference, dropping their book-by; re-running changes nothing", async () => {
    await run();
    const expected = {
      "it-dd-drive": ["NONE", false, null],
      "it-dd-drive-blank": ["NONE", false, null],
      "it-dd-rental": ["BOOKED", false, null],
      "it-dd-drive-chosen": ["TO_BOOK", true, D(2)],
      "it-dd-train": ["TO_BOOK", false, null],
    };
    expect(await states()).toEqual(expected);
    await run();
    expect(await states()).toEqual(expected);
  });

  it("Still to book and its Flag no longer carry an own-car drive; the train still does", async () => {
    const { stillToBook, steps } = await loadHomePlanningData(TRIP_ID, today, "planning", TRIP, OWNER);
    const listed = stillToBook.map((r) => r.id);
    expect(listed).toContain("it-dd-train");
    expect(listed).not.toContain("it-dd-drive");
    expect(listed).not.toContain("it-dd-drive-blank");
    const flagged = steps.map((s) => s.id);
    expect(flagged).toContain("still-to-book-it-dd-train");
    expect(flagged).not.toContain("still-to-book-it-dd-drive");
    expect(flagged).not.toContain("still-to-book-it-dd-drive-blank");
  });
});
