import { describe, expect, it } from "vitest";
import { cost } from "@/test/builders";
import {
  emptyCostFormState,
  costToFormState,
  seedCostFormState,
  setCostAmount,
  setPaid,
  toCostPayload,
  paidFieldsFromRow,
} from "./cost-form-state";

describe("seedCostFormState", () => {
  it("prefers a saved Cost, exactly as the forms seeded it before", () => {
    const saved = cost({
      id: "c1",
      costMinor: 12_345,
      paidMinor: 12_345,
      currency: "EUR",
      rateToHome: null,
      paidAt: new Date("2026-10-01T00:00:00Z"),
      dueDate: null,
      ownerType: "TRANSPORT",
      ownerId: "t1",
      label: null,
      category: null,
      settlement: "ON_TRIP",
    });
    expect(seedCostFormState(saved, { costMinor: 1, currency: "AUD" }, "AUD")).toEqual({
      costAmount: "123.45",
      currency: "EUR",
      paidAmount: "123.45",
      paidAt: "2026-10-01",
      paid: true,
      settlement: "ON_TRIP",
    });
  });

  it("seeds a Proposal's inline Cost", () => {
    expect(
      seedCostFormState(null, { costMinor: 12_000, currency: "JPY", paidMinor: null, paidAt: null }, "AUD"),
    ).toEqual({ costAmount: "12000", currency: "JPY", paidAmount: "", paidAt: "", paid: false, settlement: "BEFORE" });
  });

  it("falls back to an empty Cost in the default currency", () => {
    expect(seedCostFormState(null, undefined, "AUD")).toEqual({
      costAmount: "",
      currency: "AUD",
      paidAmount: "",
      paidAt: "",
      paid: false,
      settlement: "BEFORE",
    });
  });
});

describe("toCostPayload", () => {
  const base = emptyCostFormState("AUD");

  it("blank cost is none", () => expect(toCostPayload(base)).toEqual({ kind: "none" }));

  it("an unparseable cost is invalid, not dropped", () =>
    expect(toCostPayload({ ...base, costAmount: "abc" })).toEqual({
      kind: "invalid",
      errors: { costMinor: ["Enter the cost"] },
    }));

  it("unpaid sends undefined paid fields, never null", () => {
    const p = toCostPayload({ ...base, costAmount: "120" });
    expect(p).toEqual({
      kind: "ok",
      fields: { costMinor: 12000, currency: "AUD", paidMinor: undefined, paidAt: undefined, settlement: "BEFORE" },
    });
  });

  it("Paid with no amount is refused (Review Focus 5)", () =>
    expect(toCostPayload({ ...base, costAmount: "120", paid: true, paidAmount: "" })).toEqual({
      kind: "invalid",
      errors: { paidMinor: ["Enter what you paid"] },
    }));

  it("a genuine 0 paid amount is sent as 0, not dropped as falsy", () => {
    const p = toCostPayload({ ...base, costAmount: "120", paid: true, paidAmount: "0", paidAt: "2026-10-15" });
    expect(p).toEqual({
      kind: "ok",
      fields: { costMinor: 12000, currency: "AUD", paidMinor: 0, paidAt: "2026-10-15", settlement: "BEFORE" },
    });
  });

  it("paid with a parseable amount and a blank date sends paidAt undefined", () => {
    const p = toCostPayload({ ...base, costAmount: "120", paid: true, paidAmount: "120", paidAt: "" });
    expect(p).toEqual({
      kind: "ok",
      fields: { costMinor: 12000, currency: "AUD", paidMinor: 12000, paidAt: undefined, settlement: "BEFORE" },
    });
  });
});

describe("setPaid", () => {
  const base = emptyCostFormState("AUD");

  it("ticking Paid pre-fills the cost and today", () =>
    expect(setPaid({ ...base, costAmount: "120" }, true, "2026-10-15")).toMatchObject({
      paid: true,
      paidAmount: "120",
      paidAt: "2026-10-15",
    }));

  it("does not overwrite an already-entered amount or date", () =>
    expect(setPaid({ ...base, costAmount: "120", paidAmount: "50", paidAt: "2026-01-01" }, true, "2026-10-15")).toMatchObject({
      paid: true,
      paidAmount: "50",
      paidAt: "2026-01-01",
    }));

  it("unticking Paid keeps the amount/date so re-ticking doesn't lose them", () =>
    expect(setPaid({ ...base, costAmount: "120", paid: true, paidAmount: "120", paidAt: "2026-10-15" }, false, "2026-10-15")).toMatchObject({
      paid: false,
      paidAmount: "120",
      paidAt: "2026-10-15",
    }));
});

describe("setCostAmount", () => {
  const base = emptyCostFormState("AUD");

  it("blanking the cost clears the paid state", () =>
    expect(
      setCostAmount({ ...base, costAmount: "120", paid: true, paidAmount: "120", paidAt: "2026-10-15" }, ""),
    ).toMatchObject({ paid: false, paidAmount: "", paidAt: "" }));

  it("a non-blank change leaves the paid state untouched", () =>
    expect(
      setCostAmount({ ...base, costAmount: "120", paid: true, paidAmount: "120", paidAt: "2026-10-15" }, "200"),
    ).toMatchObject({ costAmount: "200", paid: true, paidAmount: "120", paidAt: "2026-10-15" }));
});

describe("costToFormState", () => {
  it("a legacy row with a paid amount but no date opens unpaid and keeps the amount", () =>
    expect(costToFormState(cost({ paidMinor: 1250, paidAt: null }))).toMatchObject({
      paid: false,
      paidAmount: "12.50",
    }));
});

describe("paidFieldsFromRow", () => {
  it("paidAt decides; a paid row with no amount falls back to the cost", () => {
    expect(paidFieldsFromRow({ costMinor: 500, paidMinor: null, paidAt: null })).toEqual({});
    expect(paidFieldsFromRow({ costMinor: 500, paidMinor: null, paidAt: new Date("2026-10-01T00:00:00Z") })).toEqual({
      paidMinor: 500,
      paidAt: "2026-10-01",
    });
  });
});
