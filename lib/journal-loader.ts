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
import type { AttachmentView } from "@/components/trip/attachment-list";

export interface TodaysJournalMine {
  body: string;
  updatedAt: Date | null;
  hiddenFromShares: boolean;
}

export interface TodaysJournalOther {
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

  const others = new Map<string, TodaysJournalOther>();
  for (const entry of entries) {
    if (entry.authorId === userId) continue;
    others.set(entry.authorId, {
      traveller: entry.author,
      body: entry.body,
      photo: photos.find((p) => p.uploadedById === entry.authorId) ?? null,
    });
  }
  for (const photo of photos) {
    if (photo.uploadedById === userId) continue;
    if (others.has(photo.uploadedById)) continue;
    others.set(photo.uploadedById, {
      traveller: photo.uploadedBy,
      body: "",
      photo,
    });
  }

  return {
    mine: myEntry
      ? { body: myEntry.body, updatedAt: myEntry.updatedAt, hiddenFromShares: myEntry.hiddenFromShares }
      : null,
    minePhoto,
    others: Array.from(others.values()),
  };
}
