/**
 * Map-pin colours for item/marker categories.
 *
 * These are the Tailwind-500 shades of the `color` names declared on each
 * category in `lib/categories.ts`, resolved to literal hex because Leaflet
 * `divIcon` markers are inline-styled HTML strings and cannot use Tailwind
 * utility classes. Shared by the Globe and Wishlist maps.
 */
export const CATEGORY_PIN_HEX: Record<string, string> = {
  SIGHTSEEING: "#0ea5e9", // sky-500
  FOOD: "#f59e0b", // amber-500
  ACTIVITY: "#10b981", // emerald-500
  NIGHTLIFE: "#8b5cf6", // violet-500
  SHOPPING: "#f43f5e", // rose-500
  OTHER: "#78716c", // stone-500
};

/** Pin colour for a category, falling back to the OTHER colour when unknown. */
export function pinHex(category: string): string {
  return CATEGORY_PIN_HEX[category] ?? CATEGORY_PIN_HEX.OTHER;
}
