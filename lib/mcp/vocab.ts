import type { Category } from "@/lib/categories";
import type { TransportMode, CostSettlement, ChecklistKind, VoteLevel, BookingState } from "@/lib/enum-values";
import type { FindingCategory, FindingOrigin, FindingSeverity, FindingState, ReviewKind, SuggestedFix } from "@/lib/review/types";

/** Spec Part G — one source for the style rule, used by MCP_INSTRUCTIONS (Task 7) and the day prompts. */
export const WRITING_STYLE =
  'Write like a person jotting in a shared trip planner. Short, plain, concrete. No em dashes, no semicolons, no exclamation marks. No filler or hype ("nestled", "vibrant", "hidden gem", "must-see", "immerse"). Titles are a few words ("Sintra day trip", "Dinner at Taberna da Rua"). Notes are one or two short sentences with the useful facts: times, prices, booking refs, what to bring.';

/** Spec Part H — check real-world facts online rather than relying on memory. */
export const CHECK_FACTS =
  'Check real-world facts online before relying on them or writing them into Teepee: opening hours, prices, timetables, routes, addresses, booking requirements, closures and entry rules. Your own knowledge may be out of date. Cross-check anything important against a second source, preferably the official site. Say what you checked and where. If you can\'t check something, say it\'s unverified rather than guessing.';

/**
 * What each Category value means — used both in MCP_INSTRUCTIONS and on
 * add_thing_to_do/update_thing_to_do's category field (Spec Part F).
 * Record<Category, string> makes a missing value a TYPE error; vocab.test.ts
 * adds the runtime guard against the live CATEGORY_VALUES list.
 */
export const CATEGORY_MEANING: Record<Category, string> = {
  SIGHTSEEING: "something to see: a museum, cathedral, viewpoint, landmark",
  FOOD: "a meal, café, bar for food, market or food tour",
  ACTIVITY: "something to do: a tour, hike, class, show, spa",
  NIGHTLIFE: "an evening out: bars, clubs, live music",
  SHOPPING: "shops, markets for buying things, outlets",
  GETTING_AROUND:
    "movement that does NOT change where you're staying: a day-trip bus, local train, metro, ferry hop, car hire for the day. Never a Transport",
  PLACE:
    "somewhere to go rather than something to do: a city, town, region or island not yet a Stop (for example 'Tuscany'). Mostly for Wishlist ideas",
  OTHER: "anything that fits none of the above",
};

/** What each Transport mode means, for add_transport/update_transport's mode field. */
export const TRANSPORT_MODE_MEANING: Record<TransportMode, string> = {
  FLIGHT: "a flight",
  TRAIN: "an intercity or long-distance train",
  BUS: "an intercity or long-distance coach",
  CAR: "a drive (own car or hire)",
  FERRY: "a ferry crossing",
  OTHER: "anything else that moves you between Stops",
};

/** What each Cost settlement means, for add_cost/update_cost's settlement field. */
export const SETTLEMENT_MEANING: Record<CostSettlement, string> = {
  BEFORE: "Before you go, paid before departure: flights, hotels paid at booking, insurance (the default)",
  ON_TRIP: "On the trip, paid while away: city tax at the desk, a hotel charging at check-out, meals",
};

/** What each Checklist kind means, for add_checklist_item's kind field. */
export const CHECKLIST_KIND_MEANING: Record<ChecklistKind, string> = {
  PRETRIP: "pre-trip task: visas, insurance, eSIM, bookings to make. May have a due date",
  PACKING: "something to pack",
  SHOPPING: "something to buy before the trip",
};

/** What each Vote level means, for set_vote's level field. */
export const VOTE_LEVEL_MEANING: Record<VoteLevel, string> = {
  MUST: "must-do: we shouldn't miss it",
  KEEN: "keen: would like to",
  MEH: "meh: only if it fits",
};

/** What each Booking state means (CONTEXT.md), for set_booking_state and the add_/update_ tools. */
export const BOOKING_STATE_MEANING: Record<BookingState, string> = {
  NONE: "no booking needed: walk in, free entry, or a stay with friends",
  TO_BOOK: "still to book. A leg you haven't bought yet, with placeholder times, is a TO_BOOK Transport",
  BOOKED: "booked: reserved or ticketed. Booked is not paid; payment is the Cost's business",
};

/**
 * CONTEXT.md "Slot time": Section S stores refundable as a plain true/false/
 * not-known column, not an enum, but reads and writes speak the same tri-state
 * vocabulary (get_item/get_trip_plan/get_day show YES/NO/UNKNOWN), so the
 * add_/update_thing_to_do tools take it too — mapped to true/false/null in
 * the handler (lib/mcp/tools/plan-write.ts), never a zod `.transform`.
 */
export const REFUNDABLE_VALUES = ["YES", "NO", "UNKNOWN"] as const;
export type RefundableLabel = (typeof REFUNDABLE_VALUES)[number];

export const REFUNDABLE_MEANING: Record<RefundableLabel, string> = {
  YES: "the ticket can be refunded or cancelled for free",
  NO: "non-refundable",
  UNKNOWN: "not known (the default)",
};

/**
 * A Review's two kinds as Claude says them (spec 2026-10-17 R11, R13):
 * review_trip takes `depth`, and get_review / list_reviews report the same
 * word, so Claude can pass back what it read. The stored ReviewKind never
 * reaches Claude.
 */
export const REVIEW_DEPTHS = ["standard", "deep"] as const;
export type ReviewDepth = (typeof REVIEW_DEPTHS)[number];

export const REVIEW_DEPTH_MEANING: Record<ReviewDepth, string> = {
  standard: "a Standard Review, the quicker check (the default)",
  deep: "a Deep Review, which thinks harder and takes longer. Use it when the person asks for a thorough check",
};

export const REVIEW_KIND_OF_DEPTH: Record<ReviewDepth, ReviewKind> = { standard: "STANDARD", deep: "DEEP" };
export const DEPTH_OF_REVIEW_KIND: Record<ReviewKind, ReviewDepth> = { STANDARD: "standard", DEEP: "deep" };

/** What each Finding category means (spec R8), for get_review's findings. */
export const FINDING_CATEGORY_MEANING: Record<FindingCategory, string> = {
  CLOSURE: "the place is closed, or closes early, on the day it is planned",
  SEASON: "a seasonal opening, event window or timetable that doesn't cover the date",
  TICKET: "a ticket or pass that doesn't cover what it needs to, or needs buying ahead",
  HOLIDAY: "a public holiday at the destination or at home that affects the plan",
  LOGISTICS: "timing between things: check-in against arrival, airport buffers, luggage, getting between places",
  STALE_NOTE: "a note that no longer matches the plan, often left over from a re-plan",
  PACKING: "something to pack or sort out before going, for the weather or the activities",
  BOOKING: "something still to book, or booked for the wrong time",
};

/** CONTEXT.md Finding: the four states. */
export const FINDING_STATE_MEANING: Record<FindingState, string> = {
  OPEN: "Open, nobody has acted on it yet",
  APPLIED: "Applied, someone pressed Apply on it in the app",
  DISMISSED: "Dismissed, someone decided it doesn't matter. A later Review keeps it dismissed",
  GONE: "No longer found, a later Review didn't raise it again",
};

export const FINDING_SEVERITY_MEANING: Record<FindingSeverity, string> = {
  warning: "likely to go wrong on the day unless something changes",
  info: "worth knowing, nothing is broken",
};

export const FINDING_ORIGIN_MEANING: Record<FindingOrigin, string> = {
  FLAG: "one of the trip's Flags (get_flags), restated as part of the Review",
  MODEL: "found by the Review's own checks, often with a source link",
};

/**
 * The tool Claude would use to make a Finding's suggested fix itself (spec
 * R8 SuggestedFix, discriminated on `kind`). The first word is the tool's
 * name (vocab.test.ts checks it is registered). Making the change does not
 * mark the Finding Applied: only the app's Apply does.
 */
export const FIX_WITH_TOOL: Record<SuggestedFix["kind"], string> = {
  "item.times": "update_thing_to_do with startTime and endTime, or schedule_thing_to_do to change the date",
  "item.bookingState": "set_booking_state with kind ITEM, passing the fix's bookingState as state (and its bookBy, if any)",
  "transport.bookingState": "set_booking_state with kind TRANSPORT, passing the fix's bookingState as state (and its bookBy, if any)",
  "accommodation.bookingState": "set_booking_state with kind ACCOMMODATION, passing the fix's bookingState as state (and its bookBy, if any)",
  "item.openingHours": "set_opening_hours with the hours and the source page",
  // update_thing_to_do replaces notes whole, so the current ones are read first.
  "item.note": "update_thing_to_do, after you read the current notes with get_item: pass them back with the text added",
};

/**
 * Builds a field's `.describe()` text from a meaning table, limited to the
 * values that field actually accepts (e.g. add_checklist_item's kind never
 * offers SHOPPING, so it is called with only ["PRETRIP", "PACKING"]).
 */
export function describeValues<K extends string>(intro: string, meaning: Record<K, string>, values: readonly K[]): string {
  return `${intro} ${values.map((v) => `${v}: ${meaning[v]}`).join(". ")}.`;
}
