import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Spec 2026-10-17 R2 against the real Postgres: the stored Booking state is
// the effective one, a reference implies Booked unless the Traveller chose,
// and a book-by date rides only with To book. Only the Next/auth boundary,
// the network (geocode, FX) and Activity are mocked.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null), geocodePlaceDetailed: vi.fn(async () => null) }));
vi.mock("@/lib/money/fx", () => ({ resolveRateForTrip: vi.fn(async () => ({ rate: 1, persist: null })), persistRate: vi.fn(async () => undefined) }));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-bs-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-bs-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-bs-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const { notFound } = await import("next/navigation");
    const row = await (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind].findUnique({ where: { id } });
    if (!row) notFound();
    return { row, user: { id: "it-bs-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { createItem, updateItem, scheduleItem } from "@/server/actions/items";
import { createTransport, updateTransport } from "@/server/actions/transport";
import { createAccommodation, updateAccommodation } from "@/server/actions/accommodation";

const TRIP_ID = "it-trip-booking-state";
const BOOKING = { bookingState: true, bookingStateSet: true, bookBy: true } as const;

describe.skipIf(process.env.INTEGRATION !== "1")("Booking state on write (spec R2, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-bs-user" }, update: {}, create: { id: "it-bs-user", email: "it-bs@example.test", name: "BS", isEmailVerified: true } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "Booking state trip", homeCurrency: "AUD", startDate: "2027-06-01", endDate: "2027-06-10", createdById: "it-bs-user",
        members: { create: { userId: "it-bs-user", role: "owner" } } },
    });
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  describe("Item", () => {
    it("needs no booking by default; a booking reference makes it Booked", async () => {
      const plain = await createItem(TRIP_ID, { title: "Walk", category: "ACTIVITY" });
      const ticket = await createItem(TRIP_ID, { title: "Museum", category: "SIGHTSEEING", booking: "BK-1" });
      expect(await db.item.findUnique({ where: { id: (plain as { id: string }).id }, select: BOOKING }))
        .toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
      expect(await db.item.findUnique({ where: { id: (ticket as { id: string }).id }, select: BOOKING }))
        .toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    });

    it("a chosen To book keeps its book-by date; adding a reference later doesn't overrule the choice", async () => {
      const r = await createItem(TRIP_ID, { title: "Tour", category: "ACTIVITY", bookingState: "TO_BOOK", bookBy: "2027-05-20" });
      const id = (r as { id: string }).id;
      expect(await updateItem(id, { booking: "TOUR-7" })).toEqual({ success: true });
      expect(await db.item.findUnique({ where: { id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20" });
    });

    it("refuses a book-by date on a Booked Item and leaves the row alone", async () => {
      const r = await createItem(TRIP_ID, { title: "Opera", category: "NIGHTLIFE", booking: "OP-1" });
      const id = (r as { id: string }).id;
      const res = await updateItem(id, { bookBy: "2027-05-01" });
      expect(res).toMatchObject({ success: false, errors: { bookBy: [expect.any(String)] } });
      expect(await db.item.findUnique({ where: { id }, select: BOOKING })).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    });

    it("a placed copy of a To book idea is To book by the same date", async () => {
      const idea = await db.item.create({
        data: { tripId: TRIP_ID, title: "Cooking class", category: "ACTIVITY", sortOrder: 50, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-15" },
      });
      const placed = await scheduleItem(idea.id, { date: "2027-06-03" });
      expect(placed.success).toBe(true);
      const copyId = (placed as { placedItemId: string }).placedItemId;
      expect(await db.item.findUnique({ where: { id: copyId }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-15" });
    });
  });

  describe("Transport", () => {
    const leg = { mode: "TRAIN" as const, depPlace: "Strasbourg", arrPlace: "Frankfurt", depAt: "2027-06-04T09:00", arrAt: "2027-06-04T11:00" };

    it("a leg with no reference is To book; one with a reference is Booked", async () => {
      const tentative = (await createTransport(TRIP_ID, leg)) as { id: string };
      const booked = (await createTransport(TRIP_ID, { ...leg, reference: "ICE 512" })) as { id: string };
      expect(await db.transport.findUnique({ where: { id: tentative.id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
      expect(await db.transport.findUnique({ where: { id: booked.id }, select: BOOKING })).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    });

    it("an un-chosen To book leg with a book-by date becomes Booked when its reference arrives, and drops the date", async () => {
      const r = (await createTransport(TRIP_ID, { ...leg, bookBy: "2027-05-01" })) as { id: string };
      expect(await db.transport.findUnique({ where: { id: r.id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2027-05-01" });
      expect(await updateTransport(r.id, { reference: "ICE 9" })).toEqual({ success: true });
      expect(await db.transport.findUnique({ where: { id: r.id }, select: BOOKING })).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    });

    it("a leg the Traveller set to To book stays To book with a reference; choosing Booked clears its date", async () => {
      const r = (await createTransport(TRIP_ID, { ...leg, bookingState: "TO_BOOK", bookBy: "2027-05-02" })) as { id: string };
      await updateTransport(r.id, { reference: "ICE 10" });
      expect(await db.transport.findUnique({ where: { id: r.id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-02" });
      await updateTransport(r.id, { bookingState: "BOOKED", bookBy: null });
      expect(await db.transport.findUnique({ where: { id: r.id }, select: BOOKING })).toEqual({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
    });
  });

  describe("Accommodation", () => {
    it("is To book without a confirmation, Booked with one, and a notes-only edit keeps the state", async () => {
      const stop = await db.stop.create({ data: { tripId: TRIP_ID, name: "Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, sortOrder: 0 } });
      const open = (await createAccommodation({ stopId: stop.id, name: "Casa", checkIn: "2027-06-01", checkOut: "2027-06-04", bookBy: "2027-04-30" })) as { id: string };
      const done = (await createAccommodation({ stopId: stop.id, name: "Hotel", checkIn: "2027-06-01", checkOut: "2027-06-04", confirmation: "HX-1" })) as { id: string };
      expect(await db.accommodation.findUnique({ where: { id: open.id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2027-04-30" });
      expect(await db.accommodation.findUnique({ where: { id: done.id }, select: BOOKING })).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
      expect(await updateAccommodation(open.id, { notes: "Late check-in" })).toEqual({ success: true });
      expect(await db.accommodation.findUnique({ where: { id: open.id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2027-04-30" });
    });

    it("a stay with friends can be No booking needed, and stays so", async () => {
      const stop = await db.stop.create({ data: { tripId: TRIP_ID, name: "Aghalee", timezone: "Europe/London", arriveDate: "2027-06-05", departDate: "2027-06-07", nights: 2, sortOrder: 1 } });
      const r = (await createAccommodation({ stopId: stop.id, name: "Aunt's house", checkIn: "2027-06-05", checkOut: "2027-06-07", bookingState: "NONE" })) as { id: string };
      expect(await db.accommodation.findUnique({ where: { id: r.id }, select: BOOKING })).toEqual({ bookingState: "NONE", bookingStateSet: true, bookBy: null });
      expect(await updateAccommodation(r.id, { confirmation: "none needed" })).toEqual({ success: true });
      expect(await db.accommodation.findUnique({ where: { id: r.id }, select: BOOKING })).toEqual({ bookingState: "NONE", bookingStateSet: true, bookBy: null });
    });
  });
});
