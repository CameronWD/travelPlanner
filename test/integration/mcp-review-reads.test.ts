import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Spec 2026-10-17 R13 against the real Postgres: list_reviews and get_review's
// reads, as the acting Traveller, with the real guards and Surprise loader.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { db } from "@/lib/db";
import { runAsTraveller } from "@/lib/mcp/acting-traveller";
import { loadReviewForMcp, loadReviewsForMcp } from "@/lib/mcp/reads/reviews";

const OWNER = "it-mrev-owner";
const MEMBER = "it-mrev-member";
const STRANGER = "it-mrev-stranger";
const TRIP_ID = "it-mrev-trip";
const PORTO = "it-mrev-porto";
const LELLO = "it-mrev-lello";
const GIFT = "it-mrev-gift"; // a Surprise Item for MEMBER, planned by OWNER
const OLD = "it-mrev-old";
const NEW = "it-mrev-new";
const STALE = "it-mrev-stale";
const ORPHAN = "it-mrev-orphan";
const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60_000);
const as = (id: string) => <T,>(fn: () => Promise<T>) => runAsTraveller({ id, name: id, email: `${id}@example.test`, image: null }, fn);
const NOT_FOUND = { digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") };
const base = { tripId: TRIP_ID, reviewId: NEW, detail: "d", origin: "MODEL", state: "OPEN" };

describe.skipIf(process.env.INTEGRATION !== "1")("MCP Review reads (real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    for (const id of [OWNER, MEMBER, STRANGER]) {
      await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, name: id } });
    }
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Reviews", homeCurrency: "AUD", createdById: OWNER, startDate: "2027-06-01", endDate: "2027-06-07",
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] },
      },
    });
    await db.stop.create({ data: { id: PORTO, tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-07", nights: 6, sortOrder: 0 } });
    await db.item.createMany({
      data: [
        { id: LELLO, tripId: TRIP_ID, stopId: PORTO, title: "IT Lello", category: "SIGHTSEEING", date: "2027-06-02", sortOrder: 0 },
        { id: GIFT, tripId: TRIP_ID, stopId: PORTO, title: "IT Gift", category: "FOOD", date: "2027-06-03", sortOrder: 1, surprisePlannerId: OWNER, surpriseForIds: JSON.stringify([MEMBER]) },
      ],
    });
    await db.review.createMany({
      data: [
        { id: OLD, tripId: TRIP_ID, startedById: OWNER, kind: "STANDARD", model: "claude-sonnet-5", status: "DONE", summary: "One closure", startedAt: ago(3000), finishedAt: ago(2997) },
        { id: NEW, tripId: TRIP_ID, startedById: OWNER, kind: "DEEP", model: "claude-opus-5", status: "DONE", summary: "Two things", startedAt: ago(1000), finishedAt: ago(994) },
        { id: STALE, tripId: TRIP_ID, startedById: MEMBER, kind: "STANDARD", model: "claude-sonnet-5", status: "RUNNING", startedAt: ago(60) },
        { id: ORPHAN, tripId: TRIP_ID, startedById: null, kind: "STANDARD", model: "claude-sonnet-5", status: "FAILED", error: "boom", startedAt: ago(5000), finishedAt: ago(4999) },
      ],
    });
    await db.finding.createMany({
      data: [
        { ...base, id: "it-mrev-f1", key: "PACKING|TRIP|-", severity: "info", category: "PACKING", targetType: "TRIP", title: "Umbrella for Porto", position: 0 },
        { ...base, id: "it-mrev-f2", key: `CLOSURE|ITEM|${LELLO}`, severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: LELLO, date: "2027-06-02", title: "Closed Wednesdays", suggestedFix: JSON.stringify({ kind: "item.bookingState", id: LELLO, bookingState: "TO_BOOK" }), position: 1 },
        { ...base, id: "it-mrev-f3", key: "BOOKING|TRIP|-", severity: "info", category: "BOOKING", targetType: "TRIP", title: "Old one", origin: "FLAG", state: "DISMISSED", stateById: MEMBER, stateAt: ago(990), position: 2 },
        // About the Surprise itself: MEMBER must never see it.
        { ...base, id: "it-mrev-f4", key: `CLOSURE|ITEM|${GIFT}`, severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: GIFT, title: "Gift shop closed", position: 3 },
        // A whole-trip Finding whose fix is aimed at the Surprise: MEMBER sees it, without the fix.
        { ...base, id: "it-mrev-f5", key: "LOGISTICS|TRIP|-", severity: "info", category: "LOGISTICS", targetType: "TRIP", title: "Wrapping", suggestedFix: JSON.stringify({ kind: "item.note", itemId: GIFT, append: "Wrap it in blue." }), position: 4 },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("a member lists every Review newest first, with the open count they can see and a stale run as FAILED", async () => {
    const { reviews } = await as(MEMBER)(() => loadReviewsForMcp(TRIP_ID));
    expect(reviews.map((r) => [r.id, r.depth, r.status, r.openFindings])).toEqual([
      [STALE, "standard", "FAILED", 0],
      [NEW, "deep", "DONE", 3], // f1, f2, f5: f4 is about the Surprise
      [OLD, "standard", "DONE", 0],
      [ORPHAN, "standard", "FAILED", 0],
    ]);
    expect(reviews[0].error).toBe("This Review stopped before it finished.");
    expect(reviews[1].startedBy).toBe(OWNER);
    expect(reviews[3].startedBy).toBe("a former Traveller");
  });

  it("get_review returns warnings first, the fix parsed with its tool, and who dismissed", async () => {
    const r = await as(MEMBER)(() => loadReviewForMcp(NEW));
    expect(r.findings.map((f) => f.id)).toEqual(["it-mrev-f2", "it-mrev-f1", "it-mrev-f3", "it-mrev-f5"]);
    expect(r.findings[0]).toMatchObject({ target: { type: "ITEM", id: LELLO }, suggestedFix: { kind: "item.bookingState" }, fixWith: "set_booking_state with kind ITEM" });
    expect(r.findings[2]).toMatchObject({ state: "DISMISSED", stateBy: MEMBER, origin: "FLAG" });
  });

  it("a Surprise kept from the caller: its Finding is gone and a fix aimed at it is withheld", async () => {
    const r = await as(MEMBER)(() => loadReviewForMcp(NEW));
    expect(r.findings.find((f) => f.id === "it-mrev-f5")).toMatchObject({ suggestedFix: null, fixWith: null });
    expect(JSON.stringify(r)).not.toContain(GIFT);
    expect(JSON.stringify(r)).not.toContain("Gift shop");
    // The planner sees both.
    const mine = await as(OWNER)(() => loadReviewForMcp(NEW));
    expect(mine.findings.map((f) => f.id)).toContain("it-mrev-f4");
    expect(mine.findings.find((f) => f.id === "it-mrev-f5")).toMatchObject({ suggestedFix: { kind: "item.note", itemId: GIFT }, fixWith: "update_thing_to_do with the text added to its notes" });
    expect(mine.openFindings).toBe(4);
  });

  it("someone not on the trip gets not found for both, same as a made-up id", async () => {
    await expect(as(STRANGER)(() => loadReviewsForMcp(TRIP_ID))).rejects.toMatchObject(NOT_FOUND);
    await expect(as(STRANGER)(() => loadReviewForMcp(NEW))).rejects.toMatchObject(NOT_FOUND);
    await expect(as(MEMBER)(() => loadReviewForMcp("it-mrev-nope"))).rejects.toMatchObject(NOT_FOUND);
  });
});
