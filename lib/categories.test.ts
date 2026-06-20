import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  CATEGORY_VALUES,
  categoryLabel,
  categoryMeta,
  categorySchema,
} from "@/lib/categories";

describe("categories", () => {
  it("exposes all six item categories", () => {
    expect(CATEGORY_VALUES).toEqual([
      "SIGHTSEEING",
      "FOOD",
      "ACTIVITY",
      "NIGHTLIFE",
      "SHOPPING",
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
});
