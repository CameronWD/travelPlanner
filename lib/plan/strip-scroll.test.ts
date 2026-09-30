import { describe, it, expect } from "vitest";
import { stripScrollLeft } from "./strip-scroll";

describe("stripScrollLeft (PLAN.md §4.2: scrollLeft maths, never scrollIntoView)", () => {
  it("leaves a visible slot alone", () => {
    expect(stripScrollLeft({ slotLeft: 100, slotWidth: 60, viewportWidth: 400, scrollLeft: 50 })).toBe(50);
  });
  it("brings a slot off the left edge in, with padding", () => {
    expect(stripScrollLeft({ slotLeft: 20, slotWidth: 60, viewportWidth: 400, scrollLeft: 100 })).toBe(12);
    expect(stripScrollLeft({ slotLeft: 4, slotWidth: 60, viewportWidth: 400, scrollLeft: 100 })).toBe(0);
  });
  it("brings a slot off the right edge in, with padding", () => {
    expect(stripScrollLeft({ slotLeft: 500, slotWidth: 60, viewportWidth: 400, scrollLeft: 0 })).toBe(168);
  });
});
