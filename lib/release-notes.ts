/**
 * **Release note**s — what TEEPEE tells a **Traveller** it has changed.
 *
 * See CONTEXT.md §"Feedback on the app itself" and ADR 0056. In short: one
 * line, in a Traveller's language, and only for a change a Traveller would
 * notice. Most of what ships earns no Release note at all — that discipline,
 * not `WHATS_NEW_CARD_LIMIT`, is what keeps **What's new** short.
 *
 * These live in code rather than the database so they deploy with the change
 * they describe, get reviewed in the same diff, and are present in the bundle
 * — which means What's new works offline, where a fetched document would not.
 */
export interface ReleaseNote {
  /**
   * ISO 8601 instant this note shipped.
   *
   * A full timestamp rather than a bare date, because read state is a
   * comparison against it: two releases on the same day must be
   * distinguishable, or dismissing the morning's would silently swallow the
   * afternoon's.
   */
  publishedAt: string;
  /** One line. No markdown, no line breaks. */
  text: string;
}

/** Newest first. Add new notes at the top. */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    publishedAt: "2026-09-21T12:00:00Z",
    text: "What's new: this. A short note here whenever something changes.",
  },
  {
    publishedAt: "2026-09-21T11:00:00Z",
    text: "Cover photos taken in portrait now fill the space instead of sitting in a grey box.",
  },
  {
    publishedAt: "2026-09-21T10:00:00Z",
    text: "Attachments now open in a new tab, so you keep your place — thanks Xanthia.",
  },
];

/**
 * How many Release notes the What's new card shows before deferring to the
 * full list. However large a release is, the interruption stays a fixed
 * small size.
 */
export const WHATS_NEW_CARD_LIMIT = 3;

/**
 * The Release notes a Traveller has not yet seen, newest first.
 *
 * `seenAt` is `User.whatsNewSeenAt` and is `null` for anyone who has never
 * dismissed the card. `null` means **caught up**, not "has seen nothing": it
 * falls back to when the account was created. Without that, shipping this
 * feature would have greeted both existing Travellers with the entire
 * backlog, and every future Traveller would meet the app's whole history on
 * their first sign-in — when none of it is new to them, it is simply how the
 * app is.
 */
export function unreadReleaseNotes(
  notes: ReleaseNote[],
  seenAt: Date | null,
  accountCreatedAt: Date,
): ReleaseNote[] {
  const boundary = (seenAt ?? accountCreatedAt).getTime();
  return notes.filter((n) => Date.parse(n.publishedAt) > boundary);
}

/** The calendar date a note shipped, for grouping a release under one heading. */
export function releaseNoteDate(note: ReleaseNote): string {
  return note.publishedAt.slice(0, 10);
}
