import { describe, it, expect } from "vitest";
import { tripCurrencies, currencyChoices } from "./trip-currencies";
import { CURRENCY_CODES } from "./currencies";

describe("tripCurrencies", () => {
  it("Home first, then each Stop's country in route order, then Cost currencies, without repeats", () => {
    expect(
      tripCurrencies({ homeCurrency: "AUD", stopCountryCodes: ["fr", "de", "th", "fr"], costCurrencies: ["EUR", "JPY"] }),
    ).toEqual(["AUD", "EUR", "THB", "JPY"]);
  });

  it("a country with no currency Teepee offers adds nothing", () => {
    expect(tripCurrencies({ homeCurrency: "AUD", stopCountryCodes: ["zz"], costCurrencies: [] })).toEqual(["AUD"]);
  });

  it("a Stop with no country adds nothing", () => {
    expect(tripCurrencies({ homeCurrency: "AUD", stopCountryCodes: [null], costCurrencies: [] })).toEqual(["AUD"]);
  });

  it("lower-case input is upper-cased", () => {
    expect(tripCurrencies({ homeCurrency: "aud", stopCountryCodes: [], costCurrencies: ["jpy", "AUD"] })).toEqual(["AUD", "JPY"]);
  });
});

describe("currencyChoices", () => {
  it("the field's own currency is added when the trip does not use it", () => {
    expect(currencyChoices(["AUD", "EUR"], "GBP", false)).toEqual(["AUD", "EUR", "GBP"]);
  });

  it("the field's own currency is not added twice", () => {
    expect(currencyChoices(["AUD", "EUR"], "EUR", false)).toEqual(["AUD", "EUR"]);
    expect(currencyChoices(["AUD", "EUR"], "EUR", true).filter((c) => c === "EUR")).toHaveLength(1);
  });

  it("expanded lists the trip's first, then every other currency once", () => {
    const all = currencyChoices(["AUD", "EUR"], "AUD", true);
    expect(all).toHaveLength(CURRENCY_CODES.length);
    expect(all.slice(0, 2)).toEqual(["AUD", "EUR"]);
    expect(new Set(all).size).toBe(all.length);
  });
});
