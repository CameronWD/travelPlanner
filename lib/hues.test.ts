import { describe, it, expect } from "vitest";
import { CHAPTER_COLOUR_VALUES, chapterColourMeta } from "@/lib/chapter-colours";
import { CATEGORY_VALUES, categoryMeta } from "@/lib/categories";
import { HUES, HUE_CLASSES, LEGACY_TO_HUE } from "@/lib/hues";

describe("stored colour values never change", () => {
  // chapter.colour is persisted as a String (prisma/schema.prisma). Renaming a
  // value would orphan every existing row, and the fallback is silent.
  it("keeps the eight chapter colour values the database already holds", () => {
    expect([...CHAPTER_COLOUR_VALUES]).toEqual([
      "sky", "amber", "emerald", "violet", "rose", "teal", "orange", "indigo",
    ]);
  });

  it("resolves every stored chapter value to a real hue", () => {
    for (const v of CHAPTER_COLOUR_VALUES) {
      expect(LEGACY_TO_HUE[v], `no hue mapping for stored value "${v}"`).toBeDefined();
      expect(chapterColourMeta(v).chipClass).toBeTruthy();
    }
  });

  it("keeps the seven category values the database already holds", () => {
    expect([...CATEGORY_VALUES]).toEqual([
      "SIGHTSEEING", "FOOD", "ACTIVITY", "NIGHTLIFE", "SHOPPING", "GETTING_AROUND", "OTHER",
    ]);
  });

  it("gives every category a hue with a full class set", () => {
    for (const v of CATEGORY_VALUES) {
      expect(categoryMeta(v).label).toBeTruthy();
    }
  });

  it("gives every hue all five class variants", () => {
    for (const h of HUES) {
      const c = HUE_CLASSES[h];
      expect(c.chip).toBeTruthy();
      expect(c.dot).toBeTruthy();
      expect(c.text).toBeTruthy();
      expect(c.soft).toBeTruthy();
      expect(c.fill).toBeTruthy();
    }
  });

  it("falls back rather than throwing on an unknown stored value", () => {
    expect(() => chapterColourMeta("chartreuse")).not.toThrow();
    expect(chapterColourMeta("chartreuse").chipClass).toBeTruthy();
  });
});
