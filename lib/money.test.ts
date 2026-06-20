import { describe, it, expect } from "vitest";
import {
  parseAmountToMinor,
  toMoneyValue,
  formatMinor,
} from "./money";

describe("parseAmountToMinor", () => {
  it("parses a decimal amount to minor units", () => {
    expect(parseAmountToMinor("12.50", "EUR")).toBe(1250);
  });

  it("treats whole numbers as major units (1234 -> 123400)", () => {
    expect(parseAmountToMinor("1234", "EUR")).toBe(123400);
  });

  it("rounds to two decimal places", () => {
    expect(parseAmountToMinor("12.345", "EUR")).toBe(1235);
    expect(parseAmountToMinor("0.1", "EUR")).toBe(10);
  });

  it("strips thousands separators", () => {
    expect(parseAmountToMinor("1,234.56", "USD")).toBe(123456);
    expect(parseAmountToMinor("1 000", "USD")).toBe(100000);
  });

  it("handles a leading sign", () => {
    expect(parseAmountToMinor("-5", "USD")).toBe(-500);
  });

  it("returns null for empty input", () => {
    expect(parseAmountToMinor("", "EUR")).toBeNull();
    expect(parseAmountToMinor("   ", "EUR")).toBeNull();
  });

  it("ignores invalid input gracefully", () => {
    expect(parseAmountToMinor("abc", "EUR")).toBeNull();
    expect(parseAmountToMinor("1.2.3", "EUR")).toBeNull();
    expect(parseAmountToMinor(".", "EUR")).toBeNull();
    expect(parseAmountToMinor("-", "EUR")).toBeNull();
    expect(parseAmountToMinor("12a", "EUR")).toBeNull();
  });
});

describe("toMoneyValue", () => {
  it("yields the expected money object for 12.50 EUR", () => {
    expect(toMoneyValue("12.50", "EUR")).toEqual({
      amountMinor: 1250,
      currency: "EUR",
    });
  });

  it("uppercases the currency code", () => {
    expect(toMoneyValue("1", "eur")).toEqual({
      amountMinor: 100,
      currency: "EUR",
    });
  });

  it("returns null when the amount is unparseable", () => {
    expect(toMoneyValue("nope", "EUR")).toBeNull();
  });
});

describe("formatMinor", () => {
  it("formats minor units back to a decimal string", () => {
    expect(formatMinor(1250, "EUR")).toBe("12.50");
    expect(formatMinor(123400, "EUR")).toBe("1234.00");
  });
});
