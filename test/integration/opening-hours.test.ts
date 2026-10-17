import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// CONTEXT.md "Opening hours" against the real Postgres: a write reaches the
// Wishlist idea and every copy placed from it, in any Plan, and nothing else.
//
// Adapted from task-D.3-brief.md to Section S's actual shape (d-as-built.md,
// authoritative): the stored column is a JSON string (`parseOpeningHours`/
// `serializeOpeningHours` from lib/validations/opening-hours.ts), not jsonb,
// and the model's field names are `week`/`closed`/`source`.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null), geocodePlaceDetailed: vi.fn(async () => null) }));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => {
  // Fix round 1: the Fork-copy integration case below calls createFork,
  // which also needs assertForkingAllowed/isTripOwnerOrAdmin/
  // requireForkAccess — spread the real module rather than hand-rolling
  // every export lib/guards.ts happens to have.
  const actual = await vi.importActual<typeof import("@/lib/guards")>("@/lib/guards");
  return {
    ...actual,
    requireUser: vi.fn(async () => ({ id: "it-oh-user" })),
    requireTripAccess: vi.fn(async () => ({ user: { id: "it-oh-user" }, membership: { role: "owner" } })),
    requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-oh-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
    requireRowAccess: vi.fn(async (kind: string, id: string) => {
      const { db } = await import("@/lib/db");
      const delegate = (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind];
      const row = await delegate.findUnique({ where: { id } });
      if (!row) throw new Error("NOT_FOUND");
      return { row, user: { id: "it-oh-user" }, membership: { role: "owner" }, surpriseOf: null };
    }),
  };
});
// surpriseRootFor is left as the REAL implementation (only
// requireOutsideSurprise, the route-guard half, is faked): the hours
// family's Surprise boundary (fix round 1) runs the real query here.
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { scheduleItem, setOpeningHours, updateItem } from "@/server/actions/items";
import { createFork } from "@/server/actions/forks";
import { parseOpeningHours } from "@/lib/validations/opening-hours";

const USER = "it-oh-user";
const TRIP_ID = "it-oh-trip";
const FORK_ID = "it-oh-fork";
const PORTO = "it-oh-porto";
const IDEA = "it-oh-idea";
const COPY = "it-oh-copy"; // real-plan placement of IDEA
const FORK_COPY = "it-oh-fork-copy"; // a Fork's placement of IDEA
const OTHER = "it-oh-other"; // unrelated
const span = [["10:00", "18:00"]] as [string, string][];
const HOURS = {
  week: { sun: [], mon: span, tue: [], wed: span, thu: span, fri: span, sat: span },
  seasons: [],
  closed: ["2027-06-10"],
  source: "https://lello.example/hours",
};
const hoursOf = async (id: string) => parseOpeningHours((await db.item.findUnique({ where: { id } }))!.openingHours);

describe.skipIf(process.env.INTEGRATION !== "1")("opening hours are shared by an idea and its placed copies (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "it-oh@example.test", name: "IT OH" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Opening hours", homeCurrency: "AUD", createdById: USER, forksEnabled: true,
        startDate: "2027-06-01", endDate: "2027-06-07", members: { create: { userId: USER, role: "owner" } },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: USER } });
    await db.stop.create({ data: { id: PORTO, tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-07", nights: 6, sortOrder: 0 } });
    await db.item.createMany({
      data: [
        { id: IDEA, tripId: TRIP_ID, title: "IT Livraria Lello", category: "SIGHTSEEING", sortOrder: 0 },
        { id: COPY, tripId: TRIP_ID, stopId: PORTO, sourceItemId: IDEA, title: "IT Livraria Lello", category: "SIGHTSEEING", date: "2027-06-02", sortOrder: 1 },
        { id: FORK_COPY, tripId: TRIP_ID, forkId: FORK_ID, sourceItemId: IDEA, title: "IT Livraria Lello", category: "SIGHTSEEING", date: "2027-06-03", sortOrder: 0 },
        { id: OTHER, tripId: TRIP_ID, stopId: PORTO, title: "IT Tram 22", category: "ACTIVITY", date: "2027-06-02", sortOrder: 2 },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("hours set on a placed copy reach the idea and the Fork's copy, and nothing else", async () => {
    expect(await setOpeningHours(COPY, HOURS)).toEqual({ success: true });
    for (const id of [IDEA, COPY, FORK_COPY]) expect(await hoursOf(id)).toEqual(HOURS);
    expect(await hoursOf(OTHER)).toBeNull();
  });

  it("an edit that names no hours keeps them; null clears the whole family", async () => {
    await setOpeningHours(IDEA, HOURS);
    await updateItem(COPY, { notes: "IT book the slot" });
    expect(await hoursOf(COPY)).toEqual(HOURS);
    await updateItem(COPY, { openingHours: null });
    for (const id of [IDEA, COPY, FORK_COPY]) expect(await hoursOf(id)).toBeNull();
    const raw = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Item" WHERE "tripId" = ${TRIP_ID} AND "openingHours" IS NULL`;
    expect(Number(raw[0].n)).toBe(4); // SQL NULL, not a JSON "null" string
  });

  it("refused hours write nothing", async () => {
    const bad = { ...HOURS, week: { ...HOURS.week, mon: [["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"]] } };
    expect(await setOpeningHours(COPY, bad as never)).toMatchObject({ success: false });
    expect(await hoursOf(IDEA)).toBeNull();
  });

  // Task D.5: scheduleItem's copy-in branch (ideaCopyData) starts a newly
  // placed copy with the idea's hours, and the copy stays in the family
  // (sourceItemId = IDEA), so a later setOpeningHours on any family member
  // still reaches it.
  it("a copy placed after the hours were set starts with them, and later edits reach it", async () => {
    await setOpeningHours(IDEA, HOURS);
    const placed = await scheduleItem(IDEA, { date: "2027-06-05" });
    if (!placed.success || !placed.placedItemId) throw new Error("expected a placed copy");
    expect(await hoursOf(placed.placedItemId)).toEqual(HOURS);
    await setOpeningHours(COPY, null);
    expect(await hoursOf(placed.placedItemId)).toBeNull();
  });

  // Fix round 1 (controller ruling): the hours family never crosses a
  // Surprise (CONTEXT.md "Surprise"; ADR 0072) — one test per direction,
  // against the real surpriseRootFor query.
  describe("the family never crosses a Surprise", () => {
    const HIDDEN_COPY = "it-oh-hidden-copy"; // another placement of IDEA, live and unrevealed

    beforeEach(async () => {
      await db.item.create({
        data: {
          id: HIDDEN_COPY, tripId: TRIP_ID, stopId: PORTO, sourceItemId: IDEA, title: "IT Livraria Lello",
          category: "SIGHTSEEING", date: "2027-06-04", sortOrder: 4,
          surprisePlannerId: USER, surpriseForIds: JSON.stringify(["it-oh-surprised-traveller"]), surpriseRevealedAt: null,
        },
      });
    });

    it("a visible idea edit leaves the hidden copy untouched", async () => {
      expect(await setOpeningHours(COPY, HOURS)).toEqual({ success: true });
      for (const id of [IDEA, COPY, FORK_COPY]) expect(await hoursOf(id)).toEqual(HOURS);
      expect(await hoursOf(HIDDEN_COPY)).toBeNull();
    });

    it("a hidden copy edit leaves the visible idea and its visible siblings untouched", async () => {
      expect(await setOpeningHours(HIDDEN_COPY, HOURS)).toEqual({ success: true });
      expect(await hoursOf(HIDDEN_COPY)).toEqual(HOURS);
      for (const id of [IDEA, COPY, FORK_COPY, OTHER]) expect(await hoursOf(id)).toBeNull();
    });
  });

  // Fix round 1: a Fork-created copy (buildForkPlan sets sourceItemId: null)
  // takes a snapshot at fork time and leaves the family — a later family
  // write must never reach it.
  it("a Fork-created copy (sourceItemId null) is left alone by a family write", async () => {
    await setOpeningHours(COPY, HOURS);
    const forked = await createFork(TRIP_ID, "IT Snapshot");
    expect(forked.success).toBe(true);
    if (!forked.success) throw new Error("expected createFork to succeed");

    const forkedCopy = await db.item.findFirst({
      where: { tripId: TRIP_ID, forkId: forked.forkId, title: "IT Livraria Lello", date: "2027-06-02" },
    });
    expect(forkedCopy).not.toBeNull();
    expect(forkedCopy!.sourceItemId).toBeNull(); // left the family (lib/fork-plan.ts)
    expect(await hoursOf(forkedCopy!.id)).toEqual(HOURS); // snapshot carried the hours at fork time

    await setOpeningHours(IDEA, null);
    expect(await hoursOf(forkedCopy!.id)).toEqual(HOURS); // unaffected by the family's later clear
  });
});
