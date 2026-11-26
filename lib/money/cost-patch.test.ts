import { describe, expect, it } from "vitest";
import { REFUND_MESSAGES } from "@/lib/money/refund";
import { completeInlineCost, mergeCostPatch, paidPairAfter, DUE_DATE_NOT_APPLICABLE, MORE_THAN_ONE_COST } from "./cost-patch";

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
  it("against more than one owned Cost is refused with Traveller wording (no tool name — that's the MCP tool's job to add)", () => {
    const result = completeInlineCost({ costMinor: 1 }, [paid, { ...paid, id: "c2" }]);
    expect(result).toEqual(MORE_THAN_ONE_COST);
    expect(result).toMatchObject({ success: false, errors: { costMinor: ["This now has more than one Cost. Edit them in Money."] } });
    expect(JSON.stringify(result)).not.toMatch(/update_cost/);
  });
  it("the form's unpaid save (paidAt: null) un-pays, keeping the amount as history", () => {
    expect(completeInlineCost({ costMinor: 9000, currency: "EUR", paidAt: null, settlement: "BEFORE" }, [paid]))
      .toEqual({ costMinor: 9000, currency: "EUR", settlement: "BEFORE" });
  });
});

describe("Refund through the inline Cost", () => {
  const single = { id: "k1", costMinor: 20000, currency: "EUR", paidMinor: 20000, paidAt: new Date("2026-04-01T00:00:00Z"), refundMinor: 5000, refundedAt: null };

  it("an amount-only edit passes and never carries the refund columns", () => {
    const r = completeInlineCost({ costMinor: 21000, currency: "EUR" }, [single]);
    expect(r).toMatchObject({ costMinor: 21000, paidMinor: 20000, paidAt: "2026-04-01" });
    expect(r).not.toHaveProperty("refundMinor");
    expect(r).not.toHaveProperty("refundedAt");
  });
  it("un-paying a refunded Cost is refused with the unpay message", () => {
    expect(completeInlineCost({ costMinor: 20000, currency: "EUR", paidAt: null }, [single])).toEqual(
      { success: false, errors: { _: [REFUND_MESSAGES.unpayBlocked] } },
    );
  });
  it("changing the currency of a refunded Cost is refused; repeating it is not", () => {
    expect(completeInlineCost({ costMinor: 20000, currency: "USD" }, [single])).toEqual(
      { success: false, errors: { _: [REFUND_MESSAGES.currencyBlocked] } },
    );
    expect(completeInlineCost({ costMinor: 20000, currency: "EUR" }, [single])).toMatchObject({ currency: "EUR" });
  });
  it("a paid amount below the Refund is refused", () => {
    expect(completeInlineCost({ costMinor: 20000, currency: "EUR", paidMinor: 4000, paidAt: "2026-04-01" }, [single])).toEqual(
      { success: false, errors: { _: [REFUND_MESSAGES.tooMuch] } },
    );
  });
});

describe("mergeCostPatch keeps a Refund", () => {
  const refunded = { ...paidRow, refundMinor: 3000, refundedAt: new Date("2026-05-02T00:00:00Z") };
  it("carries the row's Refund when the patch is silent, and lets null clear it", () => {
    expect(mergeCostPatch(refunded, { category: "Tours" })).toMatchObject({ refundMinor: 3000, refundedAt: "2026-05-02" });
    const cleared = mergeCostPatch(refunded, { refundMinor: null, refundedAt: null });
    expect(cleared).not.toHaveProperty("refundMinor");
    expect(cleared).not.toHaveProperty("refundedAt");
  });
});

describe("the paid currency through mergeCostPatch", () => {
  const paidAt = new Date("2026-04-01T00:00:00Z");
  const eurPaidHome = { ...paidRow, costMinor: 55000, currency: "EUR", paidMinor: 90512, paidAt, paidCurrency: "AUD" };
  const paidOf = (m: ReturnType<typeof mergeCostPatch>) => ("success" in m ? "refused" : m.paidCurrency ?? null);

  it("a patch that changes the currency keeps a Home paid currency", () => {
    expect(mergeCostPatch(eurPaidHome, { currency: "JPY" }, "AUD")).toMatchObject({ currency: "JPY", paidMinor: 90512, paidCurrency: "AUD" });
  });
  it("a patch that changes the currency of a Cost paid in its own currency, the paid currency follows (stored null)", () => {
    expect(paidOf(mergeCostPatch(paidRow, { currency: "JPY" }, "AUD"))).toBeNull();
  });
  it("a Cost with no recorded paid currency follows its own currency when that changes, even from Home", () => {
    const audPaid = { ...paidRow, costMinor: 55000, currency: "AUD", paidMinor: 55000, paidAt };
    const m = mergeCostPatch(audPaid, { currency: "EUR" }, "AUD");
    expect(m).toMatchObject({ currency: "EUR", paidMinor: 55000 });
    expect(paidOf(m)).toBeNull();
  });
  it("an unpaid Cost in Home with no paid amount stores null when its currency changes", () => {
    const audUnpaid = { ...unpaidRow, currency: "AUD", paidMinor: null };
    expect(paidOf(mergeCostPatch(audUnpaid, { currency: "EUR" }, "AUD"))).toBeNull();
  });
  it("changing the currency to Home stores null", () => {
    expect(mergeCostPatch(eurPaidHome, { currency: "AUD" }, "AUD")).toMatchObject({ currency: "AUD", paidMinor: 90512, paidCurrency: null });
  });
  it("a patch naming paidCurrency null means the Cost's own", () => {
    expect(mergeCostPatch(eurPaidHome, { paidCurrency: null, paidMinor: 55000 }, "AUD")).toMatchObject({ currency: "EUR", paidMinor: 55000, paidCurrency: null });
  });
  it("with a Refund, changing the Cost's currency is allowed when it is paid in Home", () => {
    expect(mergeCostPatch({ ...eurPaidHome, refundMinor: 5000 }, { currency: "JPY" }, "AUD")).toMatchObject({ currency: "JPY", paidCurrency: "AUD", refundMinor: 5000 });
  });
  it("with a Refund, changing the Cost's currency is refused when it is paid in its own currency", () => {
    expect(mergeCostPatch({ ...paidRow, refundMinor: 3000 }, { currency: "JPY" }, "AUD")).toEqual(
      { success: false, errors: { _: [REFUND_MESSAGES.currencyBlocked] } },
    );
  });
  it("with a Refund, changing the paid currency is refused", () => {
    const blocked = { success: false, errors: { _: [REFUND_MESSAGES.currencyBlocked] } };
    expect(mergeCostPatch({ ...eurPaidHome, refundMinor: 5000 }, { paidCurrency: null }, "AUD")).toEqual(blocked);
    expect(mergeCostPatch({ ...paidRow, refundMinor: 3000 }, { paidCurrency: "AUD" }, "AUD")).toEqual(blocked);
  });
});

describe("the paid currency through completeInlineCost", () => {
  const paidAt = new Date("2026-04-15T00:00:00Z");
  const eurPaidHome = { id: "c1", costMinor: 55000, currency: "EUR", paidMinor: 90512, paidAt, paidCurrency: "AUD", refundMinor: 5000, refundedAt: null };
  const blocked = { success: false, errors: { _: [REFUND_MESSAGES.currencyBlocked] } };

  it("with a Refund, changing the Cost's currency is allowed when it is paid in Home", () => {
    expect(completeInlineCost({ costMinor: 9000000, currency: "JPY" }, [eurPaidHome], "AUD")).toEqual(
      { costMinor: 9000000, currency: "JPY", paidMinor: 90512, paidAt: "2026-04-15", paidCurrency: "AUD" },
    );
  });
  it("with a Refund, changing the Cost's currency is refused when it is paid in its own currency", () => {
    expect(completeInlineCost({ costMinor: 9000000, currency: "JPY" }, [{ ...eurPaidHome, paidMinor: 55000, paidCurrency: null }], "AUD")).toEqual(blocked);
  });
  it("with a Refund, changing the paid currency is refused", () => {
    expect(completeInlineCost({ costMinor: 55000, currency: "EUR", paidMinor: 55000, paidAt: "2026-04-15", paidCurrency: null }, [eurPaidHome], "AUD")).toEqual(blocked);
  });
});
