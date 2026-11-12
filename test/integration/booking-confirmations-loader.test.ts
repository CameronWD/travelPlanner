import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { loadBookingConfirmationsToAdd } from "@/lib/booking-confirmations-loader";

const A = "it-bcl-planner";
const B = "it-bcl-member";
const TRIP_ID = "it-bcl-trip";
const PAST_TRIP_ID = "it-bcl-past-trip";
const FORK_ID = "it-bcl-fork";
const LISBON = "it-bcl-lisbon";
const SECRET = "it-bcl-secret";
const PAST_STOP = "it-bcl-past-stop";

const file = (id: string, targetType: string, targetId: string) => ({
  id, tripId: TRIP_ID, targetType, targetId, filename: `${id}.pdf`, mime: "application/pdf", size: 1, url: `/api/attachments/${id}`, uploadedById: A,
});

describe.skipIf(process.env.INTEGRATION !== "1")("loadBookingConfirmationsToAdd (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: A }, update: {}, create: { id: A, email: "bcl-planner@example.test", name: "Pat" } });
    await db.user.upsert({ where: { id: B }, update: {}, create: { id: B, email: "bcl-member@example.test", name: "Viv" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: { in: [TRIP_ID, PAST_TRIP_ID] } } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Booking confirmations", homeCurrency: "AUD", createdById: A, forksEnabled: true,
        startDate: "2030-06-01", endDate: "2030-06-10",
        members: { create: [{ userId: A, role: "owner" }, { userId: B, role: "member" }] },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: A } });
    await db.stop.createMany({
      data: [
        { id: LISBON, tripId: TRIP_ID, name: "IT Lisbon", timezone: "Europe/Lisbon", arriveDate: "2030-06-01", departDate: "2030-06-05", nights: 4, sortOrder: 0 },
        {
          id: SECRET, tripId: TRIP_ID, name: "IT Secret", timezone: "Europe/Lisbon", arriveDate: "2030-06-05", departDate: "2030-06-10", nights: 5, sortOrder: 1,
          surprisePlannerId: A, surpriseForIds: JSON.stringify([B]),
        },
      ],
    });
    await db.transport.createMany({
      data: [
        { id: "it-bcl-train", tripId: TRIP_ID, mode: "TRAIN", fromStopId: LISBON, toStopId: SECRET, sortOrder: 0, bookingState: "BOOKED", depAt: new Date("2030-06-05T09:00:00Z") },
        { id: "it-bcl-fork-leg", tripId: TRIP_ID, forkId: FORK_ID, mode: "TRAIN", sortOrder: 0, bookingState: "BOOKED", depAt: new Date("2030-06-05T09:00:00Z") },
      ],
    });
    await db.accommodation.create({
      data: { id: "it-bcl-hotel", tripId: TRIP_ID, stopId: LISBON, name: "IT Hotel", checkIn: "2030-06-01", checkOut: "2030-06-05", bookingState: "BOOKED" },
    });
    await db.item.createMany({
      data: [
        { id: "it-bcl-photo-only", tripId: TRIP_ID, stopId: LISBON, title: "IT Photo only", category: "ACTIVITY", date: "2030-06-02", sortOrder: 0, bookingState: "BOOKED", photoAttachmentId: "it-bcl-photo" },
        { id: "it-bcl-nothing", tripId: TRIP_ID, stopId: LISBON, title: "IT Nothing", category: "ACTIVITY", date: "2030-06-02", sortOrder: 1, bookingState: "BOOKED", nothingToAttach: true },
        { id: "it-bcl-tobook", tripId: TRIP_ID, stopId: LISBON, title: "IT To book", category: "ACTIVITY", date: "2030-06-03", sortOrder: 2, bookingState: "TO_BOOK" },
        { id: "it-bcl-wish", tripId: TRIP_ID, title: "IT Wish", category: "FOOD", sortOrder: 0, bookingState: "BOOKED" },
        { id: "it-bcl-secret-item", tripId: TRIP_ID, stopId: SECRET, title: "IT Secret spa", category: "ACTIVITY", date: "2030-06-06", sortOrder: 0, bookingState: "BOOKED" },
      ],
    });
    await db.attachment.createMany({
      data: [
        file("it-bcl-hotel-file", "ACCOMMODATION", "it-bcl-hotel"),
        file("it-bcl-photo", "ITEM", "it-bcl-photo-only"),
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: { in: [TRIP_ID, PAST_TRIP_ID] } } });
  });

  it("lists Booked real-plan things with no file, ordered by last day, skipping photo-only exclusions", async () => {
    const rows = await loadBookingConfirmationsToAdd(TRIP_ID, A);
    expect(rows).toEqual([
      { kind: "ITEM", id: "it-bcl-photo-only" },
      { kind: "TRANSPORT", id: "it-bcl-train" },
      { kind: "ITEM", id: "it-bcl-secret-item" },
    ]);
  });

  it("hides the Surprise item from the surprised viewer", async () => {
    const rows = await loadBookingConfirmationsToAdd(TRIP_ID, B);
    expect(rows.map((r) => r.id)).toEqual(["it-bcl-photo-only", "it-bcl-train"]);
  });

  it("a Past trip has none", async () => {
    await db.trip.create({
      data: {
        id: PAST_TRIP_ID, name: "IT Past", homeCurrency: "AUD", createdById: A, startDate: "2020-06-01", endDate: "2020-06-10",
        members: { create: [{ userId: A, role: "owner" }] },
      },
    });
    await db.stop.create({ data: { id: PAST_STOP, tripId: PAST_TRIP_ID, name: "IT Old", timezone: "Europe/Lisbon", arriveDate: "2020-06-01", departDate: "2020-06-10", nights: 9, sortOrder: 0 } });
    await db.item.create({ data: { id: "it-bcl-old", tripId: PAST_TRIP_ID, stopId: PAST_STOP, title: "IT Old", category: "ACTIVITY", sortOrder: 0, bookingState: "BOOKED" } });
    expect(await loadBookingConfirmationsToAdd(PAST_TRIP_ID, A)).toEqual([]);
  });
});
