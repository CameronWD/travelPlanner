import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// R3 against the real Postgres: the slot columns exist, the default start is
// written on create/update/schedule, and an explicit start is never moved.
// Mocks as test/integration/booking-state.test.ts: only the Next/auth boundary,
// the network and Activity; the actions and Prisma run for real.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null), geocodePlaceDetailed: vi.fn(async () => null) }));
vi.mock("@/lib/money/fx", () => ({ resolveRateForTrip: vi.fn(async () => ({ rate: 1, persist: null })), persistRate: vi.fn(async () => undefined) }));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-slot-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-slot-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-slot-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const delegate = (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind];
    const row = await delegate.findUnique({ where: { id } });
    if (!row) throw new Error("NOT_FOUND");
    return { row, user: { id: "it-slot-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { createItem, scheduleItem, updateItem } from "@/server/actions/items";

const TRIP_ID = "it-trip-slot";
const row = (id: string) =>
  db.item.findUniqueOrThrow({ where: { id }, select: { startTime: true, slotTime: true, arriveByMinutes: true, refundable: true, date: true } });

describe.skipIf(process.env.INTEGRATION !== "1")("Slot time: start defaults to slot − arrive-by on write (R3, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-slot-user" }, update: {}, create: { id: "it-slot-user", email: "it-slot-user@example.test", name: "Slot User", isEmailVerified: true } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "Slot trip", homeCurrency: "AUD", startDate: "2027-06-01", endDate: "2027-06-07", createdById: "it-slot-user",
        members: { create: { userId: "it-slot-user", role: "owner" } } },
    });
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("create: no start → slot − arrive-by; refundable defaults to not known (null)", async () => {
    const r = await createItem(TRIP_ID, { title: "Lodge tour", category: "ACTIVITY", date: "2027-06-02", slotTime: "12:00", arriveByMinutes: 15 });
    if (!r.success) throw new Error(JSON.stringify(r.errors));
    expect(await row(r.id)).toEqual({ date: "2027-06-02", startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: null });
  });

  it("create: the default clamps at 00:00, never the day before", async () => {
    const r = await createItem(TRIP_ID, { title: "Midnight mass", category: "ACTIVITY", date: "2027-06-02", slotTime: "00:10", arriveByMinutes: 30 });
    if (!r.success) throw new Error(JSON.stringify(r.errors));
    expect(await row(r.id)).toMatchObject({ date: "2027-06-02", startTime: "00:00" });
  });

  it("create: an explicit start is kept; update: moving the slot keeps it, clearing it re-defaults", async () => {
    const r = await createItem(TRIP_ID, { title: "Sitting", category: "FOOD", date: "2027-06-03", startTime: "19:00", slotTime: "19:30", arriveByMinutes: 10, refundable: false });
    if (!r.success) throw new Error(JSON.stringify(r.errors));
    expect(await row(r.id)).toMatchObject({ startTime: "19:00", refundable: false });
    expect(await updateItem(r.id, { slotTime: "20:00" })).toEqual({ success: true });
    expect(await row(r.id)).toMatchObject({ startTime: "19:00", slotTime: "20:00" });
    expect(await updateItem(r.id, { startTime: null })).toEqual({ success: true });
    expect(await row(r.id)).toMatchObject({ startTime: "19:50" });
    expect(await updateItem(r.id, { refundable: null })).toEqual({ success: true });
    expect(await row(r.id)).toMatchObject({ refundable: null, startTime: "19:50" });
  });

  it("an undated idea keeps its slot and no start; scheduling it defaults the placed copy's start", async () => {
    const idea = await createItem(TRIP_ID, { title: "Fado night", category: "NIGHTLIFE", slotTime: "21:00", arriveByMinutes: 30, refundable: true });
    if (!idea.success) throw new Error(JSON.stringify(idea.errors));
    expect(await row(idea.id)).toMatchObject({ date: null, startTime: null, slotTime: "21:00" });
    const placed = await scheduleItem(idea.id, { date: "2027-06-04" });
    if (!placed.success || !placed.placedItemId) throw new Error("expected a placed copy");
    expect(await row(placed.placedItemId)).toEqual({ date: "2027-06-04", startTime: "20:30", slotTime: "21:00", arriveByMinutes: 30, refundable: true });
  });
});
