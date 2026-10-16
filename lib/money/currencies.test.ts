import { describe, it, expect } from "vitest";
import { CURRENCIES, CURRENCY_CODES, currencyName, DEFAULT_HOME_CURRENCY } from "./currencies";

const ORIGINAL_TEN = ["AUD", "NZD", "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "SGD", "THB"];

const ALL_THIRTY = [
  ...ORIGINAL_TEN,
  "BRL", "CNY", "CZK", "DKK", "HKD", "HUF", "IDR", "ILS", "INR", "ISK",
  "KRW", "MXN", "MYR", "NOK", "PHP", "PLN", "RON", "SEK", "TRY", "ZAR",
];

describe("currencies", () => {
  it("CURRENCY_CODES has exactly the 30 Frankfurter codes, no duplicates", () => {
    expect(new Set(CURRENCY_CODES)).toEqual(new Set(ALL_THIRTY));
    expect(CURRENCY_CODES.length).toBe(new Set(CURRENCY_CODES).size);
    expect(CURRENCY_CODES.length).toBe(30);
  });

  it("keeps the original 10 first, in their original order", () => {
    expect(CURRENCY_CODES.slice(0, 10)).toEqual(ORIGINAL_TEN);
  });

  it("every CURRENCIES entry has a non-empty name and symbol", () => {
    for (const c of CURRENCIES) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.symbol.length).toBeGreaterThan(0);
    }
  });

  it("currencyName returns the full name for a known code", () => {
    expect(currencyName("EUR")).toBe("Euro");
  });

  it("currencyName returns the code itself for an unknown code", () => {
    expect(currencyName("XXX")).toBe("XXX");
  });

  it("CURRENCIES list contains AUD", () => {
    const aud = CURRENCIES.find((c) => c.code === "AUD");
    expect(aud).toBeDefined();
    expect(aud?.name).toBe("Australian Dollar");
  });

  it("CURRENCIES list contains at least 10 entries", () => {
    expect(CURRENCIES.length).toBeGreaterThanOrEqual(10);
  });

  it("DEFAULT_HOME_CURRENCY is AUD", () => {
    expect(DEFAULT_HOME_CURRENCY).toBe("AUD");
  });
});
