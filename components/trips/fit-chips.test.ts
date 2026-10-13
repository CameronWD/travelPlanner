import { describe, it, expect } from "vitest";
import { fitChips } from "./fit-chips";

describe("fitChips (spec 2026-10-12 W18)", () => {
  const O = { gapPx: 8, overflowPx: 48, max: 3 };
  it("shows every chip when they all fit, up to max", () => {
    expect(fitChips([100, 100], 300, O)).toBe(2);
    expect(fitChips([100, 100, 100, 100], 1000, O)).toBe(3);
  });
  it("keeps room for the +N chip once something overflows", () => {
    // 100 + 8 + 100 = 208 fits; adding a third (316) would, but +N (8 + 48) must fit beside what is shown.
    expect(fitChips([100, 100, 100, 100], 270, O)).toBe(2);
    expect(fitChips([100, 100, 100, 100], 263, O)).toBe(1);
  });
  it("can show none when even one chip plus +N would not fit, and never a negative count", () => {
    expect(fitChips([200, 200], 120, O)).toBe(0);
    expect(fitChips([], 120, O)).toBe(0);
  });
  it("with no measurement (0px) falls back to max — happy-dom and the first paint", () => {
    expect(fitChips([0, 0, 0, 0, 0], 0, O)).toBe(3);
  });
});
