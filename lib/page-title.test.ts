import { describe, it, expect } from "vitest";
import { tripTitle, dayTitle } from "./page-title";

describe("tripTitle", () => {
  it("defaults to the trip name (root template adds · Teepee) and templates subpages page-first", () => {
    expect(tripTitle("Christmas in Europe 2026")).toEqual({
      default: "Christmas in Europe 2026",
      template: "%s · Christmas in Europe 2026 · Teepee",
    });
  });
  it("trims whitespace so a padded name never yields 'Days ·  Name'", () => {
    expect(tripTitle("  Europe  ").default).toBe("Europe");
  });
});

describe("dayTitle", () => {
  it("is the short in-trip day label", () => {
    expect(dayTitle("2026-12-10")).toBe("Thu 10 Dec");
  });
});
