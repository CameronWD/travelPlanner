import "server-only";
import { flagsForRows, loadFlagRows } from "@/lib/flags-loader";
import { loadTripPlanView } from "@/lib/mcp/reads/trip-plan";
import { loadTripProjection } from "@/lib/trip-projection-reads";
import { todayISOInZone } from "@/lib/tz";
import { reviewInputFromPlan, type ReviewInput } from "./input-shape";

/**
 * Load a Review's input (spec 2026-10-17 R8, R9): the real plan and its
 * current Flags as everyone on the Trip sees them, read as a Share link's
 * null viewer, so every live Surprise is hidden. No access check and no
 * session (every read here is an unguarded one): the job runs after
 * startReview's check (lib/review/run.ts), possibly outside the request's
 * Traveller. A Trip without dates has no Flags (loadFlagRows' null), and
 * its today comes from the Home base.
 */
export async function buildReviewInput(tripId: string): Promise<ReviewInput> {
  const [plan, rows, projection] = await Promise.all([
    loadTripPlanView(tripId, null),
    loadFlagRows(tripId, null),
    loadTripProjection(tripId),
  ]);
  const flags = rows ? flagsForRows(rows, projection) : [];
  const today = rows?.today ?? todayISOInZone(plan.trip.homeTimezone ?? "UTC");
  return reviewInputFromPlan(plan, flags, today);
}
