import { describe, it, expect } from "vitest";
import { countryName } from "./countries";

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
