import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Task Z addendum item 1: `createFork` and `duplicateTrip` copy or reset the
// new planning columns (bookingState, bookingStateSet, bookBy, slotTime,
// arriveByMinutes, refundable, openingHours) per S.7/S.8's as-built rules
// (notes-S.md decision 8):
//   - Fork is a faithful copy: it carries every new column.
//   - Duplicate drops references, dates and times: it carries only
//     `openingHours` (it belongs to the place, like `address`); the rest
//     fall to the column defaults.
// This exists because object spreads aren't excess-property-checked — a
// builder that silently dropped a field, or a Prisma `data` object that
// silently carried one it shouldn't, would type-check fine.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: () => { throw new Error("REDIRECT"); } }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null), geocodePlaceDetailed: vi.fn(async () => null) }));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/guards")>("@/lib/guards");
  return {
    ...actual,
    requireUser: vi.fn(async () => ({ id: USER, email: "it-fdc@example.test" })),
    requireTripAccess: vi.fn(async () => ({ user: { id: USER, email: "it-fdc@example.test" }, membership: { role: "owner" } })),
  };
});

import { db } from "@/lib/db";
import { createFork } from "@/server/actions/forks";
import { duplicateTrip } from "@/server/actions/trips";

const USER = "it-fdc-user";
const TRIP_ID = "it-fdc-trip";
const PORTO = "it-fdc-porto";
const HOURS = JSON.stringify({ week: { sun: [], mon: [["10:00", "18:00"]], tue: [], wed: [], thu: [], fri: [], sat: [] }, seasons: [], closed: [], source: null });

// A To-book leg, a Traveller-chosen To-book stay, and a thing to do carrying
// every new column, none of them defaults — so a column that got dropped (or
// one that leaked through when it shouldn't) is visible either way.
const TRANSPORT_FIELDS = { bookingState: "TO_BOOK" as const, bookingStateSet: true, bookBy: "2027-05-01" };
const ACCOMMODATION_FIELDS = { bookingState: "TO_BOOK" as const, bookingStateSet: true, bookBy: "2027-05-02" };
const ITEM_FIELDS = {
  bookingState: "BOOKED" as const, bookingStateSet: true, bookBy: null,
  slotTime: "12:00", arriveByMinutes: 15, refundable: false, openingHours: HOURS,
};

describe.skipIf(process.env.INTEGRATION !== "1")("createFork and duplicateTrip carry/reset the planning columns (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "it-fdc@example.test", name: "IT FDC" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Fork/Duplicate copies", homeCurrency: "AUD", createdById: USER, forksEnabled: true,
        startDate: "2027-06-01", endDate: "2027-06-07", members: { create: { userId: USER, role: "owner" } },
      },
    });
    await db.stop.create({
      data: { id: PORTO, tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-07", nights: 6, sortOrder: 0 },
    });
    await db.transport.create({
      data: { tripId: TRIP_ID, mode: "TRAIN", toStopId: PORTO, sortOrder: 0, ...TRANSPORT_FIELDS },
    });
    await db.accommodation.create({
      data: { tripId: TRIP_ID, stopId: PORTO, name: "IT Casa", checkIn: "2027-06-01", checkOut: "2027-06-07", ...ACCOMMODATION_FIELDS },
    });
    await db.item.create({
      data: { tripId: TRIP_ID, stopId: PORTO, title: "IT Tour", category: "ACTIVITY", date: "2027-06-02", sortOrder: 0, ...ITEM_FIELDS },
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("a Fork carries bookingState, bookingStateSet, bookBy, slotTime, arriveByMinutes, refundable and openingHours", async () => {
    const result = await createFork(TRIP_ID, "IT Plan B");
    if (!result.success) throw new Error("expected createFork to succeed");
    const forkId = result.forkId;

    const transport = await db.transport.findFirstOrThrow({ where: { tripId: TRIP_ID, forkId } });
    expect(transport).toMatchObject(TRANSPORT_FIELDS);

    const accommodation = await db.accommodation.findFirstOrThrow({ where: { tripId: TRIP_ID, forkId } });
    expect(accommodation).toMatchObject(ACCOMMODATION_FIELDS);

    const item = await db.item.findFirstOrThrow({ where: { tripId: TRIP_ID, forkId } });
    expect(item).toMatchObject(ITEM_FIELDS);
  });

  it("Duplicate trip keeps only openingHours and resets the rest to their column defaults", async () => {
    const result = await duplicateTrip(TRIP_ID, "IT Copy");
    if (!result.success) throw new Error("expected duplicateTrip to succeed");
    const copyTripId = result.tripId;

    // Accommodations are dropped entirely by Duplicate (ADR-0018) — nothing
    // of ACCOMMODATION_FIELDS to check there.
    expect(await db.accommodation.count({ where: { tripId: copyTripId } })).toBe(0);

    const transport = await db.transport.findFirstOrThrow({ where: { tripId: copyTripId } });
    expect(transport).toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });

    const item = await db.item.findFirstOrThrow({ where: { tripId: copyTripId } });
    expect(item).toMatchObject({
      bookingState: "NONE", bookingStateSet: false, bookBy: null,
      slotTime: null, arriveByMinutes: null, refundable: null,
      openingHours: HOURS,
    });
  });
});
