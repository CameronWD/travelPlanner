import { describe, it, expect } from "vitest";
import { maxEmptyBand } from "./checks";

const area = { x: 0, y: 100, width: 400, height: 500 };
describe("maxEmptyBand", () => {
  it("is the whole height when a half has nothing", () => {
    expect(maxEmptyBand(area, [], "left")).toBe(500);
  });
  it("only counts pieces that overlap the half", () => {
    const right = { x: 250, y: 100, width: 100, height: 500 };
    expect(maxEmptyBand(area, [right], "right")).toBe(0);
    expect(maxEmptyBand(area, [right], "left")).toBe(500);
  });
  it("measures gaps between pieces and at both edges, clipped to the area", () => {
    const a = { x: 10, y: 60, width: 100, height: 100 };   // 60–160 → clipped to 100–160
    const b = { x: 10, y: 300, width: 100, height: 400 };  // 300–700 → clipped to 300–600
    expect(maxEmptyBand(area, [a, b], "left")).toBe(140);   // 160→300
  });
  it("merges overlapping pieces", () => {
    const a = { x: 0, y: 100, width: 50, height: 300 };
    const b = { x: 0, y: 350, width: 50, height: 250 };
    expect(maxEmptyBand(area, [a, b], "left")).toBe(0);
  });
});
