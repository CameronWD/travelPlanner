import { describe, it, expect } from "vitest";
import { formatMoneyParts, formatMoneyWhole } from "./format-parts";

describe("formatMoneyParts", () => {
  it("splits a two-decimal amount at the decimal separator", () => {
    expect(formatMoneyParts(1482040, "AUD")).toEqual({ whole: "$14,820", fraction: ".40" });
  });
  it("keeps a zero fraction for a two-decimal currency", () => {
    expect(formatMoneyParts(100000, "AUD")).toEqual({ whole: "$1,000", fraction: ".00" });
  });
  it("has no fraction for a zero-decimal currency (JPY)", () => {
    expect(formatMoneyParts(184000, "JPY")).toEqual({ whole: "¥184,000", fraction: null });
  });
  it("shows IDR without cents even though it is stored with two decimals", () => {
    const parts = formatMoneyParts(150000000, "IDR");
    expect(parts.fraction).toBeNull();
    expect(parts.whole).toMatch(/^Rp\s1,500,000$/);
  });
  it("uses the narrow symbol for a foreign currency", () => {
    expect(formatMoneyParts(76000, "EUR")).toEqual({ whole: "€760", fraction: ".00" });
  });
  it("falls back to formatMoney's plain text for a malformed code", () => {
    expect(formatMoneyParts(1250, "Z1Z")).toEqual({ whole: "12.50 Z1Z", fraction: null });
  });
});

describe("formatMoneyWhole", () => {
  it("rounds to whole units with the narrow symbol", () => {
    expect(formatMoneyWhole(42350, "AUD")).toBe("$424");
    expect(formatMoneyWhole(934000, "AUD")).toBe("$9,340");
    expect(formatMoneyWhole(76000, "EUR")).toBe("€760");
    expect(formatMoneyWhole(184000, "JPY")).toBe("¥184,000");
  });
  it("falls back to formatMoney for a malformed code", () => {
    expect(formatMoneyWhole(1250, "Z1Z")).toBe("12.50 Z1Z");
  });
});
