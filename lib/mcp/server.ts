/**
 * Builds the MCP server for one /api/mcp request (spec 2026-10-09). Each tool
 * group registers itself; every tool goes through runTool and the app's own
 * guards, as the acting Traveller. The tool list depends on the caller in
 * one place only: review_trip is registered for a caller allowed to run
 * Reviews (listsReviewTrip).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTripReadTools } from "./tools/trips-read";
import { registerReadTools } from "./tools/reads";
import { registerTripStopWriteTools } from "./tools/trips-stops-write";
import { registerPlanWriteTools } from "./tools/plan-write";
import { registerBookingsWriteTools } from "./tools/bookings-write";
import { registerBookingStateTools } from "./tools/booking-state-write";
import { registerListWriteTools } from "./tools/lists-write";
import { registerMakeItFitTools } from "./tools/make-it-fit";
import { registerReviewReadTools, registerReviewRunTool } from "./tools/reviews";
import { registerPrompts } from "./prompts";
import { WRITING_STYLE, CHECK_FACTS } from "./vocab";
import type { ReviewPermission } from "@/lib/enum-values";

export const MCP_INSTRUCTIONS = [
  "You are working on the user's TEEPEE trips, as them. Changes are real and visible to their travel partner, marked 'via Claude'.",
  "Every tool works on the real plan (never a What-if plan). Read the plan before changing it, and say what you changed.",
  "Every write returns the thing as it now stands (a delete returns { deleted: id }; a date change also lists the other Stops it moved, in shifted), so confirm from that rather than reading the whole plan again; to re-check one thing, use get_stop, get_item, get_transport, get_accommodation or get_day.",
  "Vocabulary: file things as the right kind.",
  "A Stop is a place they stay for a stretch. Rough means a place and a rough number of nights with no dates yet. Scheduled means it has arrive and depart dates. Pinned means those dates are fixed by a real booking or a fixed-date event, so firming up or re-planning never moves it.",
  "A Transport moves them from one Stop to the next, or from or to Home: a flight, train, coach, drive or ferry, and it drives the dates. A day trip out and back, or local buses, trains, metro or taxis that don't change where they're staying, is NOT a Transport. Add it as a thing to do with Category GETTING_AROUND instead.",
  "A thing to do (Item) is an activity, sight, meal or booking on the plan. With a date it is scheduled on that day. Under a Stop with no date it is a thing to do there. With neither it is a Wishlist idea, shared across all plans, and it stays in the Wishlist when placed.",
  "Categories: SIGHTSEEING (Sightseeing) is something to see. FOOD (Food & Drink) is meals and food. ACTIVITY (Activity) is something to do. NIGHTLIFE (Nightlife) is evenings out. SHOPPING (Shopping) is buying things. GETTING_AROUND (Getting around) is local or day-trip movement that doesn't change where they're staying, never a Transport. PLACE (Place) is somewhere to go rather than something to do, like a city or region not yet a Stop, mostly for Wishlist ideas. OTHER (Other) is anything else.",
  "A Day title names one day of a Stop's stay, for example 'Sintra day trip'. A Note is a free-text comment between the Travellers, left on a thing; it is never edited, only deleted (delete_note) and said again (add_note). It is not a thing to do's own notes, which are part of the Item and edited with update_thing_to_do. Never put a schedule in a Note, schedule real things to do instead.",
  "A Cost belongs on what it pays for: a Transport, Accommodation or thing to do. An Other cost is only for standalone money like insurance, visas or an eSIM. Settlement is when it gets paid, Before you go (the default) or On the trip. A Due date is when committed money leaves the account.",
  "Booking state (bookingState: No booking needed, To book or Booked, plus an optional bookBy date) says whether a thing still needs booking. A reference on it implies Booked unless the Traveller has chosen a state themselves. Change it with set_booking_state.",
  "Checklists: PRETRIP is tasks like visas, insurance and bookings to make, PACKING is things to pack, SHOPPING is things to buy. A Checklist item persists until ticked. A Reminder is a dated note said once, the evening before its date. Use a Reminder for 'remember to print the tickets on the 27th', and a Checklist item for 'get travel insurance'.",
  "A Surprise is a Stop or a thing to do that one Traveller is arranging for another. If a Stop or item comes back with surprise.youAreSurprised true, it is being arranged for the person you are acting as: do not suggest, research, guess or ask what is inside it, and do not try to add to it or change it. Just say it is a surprise planned by the person named in surprise.plannedBy. If youAreSurprised is false, you can see inside and help plan it. The names in surprise.for must not see it, so never put its contents anywhere they would read (a Note on another Stop, a Reminder, a checklist). set_surprise makes a Stop or item a surprise, and reveal_surprise ends it (planner only).",
  "leave_feedback sends a Feedback note to Teepee's operator about the software itself (a bug, a confusing screen, a wish), the same as the app's Feedback button. Use it when the user asks to leave feedback or report a problem with Teepee, and tell them whether it is open or waiting for review.",
  "A Review is a saved check of the whole trip that Teepee runs with web search, for what Flags can't know: closures, seasons, public holidays, tickets, logistics, stale notes and packing. Anyone on the trip can read them with list_reviews and get_review. Each Finding in one is a suggestion, and its fixWith names the tool that would make the change. Read Findings to the person and change nothing until they agree.",
  CHECK_FACTS,
  `Writing style for anything you write into Teepee (titles, Day titles, notes, Reminders, checklist items, cost labels) and for your proposals: ${WRITING_STYLE}`,
].join(" ");

/** Who the server is built for: the one per-caller fact the tool list depends on (spec 2026-10-17 R12). */
export type McpCaller = { reviewPermission: string };

const RUNS_REVIEWS: readonly ReviewPermission[] = ["LIMITED", "UNLIMITED"];

/**
 * R12: review_trip is listed only to a Traveller allowed to run Reviews.
 * Fails closed: Off, and any value this code doesn't know, hide it. The route
 * builds a fresh server per request from the freshly loaded permission, so an
 * Admin's change applies from Claude's next request. Not listed means
 * calling it anyway is the SDK's "Tool review_trip not found", and
 * startReview re-checks the permission itself in its transaction.
 */
export function listsReviewTrip(permission: string): boolean {
  return (RUNS_REVIEWS as readonly string[]).includes(permission);
}

/** Told only to a Claude that has review_trip, so nobody else's Claude offers it (R12: no option shown anywhere). */
export const REVIEW_RUN_INSTRUCTION =
  "review_trip starts a Review, standard or deep. It runs in the background for a few minutes, so tell the person it has started and check it with get_review. Each one counts against the person's Review allowance and a trip runs one at a time, so start one only when they ask, and read an earlier one with list_reviews instead of starting another.";

export function mcpInstructions(caller: McpCaller): string {
  return listsReviewTrip(caller.reviewPermission) ? `${MCP_INSTRUCTIONS} ${REVIEW_RUN_INSTRUCTION}` : MCP_INSTRUCTIONS;
}

export function buildMcpServer(caller: McpCaller): McpServer {
  const server = new McpServer({ name: "teepee", version: "1.0.0" }, { instructions: mcpInstructions(caller) });
  registerTripReadTools(server);
  registerReadTools(server);
  registerTripStopWriteTools(server);
  registerPlanWriteTools(server);
  registerBookingsWriteTools(server);
  registerBookingStateTools(server);
  registerListWriteTools(server);
  registerMakeItFitTools(server);
  registerReviewReadTools(server);
  if (listsReviewTrip(caller.reviewPermission)) registerReviewRunTool(server);
  registerPrompts(server);
  return server;
}
