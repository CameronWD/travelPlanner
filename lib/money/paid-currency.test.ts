import { describe, expect, it } from "vitest";
import {
  followCurrencyChange,
  PAID_CURRENCY_MESSAGE,
  paidCurrencyChoices,
  paidCurrencyOf,
  paidCurrencyProblem,
  paysInOwnCurrency,
  storedPaidCurrency,
  toHome,
} from "./paid-currency";

describe("paidCurrencyOf", () => {
  it("is the Cost's own currency when none is recorded", () => {
    expect(paidCurrencyOf({ currency: "EUR" })).toBe("EUR");
    expect(paidCurrencyOf({ currency: "eur", paidCurrency: null })).toBe("EUR");
  });
  it("is the recorded paid currency, upper-cased", () => {
    expect(paidCurrencyOf({ currency: "EUR", paidCurrency: "aud" })).toBe("AUD");
  });
});

describe("paysInOwnCurrency", () => {
  it("is true with no paid currency, or one equal to the Cost's ignoring case", () => {
    expect(paysInOwnCurrency({ currency: "EUR" })).toBe(true);
    expect(paysInOwnCurrency({ currency: "EUR", paidCurrency: null })).toBe(true);
    expect(paysInOwnCurrency({ currency: "EUR", paidCurrency: "eur" })).toBe(true);
    expect(paysInOwnCurrency({ currency: "eur", paidCurrency: "EUR" })).toBe(true);
  });
  it("is false for another currency", () => {
    expect(paysInOwnCurrency({ currency: "EUR", paidCurrency: "AUD" })).toBe(false);
  });
});

describe("storedPaidCurrency", () => {
  it("stores nothing when absent or equal to the Cost's currency", () => {
    expect(storedPaidCurrency(null, "EUR")).toBeNull();
    expect(storedPaidCurrency(undefined, "EUR")).toBeNull();
    expect(storedPaidCurrency("EUR", "EUR")).toBeNull();
    expect(storedPaidCurrency("eur", "EUR")).toBeNull();
  });
  it("stores another currency upper-cased", () => {
    expect(storedPaidCurrency("aud", "EUR")).toBe("AUD");
  });
});

describe("paidCurrencyChoices", () => {
  it("offers the Cost's currency then Home", () => {
    expect(paidCurrencyChoices({ currency: "EUR" }, "AUD")).toEqual(["EUR", "AUD"]);
  });
  it("offers one entry when the Cost is in Home", () => {
    expect(paidCurrencyChoices({ currency: "AUD" }, "AUD")).toEqual(["AUD"]);
  });
  it("keeps a paid currency left by a Home change, after Home", () => {
    expect(paidCurrencyChoices({ currency: "EUR", paidCurrency: "AUD" }, "GBP")).toEqual(["EUR", "GBP", "AUD"]);
  });
  it("offers only the Cost's currency with no Home", () => {
    expect(paidCurrencyChoices({ currency: "eur" }, null)).toEqual(["EUR"]);
  });
});

describe("followCurrencyChange", () => {
  it("leaves a Home paid amount alone", () => {
    expect(followCurrencyChange("AUD", "EUR", "JPY", "AUD", true)).toBe("AUD");
  });
  it("follows when paid in the Cost's own currency", () => {
    expect(followCurrencyChange("EUR", "EUR", "JPY", "AUD", true)).toBe("JPY");
  });
  it("keeps Home for a Cost in Home with a paid amount in Home", () => {
    expect(followCurrencyChange("AUD", "AUD", "EUR", "AUD", true)).toBe("AUD");
  });
  it("follows for an unpaid Cost in Home", () => {
    expect(followCurrencyChange("AUD", "AUD", "EUR", "AUD", false)).toBe("EUR");
  });
  it("follows with no paid amount, even from Home", () => {
    expect(followCurrencyChange("AUD", "EUR", "JPY", "AUD", false)).toBe("JPY");
  });
  it("keeps a paid currency left by a Home change", () => {
    expect(followCurrencyChange("AUD", "EUR", "JPY", "GBP", true)).toBe("AUD");
  });
});

describe("paidCurrencyProblem", () => {
  const eur = { currency: "EUR", storedPaidCurrency: null };
  it("accepts nothing, the Cost's currency or Home", () => {
    expect(paidCurrencyProblem(null, eur, "AUD")).toBeNull();
    expect(paidCurrencyProblem("EUR", eur, "AUD")).toBeNull();
    expect(paidCurrencyProblem("aud", eur, "AUD")).toBeNull();
  });
  it("refuses a third currency", () => {
    expect(paidCurrencyProblem("GBP", eur, "AUD")).toBe(PAID_CURRENCY_MESSAGE);
  });
  it("accepts the value already stored after a Home change", () => {
    expect(paidCurrencyProblem("AUD", { currency: "EUR", storedPaidCurrency: "AUD" }, "GBP")).toBeNull();
  });
  it("has the exact refusal copy", () => {
    expect(PAID_CURRENCY_MESSAGE).toBe("What you paid can only be in the cost’s currency or your trip’s home currency.");
  });
});

describe("toHome", () => {
  it("passes a Home amount through, ignoring any rate", () => {
    expect(toHome(90512, "aud", "AUD", null)).toBe(90512);
    expect(toHome(90512, "AUD", "AUD", 2)).toBe(90512);
  });
  it("converts with a rate, in each currency's own decimals", () => {
    expect(toHome(90512, "AUD", "GBP", 0.5)).toBe(45256);
    expect(toHome(1000, "JPY", "AUD", 0.011)).toBe(1100);
  });
  it("is null with no rate", () => {
    expect(toHome(90512, "AUD", "GBP", null)).toBeNull();
    expect(toHome(90512, "AUD", "GBP", undefined)).toBeNull();
  });
});
