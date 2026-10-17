/**
 * set_booking_state (spec 2026-10-17 R2, R13): whether a thing to do, a
 * Transport leg or an Accommodation still has to be booked. It runs the
 * app's own update actions with a booking-only PATCH, so the rule
 * (lib/booking-state-patch.ts), the Activity line and the real-plan check are
 * the dialogs'. Real plan only (`../real-plan.ts`). Returns the row as it now
 * stands (F6).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { updateItem } from "@/server/actions/items";
import { updateTransport } from "@/server/actions/transport";
import { updateAccommodation } from "@/server/actions/accommodation";
import { runWrite } from "../run-tool";
import { requireRealPlanRow } from "../real-plan";
import { loadAccommodationForMcp, loadItemForMcp, loadTransportForMcp } from "../reads/entities";
import { bookByField, describedBookingState } from "../booking-state-fields";

const KINDS = ["ITEM", "TRANSPORT", "ACCOMMODATION"] as const;

export function registerBookingStateTools(server: McpServer): void {
  server.registerTool(
    "set_booking_state",
    {
      title: "Set booking state",
      description:
        "Sets whether a thing to do (ITEM), a Transport leg or an Accommodation still has to be booked. " +
        "bookBy (YYYY-MM-DD) is the day to book it by and only goes with TO_BOOK; omit it for no date. " +
        "The state you set stays even when a booking reference is added or removed. Booking is not paying: use mark_cost_paid for that.",
      inputSchema: { kind: z.enum(KINDS), id: z.string(), state: describedBookingState, bookBy: bookByField.optional() },
    },
    ({ kind, id, state, bookBy }) =>
      runWrite(
        "set_booking_state",
        async () => {
          const patch = { bookingState: state, bookBy: bookBy ?? null };
          if (kind === "ITEM") {
            await requireRealPlanRow("item", id);
            return updateItem(id, patch);
          }
          if (kind === "TRANSPORT") {
            await requireRealPlanRow("transport", id);
            return updateTransport(id, patch);
          }
          await requireRealPlanRow("accommodation", id);
          return updateAccommodation(id, patch);
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
