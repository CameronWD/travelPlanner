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
});
