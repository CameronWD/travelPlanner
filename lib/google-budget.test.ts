import { describe, expect, it } from "vitest";
import { GOOGLE_SHARE, dailyCap } from "./google-budget";

describe("dailyCap", () => {
  it("gives Teepee the whole free allowance ÷ 30 at share 1", () => {
    expect(GOOGLE_SHARE).toBe(1);
    expect(dailyCap("routes")).toBe(333);
    expect(dailyCap("venue-details")).toBe(33);
    expect(dailyCap("nearby-search")).toBe(33);
    expect(dailyCap("venue-status")).toBe(166);
    expect(dailyCap("static-maps")).toBe(333);
  });

  it("floors a shared allowance: share 0.5 gives Routes 166 and Enterprise 16", () => {
    expect(dailyCap("routes", 0.5)).toBe(166);
    expect(dailyCap("venue-details", 0.5)).toBe(16);
  });
});
