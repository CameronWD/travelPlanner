/**
 * The Share link's public projection (ADR 0051) — the one lookup the share
 * page, its OG image and Route copy all go through, so all three refuse the
 * same revoked or rotated token and read the same fields. A revoked link's
 * row is deleted (server/actions/share.ts revokeShareLink) and a rotated
 * one's token replaced, so either simply matches nothing here.
 */

import { cache } from "react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";

const SHARE_TRIP_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  homeName: true,
  homeLat: true,
  homeLng: true,
  homeTimezone: true,
  roundTrip: true,
  // homeCurrency intentionally omitted — no money on public page
} as const;

/**
 * Resolve the token → link + trip, or null for an unknown/revoked/rotated
 * token, or a Trip in Recently deleted (ADR 0067). `findUnique` can't filter
 * on a relation, so this is a `findFirst` scoped by the token's own unique
 * column. Memoised per request (React cache), so every reader in one
 * render of the share page pays for one lookup (spec 2026-10-14 card A).
 */
export const findShareLink = cache((token: string) =>
  db.shareLink.findFirst({
    where: { token, trip: { deletedAt: null } },
    select: {
      id: true,
      includeAccommodation: true,
      includeTransport: true,
      includeDailyPlans: true,
      includeJournal: true,
      showTravellers: true,
      includeContacts: true,
      trip: { select: SHARE_TRIP_SELECT },
    },
  }),
);

export type ShareStop = {
  id: string;
  name: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
  sortOrder: number;
};

/** A dated Stop — what the day-by-day, Right now card and map pins read. */
export type ScheduledShareStop = ShareStop & { arriveDate: string; departDate: string };

export async function loadShareStops(tripId: string): Promise<ShareStop[]> {
  const rawStops = await db.stop.findMany({
    // ADR 0073: rough Stops are part of the shared route; dated sections filter with scheduledShareStops.
    where: { tripId, ...REAL_PLAN },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      country: true,
      lat: true,
      lng: true,
      timezone: true,
      arriveDate: true,
      departDate: true,
      nights: true,
      sortOrder: true,
      // notes intentionally omitted
    },
  });

  // ADR 0038: a scheduled stop's position IS its dates — re-sort canonically
  // before rendering (the numbered "at a glance" list and the route map both
  // read this array's order), since the fetch's orderBy stays sortOrder.
  // Rough stops keep their arranged slot.
  return orderPlanStops(rawStops.map((s) => ({ ...s, timezone: s.timezone ?? "UTC" })));
}
