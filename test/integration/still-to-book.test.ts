import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { loadHomePlanningData, type HomeTripInput } from "@/lib/desktop-home-loader";

// Real Postgres: Home's Still to book reads the real plan only, leaves out
// Wishlist ideas and a Fork's rows, and never lists a thing inside a Surprise
// to the Traveller it's for (CONTEXT.md Surprise).
const OWNER = "it-stb-owner";
const MEMBER = "it-stb-member";
const TRIP_ID = "it-stb-trip";
const FORK_ID = "it-stb-fork";
const forMember = JSON.stringify([MEMBER]);
const TRIP: HomeTripInput = {
  id: TRIP_ID, startDate: "2027-06-01", endDate: "2027-06-10", homeCurrency: "AUD", drivingWindingFactor: 1.3, drivingAvgSpeedKph: 80,
  homeName: "Brisbane", homeLat: null, homeLng: null, homeCountryCode: "au", homeTimezone: "Australia/Brisbane", roundTrip: true, chaptersEnabled: false,
};

describe.skipIf(process.env.INTEGRATION !== "1")("Home Still to book (real Postgres)", () => {
  beforeAll(async () => {
    for (const id of [OWNER, MEMBER]) await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, name: id } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT STB", homeCurrency: "AUD", createdById: OWNER, forksEnabled: true, startDate: "2027-06-01", endDate: "2027-06-10",
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] } },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT B", createdById: OWNER } });
    await db.stop.createMany({ data: [
      { id: "it-stb-porto", tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-05", nights: 4, sortOrder: 0 },
      { id: "it-stb-secret", tripId: TRIP_ID, name: "IT Secret", timezone: "Europe/Lisbon", arriveDate: "2027-06-05", departDate: "2027-06-10", nights: 5, sortOrder: 1, surprisePlannerId: OWNER, surpriseForIds: forMember },
      { id: "it-stb-fork-stop", tripId: TRIP_ID, forkId: FORK_ID, name: "IT Fork stop", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-05", nights: 4, sortOrder: 0 },
    ] });
    const toBook = { bookingState: "TO_BOOK" as const, bookingStateSet: false };
    await db.transport.createMany({ data: [
      { id: "it-stb-leg", tripId: TRIP_ID, mode: "TRAIN", fromStopId: "it-stb-porto", toStopId: "it-stb-secret", depAt: new Date("2027-06-05T08:00:00Z"), sortOrder: 0, ...toBook, bookBy: "2027-05-01" },
      { id: "it-stb-flight", tripId: TRIP_ID, mode: "FLIGHT", depIsHome: true, toStopId: "it-stb-porto", reference: "QF1", sortOrder: 1, bookingState: "BOOKED", bookingStateSet: false },
      { id: "it-stb-fork-leg", tripId: TRIP_ID, forkId: FORK_ID, mode: "BUS", sortOrder: 0, ...toBook },
    ] });
    await db.accommodation.createMany({ data: [
      { id: "it-stb-casa", tripId: TRIP_ID, stopId: "it-stb-porto", name: "IT Casa", checkIn: "2027-06-01", checkOut: "2027-06-05", ...toBook, bookBy: "2027-05-01" },
      { id: "it-stb-hidden-stay", tripId: TRIP_ID, stopId: "it-stb-secret", name: "IT Secret hotel", checkIn: "2027-06-05", checkOut: "2027-06-10", ...toBook },
    ] });
    await db.item.createMany({ data: [
      { id: "it-stb-tour", tripId: TRIP_ID, stopId: "it-stb-porto", title: "IT Tour", category: "ACTIVITY", date: "2027-06-02", sortOrder: 0, bookingState: "TO_BOOK", bookingStateSet: true },
      { id: "it-stb-gift", tripId: TRIP_ID, stopId: "it-stb-porto", title: "IT Gift dinner", category: "FOOD", date: "2027-06-03", sortOrder: 1, bookingState: "TO_BOOK", bookingStateSet: true, surprisePlannerId: OWNER, surpriseForIds: forMember },
      { id: "it-stb-idea", tripId: TRIP_ID, title: "IT Idea", category: "FOOD", sortOrder: 2, bookingState: "TO_BOOK", bookingStateSet: true },
    ] });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the planner sees every real-plan thing still to book, soonest book-by first; no idea, Fork row or Booked leg", async () => {
    const { stillToBook } = await loadHomePlanningData(TRIP_ID, "2027-04-20", "planning", TRIP, OWNER);
    expect(stillToBook.map((r) => r.id)).toEqual(["it-stb-casa", "it-stb-leg", "it-stb-tour", "it-stb-gift", "it-stb-hidden-stay"]);
    expect(stillToBook[1]).toMatchObject({ subtitle: "Book by Sat 1 May · Leaves Sat 5 Jun", href: expect.stringContaining("/day/2027-06-05") });
  });

  it("the Traveller a Surprise is for never sees what's inside it", async () => {
    const { stillToBook } = await loadHomePlanningData(TRIP_ID, "2027-04-20", "planning", TRIP, MEMBER);
    expect(stillToBook.map((r) => r.id)).toEqual(["it-stb-casa", "it-stb-leg", "it-stb-tour"]);
  });
});
