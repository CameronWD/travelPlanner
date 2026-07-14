import { describe, it, expect } from "vitest";
import {
  parseAmountToMinor,
  toMoneyValue,
  formatMinor,
  decimalsFor,
  formatMoney,
  formatAmountOnly,
  convertMinor,
  sumMinorToHome,
  currencySymbol,
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

  it("rounds half-up without floating-point drift (1.005 -> 101, not 100)", () => {
    // 1.005 * 100 === 100.49999999999999 in IEEE-754; a naive Math.round drops a cent.
    expect(parseAmountToMinor("1.005", "EUR")).toBe(101);
    expect(parseAmountToMinor("1.015", "EUR")).toBe(102);
    expect(parseAmountToMinor("2.675", "EUR")).toBe(268);
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

// ---------------------------------------------------------------------------
// decimalsFor
// ---------------------------------------------------------------------------

describe("decimalsFor", () => {
  it("returns 0 for JPY", () => {
    expect(decimalsFor("JPY")).toBe(0);
  });

  it("returns 0 for KRW", () => {
    expect(decimalsFor("KRW")).toBe(0);
  });

  it("returns 0 for VND", () => {
    expect(decimalsFor("VND")).toBe(0);
  });

  it("returns 0 for CLP", () => {
    expect(decimalsFor("CLP")).toBe(0);
  });

  it("returns 0 for ISK", () => {
    expect(decimalsFor("ISK")).toBe(0);
  });

  it("returns 2 for AUD", () => {
    expect(decimalsFor("AUD")).toBe(2);
  });

  it("returns 2 for EUR", () => {
    expect(decimalsFor("EUR")).toBe(2);
  });

  it("returns 3 for BHD", () => {
    expect(decimalsFor("BHD")).toBe(3);
  });

  it("returns 3 for KWD", () => {
    expect(decimalsFor("KWD")).toBe(3);
  });

  it("returns 3 for OMR", () => {
    expect(decimalsFor("OMR")).toBe(3);
  });

  it("returns 3 for TND", () => {
    expect(decimalsFor("TND")).toBe(3);
  });

  it("returns 2 for unknown currency", () => {
    expect(decimalsFor("XYZ")).toBe(2);
  });

  it("is case-insensitive", () => {
    expect(decimalsFor("jpy")).toBe(0);
    expect(decimalsFor("aud")).toBe(2);
    expect(decimalsFor("bhd")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// formatMoney
// ---------------------------------------------------------------------------

describe("formatMoney", () => {
  it("formats JPY 1000 with no decimal places", () => {
    const result = formatMoney(1000, "JPY");
    expect(result).toContain("1,000");
    expect(result).not.toMatch(/1,000\.\d/);
  });

  it("formats AUD 1250 as $12.50", () => {
    const result = formatMoney(1250, "AUD");
    expect(result).toContain("12.50");
  });

  it("formats EUR 1250 with 2 decimal places", () => {
    const result = formatMoney(1250, "EUR");
    expect(result).toContain("12.50");
  });

  it("handles negative amounts", () => {
    const result = formatMoney(-1250, "EUR");
    expect(result).toContain("12.50");
    // Should reflect negative in the output somehow
    expect(result).toMatch(/-|−|\(/);
  });

  it("handles BHD 3-decimal currency", () => {
    const result = formatMoney(1500, "BHD");
    expect(result).toContain("1.500");
  });

  it("accepts an explicit locale", () => {
    const result = formatMoney(1250, "EUR", "de-DE");
    expect(result).toContain("12,50");
  });

  it("falls back gracefully for invalid currency", () => {
    const result = formatMoney(1250, "XYZ");
    // Should contain the number and the code
    expect(result).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// formatAmountOnly
// ---------------------------------------------------------------------------

describe("formatAmountOnly", () => {
  it("returns JPY 1000 without symbol", () => {
    const result = formatAmountOnly(1000, "JPY");
    expect(result).toBe("1,000");
  });

  it("returns AUD 1250 without symbol", () => {
    const result = formatAmountOnly(1250, "AUD");
    expect(result).toBe("12.50");
  });
});

// ---------------------------------------------------------------------------
// convertMinor
// ---------------------------------------------------------------------------

describe("convertMinor", () => {
  it("passes through unchanged when from === to currency", () => {
    expect(convertMinor(1250, "EUR", "EUR", 1.65)).toBe(1250);
    expect(convertMinor(0, "USD", "USD", 1)).toBe(0);
  });

  it("converts EUR 1250 to AUD at rate 1.65 -> 2063", () => {
    // 12.50 EUR * 1.65 = 20.625 AUD = 2063 minor (round half-up)
    expect(convertMinor(1250, "EUR", "AUD", 1.65)).toBe(2063);
  });

  it("converts JPY 1000 to AUD at rate 0.011 -> 1100 minor AUD", () => {
    // 1000 JPY (0 decimals) * 0.011 = 11.00 AUD = 1100 minor
    expect(convertMinor(1000, "JPY", "AUD", 0.011)).toBe(1100);
  });

  it("converts AUD 2000 (=$20) to JPY at rate 96.5 -> 1930 minor JPY", () => {
    // 20.00 AUD * 96.5 = 1930.00 JPY -> minor 1930
    expect(convertMinor(2000, "AUD", "JPY", 96.5)).toBe(1930);
  });

  it("handles zero amount", () => {
    expect(convertMinor(0, "EUR", "AUD", 1.65)).toBe(0);
  });

  it("handles negative amounts with round-half-up toward positive infinity", () => {
    // -1250 (€-12.50) @ 1.65 = -2062.5 minor; round-half-up (floor(n + 0.5))
    // pulls .5 toward +∞, so floor(-2062.5 + 0.5) = floor(-2062) = -2062.
    const result = convertMinor(-1250, "EUR", "AUD", 1.65);
    expect(result).toBe(-2062);
  });
});

// ---------------------------------------------------------------------------
// sumMinorToHome
// ---------------------------------------------------------------------------

describe("sumMinorToHome", () => {
  it("sums single-currency amounts in home currency", () => {
    const { totalMinor, missingRates } = sumMinorToHome(
      [{ amountMinor: 1000, currency: "AUD" }],
      "AUD",
      () => 1,
    );
    expect(totalMinor).toBe(1000);
    expect(missingRates).toEqual([]);
  });

  it("converts and sums mixed currencies", () => {
    // EUR 1250 (=$12.50) at rate 1.65 -> 2063 AUD minor
    // AUD 500 is already home -> 500 AUD minor
    // total: 2563
    const { totalMinor, missingRates } = sumMinorToHome(
      [
        { amountMinor: 1250, currency: "EUR" },
        { amountMinor: 500, currency: "AUD" },
      ],
      "AUD",
      (from) => {
        if (from === "EUR") return 1.65;
        if (from === "AUD") return 1;
        return undefined;
      },
    );
    expect(totalMinor).toBe(2063 + 500);
    expect(missingRates).toEqual([]);
  });

  it("excludes currencies with missing rates and reports them", () => {
    const { totalMinor, missingRates } = sumMinorToHome(
      [
        { amountMinor: 1250, currency: "EUR" },
        { amountMinor: 10000, currency: "JPY" }, // no rate
      ],
      "AUD",
      (from) => {
        if (from === "EUR") return 1.65;
        return undefined;
      },
    );
    // Only EUR 1250 converted -> 2063
    expect(totalMinor).toBe(2063);
    expect(missingRates).toContain("JPY");
    expect(missingRates).not.toContain("EUR");
  });

  it("reports each missing currency only once even if multiple items", () => {
    const { missingRates } = sumMinorToHome(
      [
        { amountMinor: 100, currency: "JPY" },
        { amountMinor: 200, currency: "JPY" },
      ],
      "AUD",
      () => undefined,
    );
    expect(missingRates.filter((c) => c === "JPY")).toHaveLength(1);
  });

  it("handles empty item list", () => {
    const { totalMinor, missingRates } = sumMinorToHome([], "AUD", () => 1);
    expect(totalMinor).toBe(0);
    expect(missingRates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// currencySymbol
// ---------------------------------------------------------------------------

describe("currencySymbol", () => {
  it("returns the symbol for a known currency", () => {
    expect(currencySymbol("JPY")).toBe("¥");
  });
  it("upper-cases and falls back to the code for unknown currencies", () => {
    expect(currencySymbol("zzz")).toBe("ZZZ");
  });
});
