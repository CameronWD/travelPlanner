import { describe, it, expect } from "vitest";
import { currencyForCountry } from "./currency-for-country";
import { CURRENCY_CODES } from "./currencies";

describe("currencyForCountry", () => {
  it.each([["au", "AUD"], ["AU", "AUD"], ["nz", "NZD"], ["us", "USD"], ["de", "EUR"], ["fr", "EUR"], ["gb", "GBP"], ["jp", "JPY"], ["ch", "CHF"], ["ca", "CAD"], ["sg", "SGD"], ["th", "THB"], ["KR", "KRW"], ["IS", "ISK"], ["ZA", "ZAR"], ["DK", "DKK"]])("%s → %s", (cc, code) => {
    expect(currencyForCountry(cc)).toBe(code);
  });
  it("is undefined for a country whose currency we don't offer", () => {
    expect(currencyForCountry("VN")).toBeUndefined();
    expect(currencyForCountry("")).toBeUndefined();
  });
  it("only ever returns a supported currency, and covers every one", async () => {
    const { BY_COUNTRY } = await import("./currency-for-country");
    const values = new Set(Object.values(BY_COUNTRY));
    for (const v of values) expect(CURRENCY_CODES).toContain(v);
    for (const code of CURRENCY_CODES) expect(values.has(code)).toBe(true);
  });
});
