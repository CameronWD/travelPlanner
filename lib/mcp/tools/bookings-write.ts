/**
 * Write tools for Accommodation, Transport and Cost (spec 2026-10-09, Task
 * 13): add/update/delete an Accommodation and a Transport leg (each with an
 * optional inline Cost), the standalone Cost lifecycle, and the paid/unpaid
 * toggle.
 *
 * Every write delegates to the same server actions the app itself uses
 * (`server/actions/accommodation`, `transport`, `costs`), which already
 * resolve to the acting Traveller inside a Claude connection (via
 * `requireUser`/`requireTripAccess`) and record Activity marked "via Claude".
 * Real plan only: none of `createAccommodation`/`createTransport`/
 * `createCost`'s optional `forkId` is ever supplied (constraints.md); the
 * mark_* loader scopes its lookup to `forkId: null`, and every
 * Accommodation/Transport/Cost/Stop id a tool takes goes through
 * `../real-plan.ts` first, so a fork-owned row reads as not found rather
 * than being loaded and acted on.
 *
 * Guiding principle (fix round 1, review): the MCP tool must behave exactly
 * as editing the same thing in the app's own dialogs does
 * (accommodation-form-dialog.tsx, transport-form-dialog.tsx, cost-editor.tsx,
 * other-cost-editor.tsx).
 *
 * No `lat`/`lng` on either Accommodation tool (same as Task 12's Item
 * tools): `createAccommodation`/`updateAccommodation` parse a `lat`/`lng`
 * pair but never read it from `data` when building the Prisma write — only
 * the geocoded result of `address` is ever stored — so accepting it here
 * would silently drop the caller's input (ruling 2). Transport's
 * `depLat`/`arrLat`/etc. are geocoded the same way and were never part of
 * this tool's surface either.
 *
 * The update tools pass only the fields the caller supplied (ADR 0075):
 * `updateAccommodation`/`updateTransport`/`updateCost` merge onto the row
 * they hold — the endpoint rules are lib/transport-patch.ts's, the paid
 * pair, Due date and inline-Cost completion lib/money/cost-patch.ts's.
 * `paidMinor`/`paidAt`/`settlement` are deliberately not on these tools'
 * schemas (use `update_cost`/`mark_cost_paid` once the owned Cost exists).
 *
 * Every write goes through `runWrite` and returns its row as it now stands
 * (spec 2026-10-16 F6): `{ accommodation }` (get_accommodation's shape),
 * `{ transport }` (get_transport's), `{ cost }` (list_costs' entry), and
 * `{ deleted }` for a delete. A refusal before the action (a Home
 * contradiction, an end with neither Stop nor place, more than one Cost)
 * returns `success: false`, so nothing is read back.
 */
import { z } from "zod";
import { notFound } from "next/navigation";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { requireTripAccess, requireRowAccess } from "@/lib/guards";
import { createAccommodation, updateAccommodation, deleteAccommodation } from "@/server/actions/accommodation";
import { createTransport, updateTransport, deleteTransport } from "@/server/actions/transport";
import { createCost, updateCost, deleteCost, markCostPaid, markCostUnpaid } from "@/server/actions/costs";
import { transportModeSchema, costOwnerTypeSchema, costSettlementSchema } from "@/lib/enums";
import { TRANSPORT_MODES, COST_SETTLEMENTS } from "@/lib/enum-values";
import { CURRENCY_CODES } from "@/lib/money/currencies";
import { MORE_THAN_ONE_COST } from "@/lib/money/cost-patch";
import type { ActionResult } from "@/lib/action-result";
import type { AccommodationInput } from "@/lib/validations/accommodation";
import type { TransportInput } from "@/lib/validations/transport";
import type { CostRawInput } from "@/lib/validations/cost";
import { runWrite } from "../run-tool";
import { loadAccommodationForMcp, loadTransportForMcp } from "../reads/entities";
import { loadCostForMcp } from "../reads/costs";
import { requireRealPlanRow, requireRealPlanRows, type RealPlanKind } from "../real-plan";
import { homeContradictionError } from "@/lib/transport-patch";
import { TRANSPORT_MODE_MEANING, SETTLEMENT_MEANING, describeValues } from "../vocab";
import { isoDate, hhmm } from "@/lib/validations/primitives";

const currencySchema = z.enum(CURRENCY_CODES as [string, ...string[]]);
const describedTransportMode = transportModeSchema.describe(
  describeValues(
    "How this Transport moves you between two Stops (or home). For a day trip or local travel that doesn't change where you're staying, add a thing to do with Category GETTING_AROUND instead.",
    TRANSPORT_MODE_MEANING,
    TRANSPORT_MODES,
  ),
);
const describedSettlement = costSettlementSchema.describe(
  describeValues("When in the journey this Cost gets paid.", SETTLEMENT_MEANING, COST_SETTLEMENTS),
);

const MONEY_NOTE = "Money is in minor units (cents) of currency, e.g. 1050 for $10.50.";

const inlineCostCreateShape = {
  costMinor: z.number().int().min(0).optional(),
  currency: currencySchema.optional(),
};

// ---------------------------------------------------------------------------
// add_accommodation / update_accommodation shared field shapes
// ---------------------------------------------------------------------------

const accommodationCreateShape = {
  name: z.string().trim().min(1),
  address: z.string().trim().optional(),
  checkIn: isoDate,
  checkOut: isoDate,
  checkInTime: hhmm.optional(),
  checkOutTime: hhmm.optional(),
  confirmation: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  ...inlineCostCreateShape,
};

const accommodationPatchShape = {
  stopId: z.string().optional(),
  name: z.string().trim().min(1).optional(),
  address: z.string().trim().optional(),
  checkIn: isoDate.optional(),
  checkOut: isoDate.optional(),
  checkInTime: hhmm.optional(),
  checkOutTime: hhmm.optional(),
  confirmation: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  ...inlineCostCreateShape,
};

// ---------------------------------------------------------------------------
// add_transport / update_transport shared field shapes
// ---------------------------------------------------------------------------

/** A transport time: an offset ISO datetime, or an offset-less wall-clock
 * "YYYY-MM-DDTHH:mm" the action interprets in the endpoint Stop's timezone. */
const transportDatetime = z.string().trim().min(1, "Give a date and time");

const transportCreateShape = {
  mode: describedTransportMode,
  fromStopId: z.string().optional(),
  toStopId: z.string().optional(),
  anchorStopId: z.string().optional(),
  depIsHome: z.boolean().optional(),
  arrIsHome: z.boolean().optional(),
  depPlace: z.string().trim().optional().describe("The exact departure point within fromStopId, e.g. a station, airport or pier."),
  arrPlace: z.string().trim().optional().describe("The exact arrival point within toStopId, e.g. a station, airport or pier."),
  depAt: transportDatetime,
  arrAt: transportDatetime,
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  ...inlineCostCreateShape,
};

const transportPatchShape = {
  mode: describedTransportMode.optional(),
  fromStopId: z.string().optional(),
  toStopId: z.string().optional(),
  anchorStopId: z.string().optional(),
  depIsHome: z.boolean().optional(),
  arrIsHome: z.boolean().optional(),
  depPlace: z
    .string()
    .trim()
    .optional()
    .describe("The exact departure point within the departure Stop, e.g. a station, airport or pier. \"\" clears it."),
  arrPlace: z
    .string()
    .trim()
    .optional()
    .describe("The exact arrival point within the arrival Stop, e.g. a station, airport or pier. \"\" clears it."),
  depAt: transportDatetime.optional(),
  arrAt: transportDatetime.optional(),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  ...inlineCostCreateShape,
};

// ---------------------------------------------------------------------------
// add_cost / update_cost shared field shapes
// ---------------------------------------------------------------------------

const costCreateShape = {
  costMinor: z.number().int().min(0),
  currency: currencySchema,
  ownerType: costOwnerTypeSchema,
  ownerId: z.string().optional(),
  label: z.string().trim().optional(),
  category: z.string().trim().optional(),
  dueDate: isoDate.optional(),
  settlement: describedSettlement.optional(),
};

const costPatchShape = {
  costMinor: z.number().int().min(0).optional(),
  currency: currencySchema.optional(),
  ownerType: costOwnerTypeSchema.optional(),
  ownerId: z.string().optional(),
  label: z.string().trim().optional(),
  category: z.string().trim().optional(),
  dueDate: isoDate.optional(),
  settlement: describedSettlement.optional(),
};

/**
 * Loads a Cost's `tripId` only, for the `mark_cost_paid`/`mark_cost_unpaid`
 * access check. `markCostPaid`/`markCostUnpaid` do their own lookup too,
 * but on a missing row they return `{ success: false, errors: { _:
 * ["Cost not found"] } }` rather than `notFound()` — a different tool error
 * than a non-member's id gets (which still throws `notFound()` via
 * `requireTripAccess`), breaking the "same not found text either way" rule.
 * Checking here first, same notFound()-before-access-check shape as the
 * other loaders, gives both the same `NOT_FOUND_TEXT`.
 */
async function loadCostForMark(costId: string): Promise<{ tripId: string }> {
  const cost = await db.cost.findUnique({ where: { id: costId, forkId: null }, select: { tripId: true } });
  if (!cost) notFound();
  await requireTripAccess(cost.tripId);
  return cost;
}

/**
 * Maps a Cost's `ownerType` to the `RealPlanKind` of the entity `ownerId`
 * names, or `null` for `OTHER` (a standalone Cost, not owned by a real-plan
 * row). `verifyOwnerEntity` in `server/actions/costs.ts` (~50-99) checks
 * only that the owner entity belongs to the right trip, not that it's a
 * real-plan row rather than a Fork's — so a Fork's Transport/Accommodation/
 * Item id on the same trip would otherwise be accepted there, landing a
 * real-plan Cost owned by a Fork row. Fixed here, at the MCP layer, rather
 * than in `verifyOwnerEntity` itself, since the app's own Fork cost path
 * uses that same check and must keep accepting a Fork's owner id.
 */
function realPlanKindForOwner(ownerType: string): RealPlanKind | null {
  switch (ownerType) {
    case "TRANSPORT":
      return "transport";
    case "ACCOMMODATION":
      return "accommodation";
    case "ITEM":
      return "item";
    default:
      return null;
  }
}

/**
 * `update_accommodation`/`update_transport`: the app-wide inline-Cost
 * refusal (`lib/money/cost-patch.ts`'s `MORE_THAN_ONE_COST`) speaks only
 * Traveller wording, because it can also reach the Accommodation/Transport
 * dialogs — it has no "update_cost" to point at. Through Claude there is
 * one, so this appends the tool-specific sentence onto that same refusal
 * rather than cost-patch.ts knowing about tool names.
 */
function withUpdateCostGuidance(result: ActionResult): ActionResult {
  if (result !== MORE_THAN_ONE_COST) return result;
  return {
    success: false,
    errors: { costMinor: [`${MORE_THAN_ONE_COST.errors.costMinor![0]} Use update_cost to edit a specific one.`] },
  };
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerBookingsWriteTools(server: McpServer): void {
  server.registerTool(
    "add_accommodation",
    {
      title: "Add accommodation",
      description: `Adds Accommodation to a Stop. ${MONEY_NOTE} Location comes from address, not lat/lng.`,
      inputSchema: { stopId: z.string(), ...accommodationCreateShape },
    },
    (input) =>
      runWrite(
        "add_accommodation",
        async () => {
          await requireRealPlanRow("stop", input.stopId);
          return createAccommodation(input as AccommodationInput);
        },
        async (done) => ({ accommodation: await loadAccommodationForMcp(done.id) }),
      ),
  );

  server.registerTool(
    "update_accommodation",
    {
      title: "Update accommodation",
      description:
        "Changes only the fields you pass; fields you omit keep their current value. " +
        `${MONEY_NOTE} Location comes from address, not lat/lng. To change paid status or settlement on an owned Cost, use update_cost/mark_cost_paid/mark_cost_unpaid once it exists.`,
      inputSchema: { accommodationId: z.string(), ...accommodationPatchShape },
    },
    ({ accommodationId, ...patch }) =>
      runWrite(
        "update_accommodation",
        async () => {
          await requireRealPlanRows([
            ["accommodation", accommodationId],
            ["stop", patch.stopId],
          ]);
          return withUpdateCostGuidance(await updateAccommodation(accommodationId, patch));
        },
        async () => ({ accommodation: await loadAccommodationForMcp(accommodationId) }),
      ),
  );

  server.registerTool(
    "delete_accommodation",
    {
      title: "Delete accommodation",
      description: "Permanently deletes an Accommodation. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { accommodationId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ accommodationId }) =>
      runWrite(
        "delete_accommodation",
        async () => {
          await requireRealPlanRow("accommodation", accommodationId);
          return deleteAccommodation(accommodationId);
        },
        async () => ({ deleted: accommodationId }),
      ),
  );

  server.registerTool(
    "add_transport",
    {
      title: "Add transport",
      description:
        `Adds a Transport leg to a trip. depAt/arrAt are a date and time, e.g. "2026-07-01T08:00". ` +
        "Give fromStopId and depPlace together to link a Stop and name the exact departure point (e.g. a station); same for toStopId/arrPlace. " +
        "Home takes no point: depIsHome/arrIsHome can't be true together with fromStopId/toStopId or depPlace/arrPlace. " +
        MONEY_NOTE,
      inputSchema: { tripId: z.string(), ...transportCreateShape },
    },
    ({ tripId, ...rest }) =>
      runWrite(
        "add_transport",
        async () => {
          if (rest.depIsHome && (rest.fromStopId || rest.depPlace)) {
            return homeContradictionError({ stopField: "fromStopId", placeField: "depPlace", homeField: "depIsHome" });
          }
          if (rest.arrIsHome && (rest.toStopId || rest.arrPlace)) {
            return homeContradictionError({ stopField: "toStopId", placeField: "arrPlace", homeField: "arrIsHome" });
          }
          await requireRealPlanRows([
            ["stop", rest.fromStopId || undefined],
            ["stop", rest.toStopId || undefined],
            ["stop", rest.anchorStopId],
          ]);
          return createTransport(tripId, rest as TransportInput);
        },
        async (done) => ({ transport: await loadTransportForMcp(done.id) }),
      ),
  );

  server.registerTool(
    "update_transport",
    {
      title: "Update transport",
      description:
        "Changes only the fields you pass; fields you omit keep their current value. Each end is a Stop, a Stop plus its " +
        "departure/arrival point (depPlace/arrPlace: the exact station, airport or pier), a point alone, or Home. depPlace " +
        "on a Stop-linked departure sets its point and keeps the Stop; pass depPlace \"\" to clear the point. A new " +
        "fromStopId clears the old point unless you pass depPlace too. fromStopId \"\" unlinks the Stop. Home takes no " +
        "point. The same applies to toStopId/arrPlace. " +
        `${MONEY_NOTE} To change paid status or settlement on an owned Cost, use update_cost/mark_cost_paid/mark_cost_unpaid once it exists.`,
      inputSchema: { transportId: z.string(), ...transportPatchShape },
    },
    ({ transportId, ...patch }) =>
      runWrite(
        "update_transport",
        async () => {
          // The app's form may save an end with neither; through Claude, emptying both in one call is a mistake (deviation 5).
          if (patch.fromStopId === "" && patch.depPlace === "" && !patch.depIsHome) {
            return { success: false, errors: { fromStopId: ["Departure needs a stop or a place."] } };
          }
          if (patch.toStopId === "" && patch.arrPlace === "" && !patch.arrIsHome) {
            return { success: false, errors: { toStopId: ["Arrival needs a stop or a place."] } };
          }
          await requireRealPlanRows([
            ["transport", transportId],
            ["stop", patch.fromStopId || undefined],
            ["stop", patch.toStopId || undefined],
            ["stop", patch.anchorStopId],
          ]);
          return withUpdateCostGuidance(await updateTransport(transportId, patch));
        },
        async () => ({ transport: await loadTransportForMcp(transportId) }),
      ),
  );

  server.registerTool(
    "delete_transport",
    {
      title: "Delete transport",
      description: "Permanently deletes a Transport leg. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { transportId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ transportId }) =>
      runWrite(
        "delete_transport",
        async () => {
          await requireRealPlanRow("transport", transportId);
          return deleteTransport(transportId);
        },
        async () => ({ deleted: transportId }),
      ),
  );

  server.registerTool(
    "add_cost",
    {
      title: "Add cost",
      description:
        `Adds a standalone Cost. ${MONEY_NOTE} ownerId is required for TRANSPORT/ACCOMMODATION/ITEM (the owning entity's id); label is required for OTHER. ` +
        "A new Cost is unpaid; use mark_cost_paid to record a payment. If the owner already has a Cost, use update_cost instead of adding another.",
      inputSchema: { tripId: z.string(), ...costCreateShape },
    },
    ({ tripId, ...rest }) =>
      runWrite(
        "add_cost",
        async () => {
          const kind = realPlanKindForOwner(rest.ownerType);
          if (kind && rest.ownerId) await requireRealPlanRow(kind, rest.ownerId);
          return createCost(tripId, rest as CostRawInput);
        },
        async (done) => ({ cost: await loadCostForMcp(done.cost!.id) }),
      ),
  );

  server.registerTool(
    "update_cost",
    {
      title: "Update cost",
      description:
        "Changes only the fields you pass; fields you omit keep their current value. " +
        `${MONEY_NOTE} Use mark_cost_paid/mark_cost_unpaid to change paid status.`,
      inputSchema: { costId: z.string(), ...costPatchShape },
    },
    ({ costId, ...patch }) =>
      runWrite(
        "update_cost",
        async () => {
          const { row } = await requireRowAccess("cost", costId, { realPlanOnly: true });
          if (patch.ownerType !== undefined || patch.ownerId !== undefined) {
            const kind = realPlanKindForOwner(patch.ownerType ?? row.ownerType);
            const ownerId = patch.ownerId ?? row.ownerId;
            if (kind && ownerId) await requireRealPlanRow(kind, ownerId);
          }
          return updateCost(costId, patch);
        },
        async () => ({ cost: await loadCostForMcp(costId) }),
      ),
  );

  server.registerTool(
    "delete_cost",
    {
      title: "Delete cost",
      description: "Permanently deletes a Cost. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { costId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ costId }) =>
      runWrite(
        "delete_cost",
        async () => {
          await requireRealPlanRow("cost", costId);
          return deleteCost(costId);
        },
        async () => ({ deleted: costId }),
      ),
  );

  server.registerTool(
    "mark_cost_paid",
    {
      title: "Mark cost paid",
      description: `Marks a Cost paid. ${MONEY_NOTE} paidAt is the date it was paid, YYYY-MM-DD.`,
      inputSchema: { costId: z.string(), paidMinor: z.number().int().min(0), paidAt: isoDate },
    },
    ({ costId, paidMinor, paidAt }) =>
      runWrite(
        "mark_cost_paid",
        async () => {
          await loadCostForMark(costId);
          return markCostPaid(costId, paidMinor, paidAt);
        },
        async () => ({ cost: await loadCostForMcp(costId) }),
      ),
  );

  server.registerTool(
    "mark_cost_unpaid",
    {
      title: "Mark cost unpaid",
      description: "Un-marks a Cost as paid. The paid amount is kept as history.",
      inputSchema: { costId: z.string() },
    },
    ({ costId }) =>
      runWrite(
        "mark_cost_unpaid",
        async () => {
          await loadCostForMark(costId);
          return markCostUnpaid(costId);
        },
        async () => ({ cost: await loadCostForMcp(costId) }),
      ),
  );
}
