import { describe, expect, it } from "vitest";
import { categoryAccent } from "./category-pill";

describe("categoryAccent", () => {
  it("maps categories to hued dot + left-border classes", () => {
    expect(categoryAccent("FOOD")).toEqual({
      dot: "border-2 border-border bg-hue-sun",
      borderL: "border-l-hue-sun",
    });
    expect(categoryAccent("SIGHTSEEING")).toEqual({
      dot: "border-2 border-border bg-hue-sky",
      borderL: "border-l-hue-sky",
    });
    expect(categoryAccent("NIGHTLIFE")).toEqual({
      dot: "border-2 border-border bg-hue-lilac",
      borderL: "border-l-hue-lilac",
    });
    expect(categoryAccent("OTHER")).toEqual({
      dot: "border-2 border-border bg-hue-stone",
      borderL: "border-l-hue-stone",
    });
  });
});
