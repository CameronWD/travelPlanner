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
    publishedAt: "2026-10-09T00:00:00Z",
    text: "Plan variants are now called what-if plans. Pick one with \"Make this the real plan\".",
  },
  {
    publishedAt: "2026-10-07T00:32:00Z",
    text: "Travelling: a new cost starts in the local currency, set to On the trip and already paid. Change any of it before saving.",
  },
  {
    publishedAt: "2026-10-07T00:31:00Z",
    text: "Plan: change a stop's nights with − and + right on the stop, and edit its place with the same search as adding one.",
  },
  {
    publishedAt: "2026-10-07T00:30:00Z",
    text: "Add a stop, a cost or a Wishlist idea from Home or Search and the form opens straight away; a flag takes you to what needs fixing.",
  },
  {
    publishedAt: "2026-10-07T00:29:00Z",
    text: "Share: send one of your trip's share links from the Share button in the trip header or from Search.",
  },
  {
    publishedAt: "2026-10-07T00:28:00Z",
    text: "Tap outside a form you've changed and it asks before closing; a save that fails now tells you and keeps what you typed.",
  },
  {
    publishedAt: "2026-10-07T00:27:00Z",
    text: "Votes, checklist ticks and calendar moves show the moment you make them.",
  },
  {
    publishedAt: "2026-10-07T00:26:00Z",
    text: "Saved for offline now refreshes every few hours instead of on every visit, and holds off on slow or data-saving connections.",
  },
  {
    publishedAt: "2026-10-07T00:25:00Z",
    text: "Summary: a departure shows the date in the place you leave from.",
  },
  {
    publishedAt: "2026-10-07T00:24:00Z",
    text: "Teepee is quicker: pages load in fewer steps, maps load only when on screen, and place search keeps up as you type.",
  },
  {
    publishedAt: "2026-10-06T03:11:00Z",
    text: "Feedback: answered notes now say what was done, and older ones tuck away behind Show resolved.",
  },
  {
    publishedAt: "2026-10-06T03:10:00Z",
    text: "Plan: with a flight home booked, the plan counts against that flight instead of a separate home-by date.",
  },
  {
    publishedAt: "2026-10-06T03:09:00Z",
    text: "Plan: hotel details open in a roomier view, and edit forms use the width of your screen.",
  },
  {
    publishedAt: "2026-10-06T03:08:00Z",
    text: "Wishlist: Schedule offers the days you're actually near that place.",
  },
  {
    publishedAt: "2026-10-06T03:07:00Z",
    text: "Plan: a journey with several legs reads top to bottom, like stops on a metro line.",
  },
  {
    publishedAt: "2026-10-06T03:06:00Z",
    text: "Plan: tap anywhere on a stop to open it.",
  },
  {
    publishedAt: "2026-10-06T03:05:00Z",
    text: "Trip home: portrait cover photos show in full on phones.",
  },
  {
    publishedAt: "2026-10-04T06:44:00Z",
    text: "Plan: every day of a stay is now listed in full. Fold away the ones you're done with.",
  },
  {
    publishedAt: "2026-10-04T06:43:00Z",
    text: "Plan: where you're staying sits beside your ideas, with check-in and check-out times.",
  },
  {
    publishedAt: "2026-10-04T06:42:00Z",
    text: "The route map opens almost full screen on a computer.",
  },
  {
    publishedAt: "2026-10-04T06:41:00Z",
    text: "Teepee is light-only for now while dark mode gets a rethink.",
  },
  {
    publishedAt: "2026-09-27T07:10:00Z",
    text: "Desktop now has one sidebar with your trips, search and sections. No more top bar.",
  },
  {
    publishedAt: "2026-09-27T07:09:00Z",
    text: "Search: just click and type. Results appear right under the box.",
  },
  {
    publishedAt: "2026-09-27T07:08:00Z",
    text: 'Name a day in your plan, like "Sintra day trip", and it shows everywhere that day does.',
  },
  {
    publishedAt: "2026-09-27T07:07:00Z",
    text: "Add a photo to any idea or thing to do, so you remember which cathedral you meant. Thanks Xanthia.",
  },
  {
    publishedAt: "2026-09-27T07:06:00Z",
    text: "Set your own profile photo and name in Account.",
  },
  {
    publishedAt: "2026-09-27T07:05:00Z",
    text: "The Journal opens on day one: one note and one photo each per day, and you can share it on a share link.",
  },
  {
    publishedAt: "2026-09-27T07:04:00Z",
    text: "Portrait trip photos now sit beside the trip details on desktop. Thanks Xanthia.",
  },
  {
    publishedAt: "2026-09-27T07:03:00Z",
    text: "The plan's side panel lists every stop. Click one to jump to it.",
  },
  {
    publishedAt: "2026-09-27T07:02:00Z",
    text: "Your travels: a map of every trip and some fun stats, on the trips page. Thanks Xanthia.",
  },
  {
    publishedAt: "2026-09-27T07:01:00Z",
    text: "A new desktop Home: countdown, shared pot, route map and what to sort out, at a glance.",
  },
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
    text: "In a browser, attachments now open in a new tab so you keep your place. Thanks Xanthia.",
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
