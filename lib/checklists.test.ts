import { describe, expect, it } from "vitest";
import {
  sortChecklist,
  sortByDueDate,
  mergeTemplateTexts,
} from "@/lib/checklists";

// ---------------------------------------------------------------------------
// sortChecklist — by sortOrder ascending
// ---------------------------------------------------------------------------

describe("sortChecklist", () => {
  it("sorts items by sortOrder ascending", () => {
    const items = [
      { sortOrder: 3, dueDate: null },
      { sortOrder: 1, dueDate: null },
      { sortOrder: 2, dueDate: null },
    ];
    const sorted = sortChecklist(items);
    expect(sorted.map((i) => i.sortOrder)).toEqual([1, 2, 3]);
  });

  it("does not mutate the input array", () => {
    const items = [
      { sortOrder: 2, dueDate: null },
      { sortOrder: 0, dueDate: null },
    ];
    const original = [...items];
    sortChecklist(items);
    expect(items[0]).toBe(original[0]);
    expect(items[1]).toBe(original[1]);
  });

  it("handles an empty array", () => {
    expect(sortChecklist([])).toEqual([]);
  });

  it("is stable for equal sortOrders", () => {
    const a = { sortOrder: 0, dueDate: null, id: "a" };
    const b = { sortOrder: 0, dueDate: null, id: "b" };
    const sorted = sortChecklist([a, b]);
    // Stability: original order preserved for ties
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
  });
});

// ---------------------------------------------------------------------------
// sortByDueDate — dated items first (ascending), nulls last
// ---------------------------------------------------------------------------

describe("sortByDueDate", () => {
  it("puts dated items before null-dated items", () => {
    const items = [
      { sortOrder: 0, dueDate: null, id: "null" },
      { sortOrder: 1, dueDate: "2026-08-15", id: "aug" },
      { sortOrder: 2, dueDate: "2026-07-01", id: "jul" },
    ];
    const sorted = sortByDueDate(items);
    expect(sorted.map((i) => i.id)).toEqual(["jul", "aug", "null"]);
  });

  it("sorts dated items ascending by date", () => {
    const items = [
      { sortOrder: 0, dueDate: "2026-12-25" },
      { sortOrder: 1, dueDate: "2026-01-01" },
      { sortOrder: 2, dueDate: "2026-06-15" },
    ];
    const sorted = sortByDueDate(items);
    expect(sorted.map((i) => i.dueDate)).toEqual([
      "2026-01-01",
      "2026-06-15",
      "2026-12-25",
    ]);
  });

  it("puts null-dated items last", () => {
    const items = [
      { sortOrder: 2, dueDate: null },
      { sortOrder: 0, dueDate: null },
      { sortOrder: 1, dueDate: "2026-03-10" },
    ];
    const sorted = sortByDueDate(items);
    // The dated item comes first; then the two nulls sorted by sortOrder
    expect(sorted[0].dueDate).toBe("2026-03-10");
    expect(sorted[1].sortOrder).toBe(0);
    expect(sorted[2].sortOrder).toBe(2);
  });

  it("falls back to sortOrder for same date", () => {
    const items = [
      { sortOrder: 3, dueDate: "2026-07-04" },
      { sortOrder: 1, dueDate: "2026-07-04" },
      { sortOrder: 2, dueDate: "2026-07-04" },
    ];
    const sorted = sortByDueDate(items);
    expect(sorted.map((i) => i.sortOrder)).toEqual([1, 2, 3]);
  });

  it("falls back to sortOrder for null-dated ties", () => {
    const items = [
      { sortOrder: 5, dueDate: null },
      { sortOrder: 2, dueDate: null },
      { sortOrder: 9, dueDate: null },
    ];
    const sorted = sortByDueDate(items);
    expect(sorted.map((i) => i.sortOrder)).toEqual([2, 5, 9]);
  });

  it("treats empty string dueDate the same as null (nulls last)", () => {
    const items = [
      { sortOrder: 0, dueDate: "" },
      { sortOrder: 1, dueDate: "2026-05-01" },
    ];
    const sorted = sortByDueDate(items);
    expect(sorted[0].dueDate).toBe("2026-05-01");
    expect(sorted[1].dueDate).toBe("");
  });

  it("does not mutate the input array", () => {
    const items = [
      { sortOrder: 1, dueDate: null },
      { sortOrder: 0, dueDate: "2026-01-01" },
    ];
    const originalFirst = items[0];
    sortByDueDate(items);
    expect(items[0]).toBe(originalFirst);
  });
});

// ---------------------------------------------------------------------------
// mergeTemplateTexts — dedup and case-insensitive filtering
// ---------------------------------------------------------------------------

describe("mergeTemplateTexts", () => {
  it("returns template texts not already in existing", () => {
    const result = mergeTemplateTexts(
      ["Passport", "Sunscreen"],
      ["First-aid kit", "Adapter", "Passport"],
    );
    expect(result).toEqual(["First-aid kit", "Adapter"]);
  });

  it("is case-insensitive when comparing against existing", () => {
    const result = mergeTemplateTexts(
      ["passport"],
      ["PASSPORT", "Camera"],
    );
    expect(result).toEqual(["Camera"]);
  });

  it("is case-insensitive when comparing the template against itself", () => {
    const result = mergeTemplateTexts([], ["Sunscreen", "sunscreen", "SUNSCREEN"]);
    expect(result).toEqual(["Sunscreen"]); // only first occurrence
  });

  it("deduplicates within the template (case-insensitive)", () => {
    const result = mergeTemplateTexts([], ["Hat", "hat", "HAT", "Shoes"]);
    expect(result).toEqual(["Hat", "Shoes"]);
  });

  it("trims whitespace when comparing", () => {
    const result = mergeTemplateTexts(["  Passport  "], ["passport"]);
    expect(result).toEqual([]); // "passport" == " Passport " after trim+lower
  });

  it("preserves original capitalisation in the output", () => {
    const result = mergeTemplateTexts([], ["Travel Insurance", "USB Charger"]);
    expect(result).toEqual(["Travel Insurance", "USB Charger"]);
  });

  it("returns empty array when all template items already exist", () => {
    const result = mergeTemplateTexts(
      ["Toothbrush", "Shampoo"],
      ["toothbrush", "SHAMPOO"],
    );
    expect(result).toEqual([]);
  });

  it("handles an empty existing list", () => {
    const result = mergeTemplateTexts([], ["Item A", "Item B"]);
    expect(result).toEqual(["Item A", "Item B"]);
  });

  it("handles an empty template", () => {
    const result = mergeTemplateTexts(["Existing"], []);
    expect(result).toEqual([]);
  });

  it("skips blank strings in the template", () => {
    const result = mergeTemplateTexts([], ["  ", "", "Camera"]);
    expect(result).toEqual(["Camera"]);
  });
});
