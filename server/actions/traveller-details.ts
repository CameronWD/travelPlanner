"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";
import { type ActionResult, ok, validationResult } from "@/lib/action-result";
import { travellerDetailsSchema, travelNumberSchema, type TravellerDetailsInput } from "@/lib/validations/traveller-details";

/**
 * Save the viewer's own Traveller details (CONTEXT.md; spec 2026-10-02 §E).
 * Account-level, one row per person; never another person's row.
 */
export async function saveTravellerDetails(input: TravellerDetailsInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = travellerDetailsSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);

  await db.travellerDetails.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
  });

  revalidatePath("/account");
  return ok();
}

/**
 * Set the viewer's travel number on one Trip — the eSIM or local SIM for
 * that trip. Lives on the membership row because it is one Traveller's
 * number for one Trip; empty clears it.
 */
export async function saveTravelNumber(tripId: string, value: string): Promise<ActionResult> {
  const { user } = await requireTripAccess(tripId);
  const parsed = travelNumberSchema.safeParse(value);
  if (!parsed.success) return validationResult(parsed.error);

  await db.tripMember.updateMany({
    where: { tripId, userId: user.id },
    data: { travelNumber: parsed.data.length === 0 ? null : parsed.data },
  });

  revalidatePath(`/trips/${tripId}/settings`);
  return ok();
}
