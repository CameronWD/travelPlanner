"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { ok, type ActionResult } from "@/lib/action-result";

/**
 * "I have read this release."
 *
 * Marks every **Release note** published so far as seen by the signed-in
 * **Traveller**, so the What's new card does not return. Marking the *whole*
 * release rather than only the notes the card had room to show is deliberate:
 * news a Traveller chose not to read should not come back to ask again.
 *
 * Takes no arguments on purpose. There is no user id on the wire, so there is
 * nothing for a caller to tamper with — the row written is always the
 * session's own.
 *
 * Offline this simply fails and the card reappears on the next online load.
 * That is the accepted trade (ADR 0056): unlike a **Feedback note**, whose
 * offline queue exists because losing one loses real work, re-showing a card
 * costs a second tap.
 */
export async function dismissWhatsNew(): Promise<ActionResult> {
  const user = await requireUser();

  await db.user.update({
    where: { id: user.id },
    data: { whatsNewSeenAt: new Date() },
  });

  // The card renders on the trips list AND on every Trip's Home, so both
  // routes must be invalidated. This action deliberately takes no arguments
  // (no user id on the wire), so there is no tripId to interpolate — the
  // dynamic-segment form invalidates the cached Home of every trip instead,
  // which is what we want: the card is account-level, not trip-level.
  revalidatePath("/trips");
  revalidatePath("/trips/[tripId]", "page");
  return ok();
}
