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
    blurb: "Places, coloured bands and where you set off from.",
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
    title: "Forks and comparing plans",
    blurb: "Trying two versions of the trip side by side.",
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
  "today",
  "compare",
] as const;

export type GuideTripSegment = (typeof GUIDE_TRIP_SEGMENTS)[number];

/**
 * Nav labels the guide tells the reader to look for. Asserted against the
 * real nav. "Settings" is deliberately absent — it is out of scope.
 */
export const GUIDE_NAV_LABELS = [
  "Home",
  "Plan",
  "Calendar",
  "Budget",
  "Summary",
  "Wishlist",
  "Journal",
  "Checklists",
  "Files",
  "Activity",
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
