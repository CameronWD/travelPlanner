import { z } from "zod";

/**
 * Item categories. Stored on `Item.category` as a `String` (no Prisma enum —
 * SQLite portability) and validated in app code via `categorySchema`.
 *
 * `color` is a Tailwind color *name* (e.g. "amber", "rose") used to build the
 * coloured pills / budget grouping. Concrete utility classes are derived from
 * the name at the call site so light/dark variants can be applied consistently.
 */
export interface CategoryMeta {
  value: string;
  label: string;
  color: string;
}

export const CATEGORIES = [
  { value: "SIGHTSEEING", label: "Sightseeing", color: "sky" },
  { value: "FOOD", label: "Food & Drink", color: "amber" },
  { value: "ACTIVITY", label: "Activity", color: "emerald" },
  { value: "NIGHTLIFE", label: "Nightlife", color: "violet" },
  { value: "SHOPPING", label: "Shopping", color: "rose" },
  { value: "OTHER", label: "Other", color: "stone" },
] as const satisfies readonly CategoryMeta[];

export type Category = (typeof CATEGORIES)[number]["value"];

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [
  Category,
  ...Category[],
];

/** Zod schema accepting only known category values. */
export const categorySchema = z.enum(CATEGORY_VALUES);

const BY_VALUE = new Map<string, CategoryMeta>(
  CATEGORIES.map((c) => [c.value, c]),
);

/** Full metadata (label + color) for a category value. */
export function categoryMeta(value: Category): CategoryMeta {
  const meta = BY_VALUE.get(value);
  if (!meta) throw new Error(`Unknown category: ${value}`);
  return meta;
}

/** Human-readable label for a category value. */
export function categoryLabel(value: Category): string {
  return categoryMeta(value).label;
}
