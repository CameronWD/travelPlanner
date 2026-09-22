"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { ok, type ActionResult } from "@/lib/action-result";
import { RELEASE_NOTES } from "@/lib/release-notes";

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

  // Notes are hand-written constants with no relationship to deploy time, so
  // nothing stops one from being timestamped ahead of when it actually ships
  // (write a note at 09:00 dated 12:00Z and it is "unread" until the clock
  // catches up). Stamping plain `new Date()` in that window would make the
  // card reappear after every dismissal — the Traveller taps X, it hides,
  // they navigate, it's back — because `unreadReleaseNotes` compares against
  // `publishedAt`, not against when the dismissal happened. Stamping the
  // *later* of now and the newest note's `publishedAt` guarantees a dismissal
  // always clears everything currently published, regardless of clock skew
  // between a note's timestamp and its actual release.
  const newestPublishedAt = Math.max(...RELEASE_NOTES.map((n) => Date.parse(n.publishedAt)));
  const seenAt = new Date(Math.max(Date.now(), newestPublishedAt));

  await db.user.update({
    where: { id: user.id },
    data: { whatsNewSeenAt: seenAt },
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
