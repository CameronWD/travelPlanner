import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// CONTEXT.md "Try list" against the real Postgres: a write reaches the
// Wishlist idea and every copy placed from it, in any Plan, never a Surprise
// copy, and nothing else; and writes on rows of one family are serialised by
// the family's row lock, so no tick is ever lost.
//
// Adapted from task-T.3/T.4-brief.md to Section S's actual exports (ids are
// minted by lib/try-list.ts applyTryListInput; messages are S's).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null), geocodePlaceDetailed: vi.fn(async () => null) }));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => {
  // Spread the real module rather than hand-rolling every export lib/guards.ts has.
  const actual = await vi.importActual<typeof import("@/lib/guards")>("@/lib/guards");
  return {
    ...actual,
    requireUser: vi.fn(async () => ({ id: "it-tl-user" })),
    requireTripAccess: vi.fn(async () => ({ user: { id: "it-tl-user" }, membership: { role: "owner" } })),
    requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-tl-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
    requireRowAccess: vi.fn(async (kind: string, id: string) => {
      const { db } = await import("@/lib/db");
      const delegate = (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind];
      const row = await delegate.findUnique({ where: { id } });
      if (!row) throw new Error("NOT_FOUND");
      return { row, user: { id: "it-tl-user" }, membership: { role: "owner" }, surpriseOf: null };
    }),
  };
});
// surpriseRootFor is left as the REAL implementation (only
// requireOutsideSurprise, the route-guard half, is faked): the Try list
// family's Surprise boundary runs the real query here.
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { setTryList, updateItem } from "@/server/actions/items";
import { parseTryList } from "@/lib/validations/try-list";

const USER = "it-tl-user";
const OTHER_USER = "it-tl-partner";
const TRIP_ID = "it-tl-trip";
const FORK_ID = "it-tl-fork";
const NUREMBERG = "it-tl-nuremberg";
const IDEA = "it-tl-idea";
const COPY = "it-tl-copy"; // real-plan placement of IDEA
const FORK_COPY = "it-tl-fork-copy"; // a Fork's placement of IDEA
const SURPRISE_COPY = "it-tl-surprise-copy"; // a placement of IDEA that is a live Surprise
const OTHER = "it-tl-other"; // unrelated
const listOf = async (id: string) => parseTryList((await db.item.findUnique({ where: { id } }))!.tryList);

describe.skipIf(process.env.INTEGRATION !== "1")("a Try list is shared by an idea and its placed copies (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "it-tl@example.test", name: "IT TL" } });
    await db.user.upsert({ where: { id: OTHER_USER }, update: {}, create: { id: OTHER_USER, email: "it-tl-2@example.test", name: "IT TL 2" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Try list", homeCurrency: "AUD", createdById: USER, forksEnabled: true,
        startDate: "2027-12-01", endDate: "2027-12-05",
        members: { create: [{ userId: USER, role: "owner" }, { userId: OTHER_USER, role: "member" }] },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: USER } });
    await db.stop.create({ data: { id: NUREMBERG, tripId: TRIP_ID, name: "IT Nuremberg", timezone: "Europe/Berlin", arriveDate: "2027-12-01", departDate: "2027-12-05", nights: 4, sortOrder: 0 } });
    await db.item.createMany({
      data: [
        { id: IDEA, tripId: TRIP_ID, title: "IT Christkindlesmarkt", category: "FOOD", sortOrder: 0 },
        { id: COPY, tripId: TRIP_ID, stopId: NUREMBERG, sourceItemId: IDEA, title: "IT Christkindlesmarkt", category: "FOOD", date: "2027-12-02", sortOrder: 1 },
        { id: FORK_COPY, tripId: TRIP_ID, forkId: FORK_ID, sourceItemId: IDEA, title: "IT Christkindlesmarkt", category: "FOOD", date: "2027-12-03", sortOrder: 0 },
        {
          id: SURPRISE_COPY, tripId: TRIP_ID, stopId: NUREMBERG, sourceItemId: IDEA, title: "IT Christkindlesmarkt", category: "FOOD", date: "2027-12-04", sortOrder: 2,
          surprisePlannerId: USER, surpriseForIds: JSON.stringify([OTHER_USER]),
        },
        { id: OTHER, tripId: TRIP_ID, stopId: NUREMBERG, title: "IT Kaiserburg", category: "SIGHTSEEING", date: "2027-12-02", sortOrder: 3 },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("a list set on a placed copy reaches the idea and the Fork's copy; not the Surprise copy, not an unrelated Item", async () => {
    expect(await setTryList(COPY, [{ text: "IT Lebkuchen" }, { text: "IT Drei im Weggla" }])).toEqual({ success: true });
    const list = await listOf(COPY);
    expect(list?.map((e) => e.text)).toEqual(["IT Lebkuchen", "IT Drei im Weggla"]);
    for (const id of [IDEA, FORK_COPY]) expect(await listOf(id)).toEqual(list);
    expect(await listOf(SURPRISE_COPY)).toBeNull();
    expect(await listOf(OTHER)).toBeNull();
  });

  it("an edit that names no list keeps it; a dialog edit keeps ids and ticks; null clears the family as SQL NULL", async () => {
    await setTryList(IDEA, [{ text: "IT Lebkuchen", tried: true }]);
    const [lebkuchen] = (await listOf(IDEA))!;
    await updateItem(COPY, { notes: "IT cash only" });
    expect((await listOf(COPY))![0]).toEqual(lebkuchen);
    await updateItem(COPY, { tryList: [{ id: lebkuchen.id, text: "IT Elisenlebkuchen" }] });
    expect(await listOf(FORK_COPY)).toEqual([{ id: lebkuchen.id, text: "IT Elisenlebkuchen", tried: true }]);
    await updateItem(COPY, { tryList: null });
    const raw = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Item" WHERE "tripId" = ${TRIP_ID} AND "tryList" IS NULL`;
    expect(Number(raw[0].n)).toBe(5);
  });

  it("a refused list writes nothing", async () => {
    expect(await setTryList(COPY, [{ text: "" }])).toMatchObject({ success: false });
    expect(await listOf(IDEA)).toBeNull();
  });
});
