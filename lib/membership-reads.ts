import { cache } from "react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { reconcilePendingInvites } from "@/lib/reconcile-invites";

/**
 * The viewer's live Trips (spec 2026-10-06 §C), memoised per request so the
 * app layout (trip switcher) and Trip Home (per-viewer hue) share one read.
 *
 * Reconciles pending Invites first (ADR 0017; itself cache()d, so free when
 * the layout already ran it): layouts and pages render in parallel, and
 * whichever calls this first fixes the answer for both — so it must never be
 * a list from before a just-accepted Invite became membership.
 */
export const readMemberTrips = cache(async (userId: string, email: string | null) => {
  if (email) await reconcilePendingInvites(userId, email);
  return db.tripMember.findMany({
    where: { userId, trip: { deletedAt: null } },
    include: {
      trip: {
        select: {
          id: true,
          name: true,
          slug: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          stops: {
            where: { ...REAL_PLAN, arriveDate: { not: null } },
            orderBy: { sortOrder: "asc" },
            select: { id: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
          },
        },
      },
    },
    orderBy: { trip: { createdAt: "desc" } },
  });
});
