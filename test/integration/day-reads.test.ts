import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { readDayRows } from "@/lib/day-reads";

// Real Postgres (npm run test:integration). lib/day-reads.test.ts mocks the
// db; only a real database proves the selects, the plan scope and the
// Surprise fragments are ones Postgres accepts and applies.
const PLANNER = "it-dayreads-planner";
const MEMBER = "it-dayreads-member";
const TRIP_ID = "it-dayreads-trip";
const FORK_ID = "it-dayreads-fork";
const PORTO = "it-dayreads-porto";
const SECRET = "it-dayreads-secret";
const FORK_STOP = "it-dayreads-seville";
const none = async () => null;

describe.skipIf(process.env.INTEGRATION !== "1")("readDayRows (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: PLANNER }, update: {}, create: { id: PLANNER, email: "dayreads-planner@example.test", name: "Pat" } });
    await db.user.upsert({ where: { id: MEMBER }, update: {}, create: { id: MEMBER, email: "dayreads-member@example.test", name: "Viv" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades members, forks, stops, items, stays, day titles
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Day reads", homeCurrency: "AUD", createdById: PLANNER, forksEnabled: true, chaptersEnabled: true,
        startDate: "2027-06-01", endDate: "2027-06-07",
        members: { create: [{ userId: PLANNER, role: "owner" }, { userId: MEMBER, role: "member" }] },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: PLANNER } });
    await db.stop.createMany({
      data: [
        { id: PORTO, tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, sortOrder: 0 },
        // A live Surprise (departs in the future) hidden from MEMBER.
        {
          id: SECRET, tripId: TRIP_ID, name: "IT Secret", timezone: "Europe/Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-07", nights: 3, sortOrder: 1,
          surprisePlannerId: PLANNER, surpriseForIds: JSON.stringify([MEMBER]),
        },
        { id: FORK_STOP, tripId: TRIP_ID, forkId: FORK_ID, name: "IT Seville", timezone: "Europe/Madrid", arriveDate: "2027-06-01", departDate: "2027-06-07", nights: 6, sortOrder: 0 },
      ],
    });
    await db.item.createMany({
      data: [
        { id: "it-dr-tram", tripId: TRIP_ID, stopId: PORTO, title: "IT Tram 22", category: "ACTIVITY", date: "2027-06-02", sortOrder: 0, slotTime: "10:00", arriveByMinutes: 15, refundable: false },
        // A Surprise Item on a seen Stop: MEMBER gets a placeholder on its day.
        { id: "it-dr-dinner", tripId: TRIP_ID, stopId: PORTO, title: "IT Birthday dinner", category: "FOOD", date: "2027-06-03", startTime: "19:30", sortOrder: 1, surprisePlannerId: PLANNER, surpriseForIds: JSON.stringify([MEMBER]), bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20", slotTime: "19:45", refundable: false },
        // Inside the Surprise Stop: hidden from MEMBER, no placeholder (only a root Item gets one).
        { id: "it-dr-inside", tripId: TRIP_ID, stopId: SECRET, title: "IT Hidden spa", category: "ACTIVITY", date: "2027-06-05", sortOrder: 0 },
        { id: "it-dr-idea", tripId: TRIP_ID, title: "IT Port lodge tour", category: "FOOD", sortOrder: 0 },
        { id: "it-dr-todo", tripId: TRIP_ID, stopId: PORTO, title: "IT Livraria Lello", category: "SIGHTSEEING", sortOrder: 0 },
        { id: "it-dr-fork", tripId: TRIP_ID, forkId: FORK_ID, stopId: FORK_STOP, title: "IT Flamenco", category: "NIGHTLIFE", date: "2027-06-02", sortOrder: 0 },
      ],
    });
    await db.accommodation.create({
      data: { id: "it-dr-villa", tripId: TRIP_ID, stopId: SECRET, name: "IT Secret villa", checkIn: "2027-06-04", checkOut: "2027-06-07" },
    });
    // Booking state (spec 2026-10-17 R2): a tentative leg with a book-by date.
    await db.transport.create({
      data: {
        id: "it-dr-leg", tripId: TRIP_ID, mode: "TRAIN", fromStopId: PORTO, toStopId: SECRET, sortOrder: 0,
        bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2027-05-01",
      },
    });
    await db.dayTitle.createMany({
      data: [
        { stopId: PORTO, dayIndex: 1, title: "IT Tram day" },
        { stopId: SECRET, dayIndex: 0, title: "IT The big reveal" },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the surprised member: the Stop's shell, a placeholder on the Item's day, nothing from inside, no Fork rows", async () => {
    const read = await readDayRows(TRIP_ID, MEMBER, none);
    if (typeof read === "string") throw new Error(read);
    const { rows } = read;
    expect(rows.stops.map((s) => s.id)).toEqual([PORTO, SECRET]);
    expect(rows.stops.find((s) => s.id === SECRET)?.surprise?.youAreSurprised).toBe(true);
    expect(rows.items.map((i) => [i.id, i.title, i.date])).toEqual([
      ["it-dr-tram", "IT Tram 22", "2027-06-02"],
      ["it-dr-dinner", "Surprise", "2027-06-03"],
    ]);
    expect(rows.items[1].surprise?.youAreSurprised).toBe(true);
    expect(rows.accommodations).toEqual([]);
    expect(rows.dayTitles.map((t) => t.title)).toEqual(["IT Tram day"]);
    expect(rows.wishlist.map((w) => w.id)).toEqual(["it-dr-idea"]);
    expect(rows.thingsToDo.map((t) => t.id)).toEqual(["it-dr-todo"]);
    expect(JSON.stringify(rows)).not.toMatch(/Birthday dinner|Hidden spa|Secret villa|big reveal|Seville|Flamenco/);
  });

  it("the planner sees inside, with their own Surprise's view for the badge", async () => {
    const read = await readDayRows(TRIP_ID, PLANNER, none);
    if (typeof read === "string") throw new Error(read);
    const { rows } = read;
    expect(rows.items.map((i) => i.id).sort()).toEqual(["it-dr-dinner", "it-dr-inside", "it-dr-tram"]);
    expect(rows.items.find((i) => i.id === "it-dr-dinner")).toMatchObject({ title: "IT Birthday dinner", surprise: { youAreSurprised: false } });
    expect(rows.accommodations.map((a) => a.id)).toEqual(["it-dr-villa"]);
    expect(rows.dayTitles).toHaveLength(2);
  });

  it("carries Booking state; the surprised member's placeholder is never To book (spec R2)", async () => {
    const planner = await readDayRows(TRIP_ID, PLANNER, none);
    if (typeof planner === "string") throw new Error(planner);
    expect(planner.rows.transports.find((t) => t.id === "it-dr-leg")).toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2027-05-01" });
    expect(planner.rows.items.find((i) => i.id === "it-dr-dinner")).toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20" });
    expect(planner.rows.accommodations.find((a) => a.id === "it-dr-villa")).toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });

    const member = await readDayRows(TRIP_ID, MEMBER, none);
    if (typeof member === "string") throw new Error(member);
    expect(member.rows.items.find((i) => i.id === "it-dr-dinner")).toMatchObject({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
  });

  it("the slot fields come back for a seen Item and are masked on a placeholder (R3)", async () => {
    const member = await readDayRows(TRIP_ID, MEMBER, none);
    if (typeof member === "string") throw new Error(member);
    expect(member.rows.items.find((i) => i.id === "it-dr-tram")).toMatchObject({ slotTime: "10:00", arriveByMinutes: 15, refundable: false });
    expect(member.rows.items.find((i) => i.id === "it-dr-dinner")).toMatchObject({ title: "Surprise", slotTime: null, arriveByMinutes: null, refundable: null });
    const planner = await readDayRows(TRIP_ID, PLANNER, none);
    if (typeof planner === "string") throw new Error(planner);
    expect(planner.rows.items.find((i) => i.id === "it-dr-dinner")).toMatchObject({ slotTime: "19:45", refundable: false });
  });
});
