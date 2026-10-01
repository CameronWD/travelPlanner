import { describe, it, expect } from "vitest";
import { SAMPLE_TRIPS } from "./sample-trips";

describe("SAMPLE_TRIPS (handoff LANDING.md §4)", () => {
  it("has four trips, Japan first, in the order planning / on the road / done / planning", () => {
    expect(SAMPLE_TRIPS).toHaveLength(4);
    expect(SAMPLE_TRIPS[0].name).toBe("Japan in Autumn");
    expect(SAMPLE_TRIPS[1].name).toBe("Portugal by rail");
    expect(SAMPLE_TRIPS.map((t) => t.status)).toEqual(["Planning", "On the road", "Done", "Planning"]);
  });
  it("every trip has four stops, a three-row plan, two initials and two note lines", () => {
    for (const t of SAMPLE_TRIPS) {
      expect(t.stops).toHaveLength(4);
      expect(t.plan).toHaveLength(3);
      expect(t.who).toHaveLength(2);
      expect(t.note).toHaveLength(2);
      expect(t.small).toHaveLength(2);
    }
  });
  it("never says stay, staying or hotel, and carries no unicode glyphs (lucide draws them)", () => {
    const text = JSON.stringify(SAMPLE_TRIPS);
    expect(text).not.toMatch(/\bhotel\b|\bstay\b|staying/i);
    expect(text).not.toMatch(/→|♡|☀|☁|↻|✓/);
  });
});
