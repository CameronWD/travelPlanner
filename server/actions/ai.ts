"use server";

import { ok, formFail, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { requireOutsideSurprise } from "@/lib/surprise-guard";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import {
  suggestActivities,
  type AiResult,
  type SuggestActivitiesOutput,
} from "@/lib/ai";

/**
 * Converts the lib's plain `{ ok, data }` / `{ ok, reason, message }`
 * (lib/ai.ts stays as it is — it is not an action) into the one
 * `ActionResult` shape every action returns (ADR 0074): `reason` becomes
 * `code`, and the message — when the lib didn't supply one, as for
 * "disabled" — falls back to a generic line.
 */
function toAiActionResult<T extends object>(result: AiResult<T>): ActionResult<{ data: T }> {
  if (result.ok) return ok({ data: result.data });
  return formFail(result.message ?? "AI features are not configured.", result.reason);
}

// ---------------------------------------------------------------------------
// aiSuggestActivities
// ---------------------------------------------------------------------------

/**
 * Suggest activities for a stop in a trip.
 *
 * - Access-checked via requireTripAccess, then requireOutsideSurprise: a
 *   Traveller the Stop is a Surprise for is refused as a non-member is.
 * - Verifies the stop belongs to the trip.
 * - Passes existing item titles for that stop to avoid duplicates.
 * - Returns a DRAFT — does not persist anything.
 */
export async function aiSuggestActivities(
  tripId: string,
  stopId: string,
): Promise<ActionResult<{ data: SuggestActivitiesOutput }>> {
  const { user } = await requireTripAccess(tripId);
  await requireOutsideSurprise(user.id, { stopId });

  // Load the stop and verify it belongs to this trip
  const [stop, v] = await Promise.all([
    db.stop.findUnique({
      where: { id: stopId },
      select: { id: true, name: true, country: true, tripId: true },
    }),
    loadSurpriseVisibility(tripId, user.id),
  ]);

  if (!stop || stop.tripId !== tripId) {
    return formFail("Stop not found in this trip", "error");
  }

  // Load existing item titles for this stop so AI can avoid duplicates.
  // AI suggestions operate on the real plan; forks are not surfaced here.
  // A Surprise Item the viewer may not see keeps its title out of the prompt.
  const existingItems = await db.item.findMany({
    where: { tripId, stopId, ...REAL_PLAN, ...v.where.item },
    select: { title: true },
  });
  const existingTitles = existingItems.map((i) => i.title);

  return toAiActionResult(
    await suggestActivities({
      stopName: stop.name,
      country: stop.country ?? undefined,
      existingTitles,
    }),
  );
}
