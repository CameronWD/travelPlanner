import { describe, expect, it } from "vitest";
import { isPortrait } from "./cover";

describe("isPortrait", () => {
  it("is true for a 3:4 portrait aspect (0.75)", () => {
    expect(isPortrait(0.75)).toBe(true);
  });

  it("is false for a 3:2 landscape aspect (1.5)", () => {
    expect(isPortrait(1.5)).toBe(false);
  });

  it("is false when the aspect is unknown (null)", () => {
    expect(isPortrait(null)).toBe(false);
  });

  it("is false when the aspect is undefined", () => {
    expect(isPortrait(undefined)).toBe(false);
  });

  it("is false exactly at the 0.9 threshold (not strictly less than)", () => {
    expect(isPortrait(0.9)).toBe(false);
  });

  it("is true just under the 0.9 threshold", () => {
    expect(isPortrait(0.89)).toBe(true);
  });
});
