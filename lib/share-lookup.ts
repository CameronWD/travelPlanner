/**
 * The Share link's public projection (ADR 0051) — the one lookup the share
 * page, its OG image and Route copy all go through, so all three refuse the
 * same revoked or rotated token and read the same fields. A revoked link's
 * row is deleted (server/actions/share.ts revokeShareLink) and a rotated
 * one's token replaced, so either simply matches nothing here.
 */

import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";

export const SHARE_TRIP_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  homeName: true,
  homeLat: true,
  homeLng: true,
  roundTrip: true,
  // homeCurrency intentionally omitted — no money on public page
} as const;

/** Resolve the token → link + trip, or null for an unknown/revoked/rotated token. */
export function findShareLink(token: string) {
  return db.shareLink.findUnique({
    where: { token },
    select: {
      id: true,
      includeAccommodation: true,
      includeTransport: true,
      includeDailyPlans: true,
      includeJournal: true,
      showTravellers: true,
      trip: { select: SHARE_TRIP_SELECT },
    },
  });
}

export interface ShareStop {
  id: string;
  name: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string;
  arriveDate: string;
  departDate: string;
  sortOrder: number;
}

export async function loadShareStops(tripId: string): Promise<ShareStop[]> {
  const rawStops = await db.stop.findMany({
    // Rough (date-less) stops aren't part of the dated public itinerary.
    where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
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
      sortOrder: true,
      // notes intentionally omitted
    },
  });

  // Non-null at runtime: the query filters rough (date-less) stops out.
  // ADR 0038: a scheduled stop's position IS its dates — re-sort canonically
  // before rendering (the numbered "at a glance" list and the route map both
  // read this array's order), since the fetch's orderBy stays sortOrder.
  return orderPlanStops(
    rawStops.map((s) => ({
      ...s,
      timezone: s.timezone ?? "UTC",
      arriveDate: s.arriveDate!,
      departDate: s.departDate!,
    })),
  );
}
