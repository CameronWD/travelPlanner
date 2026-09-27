/**
 * One day's Journal, grouped by author (spec K).
 *
 * Journal notes are per-Traveller rows (`JournalEntry`, ARCH-DAT-6) and
 * Journal photos are `Attachment`s (targetType JOURNAL, targetId = date)
 * attributed by `uploadedById`. A Traveller "has something" on a day when
 * they wrote a note OR added a photo — a photo-only author still shows.
 *
 * The Journal page, the Day view and Today's journal all build the same
 * union from the same two lists; this is the one place that does it, so
 * they can't drift (final review #1).
 *
 * An entry row with `body === ""` and no photo is NOT an entry: it exists
 * only to carry the author's "Keep off Share links" switch (spec L,
 * `setJournalShareHidden` creates such rows). It never surfaces a
 * co-Traveller slot and never counts as an entry (final review #10). The
 * viewer's own such row is still handed back (`entry`) so their editor can
 * read the switch's state.
 */

export interface JournalAuthorEntryLike {
  authorId: string;
  body: string;
}

export interface JournalAuthorPhotoLike {
  uploadedById: string;
}

export interface JournalAuthorSlot<E, P> {
  authorId: string;
  /** This author's entry row for the day, if any (the viewer's own may be a blank switch-only row). */
  entry: E | null;
  /** This author's photos for the day, oldest first — normally one; legacy days may carry several. */
  photos: P[];
  isViewer: boolean;
}

/** Whether an entry row actually holds a note or rides with a photo. */
export function isMeaningfulJournalEntry(
  entry: JournalAuthorEntryLike,
  photoAuthorIds: ReadonlySet<string>,
): boolean {
  return entry.body !== "" || photoAuthorIds.has(entry.authorId);
}

/**
 * Group one day's entries + photos by author.
 *
 * - The viewer's slot comes first. It is included whenever
 *   `includeViewerSlot` is set (the day is writable, so the viewer gets an
 *   editor even when blank), or when the viewer has a meaningful entry or a
 *   photo.
 * - Every other author follows, in first-seen order (entries, then
 *   photo-only authors), only if they have a non-blank note or a photo.
 */
export function groupJournalDayByAuthor<
  E extends JournalAuthorEntryLike,
  P extends JournalAuthorPhotoLike,
>({
  entries,
  photos,
  viewerId,
  includeViewerSlot,
}: {
  entries: readonly E[];
  photos: readonly P[];
  viewerId: string;
  includeViewerSlot: boolean;
}): JournalAuthorSlot<E, P>[] {
  const photosByAuthor = new Map<string, P[]>();
  for (const photo of photos) {
    const list = photosByAuthor.get(photo.uploadedById) ?? [];
    list.push(photo);
    photosByAuthor.set(photo.uploadedById, list);
  }
  const photoAuthorIds = new Set(photosByAuthor.keys());

  const order: string[] = [];
  for (const entry of entries) {
    if (!order.includes(entry.authorId)) order.push(entry.authorId);
  }
  for (const authorId of photosByAuthor.keys()) {
    if (!order.includes(authorId)) order.push(authorId);
  }

  const slotFor = (authorId: string): JournalAuthorSlot<E, P> => ({
    authorId,
    entry: entries.find((e) => e.authorId === authorId) ?? null,
    photos: photosByAuthor.get(authorId) ?? [],
    isViewer: authorId === viewerId,
  });

  const hasContent = (slot: JournalAuthorSlot<E, P>) =>
    slot.photos.length > 0 ||
    (slot.entry !== null && isMeaningfulJournalEntry(slot.entry, photoAuthorIds));

  const slots: JournalAuthorSlot<E, P>[] = [];
  const viewerSlot = slotFor(viewerId);
  if (includeViewerSlot || hasContent(viewerSlot)) slots.push(viewerSlot);
  for (const authorId of order) {
    if (authorId === viewerId) continue;
    const slot = slotFor(authorId);
    if (hasContent(slot)) slots.push(slot);
  }
  return slots;
}
