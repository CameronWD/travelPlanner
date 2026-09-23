import { z } from "zod";
import { type Hue, HUE_CLASSES, type HueClasses } from "@/lib/hues";

/**
 * Item categories. Stored on `Item.category` as a `String` and validated via `categorySchema`.
 *
 * Playground: `color` keeps the legacy Tailwind name so un-migrated call sites still compile;
 * new code reads `hue` / `categoryClasses()`. Once every `${color}-…` call site is gone, delete `color`.
 */
export interface CategoryMeta {
  value: string;
  label: string;
  /** @deprecated legacy Tailwind colour name. Use `hue`. */
  color: string;
  hue: Hue;
  /** lucide-react icon name, shown inside pins and pills (colour is never the only signal). */
  icon: string;
}

export const CATEGORIES = [
  { value: "SIGHTSEEING", label: "Sightseeing", color: "sky", hue: "sky", icon: "landmark" },
  { value: "FOOD", label: "Food & Drink", color: "amber", hue: "sun", icon: "utensils" },
  { value: "ACTIVITY", label: "Activity", color: "emerald", hue: "leaf", icon: "footprints" },
  { value: "NIGHTLIFE", label: "Nightlife", color: "violet", hue: "lilac", icon: "moon-star" },
  { value: "SHOPPING", label: "Shopping", color: "rose", hue: "pink", icon: "shopping-bag" },
  // Movement that does not change your base. An Item category, never the Transport entity (CONTEXT.md).
  { value: "GETTING_AROUND", label: "Getting around", color: "indigo", hue: "indigo", icon: "tram-front" },
  { value: "OTHER", label: "Other", color: "stone", hue: "stone", icon: "circle-dot" },
] as const satisfies readonly CategoryMeta[];

export type Category = (typeof CATEGORIES)[number]["value"];

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [Category, ...Category[]];

export const categorySchema = z.enum(CATEGORY_VALUES);

const BY_VALUE = new Map<string, CategoryMeta>(CATEGORIES.map((c) => [c.value, c]));

export function categoryMeta(value: Category): CategoryMeta {
  const meta = BY_VALUE.get(value);
  if (!meta) throw new Error(`Unknown category: ${value}`);
  return meta;
}

export function categoryLabel(value: Category): string {
  return categoryMeta(value).label;
}

/** Full class set for a category. Unknown values fall back to OTHER. */
export function categoryClasses(value: string): HueClasses {
  return HUE_CLASSES[(BY_VALUE.get(value) ?? BY_VALUE.get("OTHER")!).hue];
}
