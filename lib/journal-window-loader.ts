/**
 * `loadJournalWindow` — server-only, deliberately NOT in a "use server"
 * module.
 *
 * Fix round 2 (Important — security, from Task 6): this lived in
 * server/actions/journal.ts, which has a top-level "use server" directive,
 * so Next.js exposed it (like every export of that file) as a callable
 * Server Action with its own action id, whether or not any client code
 * imported it. `loadJournalWindow` performs NO access check of its own — it
 * exists to be called by already-access-checked server code
 * (`saveJournalEntry` in server/actions/journal.ts, `uploadAttachment` in
 * server/actions/attachments.ts, the Journal page) with a `tripId` those
 * callers already derived and checked themselves — so calling it directly
 * as a Server Action let anyone read ANY trip's start/end dates and
 * reference timezone by id, with no membership check at all.
 *
 * Moving this into a plain `lib/` module (no "use server") makes it
 * un-callable from the client at all — only server-side code that imports
 * it directly can reach it — the same pattern used for `copyItemPhoto`
 * (lib/item-photo-copy.ts, fix round 1) and for other server-only `lib/`
 * modules already in this codebase (e.g. lib/journal-loader.ts).
 */

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import type { JournalWindowInput } from "@/lib/journal-window";

/**
 * Load the Trip's Journal writability window: its start/end dates and its
 * Trip-local "today", computed exactly the way the Home page does —
 * `todayISOInZone(currentTripTimezone(orderPlanStops(stops)))` over the
 * real plan's (forkId null) dated Stops in canonical plan order (ADR 0038).
 *
 * Callers MUST have already access-checked `tripId` themselves — this
 * function trusts its caller, not its argument (see file docblock).
 */
export async function loadJournalWindow(tripId: string): Promise<JournalWindowInput> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      startDate: true,
      endDate: true,
      stops: {
        where: { ...REAL_PLAN, arriveDate: { not: null } },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          timezone: true,
          arriveDate: true,
          departDate: true,
        },
      },
    },
  });
  if (!trip) notFound();

  const today = todayISOInZone(currentTripTimezone(orderPlanStops(trip.stops)));
  return { startDate: trip.startDate, endDate: trip.endDate, today };
}
