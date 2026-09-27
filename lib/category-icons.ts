import {
  Landmark,
  Utensils,
  Footprints,
  MoonStar,
  ShoppingBag,
  TramFront,
  MapPin,
  CircleDot,
  type LucideIcon,
} from "lucide-react";

/**
 * lucide component per category icon name (`lib/categories.ts` `icon`).
 *
 * Kept in its own module (no `@/lib/db`-adjacent imports) so client islands
 * that only need the icon table — e.g. `components/trip/day/day-ideas-rows.tsx`
 * — don't pull in `components/trip/timeline.tsx`'s full dependency graph
 * (day-entry-link → item-form-dialog → … → server actions → `lib/db`, which
 * throws at import time without `DATABASE_URL`). `timeline.tsx` re-exports
 * this table as `CATEGORY_ICON` for existing call sites.
 */
export const CATEGORY_ICON: Record<string, LucideIcon> = {
  landmark: Landmark,
  utensils: Utensils,
  footprints: Footprints,
  "moon-star": MoonStar,
  "shopping-bag": ShoppingBag,
  "tram-front": TramFront,
  "map-pin": MapPin,
  "circle-dot": CircleDot,
};
