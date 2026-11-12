import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { setNothingToAttach } from "@/server/actions/booking-confirmation";
import { runWrite } from "../run-tool";
import { requireRealPlanRow } from "../real-plan";
import { loadAccommodationForMcp, loadItemForMcp, loadTransportForMcp } from "../reads/entities";

export function registerNothingToAttachTool(server: McpServer): void {
  server.registerTool(
    "set_nothing_to_attach",
    {
      title: "Set nothing to attach",
      description:
        "Marks a Booked thing as having nothing to attach (its confirmation lives in an app, say), so TEEPEE stops asking for a Booking confirmation. Pass false to ask again.",
      inputSchema: { kind: z.enum(["ITEM", "TRANSPORT", "ACCOMMODATION"]), id: z.string(), nothingToAttach: z.boolean() },
    },
    ({ kind, id, nothingToAttach }) =>
      runWrite(
        "set_nothing_to_attach",
        async () => {
          await requireRealPlanRow(kind === "ITEM" ? "item" : kind === "TRANSPORT" ? "transport" : "accommodation", id);
          return setNothingToAttach(kind, id, nothingToAttach);
        },
        async () =>
          kind === "ITEM"
            ? { item: await loadItemForMcp(id) }
            : kind === "TRANSPORT"
              ? { transport: await loadTransportForMcp(id) }
              : { accommodation: await loadAccommodationForMcp(id) },
      ),
  );
}
