/**
 * MCP prompts (spec 2026-10-09, Task 15): canned starting points offered by
 * the Claude connection's prompt picker. Each takes the tripId the person is
 * looking at and hands back one user-turn instruction naming which tools to
 * call and in what order — it doesn't call a tool itself, and it changes
 * nothing on its own; the instruction text itself asks Claude to hold off
 * until the person agrees.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
}
