import { categoryClasses } from "@/lib/categories";

/**
 * Category dot colour — routed through the Playground hue ramp
 * (lib/categories.ts → lib/hues.ts) so a category's dot is always one of the
 * nine literal hue classes Tailwind's scanner can see. Shared by the month
 * grid and the wishlist rail so the two never drift.
 */
export function categoryDotClass(category: string): string {
  return categoryClasses(category).dot;
}
