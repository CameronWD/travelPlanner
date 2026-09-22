import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import {
  RELEASE_NOTES,
  WHATS_NEW_CARD_LIMIT,
  unreadReleaseNotes,
} from "@/lib/release-notes";
import { WhatsNewCard } from "./whats-new-card";

/**
 * Resolves what this **Traveller** has not yet read and, if anything,
 * renders the **What's new** card.
 *
 * The unread rule lives here rather than in either page, so the trips list
 * and Trip Home cannot drift apart on what counts as new. Returns `null`
 * when there is nothing to say — including for a Traveller whose row has
 * gone missing, where saying nothing is plainly better than failing a page
 * over release news.
 */
export async function WhatsNewBanner() {
  const user = await requireUser();

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { whatsNewSeenAt: true, createdAt: true },
  });
  if (!row) return null;

  const unread = unreadReleaseNotes(
    RELEASE_NOTES,
    row.whatsNewSeenAt,
    row.createdAt,
  );
  if (unread.length === 0) return null;

  return (
    <WhatsNewCard
      notes={unread.slice(0, WHATS_NEW_CARD_LIMIT)}
      totalUnread={unread.length}
    />
  );
}
