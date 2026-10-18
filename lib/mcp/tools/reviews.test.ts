import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ loadReviewForMcp: vi.fn(), loadReviewsForMcp: vi.fn() }));
vi.mock("../reads/reviews", () => ({ loadReviewForMcp: m.loadReviewForMcp, loadReviewsForMcp: m.loadReviewsForMcp }));
// buildMcpServer registers every group; these keep the rest import-clean (as vocab.test.ts does).
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(), requireUser: vi.fn(), requireRowAccess: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";

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
});
