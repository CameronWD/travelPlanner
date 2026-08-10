import { describe, expect, it } from "vitest";
import { CATEGORIES } from "./categories";
import { CATEGORY_PIN_HEX, pinHex } from "./map-pins";

describe("pinHex", () => {
  it("returns the sky hex for SIGHTSEEING", () => {
    expect(pinHex("SIGHTSEEING")).toBe("#0ea5e9");
  });

  it("returns the amber hex for FOOD", () => {
    expect(pinHex("FOOD")).toBe("#f59e0b");
  });

  it("falls back to the OTHER hex for an unknown category", () => {
    expect(pinHex("NOT_A_CATEGORY")).toBe(CATEGORY_PIN_HEX.OTHER);
  });

  it("falls back to the OTHER hex for an empty string", () => {
    expect(pinHex("")).toBe(CATEGORY_PIN_HEX.OTHER);
  });
});

describe("CATEGORY_PIN_HEX", () => {
  it("covers every known category, so no pin ever silently falls back", () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_PIN_HEX[c.value]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("has no entries beyond the known categories", () => {
    const known = new Set<string>(CATEGORIES.map((c) => c.value));
    for (const key of Object.keys(CATEGORY_PIN_HEX)) {
      expect(known.has(key)).toBe(true);
    }
  });
});
