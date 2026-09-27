import { describe, expect, it } from "vitest";
import { mergeOverlapping } from "./map-overlap";

describe("mergeOverlapping", () => {
  it("merges two points 10px apart into one group at their centre", () => {
    const groups = mergeOverlapping(
      [
        { id: "a", x: 100, y: 100 },
        { id: "b", x: 110, y: 100 },
      ],
      32,
    );
    expect(groups).toEqual([{ ids: ["a", "b"], x: 105, y: 100 }]);
  });

  it("keeps points at least minPx apart separate, in input order", () => {
    const groups = mergeOverlapping(
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 40, y: 0 },
      ],
      32,
    );
    expect(groups.map((g) => g.ids)).toEqual([["a"], ["b"]]);
  });

  it("chains transitively (a–b and b–c close → one group of three)", () => {
    const groups = mergeOverlapping(
      [
        { id: "a", x: 0, y: 0 },
        { id: "c", x: 50, y: 0 },
        { id: "b", x: 25, y: 0 },
      ],
      32,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].ids).toEqual(["a", "c", "b"]);
  });

  it("returns nothing for no points", () => {
    expect(mergeOverlapping([], 32)).toEqual([]);
  });
});
