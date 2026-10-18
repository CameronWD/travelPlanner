import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockDb } from "@/test/helpers/db-mock";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("@/test/helpers/db-mock");
  return { db: mockDb(["finding", "item", "transport", "accommodation"]) };
});
const h = vi.hoisted(() => ({
  requireFindingAccess: vi.fn(),
  requireRowAccess: vi.fn(async () => ({})),
  updateItem: vi.fn(async () => ({ success: true })),
  rescheduleItem: vi.fn(async () => ({ success: true })),
  setOpeningHours: vi.fn(async () => ({ success: true })),
  updateTransport: vi.fn(async () => ({ success: true })),
  updateAccommodation: vi.fn(async () => ({ success: true })),
  revalidateTrip: vi.fn(),
}));
vi.mock("@/lib/review-reads", () => ({ requireFindingAccess: h.requireFindingAccess }));
vi.mock("@/lib/guards", () => ({ requireRowAccess: h.requireRowAccess }));
vi.mock("@/server/actions/items", () => ({ updateItem: h.updateItem, rescheduleItem: h.rescheduleItem, setOpeningHours: h.setOpeningHours }));
vi.mock("@/server/actions/transport", () => ({ updateTransport: h.updateTransport }));
vi.mock("@/server/actions/accommodation", () => ({ updateAccommodation: h.updateAccommodation }));
vi.mock("@/lib/revalidate", () => ({ revalidateTrip: h.revalidateTrip }));

import { db } from "@/lib/db";
import { REVIEW_ACTION_COPY } from "@/lib/review/fix";
import { dismissFinding, undoFinding } from "./reviews";

const mdb = db as unknown as MockDb<"finding" | "item" | "transport" | "accommodation">;
const FORM = (message: string, code: string) => ({ success: false, errors: { _: [message] }, code });
const STATE_AT = new Date("2026-10-19T10:00:00Z");

function access(over: Record<string, unknown> = {}, isLatest = true) {
  h.requireFindingAccess.mockResolvedValue({
    user: { id: "u1" },
    isLatest,
    finding: { id: "f1", reviewId: "r1", tripId: "t1", state: "OPEN", suggestedFix: null, undoPayload: null, stateById: null, stateAt: null, ...over },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mdb.finding.updateMany.mockResolvedValue({ count: 1 });
});

describe("dismissFinding (R10: Dismissed, by whom and when)", () => {
  it("dismisses an Open Finding of the latest Review as the clicking Traveller", async () => {
    access();
    expect(await dismissFinding("f1")).toEqual({ success: true });
    expect(mdb.finding.updateMany).toHaveBeenCalledWith({
      where: { id: "f1", state: "OPEN" },
      data: { state: "DISMISSED", stateById: "u1", stateAt: expect.any(Date) },
    });
    expectAccessCheckedBeforeWrite(h.requireFindingAccess, mdb.finding.updateMany);
    expect(h.revalidateTrip).toHaveBeenCalledWith("t1", "reviews");
  });

  it("refuses a Finding that is not Open, without writing", async () => {
    access({ state: "APPLIED" });
    expect(await dismissFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.handled, "handled"));
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a Finding of an older Review", async () => {
    access({}, false);
    expect(await dismissFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.replaced, "replaced"));
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
  });

  it("says so when someone else dealt with it first", async () => {
    access();
    mdb.finding.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await dismissFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.handled, "handled"));
    expect(h.revalidateTrip).not.toHaveBeenCalled();
  });
});

describe("undoFinding of a Dismiss", () => {
  it("reopens it and forgets who dismissed it", async () => {
    access({ state: "DISMISSED", stateById: "u2", stateAt: STATE_AT });
    expect(await undoFinding("f1")).toEqual({ success: true });
    expect(mdb.finding.updateMany).toHaveBeenCalledWith({
      where: { id: "f1", state: "DISMISSED" },
      data: { state: "OPEN", stateById: null, stateAt: null },
    });
    expect(h.revalidateTrip).toHaveBeenCalledWith("t1", "reviews");
  });

  it("works on an older Review too", async () => {
    access({ state: "DISMISSED", stateById: "u2", stateAt: STATE_AT }, false);
    expect(await undoFinding("f1")).toEqual({ success: true });
  });

  it("an Open or No-longer-found Finding has nothing to undo", async () => {
    for (const state of ["OPEN", "GONE"]) {
      access({ state });
      expect(await undoFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.nothing, "nothing"));
    }
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
  });
});
