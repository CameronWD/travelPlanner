import { describe, expect, it } from "vitest";
import { mergeCostPatch, DUE_DATE_NOT_APPLICABLE } from "./cost-patch";

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
