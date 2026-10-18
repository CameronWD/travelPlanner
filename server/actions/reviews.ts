"use server";

/**
 * Acting on a Review's Findings (spec 2026-10-17 R8, R10, R12): Dismiss,
 * Apply (R.12) and Undo. Open to everyone on the Trip (R12). Every write is
 * conditional on the state it read, so two Travellers clicking at once
 * can't both act. Apply and Dismiss only on the Trip's latest DONE Review
 * (decision 6); Undo on any.
 */
import { db } from "@/lib/db";
import { requireFindingAccess } from "@/lib/review-reads";
import { REVIEW_ACTION_COPY as COPY } from "@/lib/review/fix";
import { formFail, ok, type ActionResult } from "@/lib/action-result";
import { revalidateTrip } from "@/lib/revalidate";

export async function dismissFinding(findingId: string): Promise<ActionResult> {
  const { user, finding, isLatest } = await requireFindingAccess(findingId);
  if (finding.state !== "OPEN") return formFail(COPY.handled, "handled");
  if (!isLatest) return formFail(COPY.replaced, "replaced");
  const { count } = await db.finding.updateMany({
    where: { id: finding.id, state: "OPEN" },
    data: { state: "DISMISSED", stateById: user.id, stateAt: new Date() },
  });
  if (count === 0) return formFail(COPY.handled, "handled");
  revalidateTrip(finding.tripId, "reviews");
  return ok();
}

export async function undoFinding(findingId: string): Promise<ActionResult> {
  const { finding } = await requireFindingAccess(findingId);
  if (finding.state === "DISMISSED") {
    const { count } = await db.finding.updateMany({
      where: { id: finding.id, state: "DISMISSED" },
      data: { state: "OPEN", stateById: null, stateAt: null },
    });
    if (count === 0) return formFail(COPY.handled, "handled");
    revalidateTrip(finding.tripId, "reviews");
    return ok();
  }
  return formFail(COPY.nothing, "nothing");
}
