import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockDb } from "@/test/helpers/db-mock";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("@/test/helpers/db-mock");
  return { db: mockDb(["finding", "item", "transport", "accommodation"]) };
});
const h = vi.hoisted(() => {
  // The actions' ActionResult: success, or a refusal with its errors.
  const action = () => vi.fn(async (): Promise<{ success: boolean; errors?: Record<string, string[]> }> => ({ success: true }));
  return {
    requireFindingAccess: vi.fn(),
    requireRowAccess: vi.fn(async () => ({})),
    updateItem: action(),
    rescheduleItem: action(),
    setOpeningHours: action(),
    updateTransport: action(),
    updateAccommodation: action(),
    revalidateTrip: vi.fn(),
  };
});
vi.mock("@/lib/review-reads", () => ({ requireFindingAccess: h.requireFindingAccess }));
vi.mock("@/lib/guards", () => ({ requireRowAccess: h.requireRowAccess }));
vi.mock("@/server/actions/items", () => ({ updateItem: h.updateItem, rescheduleItem: h.rescheduleItem, setOpeningHours: h.setOpeningHours }));
vi.mock("@/server/actions/transport", () => ({ updateTransport: h.updateTransport }));
vi.mock("@/server/actions/accommodation", () => ({ updateAccommodation: h.updateAccommodation }));
vi.mock("@/lib/revalidate", () => ({ revalidateTrip: h.revalidateTrip }));

import { db } from "@/lib/db";
import { REVIEW_ACTION_COPY, fixTarget } from "@/lib/review/fix";
import type { RowFix } from "@/lib/review/types";
import { applyFinding, dismissFinding, undoFinding } from "./reviews";

const mdb = db as unknown as MockDb<"finding" | "item" | "transport" | "accommodation">;
const FORM = (message: string, code: string) => ({ success: false, errors: { _: [message] }, code });
const STATE_AT = new Date("2026-10-19T10:00:00Z");

/** The Finding is about its fix's own row (final wave I1), unless `over` says otherwise. */
function access(over: Record<string, unknown> = {}, isLatest = true) {
  const fix = typeof over.suggestedFix === "string" ? (JSON.parse(over.suggestedFix) as RowFix) : null;
  const own = fix ? { targetType: fixTarget(fix).kind.toUpperCase(), targetId: fixTarget(fix).id } : { targetType: "TRIP", targetId: null };
  h.requireFindingAccess.mockResolvedValue({
    user: { id: "u1" },
    isLatest,
    finding: { id: "f1", reviewId: "r1", tripId: "t1", ...own, state: "OPEN", suggestedFix: null, undoPayload: null, stateById: null, stateAt: null, ...over },
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

  it("is refused on an older Review, as Dismiss is (its Undo would never carry forward)", async () => {
    access({ state: "DISMISSED", stateById: "u2", stateAt: STATE_AT }, false);
    expect(await undoFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.replaced, "replaced"));
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
  });

  it("an Open or No-longer-found Finding has nothing to undo", async () => {
    for (const state of ["OPEN", "GONE"]) {
      access({ state });
      expect(await undoFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.nothing, "nothing"));
    }
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
  });
});

const NOT_FOUND = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
const ITEM = { tripId: "t1", forkId: null, date: "2027-06-02", startTime: "10:00", endTime: null, notes: "Cash only.", openingHours: null, bookingState: "NONE", bookingStateSet: false, bookBy: null };

describe("applyFinding (R8: runs the existing action, with Undo)", () => {
  it("refuses a stored fix aimed at another row than the Finding's own, without claiming it (final wave I1)", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "transport.bookingState", id: "tr1", bookingState: "BOOKED" }), targetType: "ITEM", targetId: "i1" });
    expect(await applyFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.noFix, "no-fix"));
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
    expect(h.updateTransport).not.toHaveBeenCalled();
  });

  it("an item.note fix appends through updateItem and stores what it changed", async () => {
    const fix = { kind: "item.note", itemId: "i1", append: "Closed Mondays." };
    access({ suggestedFix: JSON.stringify(fix) });
    mdb.item.findUnique.mockResolvedValueOnce(ITEM).mockResolvedValueOnce({ ...ITEM, notes: "Cash only.\n\nClosed Mondays." });

    expect(await applyFinding("f1")).toEqual({ success: true });
    expect(h.requireRowAccess).toHaveBeenCalledWith("item", "i1", { realPlanOnly: true });
    expect(mdb.finding.updateMany).toHaveBeenCalledWith({
      where: { id: "f1", state: "OPEN" },
      data: { state: "APPLIED", stateById: "u1", stateAt: expect.any(Date), undoPayload: null },
    });
    expect(h.updateItem).toHaveBeenCalledWith("i1", { notes: "Cash only.\n\nClosed Mondays." });
    expectAccessCheckedBeforeWrite(mdb.finding.updateMany, h.updateItem); // claimed before it runs
    // Parked 2: the payload is saved only onto our own claim, still waiting for it.
    const save = mdb.finding.updateMany.mock.calls[1][0];
    expect(save.where).toEqual({ id: "f1", state: "APPLIED", stateById: "u1", undoPayload: null });
    const stored = JSON.parse(save.data.undoPayload);
    expect(stored).toEqual({ fix, before: { kind: "note", notes: "Cash only." }, after: { kind: "note", notes: "Cash only.\n\nClosed Mondays." } });
    expect(h.revalidateTrip).toHaveBeenCalledWith("t1", "reviews");
  });

  it("a transport.bookingState fix runs updateTransport with a booking-only patch", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "transport.bookingState", id: "tr1", bookingState: "TO_BOOK", bookBy: "2027-05-01" }) });
    const leg = { tripId: "t1", forkId: null, bookingState: "BOOKED", bookingStateSet: false, bookBy: null };
    mdb.transport.findUnique.mockResolvedValueOnce(leg).mockResolvedValueOnce({ ...leg, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-01" });
    expect(await applyFinding("f1")).toEqual({ success: true });
    expect(h.requireRowAccess).toHaveBeenCalledWith("transport", "tr1", { realPlanOnly: true });
    expect(h.updateTransport).toHaveBeenCalledWith("tr1", { bookingState: "TO_BOOK", bookBy: "2027-05-01" });
  });

  it("a booking fix without a book-by date leaves the date alone", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "accommodation.bookingState", id: "a1", bookingState: "BOOKED" }) });
    mdb.accommodation.findUnique.mockResolvedValue({ tripId: "t1", forkId: null, bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
    await applyFinding("f1");
    expect(h.updateAccommodation).toHaveBeenCalledWith("a1", { bookingState: "BOOKED" });
  });

  it("an item.times fix with a day moves the Item first (owning Stop re-filed), then sets the time", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.times", itemId: "i1", startTime: "09:00", date: "2027-06-03" }) });
    mdb.item.findUnique.mockResolvedValue(ITEM);
    await applyFinding("f1");
    expect(h.rescheduleItem).toHaveBeenCalledWith("i1", "2027-06-03");
    expect(h.updateItem).toHaveBeenCalledWith("i1", { startTime: "09:00" });
    expectAccessCheckedBeforeWrite(h.rescheduleItem, h.updateItem);
  });

  it("an item.openingHours fix runs setOpeningHours", async () => {
    const hours = { week: { sun: [], mon: [["10:00", "18:00"]], tue: [], wed: [], thu: [], fri: [], sat: [] }, seasons: [], closed: [] };
    access({ suggestedFix: JSON.stringify({ kind: "item.openingHours", itemId: "i1", hours }) });
    mdb.item.findUnique.mockResolvedValue(ITEM);
    await applyFinding("f1");
    expect(h.setOpeningHours).toHaveBeenCalledWith("i1", hours);
  });

  it("no fix means Dismiss only", async () => {
    access({ suggestedFix: null });
    expect(await applyFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.noFix, "no-fix"));
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a Finding that isn't Open, or is on an older Review", async () => {
    access({ state: "DISMISSED", suggestedFix: JSON.stringify({ kind: "item.note", itemId: "i1", append: "x" }) });
    expect(await applyFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.handled, "handled"));
    access({ suggestedFix: JSON.stringify({ kind: "item.note", itemId: "i1", append: "x" }) }, false);
    expect(await applyFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.replaced, "replaced"));
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
  });

  it("fails cleanly when the target is gone or hidden from this Traveller", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.note", itemId: "i1", append: "x" }) });
    h.requireRowAccess.mockRejectedValueOnce(NOT_FOUND);
    expect(await applyFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.gone, "gone"));
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
    expect(h.updateItem).not.toHaveBeenCalled();
  });

  it("fails cleanly when the target is on another Trip or a Fork", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.note", itemId: "i1", append: "x" }) });
    mdb.item.findUnique.mockResolvedValueOnce({ ...ITEM, tripId: "t2" });
    expect(await applyFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.gone, "gone"));
    mdb.item.findUnique.mockResolvedValueOnce({ ...ITEM, forkId: "fork1" });
    expect(await applyFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.gone, "gone"));
    expect(h.updateItem).not.toHaveBeenCalled();
  });

  it("when the action refuses, the refusal comes back and the Finding is Open again", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.note", itemId: "i1", append: "x" }) });
    mdb.item.findUnique.mockResolvedValue(ITEM);
    const refusal = { success: false, errors: { notes: ["Too long"] } };
    h.updateItem.mockResolvedValueOnce(refusal);
    expect(await applyFinding("f1")).toEqual(refusal);
    expect(mdb.finding.updateMany).toHaveBeenLastCalledWith({
      where: { id: "f1", state: "APPLIED", stateById: "u1", undoPayload: null },
      data: { state: "OPEN", stateById: null, stateAt: null },
    });
    expect(mdb.finding.update).not.toHaveBeenCalled();
  });

  it("a move that landed before the time was refused is put back", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.times", itemId: "i1", startTime: "09:00", date: "2027-06-03" }) });
    mdb.item.findUnique.mockResolvedValueOnce(ITEM).mockResolvedValueOnce({ ...ITEM, date: "2027-06-03" });
    h.updateItem.mockResolvedValueOnce({ success: false, errors: { startTime: ["No"] } });
    await applyFinding("f1");
    expect(h.rescheduleItem.mock.calls).toEqual([["i1", "2027-06-03"], ["i1", "2027-06-02"]]);
  });

  it("someone else got there first: nothing runs", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.note", itemId: "i1", append: "x" }) });
    mdb.item.findUnique.mockResolvedValue(ITEM);
    mdb.finding.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await applyFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.handled, "handled"));
    expect(h.updateItem).not.toHaveBeenCalled();
  });

  it("a control-flow throw inside the action (its own guard) is a clean failure", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.note", itemId: "i1", append: "x" }) });
    mdb.item.findUnique.mockResolvedValue(ITEM);
    h.updateItem.mockRejectedValueOnce(NOT_FOUND);
    expect(await applyFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.gone, "gone"));
  });
});

describe("undoFinding of an Apply", () => {
  const fix = { kind: "item.bookingState", id: "i1", bookingState: "TO_BOOK", bookBy: "2027-05-20" };
  const payload = JSON.stringify({
    fix,
    before: { kind: "booking", bookingState: "NONE", bookingStateSet: false, bookBy: null },
    after: { kind: "booking", bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20" },
  });
  const APPLIED_ROW = { ...ITEM, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20" };

  it("puts a derived Booking state back to derived and reopens the Finding", async () => {
    access({ state: "APPLIED", stateById: "u2", stateAt: STATE_AT, suggestedFix: JSON.stringify(fix), undoPayload: payload });
    mdb.item.findUnique.mockResolvedValue(APPLIED_ROW);
    expect(await undoFinding("f1")).toEqual({ success: true });
    expect(mdb.finding.updateMany).toHaveBeenCalledWith({
      where: { id: "f1", state: "APPLIED", undoPayload: payload },
      data: { state: "OPEN", stateById: null, stateAt: null, undoPayload: null },
    });
    expect(h.updateItem).toHaveBeenCalledWith("i1", { bookingState: null, bookBy: null });
    expect(h.revalidateTrip).toHaveBeenCalledWith("t1", "reviews");
  });

  it("refuses when the row was changed since Apply, and changes nothing", async () => {
    access({ state: "APPLIED", stateById: "u2", stateAt: STATE_AT, undoPayload: payload });
    mdb.item.findUnique.mockResolvedValue({ ...APPLIED_ROW, bookingState: "BOOKED" });
    expect(await undoFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.changed, "changed"));
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
    expect(h.updateItem).not.toHaveBeenCalled();
  });

  it("when the restore is refused, the Finding goes back to Applied as it was", async () => {
    access({ state: "APPLIED", stateById: "u2", stateAt: STATE_AT, undoPayload: payload });
    mdb.item.findUnique.mockResolvedValue(APPLIED_ROW);
    const refusal = { success: false, errors: { bookBy: ["No"] } };
    h.updateItem.mockResolvedValueOnce(refusal);
    expect(await undoFinding("f1")).toEqual(refusal);
    expect(mdb.finding.updateMany).toHaveBeenLastCalledWith({
      where: { id: "f1", state: "OPEN", stateById: null },
      data: { state: "APPLIED", stateById: "u2", stateAt: STATE_AT, undoPayload: payload },
    });
  });

  it("a Finding still being applied (no payload yet) can't be undone yet", async () => {
    access({ state: "APPLIED", stateById: "u2", stateAt: new Date(Date.now() - 60_000), undoPayload: null });
    expect(await undoFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.applying, "applying"));
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
  });

  it("an Apply stranded for more than 5 minutes (no payload) is released back to Open", async () => {
    const stateAt = new Date(Date.now() - 6 * 60_000);
    access({ state: "APPLIED", stateById: "u2", stateAt, undoPayload: null }, false);
    expect(await undoFinding("f1")).toEqual({ success: true });
    expect(mdb.finding.updateMany).toHaveBeenCalledWith({
      where: { id: "f1", state: "APPLIED", undoPayload: null, stateAt },
      data: { state: "OPEN", stateById: null, stateAt: null },
    });
    expect(h.updateItem).not.toHaveBeenCalled();
    expect(h.revalidateTrip).toHaveBeenCalledWith("t1", "reviews");
  });

  it("a refused single-step restore rolls nothing back, so a concurrent edit stands (parked 3)", async () => {
    access({ state: "APPLIED", stateById: "u2", stateAt: STATE_AT, undoPayload: payload });
    mdb.item.findUnique.mockResolvedValueOnce(APPLIED_ROW).mockResolvedValueOnce({ ...APPLIED_ROW, bookingState: "BOOKED" });
    h.updateItem.mockResolvedValueOnce({ success: false, errors: { bookBy: ["No"] } });
    await undoFinding("f1");
    expect(h.updateItem).toHaveBeenCalledTimes(1); // the refused restore only: Xanni's BOOKED is not overwritten
  });

  it("a refused move back (it never landed) rolls nothing back, even when the day changed meanwhile (parked 3)", async () => {
    const times = JSON.stringify({
      fix: { kind: "item.times", itemId: "i1", startTime: "09:00", date: "2027-06-03" },
      before: { kind: "times", date: "2027-06-02", startTime: "10:00", endTime: null },
      after: { kind: "times", date: "2027-06-03", startTime: "09:00", endTime: null },
    });
    access({ state: "APPLIED", stateById: "u2", stateAt: STATE_AT, undoPayload: times });
    const applied = { ...ITEM, date: "2027-06-03", startTime: "09:00" };
    mdb.item.findUnique.mockResolvedValueOnce(applied).mockResolvedValueOnce({ ...applied, date: "2027-06-05" });
    h.rescheduleItem.mockResolvedValueOnce({ success: false, errors: { date: ["No"] } });
    await undoFinding("f1");
    expect(h.rescheduleItem).toHaveBeenCalledTimes(1);
    expect(h.updateItem).not.toHaveBeenCalled();
  });

  it("a restore whose move landed before the times were refused puts the Applied day back", async () => {
    const times = JSON.stringify({
      fix: { kind: "item.times", itemId: "i1", startTime: "09:00", date: "2027-06-03" },
      before: { kind: "times", date: "2027-06-02", startTime: "10:00", endTime: null },
      after: { kind: "times", date: "2027-06-03", startTime: "09:00", endTime: null },
    });
    access({ state: "APPLIED", stateById: "u2", stateAt: STATE_AT, undoPayload: times });
    const applied = { ...ITEM, date: "2027-06-03", startTime: "09:00" };
    mdb.item.findUnique.mockResolvedValueOnce(applied).mockResolvedValueOnce({ ...applied, date: "2027-06-02" });
    const refusal = { success: false, errors: { startTime: ["No"] } };
    h.updateItem.mockResolvedValueOnce(refusal);
    expect(await undoFinding("f1")).toEqual(refusal);
    expect(h.rescheduleItem.mock.calls).toEqual([["i1", "2027-06-02"], ["i1", "2027-06-03"]]);
    expect(mdb.finding.updateMany).toHaveBeenLastCalledWith({
      where: { id: "f1", state: "OPEN", stateById: null },
      data: { state: "APPLIED", stateById: "u2", stateAt: STATE_AT, undoPayload: times },
    });
  });

  it("fails cleanly when the target is gone", async () => {
    access({ state: "APPLIED", stateById: "u2", stateAt: STATE_AT, undoPayload: payload });
    h.requireRowAccess.mockRejectedValueOnce(NOT_FOUND);
    expect(await undoFinding("f1")).toEqual(FORM(REVIEW_ACTION_COPY.goneUndo, "gone"));
    expect(mdb.finding.updateMany).not.toHaveBeenCalled();
  });

  it("restores a chosen state as a choice, and a note verbatim", async () => {
    const chosen = JSON.stringify({
      fix: { kind: "transport.bookingState", id: "tr1", bookingState: "BOOKED" },
      before: { kind: "booking", bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-01" },
      after: { kind: "booking", bookingState: "BOOKED", bookingStateSet: true, bookBy: null },
    });
    access({ state: "APPLIED", stateById: "u2", stateAt: STATE_AT, undoPayload: chosen });
    mdb.transport.findUnique.mockResolvedValue({ tripId: "t1", forkId: null, bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
    await undoFinding("f1");
    expect(h.updateTransport).toHaveBeenCalledWith("tr1", { bookingState: "TO_BOOK", bookBy: "2027-05-01" });

    const note = JSON.stringify({
      fix: { kind: "item.note", itemId: "i1", append: "x" },
      before: { kind: "note", notes: null },
      after: { kind: "note", notes: "x" },
    });
    access({ state: "APPLIED", stateById: "u2", stateAt: STATE_AT, undoPayload: note });
    mdb.item.findUnique.mockResolvedValue({ ...ITEM, notes: "x" });
    await undoFinding("f1");
    expect(h.updateItem).toHaveBeenCalledWith("i1", { notes: null });
  });
});

describe("applyFinding never strands or overwrites (fix round 1)", () => {
  const RELEASE = {
    where: { id: "f1", state: "APPLIED", stateById: "u1", undoPayload: null },
    data: { state: "OPEN", stateById: null, stateAt: null },
  };

  it("a throw inside the action after the claim releases the Finding and rethrows", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.note", itemId: "i1", append: "x" }) });
    mdb.item.findUnique.mockResolvedValue(ITEM);
    h.updateItem.mockRejectedValueOnce(new Error("connection reset"));
    await expect(applyFinding("f1")).rejects.toThrow("connection reset");
    expect(mdb.finding.updateMany).toHaveBeenLastCalledWith(RELEASE);
  });

  it("a throw while saving the payload releases the Finding and rethrows", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.note", itemId: "i1", append: "x" }) });
    mdb.item.findUnique.mockResolvedValue(ITEM);
    mdb.finding.updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error("P2024 timeout"));
    await expect(applyFinding("f1")).rejects.toThrow("P2024 timeout");
    expect(mdb.finding.updateMany).toHaveBeenLastCalledWith(RELEASE);
    expect(h.revalidateTrip).not.toHaveBeenCalled();
  });

  it("a refused single-step fix rolls nothing back, so a concurrent edit stands", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.note", itemId: "i1", append: "x" }) });
    mdb.item.findUnique.mockResolvedValueOnce(ITEM).mockResolvedValueOnce({ ...ITEM, notes: "Edited by Xanni meanwhile." });
    h.updateItem.mockResolvedValueOnce({ success: false, errors: { notes: ["No"] } });
    await applyFinding("f1");
    expect(h.updateItem).toHaveBeenCalledTimes(1);
    expect(mdb.finding.updateMany).toHaveBeenLastCalledWith(RELEASE);
  });

  it("a refused move (it never landed) rolls nothing back, even when the day changed meanwhile", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.times", itemId: "i1", startTime: "09:00", date: "2027-06-03" }) });
    mdb.item.findUnique.mockResolvedValueOnce(ITEM).mockResolvedValueOnce({ ...ITEM, date: "2027-06-05" });
    h.rescheduleItem.mockResolvedValueOnce({ success: false, errors: { date: ["No"] } });
    await applyFinding("f1");
    expect(h.rescheduleItem).toHaveBeenCalledTimes(1);
    expect(h.updateItem).not.toHaveBeenCalled();
  });

  it("a late payload save onto a Finding released meanwhile writes nothing, and the Apply still reports what happened (parked 2)", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.note", itemId: "i1", append: "x" }) });
    mdb.item.findUnique.mockResolvedValue(ITEM);
    mdb.finding.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await applyFinding("f1")).toEqual({ success: true });
    expect(mdb.finding.updateMany).toHaveBeenCalledTimes(2); // the claim, then the conditional save: no release, no other write
    expect(mdb.finding.update).not.toHaveBeenCalled();
  });

  it("a throw after the move landed puts the day back before releasing (parked 4)", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.times", itemId: "i1", startTime: "09:00", date: "2027-06-03" }) });
    mdb.item.findUnique.mockResolvedValueOnce(ITEM).mockResolvedValueOnce({ ...ITEM, date: "2027-06-03" });
    h.updateItem.mockRejectedValueOnce(new Error("connection reset"));
    await expect(applyFinding("f1")).rejects.toThrow("connection reset");
    expect(h.rescheduleItem.mock.calls).toEqual([["i1", "2027-06-03"], ["i1", "2027-06-02"]]);
    expect(mdb.finding.updateMany).toHaveBeenLastCalledWith(RELEASE);
    // The day goes back first, then the claim is released.
    expect(h.rescheduleItem.mock.invocationCallOrder[1]).toBeLessThan(mdb.finding.updateMany.mock.invocationCallOrder.at(-1)!);
  });

  it("a landed move is put back by day only, leaving the times as they are now", async () => {
    access({ suggestedFix: JSON.stringify({ kind: "item.times", itemId: "i1", startTime: "09:00", date: "2027-06-03" }) });
    mdb.item.findUnique.mockResolvedValueOnce(ITEM).mockResolvedValueOnce({ ...ITEM, date: "2027-06-03", startTime: "11:15" });
    h.updateItem.mockResolvedValueOnce({ success: false, errors: { startTime: ["No"] } });
    await applyFinding("f1");
    expect(h.rescheduleItem.mock.calls).toEqual([["i1", "2027-06-03"], ["i1", "2027-06-02"]]);
    expect(h.updateItem).toHaveBeenCalledTimes(1); // the refused times only; no times restore
  });
});
