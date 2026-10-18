import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Spec 2026-10-17 R8, R10 against the real Postgres: Apply runs the app's own
// actions and records who and when, Undo puts the row back exactly (a derived
// Booking state goes back to derived), Undo refuses over a later edit, and a
// fix whose target is gone fails cleanly. Only the Next/auth boundary, the
// network (geocode, FX) and Activity are mocked.
const NOT_FOUND = () => Object.assign(new Error("NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw NOT_FOUND(); } }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null), geocodePlaceDetailed: vi.fn(async () => null) }));
vi.mock("@/lib/money/fx", () => ({ resolveRateForTrip: vi.fn(async () => ({ rate: 1, persist: null })), persistRate: vi.fn(async () => undefined) }));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-ra-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-ra-user" }, membership: { role: "member" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-ra-user" }, membership: { role: "member" }, plan: forkId ?? null })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const { notFound } = await import("next/navigation");
    const row = await (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind].findUnique({ where: { id } });
    if (!row) notFound();
    return { row, user: { id: "it-ra-user" }, membership: { role: "member" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { applyFinding, dismissFinding, undoFinding } from "@/server/actions/reviews";
import { REVIEW_ACTION_COPY } from "@/lib/review/fix";

const USER = "it-ra-user";
const TRIP_ID = "it-ra-trip";
const PORTO = "it-ra-porto";
const DINNER = "it-ra-dinner";
const TRAIN = "it-ra-train";
const T0 = new Date("2026-10-19T09:00:00Z");
const BOOKING = { bookingState: true, bookingStateSet: true, bookBy: true } as const;

async function finding(id: string, fix: object | null, reviewId = "it-ra-r2") {
  await db.finding.create({
    data: {
      id, reviewId, tripId: TRIP_ID, key: `BOOKING|ITEM|${id}`, severity: "warning", category: "BOOKING",
      targetType: "ITEM", targetId: DINNER, title: "t", detail: "d", origin: "MODEL", suggestedFix: fix ? JSON.stringify(fix) : null,
    },
  });
}
const stateOf = async (id: string) => db.finding.findUniqueOrThrow({ where: { id }, select: { state: true, stateById: true, stateAt: true, undoPayload: true } });

describe.skipIf(process.env.INTEGRATION !== "1")("Apply, Undo and Dismiss (spec 2026-10-17 R8, R10, real Postgres)", () => {
  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "it-ra@example.test", name: "IT RA" } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT Review actions", homeCurrency: "AUD", createdById: USER, startDate: "2027-06-01", endDate: "2027-06-07",
        members: { create: { userId: USER, role: "owner" } } },
    });
    await db.stop.create({ data: { id: PORTO, tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-07", nights: 6, sortOrder: 0 } });
    await db.item.create({ data: { id: DINNER, tripId: TRIP_ID, stopId: PORTO, title: "IT Dinner", category: "FOOD", date: "2027-06-03", startTime: "19:30", notes: "Cash only.", sortOrder: 0, bookingState: "NONE", bookingStateSet: false } });
    await db.transport.create({ data: { id: TRAIN, tripId: TRIP_ID, mode: "TRAIN", fromStopId: PORTO, depPlace: "Porto", arrPlace: "Lisbon", bookingState: "TO_BOOK", bookingStateSet: false } });
    await db.review.createMany({
      data: [
        { id: "it-ra-r1", tripId: TRIP_ID, startedById: USER, kind: "STANDARD", model: "m", status: "DONE", startedAt: T0, finishedAt: T0 },
        { id: "it-ra-r2", tripId: TRIP_ID, startedById: USER, kind: "STANDARD", model: "m", status: "DONE", startedAt: new Date(T0.getTime() + 1000), finishedAt: new Date(T0.getTime() + 2000) },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("Apply sets the Item To book by a date as a choice; Undo puts the derived state back", async () => {
    await finding("it-ra-f1", { kind: "item.bookingState", id: DINNER, bookingState: "TO_BOOK", bookBy: "2027-05-20" });
    expect(await applyFinding("it-ra-f1")).toEqual({ success: true });
    expect(await db.item.findUniqueOrThrow({ where: { id: DINNER }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20" });
    expect(await stateOf("it-ra-f1")).toMatchObject({ state: "APPLIED", stateById: USER });

    expect(await undoFinding("it-ra-f1")).toEqual({ success: true });
    expect(await db.item.findUniqueOrThrow({ where: { id: DINNER }, select: BOOKING })).toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
    expect(await stateOf("it-ra-f1")).toEqual({ state: "OPEN", stateById: null, stateAt: null, undoPayload: null });
  });

  it("Apply marks the train Booked through updateTransport", async () => {
    await finding("it-ra-f2", { kind: "transport.bookingState", id: TRAIN, bookingState: "BOOKED" });
    expect(await applyFinding("it-ra-f2")).toEqual({ success: true });
    expect(await db.transport.findUniqueOrThrow({ where: { id: TRAIN }, select: { bookingState: true, bookingStateSet: true } })).toEqual({ bookingState: "BOOKED", bookingStateSet: true });
  });

  it("Undo refuses over an edit made since Apply, and leaves the note alone", async () => {
    await finding("it-ra-f3", { kind: "item.note", itemId: DINNER, append: "Closed on Mondays." });
    await applyFinding("it-ra-f3");
    expect((await db.item.findUniqueOrThrow({ where: { id: DINNER } })).notes).toBe("Cash only.\n\nClosed on Mondays.");
    await db.item.update({ where: { id: DINNER }, data: { notes: "Rewritten by Xanni." } });
    expect(await undoFinding("it-ra-f3")).toMatchObject({ success: false, code: "changed" });
    expect((await db.item.findUniqueOrThrow({ where: { id: DINNER } })).notes).toBe("Rewritten by Xanni.");
    expect((await stateOf("it-ra-f3")).state).toBe("APPLIED");
  });

  it("an item.times fix with a day moves the Item and its time; Undo moves it back", async () => {
    await finding("it-ra-f4", { kind: "item.times", itemId: DINNER, startTime: "20:00", date: "2027-06-04" });
    expect(await applyFinding("it-ra-f4")).toEqual({ success: true });
    expect(await db.item.findUniqueOrThrow({ where: { id: DINNER }, select: { date: true, startTime: true, stopId: true } })).toEqual({ date: "2027-06-04", startTime: "20:00", stopId: PORTO });
    expect(await undoFinding("it-ra-f4")).toEqual({ success: true });
    expect(await db.item.findUniqueOrThrow({ where: { id: DINNER }, select: { date: true, startTime: true } })).toEqual({ date: "2027-06-03", startTime: "19:30" });
  });

  it("a fix whose target is gone fails cleanly and stays Open", async () => {
    await finding("it-ra-f5", { kind: "item.note", itemId: "it-ra-deleted", append: "x" });
    expect(await applyFinding("it-ra-f5")).toEqual({ success: false, errors: { _: [REVIEW_ACTION_COPY.gone] }, code: "gone" });
    expect((await stateOf("it-ra-f5")).state).toBe("OPEN");
  });

  it("Dismiss records who and when; Undo reopens it; an older Review's Finding can't be dismissed", async () => {
    await finding("it-ra-f6", null);
    expect(await dismissFinding("it-ra-f6")).toEqual({ success: true });
    const dismissed = await stateOf("it-ra-f6");
    expect(dismissed).toMatchObject({ state: "DISMISSED", stateById: USER });
    expect(dismissed.stateAt).toBeInstanceOf(Date);
    expect(await undoFinding("it-ra-f6")).toEqual({ success: true });
    expect((await stateOf("it-ra-f6")).state).toBe("OPEN");

    await finding("it-ra-old", null, "it-ra-r1");
    expect(await dismissFinding("it-ra-old")).toMatchObject({ success: false, code: "replaced" });
  });
});
