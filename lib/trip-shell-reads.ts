import { cache } from "react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { getUnreadActivityCount, getRecentActivity } from "@/server/actions/activity";
import { listForks } from "@/server/actions/forks";

/**
 * Per-request memoised reads shared by the trip layout and the pages under
 * it (ADR 0063). React `cache()`: one call per distinct argument list per
 * request, exactly like requireTripAccess in lib/guards.ts. That saves a
 * repeat only when layout and page render in the same request — a cold load
 * or router.refresh(). On a client navigation (day → day, section → section)
 * Next re-renders only the changed segment, so the layout does not run and
 * the page's own reads — the Day view's header bell count, recent activity
 * and members (DAY_VIEW §3.1), Home's own header — are paid in full. Moving
 * those into data the layout already holds is follow-up NAV-03.
 *
 * server/actions/activity.ts is a "use server" module, whose exports must be
 * plain async functions, so the cache() wrappers live here rather than there.
 */
export const readUnreadActivityCount = cache((tripId: string) => getUnreadActivityCount(tripId));
export const readRecentActivity = cache((tripId: string, limit: number) => getRecentActivity(tripId, limit));
export const readForks = cache((tripId: string) => listForks(tripId));

/** The trip layout's selection, shared so the Day index and Day page can read the same row for free. */
export const TRIP_SHELL_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  homeCurrency: true,
  forksEnabled: true,
  coverImageKey: true,
  members: { select: { user: { select: TRAVELLER_SELECT } } },
  stops: {
    where: { ...REAL_PLAN, arriveDate: { not: null } },
    orderBy: { sortOrder: "asc" as const },
    select: { id: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
  },
} as const;

export const readTripShell = cache((tripId: string) => db.trip.findUnique({ where: { id: tripId }, select: TRIP_SHELL_SELECT }));

export type TripShell = NonNullable<Awaited<ReturnType<typeof readTripShell>>>;
