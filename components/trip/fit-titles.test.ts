import { describe, it, expect } from "vitest";
import { fitTitles } from "./fit-titles";

describe("fitTitles", () => {
  it("shows all titles when they fit, else as many as fit leaving room for +N", () => {
    expect(fitTitles(["Louvre", "Lunch"], 400).shown).toBe(2);
    expect(fitTitles(["A very long museum name", "Another long dinner name", "Third"], 200).shown).toBe(1);
    expect(fitTitles([], 300).shown).toBe(0);
    expect(fitTitles(["x"], 0).shown).toBe(1); // never hide the first title
  });

  it("shows all three when their total fits even though a fixed +N reserve would not", () => {
    expect(fitTitles(["AAAAAAAAAAAA", "AAAAAAAAAAAA", "Hi"], 200).shown).toBe(3);
  });

  it("reserves room for +N only when something really overflows", () => {
    // 3 × 86px + 2 gaps = 274 > 200 → greedy with a 32px reserve: 86 + 32 = 118 ok; 86+8+86+32 = 212 > 200 → shown 1
    expect(fitTitles(["AAAAAAAAAAAA", "AAAAAAAAAAAA", "AAAAAAAAAAAA"], 200).shown).toBe(1);
    // with more room both fit and the third overflows: 86+8+86+32 = 212 <= 220
    expect(fitTitles(["AAAAAAAAAAAA", "AAAAAAAAAAAA", "AAAAAAAAAAAA"], 220).shown).toBe(2);
  });
});
