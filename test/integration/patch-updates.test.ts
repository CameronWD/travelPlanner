import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ADR 0075 against the real Postgres: an update that names one field keeps
// every other column; an explicit null clears. Only the Next/auth boundary,
// the network (geocode, FX) and Activity are mocked; the actions and Prisma run for real.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({
  geocodePlace: vi.fn(async () => null),
  geocodePlaceDetailed: vi.fn(async () => null),
}));
vi.mock("@/lib/fx", () => ({
  resolveRateForTrip: vi.fn(async () => ({ rate: 1, persist: null })),
  persistRate: vi.fn(async () => undefined),
}));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
  // The actions only read id/tripId/forkId (+ the reminder's own fields) off the guard's row.
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const { notFound } = await import("next/navigation");
    const delegate = (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind];
    const row = await delegate.findUnique({ where: { id }, ...(kind === "reminder" ? { include: { stop: { select: { name: true } } } } : {}) });
    if (!row) notFound();
    return { row, user: { id: "it-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { updateReminder } from "@/server/actions/reminders";
import { updateChapter } from "@/server/actions/chapters";
import { updateTrip } from "@/server/actions/trips";
import { updateCost } from "@/server/actions/costs";
import { updateAccommodation } from "@/server/actions/accommodation";
import { updateItem } from "@/server/actions/items";

const TRIP_ID = "it-trip-patch";

describe.skipIf(process.env.INTEGRATION !== "1")("update actions take a PATCH (ADR 0075, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it-user@example.test", name: "It User", isEmailVerified: true } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "PATCH trip", homeCurrency: "AUD", startDate: "2026-05-01", endDate: "2026-05-20", hardEndDate: "2026-05-25", createdById: "it-user",
        members: { create: { userId: "it-user", role: "owner" } } },
    });
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  describe("Reminder", () => {
    it("a title-only patch keeps the date and the Stop", async () => {
      const stop = await db.stop.create({ data: { tripId: TRIP_ID, name: "Rome", nights: 2, sortOrder: 0 } });
      const r = await db.reminder.create({ data: { tripId: TRIP_ID, title: "Old", date: "2026-05-02", stopId: stop.id } });
      expect(await updateReminder(r.id, { title: "New" })).toEqual({ success: true });
      expect(await db.reminder.findUnique({ where: { id: r.id } })).toMatchObject({ title: "New", date: "2026-05-02", stopId: stop.id });
    });
  });

  describe("Chapter", () => {
    it("a name-only patch keeps colour and dates; explicit nulls clear the dates", async () => {
      const ch = await db.chapter.create({ data: { tripId: TRIP_ID, name: "Italy", colour: "amber", startDate: "2026-05-01", endDate: "2026-05-05", sortOrder: 0 } });
      await updateChapter(ch.id, { name: "Italia" });
      expect(await db.chapter.findUnique({ where: { id: ch.id } })).toMatchObject({ name: "Italia", colour: "amber", startDate: "2026-05-01", endDate: "2026-05-05" });
      await updateChapter(ch.id, { startDate: null, endDate: null });
      expect(await db.chapter.findUnique({ where: { id: ch.id } })).toMatchObject({ name: "Italia", startDate: null, endDate: null });
    });
  });

  describe("Trip", () => {
    it("a name-only patch keeps the dates and the Hard end date (the hardEndDate data-loss round)", async () => {
      expect(await updateTrip(TRIP_ID, { name: "PATCH trip, renamed" })).toMatchObject({ success: true });
      expect(await db.trip.findUnique({ where: { id: TRIP_ID } })).toMatchObject({
        name: "PATCH trip, renamed", startDate: "2026-05-01", endDate: "2026-05-20", hardEndDate: "2026-05-25", homeCurrency: "AUD",
      });
    });
  });

  describe("Cost", () => {
    it("a category-only patch on a paid Cost keeps it paid; the editor's paidAt: null un-pays it and keeps the amount", async () => {
      const cost = await db.cost.create({ data: { tripId: TRIP_ID, ownerType: "OTHER", label: "Museum pass", costMinor: 12000, paidMinor: 12000, currency: "AUD", rateToHome: 1, paidAt: new Date("2026-04-01T00:00:00Z"), settlement: "BEFORE" } });
      await updateCost(cost.id, { category: "Tours" });
      expect(await db.cost.findUnique({ where: { id: cost.id } })).toMatchObject({ category: "Tours", label: "Museum pass", paidMinor: 12000, paidAt: new Date("2026-04-01T00:00:00Z") });
      await updateCost(cost.id, { costMinor: 12000, currency: "AUD", paidAt: null, settlement: "BEFORE" });
      expect(await db.cost.findUnique({ where: { id: cost.id } })).toMatchObject({ paidAt: null, paidMinor: 12000 });
    });

    it("a cost-amount-only patch (as through Claude) keeps a paid Cost paid with its paid pair", async () => {
      const cost = await db.cost.create({ data: { tripId: TRIP_ID, ownerType: "OTHER", label: "Ferry", costMinor: 8000, paidMinor: 7500, currency: "AUD", rateToHome: 1, paidAt: new Date("2026-04-02T00:00:00Z"), settlement: "BEFORE" } });
      expect(await updateCost(cost.id, { costMinor: 9000 })).toMatchObject({ success: true });
      expect(await db.cost.findUnique({ where: { id: cost.id } })).toMatchObject({ costMinor: 9000, paidMinor: 7500, paidAt: new Date("2026-04-02T00:00:00Z"), label: "Ferry" });
    });
  });

  describe("Accommodation", () => {
    it("a name-only patch keeps the rest; null clears notes; a cost-only patch keeps a paid Cost paid", async () => {
      const stop = await db.stop.create({ data: { tripId: TRIP_ID, name: "Lisbon", arriveDate: "2026-05-01", departDate: "2026-05-04", timezone: "Europe/Lisbon", sortOrder: 1 } });
      const acc = await db.accommodation.create({ data: { tripId: TRIP_ID, stopId: stop.id, name: "Hilton", address: "1 Rua", checkIn: "2026-05-01", checkOut: "2026-05-04", checkInTime: "15:00", confirmation: "ABC", notes: "old" } });
      const cost = await db.cost.create({ data: { tripId: TRIP_ID, ownerType: "ACCOMMODATION", ownerId: acc.id, costMinor: 9000, paidMinor: 9000, currency: "AUD", rateToHome: 1, paidAt: new Date("2026-04-15T00:00:00Z"), settlement: "BEFORE" } });
      expect(await updateAccommodation(acc.id, { name: "Hilton Garden Inn" })).toEqual({ success: true });
      expect(await db.accommodation.findUnique({ where: { id: acc.id } })).toMatchObject({ name: "Hilton Garden Inn", address: "1 Rua", checkInTime: "15:00", confirmation: "ABC", notes: "old", stopId: stop.id });
      expect(await updateAccommodation(acc.id, { notes: null })).toEqual({ success: true });
      expect(await db.accommodation.findUnique({ where: { id: acc.id } })).toMatchObject({ notes: null, confirmation: "ABC" });
      expect(await updateAccommodation(acc.id, { costMinor: 9500 })).toEqual({ success: true });
      expect(await db.cost.findUnique({ where: { id: cost.id } })).toMatchObject({ costMinor: 9500, paidMinor: 9000, paidAt: new Date("2026-04-15T00:00:00Z") });
    });
  });

  describe("Item", () => {
    it("a notes-only patch keeps hiddenFromShares and the schedule; null clears the link", async () => {
      const item = await db.item.create({ data: { tripId: TRIP_ID, title: "Colosseum", category: "SIGHTSEEING", date: "2026-05-02", startTime: "09:00", link: "https://example.test", hiddenFromShares: true, sortOrder: 0 } });
      await updateItem(item.id, { notes: "book ahead" });
      expect(await db.item.findUnique({ where: { id: item.id } })).toMatchObject({ notes: "book ahead", hiddenFromShares: true, date: "2026-05-02", startTime: "09:00", link: "https://example.test" });
      await updateItem(item.id, { link: null });
      expect(await db.item.findUnique({ where: { id: item.id } })).toMatchObject({ link: null, notes: "book ahead" });
    });
  });
});
