import { describe, expect, it } from "vitest";
import { categoryAccent } from "./category-pill";

describe("categoryAccent", () => {
  it("maps categories to hued dot + left-border classes", () => {
    expect(categoryAccent("FOOD")).toEqual({ dot: "bg-amber-500", borderL: "border-l-amber-500" });
    expect(categoryAccent("SIGHTSEEING")).toEqual({ dot: "bg-sky-500", borderL: "border-l-sky-500" });
    expect(categoryAccent("NIGHTLIFE")).toEqual({ dot: "bg-violet-500", borderL: "border-l-violet-500" });
    expect(categoryAccent("OTHER")).toEqual({ dot: "bg-stone-500", borderL: "border-l-stone-500" });
  });
});
