/**
 * Shared, single source of truth for what counts as a "located" Trip on the
 * Travel map (spec §M, CONTEXT.md "Your travels"): a Trip with at least one
 * located Stop (a route point). Used by both the map itself
 * (components/trips/travel-map.tsx, which draws only located Trips) and its
 * caller (components/trips/your-travels.tsx, which needs the same filter to
 * decide whether the map area has anything to draw at all, independent of
 * whether the stats tiles render).
 *
 * Framework-free — no React, no `@/lib/db` — so a Server Component and a
 * "use client" module can both import it safely (travel-stats-loader.ts
 * pulls in Prisma and must never end up in a client bundle).
 */
export interface LocatableTravelTrip {
  points: { lat: number; lng: number; name: string }[];
}

/** Trips with no located Stop are omitted from the Travel map (spec §M). */
export function locatedTravelMapTrips<T extends LocatableTravelTrip>(trips: T[]): T[] {
  return trips.filter((trip) => trip.points.length > 0);
}
