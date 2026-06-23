import { describe, expect, it } from "vitest";
import {
  CHAPTER_COLOURS,
  CHAPTER_COLOUR_VALUES,
  chapterColourMeta,
  chapterColourSwatch,
  nextChapterColour,
} from "./chapter-colours";

describe("chapter colour palette", () => {
  it("exposes at least 8 distinct colours with unique values", () => {
    expect(CHAPTER_COLOURS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(CHAPTER_COLOUR_VALUES).size).toBe(CHAPTER_COLOUR_VALUES.length);
  });

  it("every colour has label, chipClass and a hex swatch", () => {
    for (const c of CHAPTER_COLOURS) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.chipClass).toContain("bg-");
      expect(c.swatch).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("chapterColourMeta falls back to the first colour for unknown values", () => {
    expect(chapterColourMeta("not-a-colour")).toEqual(CHAPTER_COLOURS[0]);
    expect(chapterColourSwatch("not-a-colour")).toBe(CHAPTER_COLOURS[0].swatch);
  });

  it("nextChapterColour returns the first unused palette value, cycling when exhausted", () => {
    expect(nextChapterColour([])).toBe(CHAPTER_COLOUR_VALUES[0]);
    expect(nextChapterColour([CHAPTER_COLOUR_VALUES[0]])).toBe(CHAPTER_COLOUR_VALUES[1]);
    expect(nextChapterColour([...CHAPTER_COLOUR_VALUES])).toBe(CHAPTER_COLOUR_VALUES[0]);
  });
});
