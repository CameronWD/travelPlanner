import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ loadReviewForMcp: vi.fn(), loadReviewsForMcp: vi.fn(), startReview: vi.fn() }));
vi.mock("../reads/reviews", () => ({ loadReviewForMcp: m.loadReviewForMcp, loadReviewsForMcp: m.loadReviewsForMcp }));
vi.mock("@/server/actions/reviews", () => ({ startReview: m.startReview, applyFinding: vi.fn(), undoFinding: vi.fn(), dismissFinding: vi.fn() }));
// buildMcpServer registers every group; these keep the rest import-clean (as vocab.test.ts does).
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(), requireUser: vi.fn(), requireRowAccess: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";
import { listsReviewTrip, REVIEW_RUN_INSTRUCTION } from "../server";

const text = (r: Record<string, unknown>) => (r.content as { text: string }[])[0].text;
const nf = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

describe("get_review and list_reviews (R13)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("both are listed as read-only", async () => {
    const c = await connectTestClient();
    const tools = new Map((await c.listTools()).tools.map((t) => [t.name, t]));
    for (const name of ["get_review", "list_reviews"]) expect(tools.get(name)?.annotations?.readOnlyHint, name).toBe(true);
    expect(tools.get("get_review")!.description).toContain("No longer found");
    expect(tools.get("get_review")!.description).toContain("fixWith");
    // Final wave, parked 6: a DAY target's id is null and its date is what get_day takes; the history is capped.
    expect(tools.get("get_review")!.description).toContain("A DAY target has a null id: its day is the Finding's date (YYYY-MM-DD), which is what get_day takes.");
    expect(tools.get("list_reviews")!.description).toContain("at most 50");
  });

  it("list_reviews returns the trip's Reviews as the reader shapes them", async () => {
    m.loadReviewsForMcp.mockResolvedValue({ reviews: [{ id: "rev-1", depth: "standard", status: "DONE", openFindings: 3 }] });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "list_reviews", arguments: { tripId: "trip-1" } });
    expect(m.loadReviewsForMcp).toHaveBeenCalledWith("trip-1");
    expect(JSON.parse(text(r))).toEqual({ reviews: [{ id: "rev-1", depth: "standard", status: "DONE", openFindings: 3 }] });
  });

  it("get_review returns one Review with its Findings", async () => {
    m.loadReviewForMcp.mockResolvedValue({ id: "rev-1", status: "DONE", findings: [{ id: "f1", state: "OPEN" }] });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "get_review", arguments: { reviewId: "rev-1" } });
    expect(m.loadReviewForMcp).toHaveBeenCalledWith("rev-1");
    expect(JSON.parse(text(r))).toEqual({ id: "rev-1", status: "DONE", findings: [{ id: "f1", state: "OPEN" }] });
  });

  it("another trip's Review, or a made-up id, reads as not found", async () => {
    m.loadReviewForMcp.mockRejectedValue(nf());
    m.loadReviewsForMcp.mockRejectedValue(nf());
    const c = await connectTestClient();
    expect(text(await c.callTool({ name: "get_review", arguments: { reviewId: "theirs" } }))).toBe(NOT_FOUND_TEXT);
    expect(text(await c.callTool({ name: "list_reviews", arguments: { tripId: "theirs" } }))).toBe(NOT_FOUND_TEXT);
  });

  it("the read tools are there for a Traveller who can't run Reviews (R12: reading is open to everyone)", async () => {
    const c = await connectTestClient({ reviewPermission: "OFF" });
    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_review", "list_reviews"]));
  });
});

describe("review_trip (R12, R13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.startReview.mockResolvedValue({ success: true, reviewId: "rev-9", status: "RUNNING" });
    m.loadReviewForMcp.mockResolvedValue({ id: "rev-9", depth: "standard", status: "RUNNING", findings: [] });
  });

  it("is listed only when the caller's permission isn't Off, and an unknown value hides it", () => {
    expect(listsReviewTrip("OFF")).toBe(false);
    expect(listsReviewTrip("LIMITED")).toBe(true);
    expect(listsReviewTrip("UNLIMITED")).toBe(true);
    expect(listsReviewTrip("")).toBe(false);
    expect(listsReviewTrip("unlimited")).toBe(false);
  });

  it("Off: not listed, not in the instructions, and calling it anyway starts nothing", async () => {
    const c = await connectTestClient({ reviewPermission: "OFF" });
    expect((await c.listTools()).tools.map((t) => t.name)).not.toContain("review_trip");
    expect(c.getInstructions()).not.toContain("review_trip");
    const r = await c.callTool({ name: "review_trip", arguments: { tripId: "trip-1" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("review_trip not found");
    expect(m.startReview).not.toHaveBeenCalled();
  });

  it.each(["LIMITED", "UNLIMITED"])("%s: listed as a write with depth described, and the instructions say how to run one", async (reviewPermission) => {
    const c = await connectTestClient({ reviewPermission });
    const tool = (await c.listTools()).tools.find((t) => t.name === "review_trip");
    expect(tool).toBeDefined();
    expect(tool!.annotations?.readOnlyHint).toBeFalsy();
    const depth = (tool!.inputSchema.properties as Record<string, { description?: string; enum?: string[] }>).depth;
    expect(depth.enum).toEqual(["standard", "deep"]);
    expect(depth.description).toContain("deep: ");
    expect(c.getInstructions()).toContain(REVIEW_RUN_INSTRUCTION);
  });

  it("the run instruction is in the house style", () => {
    expect(REVIEW_RUN_INSTRUCTION).toContain("review_trip");
    expect(REVIEW_RUN_INSTRUCTION).not.toContain("—");
    expect(REVIEW_RUN_INSTRUCTION).not.toContain(";");
  });

  it("starts a standard Review by default and returns it as it now stands (RUNNING)", async () => {
    const c = await connectTestClient({ reviewPermission: "LIMITED" });
    const r = await c.callTool({ name: "review_trip", arguments: { tripId: "trip-1" } });
    expect(r.isError, text(r)).toBeFalsy();
    expect(m.startReview).toHaveBeenCalledWith("trip-1", "STANDARD");
    expect(m.loadReviewForMcp).toHaveBeenCalledWith("rev-9");
    expect(JSON.parse(text(r))).toEqual({ review: { id: "rev-9", depth: "standard", status: "RUNNING", findings: [] } });
  });

  it("deep starts a Deep Review", async () => {
    const c = await connectTestClient({ reviewPermission: "UNLIMITED" });
    await c.callTool({ name: "review_trip", arguments: { tripId: "trip-1", depth: "deep" } });
    expect(m.startReview).toHaveBeenCalledWith("trip-1", "DEEP");
  });

  it("with one already running, relays the app's own message and reads nothing back", async () => {
    m.startReview.mockResolvedValue({ success: false, errors: { _: ["A Review is already running on this trip."] }, code: "running" });
    const c = await connectTestClient({ reviewPermission: "LIMITED" });
    const r = await c.callTool({ name: "review_trip", arguments: { tripId: "trip-1" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe("Couldn't do that: A Review is already running on this trip.");
    expect(m.loadReviewForMcp).not.toHaveBeenCalled();
  });

  it("at the limit, relays the app's message with when the next one is available", async () => {
    m.startReview.mockResolvedValue({
      success: false, errors: { _: ["You've used your Reviews for now."] }, code: "limit", nextAvailableAt: "2027-05-02T09:00:00.000Z",
    });
    const c = await connectTestClient({ reviewPermission: "LIMITED" });
    const r = await c.callTool({ name: "review_trip", arguments: { tripId: "trip-1" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe("Couldn't do that: You've used your Reviews for now. The next one is available from 2027-05-02T09:00:00.000Z (UTC).");
    expect(m.loadReviewForMcp).not.toHaveBeenCalled();
  });

  it("a trip the caller isn't on reads as not found", async () => {
    m.startReview.mockRejectedValue(nf());
    const c = await connectTestClient({ reviewPermission: "UNLIMITED" });
    expect(text(await c.callTool({ name: "review_trip", arguments: { tripId: "theirs" } }))).toBe(NOT_FOUND_TEXT);
  });

  it("refuses a depth it doesn't know before starting anything", async () => {
    const c = await connectTestClient({ reviewPermission: "UNLIMITED" });
    const r = await c.callTool({ name: "review_trip", arguments: { tripId: "trip-1", depth: "quick" } });
    expect(r.isError).toBe(true);
    expect(m.startReview).not.toHaveBeenCalled();
  });
});
