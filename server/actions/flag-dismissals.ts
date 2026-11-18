"use server";

import { db } from "@/lib/db";
import { requireRowAccess } from "@/lib/guards";
import { revalidateTrip } from "@/lib/revalidate";
import { formFail, type ActionResult } from "@/lib/action-result";
import { tightFlagItems } from "@/lib/flags";
import { loadFlags } from "@/lib/flags-loader";

const ONLY_TIGHT = "Only a travel-time warning can be marked fine.";

async function requireTightFlag(tripId: string, flagId: string): Promise<{ userId: string } | string> {
  const pair = tightFlagItems(flagId);
  if (!pair) return ONLY_TIGHT;
  const [from, to] = [
    await requireRowAccess("item", pair.fromItemId, { realPlanOnly: true }),
    await requireRowAccess("item", pair.toItemId, { realPlanOnly: true }),
  ];
  if (from.row.tripId !== tripId || to.row.tripId !== tripId) return "Those two things are not on this trip.";
  return { userId: from.user.id };
}

export async function markFlagFine(tripId: string, flagId: string, fingerprint: string): Promise<ActionResult> {
  const caller = await requireTightFlag(tripId, flagId);
  if (typeof caller === "string") return formFail(caller);

  const { shown, markedFine } = await loadFlags(tripId, caller.userId);
  const current = [...shown, ...markedFine].find((f) => f.id === flagId)?.fingerprint;
  // A stale page must never wave through a warning the Traveller has not seen; refresh it instead.
  if (current !== fingerprint) {
    revalidateTrip(tripId, "plan");
    return formFail(current === undefined ? "That warning is no longer showing." : "That warning has changed. Have another look.");
  }

  await db.flagDismissal.upsert({
    where: { tripId_flagId: { tripId, flagId } },
    create: { tripId, flagId, fingerprint, markedById: caller.userId },
    update: { fingerprint, markedById: caller.userId, createdAt: new Date() },
  });
  revalidateTrip(tripId, "plan");
  return { success: true };
}

export async function unmarkFlagFine(tripId: string, flagId: string): Promise<ActionResult> {
  const caller = await requireTightFlag(tripId, flagId);
  if (typeof caller === "string") return formFail(caller);

  await db.flagDismissal.deleteMany({ where: { tripId, flagId } });
  revalidateTrip(tripId, "plan");
  return { success: true };
}
