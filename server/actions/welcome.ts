"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { ok, type ActionResult } from "@/lib/action-result";

/**
 * "I have seen the Welcome."
 *
 * Stamps `User.welcomeSeenAt` for the signed-in Traveller so the first-sign-in
 * Welcome (components/welcome) does not return. Takes no arguments on purpose:
 * there is no user id on the wire, so nothing for a caller to tamper with —
 * the row written is always the session's own (same shape as dismissWhatsNew).
 *
 * Offline this rejects and the Welcome shows again on the next online load.
 * That is the same accepted trade as What's new (ADR 0056): a second tap, not
 * lost work.
 */
export async function markWelcomeSeen(): Promise<ActionResult> {
  const user = await requireUser();

  await db.user.update({
    where: { id: user.id },
    data: { welcomeSeenAt: new Date() },
  });

  // Only the Trips page mounts the Welcome (spec §G), so one path suffices.
  revalidatePath("/trips");
  return ok();
}
