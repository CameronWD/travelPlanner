/**
 * Plan and Wishlist counts for the trip nav (sidebar rows ≥1280px; see
 * docs/specs/2026-09-27-beta-feedback.md §A). Self-contained — a caller that
 * hasn't already fetched a trip's stops/transports/etc for some other reason
 * (like lib/next-steps-loader.ts) — so it can be dropped into the nav's own
 * Suspense boundary without any other page having to thread this data down.
 *
 * Plan count = number of Flags on the real plan. Reads through
 * `lib/flags-loader.ts`'s `loadFlagRows`/`flagsForRows` — the one place every
 * `detectFlags` caller's input is assembled (TB-01, spec 2026-10-14) — so the
 * sidebar number can never drift from what the Summary page's own Flags list
 * shows. (Deliberately NOT lib/next-steps-builder.ts's buildTripNextSteps,
 * which is phase-gated — this count is not.)
 *
 * Wishlist count reuses WISHLIST_IDEA_WHERE, the same predicate the Wishlist
 * page's own query is built from (ADR 0022), so the two can never disagree.
 *
 * Surprise (ADR 0051): the Flags count reads Accommodations and Items through
 * the viewer's visibility fragments, as the Summary page does, so the count
 * matches the Flags list that viewer sees. Stops (their names and dates are
 * outside) and Wishlist ideas (never inside a Surprise) are read whole.
 *
 * Wrapped in React `cache()` so the Plan and Wishlist rows (and anything else
 * that asks in the same request) share one query set; render from inside
 * `<Suspense fallback={null}>` so the nav never waits on it.
 */
import { cache } from "react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN, WISHLIST_IDEA_WHERE } from "@/lib/plan-scope";
import { loadFlagRows, flagsForRows } from "@/lib/flags-loader";
import { getTripProjection } from "@/lib/trip-projection-reads";

export interface NavCounts {
  flags: number;
  wishlist: number;
}

export const loadNavCounts = cache(async (tripId: string): Promise<NavCounts> => {
  const { user } = await requireTripAccess(tripId);

  // One wave (spec 2026-10-06 §C): the Wishlist count, the Flag rows and the
  // projection don't depend on each other, so they go out together; the
  // projection is simply discarded below when the trip turns out to have no
  // dates.
  const [wishlist, rows, projection] = await Promise.all([
    db.item.count({ where: { tripId, ...REAL_PLAN, ...WISHLIST_IDEA_WHERE } }),
    loadFlagRows(tripId, user.id),
    getTripProjection(tripId),
  ]);

  // A date-less trip's Summary shows no Flags at all (just the "no dates
  // yet" notice) — match that here rather than calling detectFlags with a
  // start/end it doesn't have.
  if (!rows) return { flags: 0, wishlist };

  return { flags: flagsForRows(rows, projection).length, wishlist };
});
