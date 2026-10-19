import "server-only";
import { db } from "@/lib/db";
import { flagsForRows, loadFlagRows } from "@/lib/flags-loader";
import { loadTripPlanView } from "@/lib/mcp/reads/trip-plan";
import { loadTripProjection } from "@/lib/trip-projection-reads";
import { todayISOInZone } from "@/lib/tz";
import { reviewInputFromPlan, type ReviewChecklistEntry, type ReviewInput } from "./input-shape";

/**
 * Load a Review's input (spec 2026-10-17 R8, R9; spec 2026-10-18 A4): the
 * real plan, its current Flags as everyone on the Trip sees them, and the
 * trip's Packing list and Pre-trip checklist, read as a Share link's null
 * viewer, so every live Surprise is hidden. No access check and no session
 * (every read here is an unguarded one): the job runs after startReview's
 * check (lib/review/run.ts), possibly outside the request's Traveller. A
 * Trip without dates has no Flags (loadFlagRows' null), and its today comes
 * from the Home base. Checklists are never Surprise-able, so they are read
 * plainly, by kind; Shopping and Reminders stay out, since a checklist.add
 * fix only ever adds to Packing or Pre-trip (lib/review/types.ts CHECKLIST_FIX_LISTS).
 */
export async function buildReviewInput(tripId: string): Promise<ReviewInput> {
  const [plan, rows, projection, checklistRows] = await Promise.all([
    loadTripPlanView(tripId, null),
    loadFlagRows(tripId, null),
    loadTripProjection(tripId),
    db.checklistItem.findMany({
      where: { tripId, kind: { in: ["PACKING", "PRETRIP"] } },
      orderBy: { sortOrder: "asc" },
      select: { kind: true, text: true, done: true },
    }),
  ]);
  const flags = rows ? flagsForRows(rows, projection) : [];
  const today = rows?.today ?? todayISOInZone(plan.trip.homeTimezone ?? "UTC");
  const checklists: ReviewChecklistEntry[] = checklistRows.map((r) => ({ list: r.kind as ReviewChecklistEntry["list"], text: r.text, ticked: r.done }));
  return reviewInputFromPlan(plan, flags, today, checklists);
}
