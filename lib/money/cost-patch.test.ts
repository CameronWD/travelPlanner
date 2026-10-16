import { describe, expect, it } from "vitest";
import { completeInlineCost, mergeCostPatch, paidPairAfter, DUE_DATE_NOT_APPLICABLE } from "./cost-patch";

const paidRow = {
  costMinor: 12000, currency: "EUR", paidMinor: 12000, paidAt: new Date("2026-04-01T00:00:00Z"), dueDate: null,
  ownerType: "OTHER", ownerId: null, label: "Museum pass", category: "Activities", settlement: "BEFORE",
};
const unpaidRow = { ...paidRow, paidMinor: null, paidAt: null, dueDate: "2026-04-20" };

describe("mergeCostPatch", () => {
  it("with only category keeps every other field, including the paid amount and date", () => {
    expect(mergeCostPatch(paidRow, { category: "Tours" })).toEqual({
      costMinor: 12000, currency: "EUR", ownerType: "OTHER", ownerId: undefined, label: "Museum pass", category: "Tours",
      dueDate: undefined, settlement: "BEFORE", paidMinor: 12000, paidAt: "2026-04-01",
    });
  });
  it("a cost-amount-only patch (as through Claude) keeps a paid Cost paid with its paid pair", () => {
    expect(mergeCostPatch({ ...paidRow, paidMinor: 11000 }, { costMinor: 15000 })).toMatchObject({ costMinor: 15000, paidMinor: 11000, paidAt: "2026-04-01" });
  });
  it("a paid-amount-only patch keeps a paid Cost paid: the new amount, the row's paid date", () => {
    expect(mergeCostPatch(paidRow, { paidMinor: 9000 })).toMatchObject({ paidMinor: 9000, paidAt: "2026-04-01" });
  });
  it("a currency change on a paid Cost still carries the paid pair", () => {
    expect(mergeCostPatch(paidRow, { currency: "GBP" })).toMatchObject({ currency: "GBP", paidMinor: 12000, paidAt: "2026-04-01" });
  });
  it("an unpaid Cost carries neither paidMinor nor paidAt", () => {
    const m = mergeCostPatch({ ...unpaidRow, paidMinor: 900 }, { label: "Pass" });
    expect(m).not.toHaveProperty("paidMinor");
    expect(m).not.toHaveProperty("paidAt");
  });
  it("a legacy paid row with no amount stays paid, its amount falling back to the cost", () => {
    expect(mergeCostPatch({ ...paidRow, paidMinor: null }, { label: "Pass" })).toMatchObject({ paidMinor: 12000, paidAt: "2026-04-01" });
  });
  it("drops the row's dueDate when the patch sets settlement ON_TRIP", () => {
    expect(mergeCostPatch(unpaidRow, { settlement: "ON_TRIP" })).toMatchObject({ settlement: "ON_TRIP", dueDate: undefined });
  });
  it("an explicit dueDate on a paid Cost is refused", () => {
    expect(mergeCostPatch(paidRow, { dueDate: "2026-04-10" })).toEqual(DUE_DATE_NOT_APPLICABLE);
  });
  it("an explicit dueDate with settlement ON_TRIP (patched or current) is refused", () => {
    expect(mergeCostPatch(unpaidRow, { settlement: "ON_TRIP", dueDate: "2026-04-10" })).toEqual(DUE_DATE_NOT_APPLICABLE);
    expect(mergeCostPatch({ ...unpaidRow, settlement: "ON_TRIP" }, { dueDate: "2026-04-10" })).toEqual(DUE_DATE_NOT_APPLICABLE);
  });
  it("an explicit dueDate on an unpaid Cost paid before the trip is kept", () => {
    expect(mergeCostPatch(unpaidRow, { dueDate: "2026-04-25" })).toMatchObject({ dueDate: "2026-04-25" });
  });
  it("drops the row's dueDate when the Cost is paid", () => {
    expect(mergeCostPatch({ ...paidRow, dueDate: "2026-04-20" }, { label: "x" })).toMatchObject({ dueDate: undefined });
  });
  // The editors' saves (full input through toPatch):
  it("the editor's un-ticked Paid (paidAt: null) un-pays the Cost and keeps the paid amount as history", () => {
    const m = mergeCostPatch(paidRow, { costMinor: 12000, currency: "EUR", paidAt: null, settlement: "BEFORE" });
    expect(m).not.toHaveProperty("paidAt");
    expect(m).not.toHaveProperty("paidMinor"); // undefined: updateCost leaves the column (history)
  });
  it("the editor's cleared Due date (null) clears it", () => {
    expect(mergeCostPatch(unpaidRow, { dueDate: null, paidAt: null })).toMatchObject({ dueDate: undefined });
  });
});

describe("paidPairAfter", () => {
  it("a lone paidMinor on a paid row overlays the amount and keeps the row's paidAt (only paidAt speaks about Paid)", () => {
    expect(paidPairAfter({ paidMinor: 7000 }, paidRow)).toEqual({ paidMinor: 7000, paidAt: "2026-04-01" });
  });
  it("a lone paidMinor: null leaves the row's paid pair (the stored paid amount is history)", () => {
    expect(paidPairAfter({ paidMinor: null }, paidRow)).toEqual({ paidMinor: 12000, paidAt: "2026-04-01" });
  });
});

describe("completeInlineCost", () => {
  const paid = { id: "c1", costMinor: 9000, currency: "EUR", paidMinor: 9000, paidAt: new Date("2026-04-15T00:00:00Z") };
  it("a patch that doesn't touch the Cost completes nothing", () => {
    expect(completeInlineCost({ paidAt: null }, [paid])).toBeNull();
  });
  it("costMinor-only on a paid owned Cost carries currency and the paid pair together", () => {
    expect(completeInlineCost({ costMinor: 9500 }, [paid])).toEqual({ costMinor: 9500, currency: "EUR", paidMinor: 9000, paidAt: "2026-04-15" });
  });
  it("keeps a paid Cost paid even if its paid amount is missing (paidAt decides)", () => {
    expect(completeInlineCost({ costMinor: 600 }, [{ ...paid, costMinor: 500, currency: "AUD", paidMinor: null, paidAt: new Date("2026-10-01T00:00:00Z") }]))
      .toMatchObject({ costMinor: 600, currency: "AUD", paidMinor: 500, paidAt: "2026-10-01" });
  });
  it("on an UNPAID owned Cost carries no paid pair", () => {
    const r = completeInlineCost({ costMinor: 9500 }, [{ ...paid, paidMinor: null, paidAt: null }]);
    expect(r).toEqual({ costMinor: 9500, currency: "EUR" });
  });
  it("currency-only with no owned Cost is refused", () => {
    expect(completeInlineCost({ currency: "EUR" }, [])).toMatchObject({ success: false, errors: { costMinor: [expect.stringMatching(/Pass both costMinor and currency/)] } });
  });
  it("against more than one owned Cost is refused", () => {
    expect(completeInlineCost({ costMinor: 1 }, [paid, { ...paid, id: "c2" }])).toMatchObject({ success: false, errors: { costMinor: [expect.stringMatching(/more than one Cost/)] } });
  });
  it("the form's unpaid save (paidAt: null) un-pays, keeping the amount as history", () => {
    expect(completeInlineCost({ costMinor: 9000, currency: "EUR", paidAt: null, settlement: "BEFORE" }, [paid]))
      .toEqual({ costMinor: 9000, currency: "EUR", settlement: "BEFORE" });
  });
});
