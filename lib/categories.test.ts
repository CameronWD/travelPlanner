import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  CATEGORY_VALUES,
  categoryLabel,
  categoryMeta,
  categorySchema,
} from "@/lib/categories";

describe("categories", () => {
  it("exposes all eight item categories", () => {
    expect(CATEGORY_VALUES).toEqual([
      "SIGHTSEEING",
      "FOOD",
      "ACTIVITY",
      "NIGHTLIFE",
      "SHOPPING",
      "GETTING_AROUND",
      "PLACE",
      "OTHER",
    ]);
  });

  it("gives every category a non-empty label and color", () => {
    for (const meta of CATEGORIES) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.color.length).toBeGreaterThan(0);
    }
  });

  it("labels FOOD as 'Food & Drink'", () => {
    expect(categoryLabel("FOOD")).toBe("Food & Drink");
  });

  it("looks up meta by value", () => {
    expect(categoryMeta("SIGHTSEEING").label).toBe("Sightseeing");
    expect(categoryMeta("OTHER").value).toBe("OTHER");
  });

  it("validates known categories via the Zod schema", () => {
    expect(categorySchema.parse("NIGHTLIFE")).toBe("NIGHTLIFE");
  });

  it("rejects unknown categories via the Zod schema", () => {
    expect(categorySchema.safeParse("BANANA").success).toBe(false);
  });

  it("labels Getting around in sentence case with the indigo colour", () => {
    expect(categoryMeta("GETTING_AROUND")).toEqual({
      value: "GETTING_AROUND", label: "Getting around", color: "indigo", hue: "indigo", icon: "tram-front",
    });
  });

  it("includes Place (somewhere to go) before Other, on the teal hue with a map-pin icon", () => {
    const values = CATEGORIES.map((c) => c.value);
    expect(values.indexOf("PLACE")).toBe(values.indexOf("OTHER") - 1);
    expect(categoryMeta("PLACE")).toMatchObject({ label: "Place", hue: "teal", icon: "map-pin" });
    expect(categorySchema.safeParse("PLACE").success).toBe(true);
  });
});
