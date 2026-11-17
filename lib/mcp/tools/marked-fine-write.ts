import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { markFlagFine, unmarkFlagFine } from "@/server/actions/flag-dismissals";
import { runWrite } from "../run-tool";
import { loadFlagsForMcp } from "../reads/flags";

export function registerMarkedFineTools(server: McpServer): void {
  server.registerTool(
    "mark_flag_fine",
    {
      title: "Mark flag fine",
      description:
        "Marks one travel-time flag from get_flags (by its flagId) as fine, when the person says that hop is not a problem. It is hidden for every Traveller until either thing's time or place, or the travel time, changes. Only travel-time flags can be marked fine. Returns the trip's flags as they now stand.",
      inputSchema: { tripId: z.string(), flagId: z.string() },
    },
    ({ tripId, flagId }) =>
      runWrite("mark_flag_fine", () => markFlagFine(tripId, flagId), () => loadFlagsForMcp(tripId)),
  );

  server.registerTool(
    "unmark_flag_fine",
    {
      title: "Unmark flag fine",
      description: "Shows a travel-time flag that was marked fine again (its flagId from get_flags' markedFine). Returns the trip's flags as they now stand.",
      inputSchema: { tripId: z.string(), flagId: z.string() },
    },
    ({ tripId, flagId }) =>
      runWrite("unmark_flag_fine", () => unmarkFlagFine(tripId, flagId), () => loadFlagsForMcp(tripId)),
  );
}
