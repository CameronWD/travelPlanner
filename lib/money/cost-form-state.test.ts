import { describe, expect, it } from "vitest";
import { cost } from "@/test/builders";
import {
  emptyCostFormState,
  costToFormState,
  seedCostFormState,
  setCostAmount,
  setPaid,
  setCostCurrency,
  setPaidCurrency,
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
      paidCurrency: "EUR",
      paidCurrencyExplicit: false,
    });
  });

  it("seeds a Proposal's inline Cost", () => {
    expect(
      seedCostFormState(null, { costMinor: 12_000, currency: "JPY", paidMinor: null, paidAt: null }, "AUD"),
    ).toEqual({
      costAmount: "12000",
      currency: "JPY",
      paidAmount: "",
      paidAt: "",
      paid: false,
      settlement: "BEFORE",
      paidCurrency: "JPY",
      paidCurrencyExplicit: false,
    });
  });

  it("falls back to an empty Cost in the default currency", () => {
    expect(seedCostFormState(null, undefined, "AUD")).toEqual({
      costAmount: "",
      currency: "AUD",
      paidAmount: "",
      paidAt: "",
      paid: false,
      settlement: "BEFORE",
      paidCurrency: "AUD",
      paidCurrencyExplicit: false,
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

  it("a legacy paid row with no paid amount opens paid with the cost as its paid amount, so it can be resaved", () => {
    const s = costToFormState(cost({ costMinor: 1250, paidMinor: null, paidAt: new Date("2026-10-01T00:00:00Z") }));
    expect(s).toMatchObject({ paid: true, paidAmount: "12.50", paidAt: "2026-10-01" });
    expect(toCostPayload(s)).toMatchObject({ kind: "ok", fields: { paidMinor: 1250, paidAt: "2026-10-01" } });
  });
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

describe("the paid currency", () => {
  const paidAt = new Date("2026-10-01T00:00:00Z");

  it("a Cost paid in Home seeds You paid in Home with its decimals", () => {
    const s = costToFormState(cost({ currency: "JPY", costMinor: 12_000, paidMinor: 15_050, paidCurrency: "AUD", paidAt }));
    expect(s).toMatchObject({ costAmount: "12000", currency: "JPY", paidCurrency: "AUD", paidAmount: "150.50", paid: true });
  });

  it("a Proposal paid in Home seeds You paid in Home with its decimals", () => {
    const s = seedCostFormState(null, { costMinor: 12_000, currency: "JPY", paidMinor: 15_050, paidCurrency: "AUD", paidAt: "2026-10-01" }, "AUD");
    expect(s).toMatchObject({ costAmount: "12000", currency: "JPY", paidCurrency: "AUD", paidAmount: "150.50" });
    expect(toCostPayload(s)).toMatchObject({ kind: "ok", fields: { paidMinor: 15_050, paidCurrency: "AUD" } });
  });

  it("the payload parses the paid amount in the paid currency", () => {
    const s = setPaidCurrency(setPaid({ ...emptyCostFormState("JPY"), costAmount: "12000" }, true, "2026-10-15"), "AUD");
    expect(toCostPayload({ ...s, paidAmount: "150.50" })).toEqual({
      kind: "ok",
      fields: { costMinor: 12_000, currency: "JPY", paidMinor: 15_050, paidAt: "2026-10-15", paidCurrency: "AUD", settlement: "BEFORE" },
    });
  });

  it("an amount typed in a zero-decimal paid currency is counted in its units", () => {
    const s = setPaidCurrency(setPaid({ ...emptyCostFormState("AUD"), costAmount: "100" }, true, "2026-10-15"), "JPY");
    expect(toCostPayload({ ...s, paidAmount: "12000" })).toMatchObject({ kind: "ok", fields: { costMinor: 10_000, paidMinor: 12_000, paidCurrency: "JPY" } });
  });

  it("the payload sends null when paid in the Cost's currency", () => {
    const s = costToFormState(cost({ currency: "JPY", costMinor: 12_000, paidMinor: 15_050, paidCurrency: "AUD", paidAt }));
    const back = { ...setPaidCurrency(s, "JPY"), paidAmount: "12000" };
    const p = toCostPayload(back);
    expect(p).toMatchObject({ kind: "ok", fields: { paidMinor: 12_000 } });
    expect(p.kind === "ok" && p.fields).toHaveProperty("paidCurrency", null);
  });

  it("the payload sends no paid currency when unpaid", () => {
    const s = costToFormState(cost({ currency: "JPY", costMinor: 12_000, paidMinor: 15_050, paidCurrency: "AUD", paidAt }));
    const p = toCostPayload(setPaid(s, false, "2026-10-15"));
    expect(p.kind === "ok" && p.fields).not.toHaveProperty("paidCurrency");
  });

  it("setPaidCurrency clears the amount", () => {
    const s = setPaid({ ...emptyCostFormState("EUR"), costAmount: "550" }, true, "2026-10-15");
    expect(setPaidCurrency(s, "AUD")).toMatchObject({ currency: "EUR", costAmount: "550", paidCurrency: "AUD", paidAmount: "" });
    expect(setPaidCurrency(setPaidCurrency(s, "AUD"), "EUR")).toMatchObject({ paidCurrency: "EUR", paidAmount: "" });
  });

  it("setCostCurrency keeps a Home paid currency that has an amount and moves an own one", () => {
    const own = setPaid({ ...emptyCostFormState("EUR"), costAmount: "550" }, true, "2026-10-15");
    expect(setCostCurrency(own, "GBP", "AUD")).toMatchObject({ currency: "GBP", paidCurrency: "GBP", paidAmount: "550" });
    const home = { ...setPaidCurrency(own, "AUD"), paidAmount: "905.12" };
    expect(setCostCurrency(home, "GBP", "AUD")).toMatchObject({ currency: "GBP", paidCurrency: "AUD", paidAmount: "905.12" });
  });

  it("a Home picked in You paid stays Home through a change of the Cost's currency before an amount is typed", () => {
    const home = setPaidCurrency(setPaid({ ...emptyCostFormState("EUR"), costAmount: "550" }, true, "2026-10-15"), "AUD");
    expect(setCostCurrency(home, "GBP", "AUD")).toMatchObject({ currency: "GBP", paidCurrency: "AUD", paidAmount: "" });
  });

  it("a Cost with no stored paid currency follows a change of the Cost's currency, even paid in Home", () => {
    const s = costToFormState(cost({ currency: "AUD", costMinor: 5000, paidMinor: 5000, paidCurrency: null, paidAt }));
    const moved = setCostCurrency(s, "EUR", "AUD");
    expect(moved).toMatchObject({ currency: "EUR", paidCurrency: "EUR", paidAmount: "50.00" });
    const p = toCostPayload(moved);
    expect(p.kind === "ok" && p.fields).not.toHaveProperty("paidCurrency");
  });

  it("a new Cost switched from Home to EUR, then Paid ticked, offers the cost pre-filled in EUR", () => {
    const typed = setCostAmount(emptyCostFormState("AUD"), "550");
    const ticked = setPaid(setCostCurrency(typed, "EUR", "AUD"), true, "2026-10-15");
    expect(ticked).toMatchObject({ currency: "EUR", paidCurrency: "EUR", paidAmount: "550" });
  });

  it("ticking Paid with a blank amount puts You paid back in the Cost's currency", () => {
    const home = setPaid(setPaidCurrency(setPaid({ ...emptyCostFormState("EUR"), costAmount: "550" }, true, "2026-10-15"), "AUD"), false, "2026-10-15");
    expect(setPaid(home, true, "2026-10-15")).toMatchObject({ paidCurrency: "EUR", paidAmount: "550" });
  });

  it("ticking Paid with an amount already typed in Home leaves it in Home", () => {
    const home = { ...setPaidCurrency(setPaid({ ...emptyCostFormState("EUR"), costAmount: "550" }, true, "2026-10-15"), "AUD"), paidAmount: "905.12" };
    expect(setPaid(setPaid(home, false, "2026-10-15"), true, "2026-10-15")).toMatchObject({ paidCurrency: "AUD", paidAmount: "905.12" });
  });

  it("an existing Cost seeds and pays back exactly as before", () => {
    const paid = cost({ currency: "JPY", costMinor: 12_000, paidMinor: 11_500, paidCurrency: null, paidAt, settlement: "ON_TRIP" });
    expect(toCostPayload(costToFormState(paid))).toStrictEqual({
      kind: "ok",
      fields: { costMinor: 12_000, currency: "JPY", paidMinor: 11_500, paidAt: "2026-10-01", settlement: "ON_TRIP" },
    });
    const unpaid = cost({ currency: "EUR", costMinor: 1200, paidMinor: null, paidAt: null });
    expect(toCostPayload(costToFormState(unpaid))).toStrictEqual({
      kind: "ok",
      fields: { costMinor: 1200, currency: "EUR", paidMinor: undefined, paidAt: undefined, settlement: "BEFORE" },
    });
    const legacy = cost({ currency: "EUR", costMinor: 1200, paidMinor: null, paidAt });
    expect(toCostPayload(costToFormState(legacy))).toStrictEqual({
      kind: "ok",
      fields: { costMinor: 1200, currency: "EUR", paidMinor: 1200, paidAt: "2026-10-01", settlement: "BEFORE" },
    });
  });
});
