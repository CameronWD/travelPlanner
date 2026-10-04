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

import { tripPath } from "@/lib/trip-path";

/** Which block of the page a section belongs to. */
export type HelpGroup = "intro" | "everyday" | "advanced" | "reference";

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
 * order intro → everyday → advanced → reference (asserted by test). The two
 * "intro" sections are open prose at the top of the guide, not collapsible
 * cards — see collapsibleSections().
 */
export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: "what-teepee-is",
    title: "What Teepee is",
    blurb: "A place to plan a trip with the people going on it.",
    group: "intro",
  },
  {
    id: "the-life-of-one-trip",
    title: "The life of one trip",
    blurb: "Six steps from a rough idea to the days you're away.",
    group: "intro",
  },
  {
    id: "your-trips",
    title: "Your trips and your travels",
    blurb: "The front page: every trip as a card, plus the map and tally of where you've been.",
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
    id: "the-day",
    title: "One day at a time",
    blurb: "The Days screen: a single day, its plan, weather and map.",
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
    id: "journal",
    title: "Keeping a journal",
    blurb: "Your own few lines on each day, side by side with everyone else's.",
    group: "everyday",
  },
  {
    id: "something-off",
    title: "When something looks off",
    blurb: "The app spots gaps and tells you what to fix next.",
    group: "everyday",
  },
  {
    id: "account",
    title: "You, on Account",
    blurb: "Your photo, your name, your devices and which trips send you a digest.",
    group: "everyday",
  },
  {
    id: "feedback",
    title: "Telling us what's wrong",
    blurb: "The Feedback button on every screen — a note to the people who make Teepee.",
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
    id: "links",
    title: "Sharing a link to a page",
    blurb: "Trip links read like the trip's name and keep working after a rename.",
    group: "advanced",
  },
  {
    id: "home-screen",
    title: "Put Teepee on your Home Screen",
    blurb: "Install it from your phone's browser — and why an iPhone needs this for the Digest.",
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
  "day",
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
  "Calendar",
  "Money",
  "Summary",
  "Wishlist",
  "Journal",
  "Checklists",
  "Files",
  "Activity",
  "Settings",
  "Help",
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
 * is not redundancy. Before the transport sheet restyle (PLAN.md §7.5),
 * `"Booking reference"` was a literal substring of the transport form's own
 * `"Booking reference / number"` — two different controls in two different
 * dialogs (item-form-dialog.tsx vs. transport-form-dialog.tsx) that happened
 * to overlap as text. The renamed transport label no longer overlaps, but the
 * position-for-position check (not string containment) is what makes that
 * irrelevant either way — it never assumed the two would keep overlapping.
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
 * as its own entry: it's the Thing-to-Do/Accommodation form's field
 * (item-form-dialog.tsx), independent of the Transport form's own "Booking
 * ref · only people on the trip see this" (transport-form-dialog.tsx,
 * PLAN.md §7.5) — literal containment between two entries does not by itself
 * mean one is redundant, so neither is removed just because the two once
 * shared a prefix. Entries must be whole phrases, and an entry is only
 * removed for redundancy when every one of its real occurrences is also
 * covered by another entry's occurrence at that same spot (enforced by
 * lib/help-guide.test.ts).
 */
export const GUIDE_UI_STRINGS = [
  // Adding things
  "Add an idea",
  "Start time",
  "End time",
  "Booking reference",
  "Add to this day",
  "Show day map",
  "Add from Globe",
  "Add a stay",
  "Booking confirmation",
  "Add transport",
  "Booking ref · only people on the trip see this",
  "Schedule this",
  "in this plan",
  "Add a photo",
  // Days
  "Add a title",
  // Money ("Between legs" is quoted too, but only lib/money/breakdown.ts
  // emits it, outside the scanned source)
  "Before you go",
  "On the trip",
  "Where it goes",
  "To pay",
  "Mark partly paid",
  "Add a cost",
  // Getting ready
  "Pre-trip",
  "Packing",
  "Paste a booking",
  "Create calendar feed",
  "Add Reminder",
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
  "Group this trip into chapters",
  "New Chapter",
  "Suggest from countries",
  "Firm up all stops",
  "Make rough",
  // Variants
  "Plan variants",
  "New variant",
  "Compare plans",
  // Search
  "Search or jump",
  "Search needs a connection",
  "New trip",
  "All trips",
  "Your travels",
  // Trip settings
  "Add a Traveller by email",
  "New share link",
  "Include in feed",
  "Include journal",
  "Show who's going",
  "Use this route",
  "Keep off Share links",
  "Road winding factor",
  "Name for the duplicate",
  "Delete trip",
  "Delete",
  "Recently deleted",
  "Restore",
  // Globe
  "Add Marker",
  "Place search",
  // Getting around, the trips list and the Trip home
  "Plan it",
  "Across trips",
  "Your trips",
  "Sort these out",
  "Cover photo",
  // The Day view
  "Day plan",
  // Account
  "Change photo",
  "Reposition",
  "Display name",
  "Enable on this device",
  "Which trips send you a digest",
  // Feedback
  "What's on your mind?",
  "Won't fix",
  // Offline (Settings)
  "Saved for offline",
  "Save again",
] as const;

/** Sections in one group, in document order. */
export function sectionsInGroup(group: HelpGroup): HelpSection[] {
  return HELP_SECTIONS.filter((s) => s.group === group);
}

/** The sections drawn as collapsible cards — everything but the intro prose. */
export function collapsibleSections(): HelpSection[] {
  return HELP_SECTIONS.filter((s) => s.group !== "intro");
}

/** Anchor id of the legend block ("What the buttons mean") in the guide. */
export const HELP_LEGEND_ID = "help-legend";

/** The on-page heading of each collapsible group; the rail reuses them. */
export const HELP_GROUP_LABELS = {
  everyday: "Using it day to day",
  advanced: "Going deeper",
  reference: "Looking something up",
} as const satisfies Record<Exclude<HelpGroup, "intro">, string>;

export interface HelpContentsGroup {
  label?: string;
  entries: { id: string; title: string }[];
}

/**
 * What the contents (chip box below lg, the "On this page" rail from lg) link
 * to: the walkthrough and the legend first, then every card under its group.
 * The intro paragraph is left out — it is the first thing on the page.
 */
export function helpContents(): HelpContentsGroup[] {
  const walkthrough = HELP_SECTIONS.find((s) => s.id === "the-life-of-one-trip")!;
  const entry = (s: HelpSection) => ({ id: s.id, title: s.title });
  return [
    {
      entries: [entry(walkthrough), { id: HELP_LEGEND_ID, title: "What the buttons mean" }],
    },
    { label: HELP_GROUP_LABELS.everyday, entries: sectionsInGroup("everyday").map(entry) },
    { label: HELP_GROUP_LABELS.advanced, entries: sectionsInGroup("advanced").map(entry) },
    { label: HELP_GROUP_LABELS.reference, entries: sectionsInGroup("reference").map(entry) },
  ];
}

/**
 * Deep link into a trip, or undefined when there is no trip in scope (the
 * global /help route) so the caller can render plain text instead of a link.
 */
export function guideTripHref(
  tripRef: string | undefined,
  segment: GuideTripSegment,
): string | undefined {
  return tripRef ? tripPath(tripRef, `/${segment}`) : undefined;
}
