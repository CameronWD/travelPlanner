import { describe, it, expect } from "vitest";
import { countryName, countryFlagEmoji } from "./countries";

describe("countryName", () => {
  it("maps alpha-2 codes (any case) to names", () => {
    expect(countryName("it")).toBe("Italy");
    expect(countryName("FR")).toBe("France");
  });
  it("is empty for nullish and falls back to the code when unresolvable", () => {
    expect(countryName(null)).toBe("");
    expect(countryName("")).toBe("");
    expect(countryName("zz")).toBe("ZZ");
  });
});

describe("countryFlagEmoji", () => {
  it("builds the regional-indicator flag emoji from an alpha-2 code, any case", () => {
    expect(countryFlagEmoji("fr")).toBe("🇫🇷");
    expect(countryFlagEmoji("IT")).toBe("🇮🇹");
    expect(countryFlagEmoji("Jp")).toBe("🇯🇵");
  });

  it("is empty for nullish or non-alphabetic input", () => {
    expect(countryFlagEmoji(null)).toBe("");
    expect(countryFlagEmoji(undefined)).toBe("");
    expect(countryFlagEmoji("")).toBe("");
    expect(countryFlagEmoji("12")).toBe("");
  });
});
