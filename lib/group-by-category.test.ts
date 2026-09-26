import { it, expect } from "vitest";
import { groupByCategory } from "./group-by-category";

it("groups in CATEGORIES order, omits empty groups, and files unknown values under Other", () => {
  const groups = groupByCategory([
    { id: "a", category: "OTHER" }, { id: "b", category: "FOOD" }, { id: "c", category: "SIGHTSEEING" },
    { id: "d", category: "FOOD" }, { id: "e", category: "WHAT" },
  ]);
  expect(groups.map((g) => g.category)).toEqual(["SIGHTSEEING", "FOOD", "OTHER"]);
  expect(groups[1].items.map((i) => i.id)).toEqual(["b", "d"]);
  expect(groups[2].items.map((i) => i.id)).toEqual(["a", "e"]);
  expect(groups[1].label).toBe("Food & Drink");
});
