/**
 * A Plan is identified by its forkId. `null` is the real (live) plan;
 * a string is a Fork. (ADR 0020)
 */
export type PlanId = string | null;

/** Prisma `where` fragment selecting the real plan only. */
export const REAL_PLAN = { forkId: null } as const;

/** Build a Prisma `where`/`data` fragment for a given Plan. */
export function planScope(forkId?: PlanId): { forkId: string | null } {
  return { forkId: forkId ?? null };
}

// ---------------------------------------------------------------------------
// Plan-placement vs Wishlist-idea discriminator (ADR 0022)
// ---------------------------------------------------------------------------
//
// An Item is either a trip-wide, shared **Wishlist idea** (no Stop, no date,
// forkId null) or a **plan placement** owned by a Plan. Before ADR 0022 the
// discriminator was `date != null` — but a plan-owned "thing to do" may be
// attached to a rough Stop with a NULL date, so the discriminator now keys off
// EITHER a non-null stopId OR a non-null date.
//
//   Wishlist idea    = stopId == null AND date == null
//   Plan placement   = stopId != null OR  date != null
//
// Use these fragments (spread into an existing `where`) so the two definitions
// never drift across the fork/promote/compare call sites.

/**
 * Prisma `where` fragment selecting Items that are **plan placements** (owned by
 * a Plan): they have a Stop, a date, or both. Excludes trip-wide Wishlist ideas.
 * Spread into an existing `where` (e.g. `{ tripId, forkId, ...PLAN_PLACEMENT_WHERE }`).
 */
export const PLAN_PLACEMENT_WHERE = {
  OR: [{ stopId: { not: null } }, { date: { not: null } }] as Array<
    { stopId: { not: null } } | { date: { not: null } }
  >,
};

/**
 * Prisma `where` fragment selecting trip-wide, shared **Wishlist ideas**: no
 * Stop and no date. (These live on the real plan with forkId null.)
 */
export const WISHLIST_IDEA_WHERE = { stopId: null, date: null } as const;

/**
 * Pure predicate mirroring {@link PLAN_PLACEMENT_WHERE}: true when the Item is a
 * plan placement (has a Stop OR a date), false when it is a Wishlist idea.
 */
export function isPlanPlacement(item: {
  stopId: string | null;
  date: string | null;
}): boolean {
  return item.stopId != null || item.date != null;
}
