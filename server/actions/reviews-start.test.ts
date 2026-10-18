import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  after: vi.fn(), requireTripAccess: vi.fn(), isAiConfigured: vi.fn(), reviewModel: vi.fn(),
  beginReview: vi.fn(), runReview: vi.fn(), revalidateTrip: vi.fn(),
}));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: m.requireTripAccess, requireRowAccess: vi.fn() }));
vi.mock("@/lib/ai", () => ({ isAiConfigured: m.isAiConfigured, reviewModel: m.reviewModel }));
vi.mock("@/lib/review/start", () => ({ beginReview: m.beginReview }));
vi.mock("@/lib/review/run", () => ({ runReview: m.runReview }));
vi.mock("@/lib/revalidate", () => ({ revalidateTrip: m.revalidateTrip }));
vi.mock("@/lib/db", () => ({ db: {} }));
// R's Finding actions call these; startReview doesn't.
vi.mock("@/lib/review-reads", () => ({ requireFindingAccess: vi.fn() }));
vi.mock("@/server/actions/items", () => ({ updateItem: vi.fn(), rescheduleItem: vi.fn(), setOpeningHours: vi.fn() }));
vi.mock("@/server/actions/transport", () => ({ updateTransport: vi.fn() }));
vi.mock("@/server/actions/accommodation", () => ({ updateAccommodation: vi.fn() }));

import { REVIEW_MESSAGES as M } from "@/lib/review/messages";
import { startReview } from "./reviews";

beforeEach(() => {
  vi.resetAllMocks();
  m.requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: { role: "member" } });
  m.isAiConfigured.mockReturnValue(true);
  m.reviewModel.mockImplementation((kind: string) => (kind === "DEEP" ? "claude-opus-5" : "claude-sonnet-5"));
  m.beginReview.mockResolvedValue({ kind: "started", reviewId: "rev-1" });
  m.runReview.mockResolvedValue(undefined);
});

describe("startReview (spec 2026-10-17 R11, R12)", () => {
  it("starts the Review with its kind's model, runs the job after the response, and refreshes the Reviews tab", async () => {
    expect(await startReview("trip-1", "DEEP")).toEqual({ success: true, reviewId: "rev-1", status: "RUNNING" });
    expect(m.beginReview).toHaveBeenCalledWith("u1", "trip-1", "DEEP", "claude-opus-5");
    expect(m.after).toHaveBeenCalledTimes(1);
    expect(m.runReview).not.toHaveBeenCalled();
    expect(m.beginReview.mock.invocationCallOrder[0]).toBeLessThan(m.after.mock.invocationCallOrder[0]);
    await m.after.mock.calls[0][0]();
    expect(m.runReview).toHaveBeenCalledWith("rev-1");
    expect(m.revalidateTrip).toHaveBeenCalledWith("trip-1", "reviews");
  });

  it("checks access before anything else", async () => {
    m.requireTripAccess.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(startReview("trip-1", "STANDARD")).rejects.toThrow();
    expect(m.beginReview).not.toHaveBeenCalled();
    expect(m.after).not.toHaveBeenCalled();
  });

  it("says Reviews are not set up without an API key, and starts nothing", async () => {
    m.isAiConfigured.mockReturnValue(false);
    expect(await startReview("trip-1", "STANDARD")).toEqual({ success: false, errors: { _: [M.notSetUp] }, code: "disabled" });
    expect(m.beginReview).not.toHaveBeenCalled();
  });

  it("refuses a kind that isn't Standard or Deep", async () => {
    expect(await startReview("trip-1", "QUICK" as never)).toEqual({ success: false, errors: { _: [M.badKind] }, code: "invalid" });
    expect(m.beginReview).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "off" }, { success: false, errors: { _: [M.off] }, code: "off" }],
    [{ kind: "running", startedById: "u2" }, { success: false, errors: { _: [M.running] }, code: "running" }],
    [{ kind: "limit", nextAvailableAt: new Date("2026-10-19T09:00:00Z") }, { success: false, errors: { _: [M.limit] }, code: "limit", nextAvailableAt: "2026-10-19T09:00:00.000Z" }],
    [{ kind: "limit", nextAvailableAt: null }, { success: false, errors: { _: [M.limit] }, code: "limit", nextAvailableAt: null }],
  ])("maps %o to its refusal, and schedules no job", async (begun, expected) => {
    m.beginReview.mockResolvedValue(begun);
    expect(await startReview("trip-1", "STANDARD")).toEqual(expected);
    expect(m.after).not.toHaveBeenCalled();
    expect(m.revalidateTrip).not.toHaveBeenCalled();
  });
});
