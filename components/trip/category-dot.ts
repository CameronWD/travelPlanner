import { CATEGORIES } from "@/lib/categories";

/**
 * Category dot colour — purge-safe static Tailwind class strings, keyed by a
 * category's colour name. Shared by the month grid and the wishlist rail so the
 * two never drift.
 */
const DOT_CLASSES: Record<string, string> = {
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  stone: "bg-stone-500",
};

const DOT_BY_CATEGORY: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, DOT_CLASSES[c.color] ?? "bg-muted-foreground"]),
);

/** Map a category value → its dot class, tolerating unknown/legacy values without throwing. */
export function categoryDotClass(category: string): string {
  return DOT_BY_CATEGORY[category] ?? "bg-muted-foreground";
}
