/**
 * MCP prompts (spec 2026-10-09, Task 15; day-planning prompts added
 * 2026-10-11, Part E): canned starting points offered by the Claude
 * connection's prompt picker: review-plan, pack-for, plan-day, check-day.
 * Each takes the tripId the person is looking at (plan-day and check-day
 * also take a date) and hands back one user-turn instruction naming which
 * tools to call and in what order — it doesn't call a tool itself, and it
 * changes nothing on its own; the instruction text itself asks Claude to
 * hold off until the person agrees.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WRITING_STYLE, CHECK_FACTS } from "./vocab";
import { isoDate } from "@/lib/validations/primitives";

/** Shared by plan-day and check-day (spec 2026-10-11-mcp-read-pass Part E). */
const LOGISTICS_CHECK =
  "For each stop on the day, in order: (1) Address: confirm it resolves with search_places and name the place it matched. " +
  "(2) Getting there: from the previous place, give the options that apply (walk, metro or train, bus or tram, car or taxi) with a rough time for each, recommend one, and check the gap allows for it. " +
  "(3) Opening hours: start from the thing's openingHours (get_item or get_trip_plan) when Teepee has them, then check them for that date and weekday, including seasonal and holiday closures, and whether booking is needed. Save hours you have confirmed with set_opening_hours, giving the page as source. " +
  "(4) Fixed times: check the day's Transport (local times from get_trip_plan), check-out and check-in fit, with a buffer for airports and stations. " +
  "Mark each point verified (say how: web search, search_places) or unverified. Teepee holds no routing data and only the opening hours someone has saved, so flag anything you can't check with your own tools, never guess.";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "review-plan",
    {
      title: "Review plan",
      description: "Reviews a trip's plan for gaps, clashes, unbooked stays and the deadline, and proposes fixes.",
      argsSchema: { tripId: z.string() },
    },
    ({ tripId }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Review trip ${tripId}: call get_trip_plan, get_flags and get_budget, then list what looks wrong or risky (gaps, clashes, unbooked stays, the deadline) and propose fixes. Change nothing until I agree.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "pack-for",
    {
      title: "Pack for trip",
      description: "Builds a trip's packing list from its plan, grouped by type, with anything to buy flagged.",
      argsSchema: { tripId: z.string() },
    },
    ({ tripId }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Build the packing list for trip ${tripId}: read get_trip_plan (places, dates, season) and get_checklists, then propose additions grouped by type; after I confirm, add them with add_checklist_item (kind PACKING) and mark anything we need to buy with set_need_to_buy.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "plan-day",
    {
      title: "Plan a day",
      description: "Plans one day of a trip as timed things to do, checks the logistics (addresses, getting-there options, opening hours, fixed times), and builds it after you agree.",
      argsSchema: { tripId: z.string(), date: isoDate, brief: z.string().optional() },
    },
    ({ tripId, date, brief }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Plan ${date} on trip ${tripId}${brief ? `, what I'd like: ${brief}` : ""}. ` +
              "First read get_trip_plan (the Stop for that date, what's already on the day, Transport in local time, check-in and check-out), get_wishlist (ideas and Votes, favour must-dos) and list_attachments (tickets we already have for that day). " +
              "Draft a timed itinerary that fits around the Transport and check-in/out times. Then run this logistics check on the draft and fix what fails: " +
              LOGISTICS_CHECK +
              " Propose the itinerary with the getting-there options between stops, the check results, and a suggested Day title. Change nothing until I agree. " +
              "Once I agree, build it as real things to do: place Wishlist ideas with schedule_thing_to_do; add new things with add_thing_to_do, each with the date, stopId, startTime, endTime and address; set the title with set_day_title. Never put the schedule in a note. Leave anything already on the day alone unless I say to move or delete it. " +
              CHECK_FACTS +
              " " +
              WRITING_STYLE,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "check-day",
    {
      title: "Check a day",
      description: "Checks a planned day's logistics (addresses, getting-there options, opening hours, fixed times) and suggests fixes.",
      argsSchema: { tripId: z.string(), date: isoDate },
    },
    ({ tripId, date }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Check ${date} on trip ${tripId}: read get_trip_plan (what's on the day, Transport in local time, check-in and check-out) and list_attachments (tickets for that day), then run this logistics check on the day as it stands: ` +
              LOGISTICS_CHECK +
              " List the problems you find with suggested fixes, including better getting-there options. Change nothing until I agree. " +
              CHECK_FACTS +
              " " +
              WRITING_STYLE,
          },
        },
      ],
    }),
  );
}
