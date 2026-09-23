/**
 * Pure data model for the in-app user guide.
 *
 * PURE — no React, no Prisma, no browser APIs.
 *
 * The guide's *claims* about the app live here as data, not prose, so tests
 * can assert they are still true: GUIDE_NAV_LABELS must exist in the real
 * nav, and GUIDE_TRIP_SEGMENTS must resolve to real routes. When a tab is
 * renamed or a page moves, the suite fails instead of the guide lying.
 */

/** Which block of the page a section belongs to. */
export type HelpGroup = "everyday" | "advanced" | "reference";

export interface HelpSection {
  /** Slug used as the <details> anchor id. */
  id: string;
  title: string;
  /** One-line summary shown in the collapsed <summary> row. */
  blurb: string;
  group: HelpGroup;
}

/**
 * Section order IS document order. Groups must stay contiguous and in the
 * order everyday → advanced → reference (asserted by test).
 */
export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: "sixty-seconds",
    title: "The 60-second version",
    blurb: "The whole loop, start to finish, in six steps.",
    group: "everyday",
  },
  {
    id: "trip-shape",
    title: "The shape of your trip",
    blurb: "Places, where you set off from, and the optional coloured bands.",
    group: "everyday",
  },
  {
    id: "things-to-do",
    title: "Adding things to do",
    blurb: "Park an idea under a place — the main thing you'll do here.",
    group: "everyday",
  },
  {
    id: "giving-a-day",
    title: "Giving it a day",
    blurb: "The step that puts something on the calendar.",
    group: "everyday",
  },
  {
    id: "undecided",
    title: "Ideas you haven't decided on",
    blurb: "Where maybes live, and how you two agree on them.",
    group: "everyday",
  },
  {
    id: "sleeping-moving",
    title: "Sleeping and getting around",
    blurb: "Where you stay each night, and how you get between places.",
    group: "everyday",
  },
  {
    id: "money",
    title: "Money",
    blurb: "What something costs, and what you've actually paid.",
    group: "everyday",
  },
  {
    id: "getting-ready",
    title: "Getting ready",
    blurb: "Lists to tick off, and somewhere to keep tickets.",
    group: "everyday",
  },
  {
    id: "together",
    title: "Working together",
    blurb: "Leaving notes, and seeing what the other one changed.",
    group: "everyday",
  },
  {
    id: "search",
    title: "Finding things fast",
    blurb: "One box that jumps to any screen, or finds anything you've added.",
    group: "everyday",
  },
  {
    id: "away",
    title: "While you're away",
    blurb: "The one screen you'll actually use on the road.",
    group: "everyday",
  },
  {
    id: "something-off",
    title: "When something looks off",
    blurb: "The app spots gaps and tells you what to fix next.",
    group: "everyday",
  },
  {
    id: "chapters",
    title: "Chapters, in depth",
    blurb: "How the coloured bands decide what's grouped with what.",
    group: "advanced",
  },
  {
    id: "dates-and-pins",
    title: "Dates, pins and firming up",
    blurb: "Turning rough ideas into real dates without losing bookings.",
    group: "advanced",
  },
  {
    id: "make-it-fit",
    title: "Make it fit",
    blurb: "When the plan runs past the day you have to be home.",
    group: "advanced",
  },
  {
    id: "forks",
    // Titled for the word the UI actually uses ("New variant", "Compare
    // plans"). The id stays "forks" — it is the anchor slug, and Fork is the
    // domain noun in CONTEXT.md.
    title: "Variants and comparing plans",
    blurb: "Trying two versions of the trip side by side.",
    group: "advanced",
  },
  {
    id: "globe",
    title: "Your Globe",
    blurb: "The places you'd go someday, kept across every trip.",
    group: "advanced",
  },
  {
    id: "trip-settings",
    title: "Your trip's settings",
    blurb: "Who's on the trip, sharing it, and getting rid of it.",
    group: "advanced",
  },
  {
    id: "word-list",
    title: "Word list",
    blurb: "Every term the app uses, in plain English.",
    group: "reference",
  },
];

/**
 * Trip route segments the guide links to. Asserted to exist as real pages —
 * add a segment here only when the guide actually links to it.
 *
 * "today" is deliberately absent: that route is a bare redirect to the trip
 * root, so a link labelled "Home" pointing at /today was a label that did not
 * match its href. The guide names the Home screen in plain text instead.
 */
export const GUIDE_TRIP_SEGMENTS = [
  "plan",
  "calendar",
  "budget",
  "summary",
  "wishlist",
  "journal",
  "checklists",
  "files",
  "activity",
  "compare",
  "settings",
] as const;

export type GuideTripSegment = (typeof GUIDE_TRIP_SEGMENTS)[number];

/**
 * Nav labels the guide tells the reader to look for. Asserted against the
 * real nav.
 */
export const GUIDE_NAV_LABELS = [
  "Home",
  "Plan",
  "Days",
  "Money",
  "Summary",
  "Wishlist",
  "Journal",
  "Checklists",
  "Files",
  "Activity",
  "Settings",
] as const;

/**
 * True when `label` appears in `text` as a COMPLETE phrase, not merely as a
 * substring.
 *
 * A plain `includes` let two things through. `"Booking reference"` passed on
 * the strength of the longer `"Booking reference / number"` also in the list,
 * so it could never fail; and correction C6 shipped a guide that misquoted the
 * variant banner because `"Editing variant"` passed as a substring of the
 * banner's real, interpolated string. A guard that has already failed to catch
 * a shipped defect is not a guard.
 *
 * "Complete" means: the character immediately after the occurrence is either
 * absent, or one that cannot continue the same on-screen phrase — a quote, an
 * angle bracket, a brace, punctuation, a newline. Letters, digits, spaces,
 * slashes, apostrophes and hyphens all continue a phrase, so an occurrence
 * followed by one of those does not count.
 */
const PHRASE_CONTINUES = /[A-Za-z0-9 /'’-]/;

/**
 * Every index in `text` where `label` occurs as a complete on-screen phrase
 * (see `guideLabelOnScreen`). Used to check whether one `GUIDE_UI_STRINGS`
 * entry's real occurrences are all subsumed by another's, rather than merely
 * asking whether one entry's *text* contains another's — literal containment
 * is not redundancy. `"Booking reference"` is a literal substring of
 * `"Booking reference / number"`, but they are two different controls in two
 * different dialogs (item-form-dialog.tsx vs. transport-form-dialog.tsx), and
 * `"Booking reference"` has its own independent complete-phrase occurrence,
 * so it is not redundant.
 */
export function guideLabelPositions(text: string, label: string): number[] {
  const out: number[] = [];
  let i = text.indexOf(label);
  while (i !== -1) {
    const after = text[i + label.length];
    if (after === undefined || !PHRASE_CONTINUES.test(after)) out.push(i);
    i = text.indexOf(label, i + 1);
  }
  return out;
}

export function guideLabelOnScreen(text: string, label: string): boolean {
  return guideLabelPositions(text, label).length > 0;
}

/**
 * On-screen control labels the guide quotes back to the reader.
 *
 * The nav-label and route guards below cover tab names and page paths — the
 * parts least likely to move. Button labels are the parts most likely to move,
 * and a renamed button turns a confident instruction ("tap Add Chapter") into
 * one that cannot be followed. Every string here is asserted to appear
 * literally in some file under components/ or app/, excluding the guide's own
 * files, so a rename fails the suite instead of silently making the guide lie.
 *
 * Add a string here when the guide starts quoting a control, and remove it
 * when the guide stops. Deliberately excluded: single generic words ("Month",
 * "Promote", "Firm up", "Paid") whose last occurrence would survive a rename,
 * so the entry could not fail.
 *
 * Also deliberately excluded: a phrase with no complete on-screen occurrence
 * of its own. The variant banner interpolates the variant's name, so
 * `"Editing variant"` (a true substring of the banner's real, interpolated
 * text) has no complete phrase to assert — its wording is pinned by
 * components/trip/help-guide.test.tsx instead. `"Booking reference"` is KEPT
 * despite being a literal substring of `"Booking reference / number"`: the
 * two are different fields in different dialogs (the Thing-to-Do/
 * Accommodation form vs. the Transport form) and each has its own,
 * independent complete-phrase occurrence — literal containment between two
 * entries does not by itself mean one is redundant. Entries must be whole
 * phrases, and an entry is only removed for redundancy when every one of its
 * real occurrences is also covered by another entry's occurrence at that same
 * spot (enforced by lib/help-guide.test.ts).
 */
export const GUIDE_UI_STRINGS = [
  // Adding things
  "Add Thing to Do",
  "Start time",
  "End time",
  "Booking reference",
  "Add to this day",
  "Show day map",
  "Add from Globe",
  "Add Accommodation",
  "Booking confirmation",
  "Add transport",
  "Booking reference / number",
  "Schedule this",
  "in this plan",
  // Budget
  "Mark off what you've paid",
  "By category",
  "By destination",
  "By chapter",
  "Day by day",
  "Other costs",
  "Between legs",
  // Getting ready
  "Pre-trip",
  "Packing",
  "Booking parser",
  "Create calendar feed",
  // Working together
  "Mark all read",
  // Flags, fitting and the home screen
  "Next steps",
  "Make it fit",
  "Over hard end",
  "Trim nights",
  "Or drop a stop",
  "Apply trim",
  // Chapters, dates and pins
  "Group into chapters",
  "Turn off chapters",
  "New Chapter",
  "Suggest from countries",
  "Firm up all stops",
  "Clear dates",
  "Make rough",
  // Variants
  "New variant",
  "Compare plans",
  // Search
  "Search or jump",
  "Search needs a connection",
  "New trip",
  "Toggle theme",
  // Trip settings
  "Add a Traveller by email",
  "New share link",
  "Include in feed",
  "Road winding factor",
  "Name for the duplicate",
  "Delete trip",
  "Delete forever",
  // Globe
  "Add Marker",
  "Place search",
] as const;

/** Sections in one group, in document order. */
export function sectionsInGroup(group: HelpGroup): HelpSection[] {
  return HELP_SECTIONS.filter((s) => s.group === group);
}

/**
 * Deep link into a trip, or undefined when there is no trip in scope (the
 * global /help route) so the caller can render plain text instead of a link.
 */
export function guideTripHref(
  tripId: string | undefined,
  segment: GuideTripSegment,
): string | undefined {
  return tripId ? `/trips/${encodeURIComponent(tripId)}/${segment}` : undefined;
}
