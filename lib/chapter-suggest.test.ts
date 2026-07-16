import { describe, expect, it } from "vitest";
import { combineName } from "./chapter-suggest";

describe("combineName", () => {
  it("returns the single country unchanged", () => {
    expect(combineName(["Germany"])).toBe("Germany");
  });
  it("joins two countries with an ampersand", () => {
    expect(combineName(["Germany", "France"])).toBe("Germany & France");
  });
  it("uses Oxford-style for three", () => {
    expect(combineName(["Germany", "France", "Switzerland"])).toBe("Germany, France & Switzerland");
  });
  it("falls back to a generic label for four or more", () => {
    expect(combineName(["Germany", "France", "Switzerland", "Austria"])).toBe("Multi-country leg");
  });
  it("de-duplicates preserving first-appearance order before counting", () => {
    // Germany, France, Germany → two unique → "Germany & France"
    expect(combineName(["Germany", "France", "Germany"])).toBe("Germany & France");
  });
});
