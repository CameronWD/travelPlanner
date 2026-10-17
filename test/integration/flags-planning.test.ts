import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { loadFlagRows, flagsForRows } from "@/lib/flags-loader";
import { loadHomePlanningData, type HomeTripInput } from "@/lib/desktop-home-loader";
import { serializeOpeningHours } from "@/lib/validations/opening-hours";
import { addDays } from "@/lib/dates";
import { todayISOInZone } from "@/lib/tz";

// Real Postgres (spec 2026-10-17 R7): the six planning Flags come out of the
// one Flag read on the real plan only, Surprise-aware, never for a Wishlist
// idea or a Fork's row, and Home's Next steps carry the same Flags.
// Dates are relative to the Trip's real today (lib/trip-today.ts reads the
// clock in the current Stop's zone), so the book-by windows hold whenever
// this runs.
const OWNER = "it-fp-owner";
const MEMBER = "it-fp-member";
const TRIP_ID = "it-fp-trip";
const FORK_ID = "it-fp-fork";
const TZ = "Europe/Lisbon";
const forMember = JSON.stringify([MEMBER]);
const today = todayISOInZone(TZ);
const D = (n: number) => addDays(today, n);
const PROJECTION = { projectedEnd: null, hardEndDate: null, deadline: null };
type Spans = [string, string][];
const everyDay = (spans: Spans) => ({ sun: spans, mon: spans, tue: spans, wed: spans, thu: spans, fri: spans, sat: spans });
const open10to6 = serializeOpeningHours({ week: everyDay([["10:00", "18:00"]]), seasons: [], closed: [] });
const closedOn = (date: string) => serializeOpeningHours({ week: {}, seasons: [], closed: [date] });
const TRIP: HomeTripInput = {
  id: TRIP_ID, startDate: D(3), endDate: D(10), homeCurrency: "EUR", drivingWindingFactor: 1.3, drivingAvgSpeedKph: 80,
  homeName: null, homeLat: null, homeLng: null, homeCountryCode: null, homeTimezone: null, roundTrip: false, chaptersEnabled: false,
};

async function flagIds(viewer: string) {
  const rows = await loadFlagRows(TRIP_ID, viewer);
  return flagsForRows(rows!, PROJECTION);
}

describe.skipIf(process.env.INTEGRATION !== "1")("planning Flags (real Postgres)", () => {
  beforeAll(async () => {
    for (const id of [OWNER, MEMBER]) await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, name: id } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT Planning flags", homeCurrency: "EUR", createdById: OWNER, forksEnabled: true, startDate: D(3), endDate: D(10), roundTrip: false,
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] } },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT B", createdById: OWNER } });
    await db.stop.createMany({ data: [
      { id: "it-fp-porto", tripId: TRIP_ID, name: "IT Porto", timezone: TZ, arriveDate: D(3), departDate: D(6), nights: 3, sortOrder: 0 },
      { id: "it-fp-secret", tripId: TRIP_ID, name: "IT Secret", timezone: TZ, arriveDate: D(6), departDate: D(10), nights: 4, sortOrder: 1, surprisePlannerId: OWNER, surpriseForIds: forMember },
      { id: "it-fp-fork-stop", tripId: TRIP_ID, forkId: FORK_ID, name: "IT Fork stop", timezone: TZ, arriveDate: D(3), departDate: D(6), nights: 3, sortOrder: 0 },
    ] });
    await db.transport.create({ data: {
      id: "it-fp-leg", tripId: TRIP_ID, mode: "TRAIN", fromStopId: "it-fp-porto", toStopId: "it-fp-secret", depAt: new Date(`${D(6)}T08:00:00Z`), sortOrder: 0,
      bookingState: "TO_BOOK", bookingStateSet: false,
    } });
    await db.accommodation.createMany({ data: [
      { id: "it-fp-casa", tripId: TRIP_ID, stopId: "it-fp-porto", name: "IT Casa", checkIn: D(3), checkOut: D(6), bookingState: "TO_BOOK", bookingStateSet: true, bookBy: D(-2) },
      { id: "it-fp-hidden-stay", tripId: TRIP_ID, stopId: "it-fp-secret", name: "IT Secret hotel", checkIn: D(6), checkOut: D(10), bookingState: "TO_BOOK", bookingStateSet: false },
    ] });
    await db.item.createMany({ data: [
      { id: "it-fp-closed", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Closed museum", category: "SIGHTSEEING", date: D(4), sortOrder: 0, openingHours: closedOn(D(4)) },
      { id: "it-fp-early", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Gallery", category: "SIGHTSEEING", date: D(4), startTime: "09:30", endTime: "10:30", sortOrder: 1, openingHours: open10to6 },
      { id: "it-fp-late", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Palace", category: "SIGHTSEEING", date: D(5), startTime: "17:00", endTime: "18:30", sortOrder: 2, openingHours: open10to6 },
      { id: "it-fp-slot", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Tour", category: "ACTIVITY", date: D(5), startTime: "11:50", slotTime: "12:00", arriveByMinutes: 15, sortOrder: 3 },
      { id: "it-fp-gift", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Gift", category: "FOOD", date: D(5), sortOrder: 4, openingHours: closedOn(D(5)), surprisePlannerId: OWNER, surpriseForIds: forMember },
      { id: "it-fp-pass", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Tram pass", category: "GETTING_AROUND", sortOrder: 5, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: D(2) },
      { id: "it-fp-idea", tripId: TRIP_ID, title: "IT Idea", category: "FOOD", sortOrder: 6, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: D(-1) },
      { id: "it-fp-fork-item", tripId: TRIP_ID, forkId: FORK_ID, stopId: "it-fp-fork-stop", title: "IT Fork museum", category: "SIGHTSEEING", date: D(4), sortOrder: 0, openingHours: closedOn(D(4)) },
    ] });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the planner sees all six kinds on the real plan, worded for them", async () => {
    const flags = await flagIds(OWNER);
    const ids = flags.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining([
      "item-closed-it-fp-closed",
      "item-before-open-it-fp-early",
      "item-after-close-it-fp-late",
      "item-late-slot-it-fp-slot",
      "item-closed-it-fp-gift",
      "book-by-soon-it-fp-pass",
      "book-by-overdue-it-fp-casa",
      "still-to-book-it-fp-leg",
      "still-to-book-it-fp-hidden-stay",
    ]));
    expect(flags.find((f) => f.id === "item-before-open-it-fp-early")?.message).toBe("IT Gallery opens at 10:00; this starts 09:30.");
    expect(flags.find((f) => f.id === "still-to-book-it-fp-leg")?.message).toMatch(/^The train from IT Porto to IT Secret is still to book and leaves in 6 days/);
    expect(flags.find((f) => f.id === "item-closed-it-fp-closed")).toMatchObject({ targetType: "ITEM", targetId: "it-fp-closed", date: D(4), stopId: "it-fp-porto" });
  });

  it("never a Wishlist idea or a Fork's row", async () => {
    const ids = (await flagIds(OWNER)).map((f) => f.id);
    expect(ids.filter((id) => id.includes("it-fp-idea") || id.includes("it-fp-fork-item"))).toEqual([]);
  });

  it("the Traveller a Surprise is for gets nothing about what's inside it; the leg into it still flags", async () => {
    const ids = (await flagIds(MEMBER)).map((f) => f.id);
    expect(ids).not.toContain("item-closed-it-fp-gift");
    expect(ids).not.toContain("still-to-book-it-fp-hidden-stay");
    expect(ids).toEqual(expect.arrayContaining(["item-closed-it-fp-closed", "book-by-overdue-it-fp-casa", "still-to-book-it-fp-leg"]));
  });

  it("Home's Next steps carry the same Flags, linked to where they are fixed", async () => {
    const { steps } = await loadHomePlanningData(TRIP_ID, today, "planning", TRIP, OWNER);
    const ids = steps.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["item-closed-it-fp-closed", "book-by-overdue-it-fp-casa", "item-late-slot-it-fp-slot"]));
    expect(steps.find((s) => s.id === "item-closed-it-fp-closed")?.href).toContain(`/day/${D(4)}`);
    const member = await loadHomePlanningData(TRIP_ID, today, "planning", TRIP, MEMBER);
    expect(member.steps.map((s) => s.id)).not.toContain("item-closed-it-fp-gift");
  });
});
