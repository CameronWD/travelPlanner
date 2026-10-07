/**
 * Loads the data `TodaysJournal` (components/trip/todays-journal.tsx) needs
 * for one Trip-local date: the current Traveller's own entry/photo (`mine`
 * / `minePhoto`, editable) and every co-Traveller's (`others`, read-only).
 *
 * Trip Home (Task 17, desktop) and the phone Travelling Home (Task 7) both
 * render `TodaysJournal` for "today" — this is the one place that loads its
 * props, so the query shape can't drift between the two call sites.
 */

import { db } from "@/lib/db";
import { TRAVELLER_SELECT, type TravellerLike } from "@/lib/traveller";
import { groupJournalDayByAuthor } from "@/lib/journal-authors";
import type { AttachmentView } from "@/components/trip/attachment-list";

interface TodaysJournalMine {
  body: string;
  updatedAt: Date | null;
  hiddenFromShares: boolean;
}

interface TodaysJournalOther {
  traveller: TravellerLike;
  body: string;
  photo: AttachmentView | null;
}

export interface TodaysJournalData {
  mine: TodaysJournalMine | null;
  minePhoto: AttachmentView | null;
  others: TodaysJournalOther[];
}

/**
 * Loads Today's Journal props for `tripId`/`today` (the Trip's own
 * reference-timezone "today" — callers compute this the same way the Home
 * page does, `todayISOInZone(currentTripTimezone(...))`) as seen by
 * `userId`.
 *
 * A co-Traveller shows up in `others` if they wrote a note OR added a photo
 * today — a photo with no note still surfaces its author (union, not just
 * the entries with text).
 */
export async function loadTodaysJournal(
  tripId: string,
  today: string,
  userId: string,
): Promise<TodaysJournalData> {
  const [entries, photos] = await Promise.all([
    db.journalEntry.findMany({
      where: { tripId, date: today },
      orderBy: { createdAt: "asc" },
      select: {
        body: true,
        updatedAt: true,
        authorId: true,
        hiddenFromShares: true,
        author: { select: TRAVELLER_SELECT },
      },
    }),
    db.attachment.findMany({
      where: { tripId, targetType: "JOURNAL", targetId: today },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        filename: true,
        mime: true,
        size: true,
        url: true,
        uploadedById: true,
        createdAt: true,
        uploadedBy: { select: TRAVELLER_SELECT },
      },
    }),
  ]);

  const myEntry = entries.find((e) => e.authorId === userId) ?? null;
  const minePhoto = photos.find((p) => p.uploadedById === userId) ?? null;

  // Same author union as the Journal page / Day view (lib/journal-authors):
  // a co-Traveller surfaces with a note OR a photo; a blank switch-only row
  // with no photo is not an entry (final review #10).
  const others: TodaysJournalOther[] = groupJournalDayByAuthor({
    entries,
    photos,
    viewerId: userId,
    includeViewerSlot: false,
  })
    .filter((slot) => !slot.isViewer)
    .map((slot) => ({
      traveller: slot.entry?.author ?? slot.photos[0].uploadedBy,
      body: slot.entry?.body ?? "",
      photo: slot.photos[0] ?? null,
    }));

  return {
    mine: myEntry
      ? { body: myEntry.body, updatedAt: myEntry.updatedAt, hiddenFromShares: myEntry.hiddenFromShares }
      : null,
    minePhoto,
    others,
  };
}
