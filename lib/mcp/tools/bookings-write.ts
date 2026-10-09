/**
 * Write tools for Accommodation, Transport and Cost (spec 2026-10-09, Task
 * 13): add/update/delete an Accommodation and a Transport leg (each with an
 * optional inline Cost), the standalone Cost lifecycle, and the paid/unpaid
 * toggle.
 *
 * Every write delegates to the same server actions the app itself uses
 * (`server/actions/accommodation`, `transport`, `costs`), which already
 * resolve to the acting Traveller inside a Claude connection (via
 * `requireUser`/`requireTripAccess`) and record Activity marked "via Claude"
 * — these tools add no access logic of their own. Real plan only: none of
 * `createAccommodation`/`createTransport`/`createCost`'s optional `forkId`
 * is ever supplied (constraints.md).
 *
 * No `lat`/`lng` on either Accommodation tool (fix round 1 pattern, same as
 * Task 12's Item tools): `createAccommodation`/`updateAccommodation` parse a
 * `lat`/`lng` pair but never read it from `data` when building the Prisma
 * write — only the geocoded result of `address` is ever stored — so
 * accepting it here would silently drop the caller's input (ruling 2).
 * Transport's `depLat`/`arrLat`/etc. are geocoded the same way and were
 * never part of this tool's surface either.
 *
 * `update_accommodation` and `update_transport` are PATCH (same ruling as
 * Tasks 11/12's `update_stop`/`update_thing_to_do`): both actions write
 * every field of their input, including absent ones, as the new value (an
 * omitted `address` writes `address: null`, an omitted `depIsHome` writes
 * `depIsHome: false`, etc.), so these load the current row, merge only the
 * fields the caller actually supplied, and send the action a complete input.
 *
 * The inline Cost on Accommodation/Transport is a convenience, not the
 * primary Cost surface — `paidMinor`/`paidAt`/`settlement` are deliberately
 * not on these tools' schemas (use `update_cost`/`mark_cost_paid` once the
 * owned Cost exists). But the action writes the owned Cost's `paidAt` as
 * `data.paidAt ? new Date(...) : null` UNCONDITIONALLY whenever `costMinor`
 * and `currency` are both present — so bumping just the amount, with no way
 * to even supply `paidAt` on this tool, would otherwise silently un-pay it.
 * `completeInlineCost` forwards the current single owned Cost's `paidAt`
 * (and completes `costMinor`/`currency` from it when the caller supplies
 * only one of the pair) whenever the patch touches the inline Cost at all.
 *
 * `update_cost` is the same PATCH shape, with one more wrinkle: `paidMinor`/
 * `paidAt` aren't on its schema either (same "use the dedicated tool"
 * reasoning), but `updateCost` writes `paidAt: data.paidAt ?? null`
 * unconditionally — so every patch would un-pay the Cost unless the current
 * `paidMinor`/`paidAt` are forwarded. The one exception: when the patch
 * changes `currency`, `updateCost` has its own rule (P3-3) that clears a
 * stale paid amount recorded in the old currency when no fresh payment info
 * comes with the change — forwarding the old pair across a currency change
 * would silently reintroduce the wrong-currency bug that rule exists to
 * prevent, so this tool leaves `paidMinor`/`paidAt` unforwarded (undefined)
 * on exactly that case, letting `updateCost`'s own clearing logic fire.
 */
import { z } from "zod";
import { notFound } from "next/navigation";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { createAccommodation, updateAccommodation, deleteAccommodation } from "@/server/actions/accommodation";
import { createTransport, updateTransport, deleteTransport } from "@/server/actions/transport";
import { createCost, updateCost, deleteCost, markCostPaid, markCostUnpaid } from "@/server/actions/costs";
import { transportModeSchema, costOwnerTypeSchema, costSettlementSchema } from "@/lib/enums";
import { CURRENCY_CODES } from "@/lib/currencies";
import type { AccommodationInput } from "@/lib/validations/accommodation";
import type { TransportInput } from "@/lib/validations/transport";
import type { CostRawInput } from "@/lib/validations/cost";
import { runTool } from "../run-tool";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format (24h)");
const currencySchema = z.enum(CURRENCY_CODES as [string, ...string[]]);

const MONEY_NOTE = "Money is in minor units (cents) of currency, e.g. 1050 for $10.50.";

// ---------------------------------------------------------------------------
// Inline cost completion (shared by Accommodation and Transport)
// ---------------------------------------------------------------------------

type InlineCostPatch = { costMinor?: number; currency?: string };
type InlineCostFields = { costMinor?: number; currency?: string; paidAt?: string };

/**
 * Completes a patch's inline-cost fields from the entity's current single
 * owned Cost (if there's exactly one — 0 means nothing to forward, >1 means
 * the action itself leaves the Cost editor authoritative and does nothing).
 * Returns `{}` (no cost keys at all) when the patch doesn't touch the
 * inline Cost, so the action's own "no amount provided → skip" path holds.
 */
async function completeInlineCost(
  ownerType: "ACCOMMODATION" | "TRANSPORT",
  ownerId: string,
  patch: InlineCostPatch,
): Promise<InlineCostFields> {
  if (patch.costMinor === undefined && patch.currency === undefined) return {};
  const existing = await db.cost.findMany({
    where: { ownerType, ownerId },
    select: { costMinor: true, currency: true, paidAt: true },
  });
  const single = existing.length === 1 ? existing[0] : null;
  return {
    costMinor: patch.costMinor ?? single?.costMinor,
    currency: patch.currency ?? single?.currency,
    paidAt: single?.paidAt ? single.paidAt.toISOString().slice(0, 10) : undefined,
  };
}

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

type AccommodationPatch = {
  stopId?: string;
  name?: string;
  address?: string;
  checkIn?: string;
  checkOut?: string;
  checkInTime?: string;
  checkOutTime?: string;
  confirmation?: string;
  notes?: string;
  costMinor?: number;
  currency?: string;
};

type AccommodationRow = {
  tripId: string;
  stopId: string;
  name: string;
  address: string | null;
  checkIn: string;
  checkOut: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  confirmation: string | null;
  notes: string | null;
};

/**
 * Loads the current Accommodation for a patch, trip-access-checked. A
 * missing row reads as `notFound()` (mapped by `runTool` to the same "not
 * found" text a non-member's id gets), checked *before* the access check
 * can even run — membership is then verified before any of the row's
 * values are used.
 */
async function loadAccommodationForPatch(accommodationId: string): Promise<AccommodationRow> {
  const acc = await db.accommodation.findUnique({
    where: { id: accommodationId },
    select: {
      tripId: true,
      stopId: true,
      name: true,
      address: true,
      checkIn: true,
      checkOut: true,
      checkInTime: true,
      checkOutTime: true,
      confirmation: true,
      notes: true,
    },
  });
  if (!acc) notFound();
  await requireTripAccess(acc.tripId);
  return acc;
}

function mergeAccommodationPatch(
  current: AccommodationRow,
  patch: AccommodationPatch,
  inlineCost: InlineCostFields,
): AccommodationInput {
  return {
    stopId: patch.stopId ?? current.stopId,
    name: patch.name ?? current.name,
    address: patch.address ?? current.address ?? undefined,
    checkIn: patch.checkIn ?? current.checkIn,
    checkOut: patch.checkOut ?? current.checkOut,
    checkInTime: patch.checkInTime ?? current.checkInTime ?? undefined,
    checkOutTime: patch.checkOutTime ?? current.checkOutTime ?? undefined,
    confirmation: patch.confirmation ?? current.confirmation ?? undefined,
    notes: patch.notes ?? current.notes ?? undefined,
    ...inlineCost,
  } as AccommodationInput;
}

// ---------------------------------------------------------------------------
// add_transport / update_transport shared field shapes
// ---------------------------------------------------------------------------

/** A transport time: an offset ISO datetime, or an offset-less wall-clock
 * "YYYY-MM-DDTHH:mm" the action interprets in the endpoint Stop's timezone. */
const transportDatetime = z.string().trim().min(1, "Give a date and time");

const transportCreateShape = {
  mode: transportModeSchema,
  fromStopId: z.string().optional(),
  toStopId: z.string().optional(),
  anchorStopId: z.string().optional(),
  depIsHome: z.boolean().optional(),
  arrIsHome: z.boolean().optional(),
  depPlace: z.string().trim().optional(),
  arrPlace: z.string().trim().optional(),
  depAt: transportDatetime,
  arrAt: transportDatetime,
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  ...inlineCostCreateShape,
};

const transportPatchShape = {
  mode: transportModeSchema.optional(),
  fromStopId: z.string().optional(),
  toStopId: z.string().optional(),
  anchorStopId: z.string().optional(),
  depIsHome: z.boolean().optional(),
  arrIsHome: z.boolean().optional(),
  depPlace: z.string().trim().optional(),
  arrPlace: z.string().trim().optional(),
  depAt: transportDatetime.optional(),
  arrAt: transportDatetime.optional(),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  ...inlineCostCreateShape,
};

type TransportPatch = {
  mode?: string;
  fromStopId?: string;
  toStopId?: string;
  anchorStopId?: string;
  depIsHome?: boolean;
  arrIsHome?: boolean;
  depPlace?: string;
  arrPlace?: string;
  depAt?: string;
  arrAt?: string;
  reference?: string;
  notes?: string;
  costMinor?: number;
  currency?: string;
};

type TransportRow = {
  tripId: string;
  mode: string;
  fromStopId: string | null;
  toStopId: string | null;
  anchorStopId: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  depPlace: string | null;
  arrPlace: string | null;
  depAt: Date | null;
  arrAt: Date | null;
  reference: string | null;
  notes: string | null;
};

/**
 * Loads the current Transport for a patch, trip-access-checked. Same
 * notFound()-before-access-check shape as `loadAccommodationForPatch`.
 */
async function loadTransportForPatch(transportId: string): Promise<TransportRow> {
  const transport = await db.transport.findUnique({
    where: { id: transportId },
    select: {
      tripId: true,
      mode: true,
      fromStopId: true,
      toStopId: true,
      anchorStopId: true,
      depIsHome: true,
      arrIsHome: true,
      depPlace: true,
      arrPlace: true,
      depAt: true,
      arrAt: true,
      reference: true,
      notes: true,
    },
  });
  if (!transport) notFound();
  await requireTripAccess(transport.tripId);
  return transport;
}

function mergeTransportPatch(
  current: TransportRow,
  patch: TransportPatch,
  inlineCost: InlineCostFields,
): TransportInput {
  return {
    mode: (patch.mode ?? current.mode) as TransportInput["mode"],
    fromStopId: patch.fromStopId ?? current.fromStopId ?? undefined,
    toStopId: patch.toStopId ?? current.toStopId ?? undefined,
    anchorStopId: patch.anchorStopId ?? current.anchorStopId ?? undefined,
    depIsHome: patch.depIsHome ?? current.depIsHome,
    arrIsHome: patch.arrIsHome ?? current.arrIsHome,
    depPlace: patch.depPlace ?? current.depPlace ?? undefined,
    arrPlace: patch.arrPlace ?? current.arrPlace ?? undefined,
    depAt: patch.depAt ?? current.depAt ?? undefined,
    arrAt: patch.arrAt ?? current.arrAt ?? undefined,
    reference: patch.reference ?? current.reference ?? undefined,
    notes: patch.notes ?? current.notes ?? undefined,
    ...inlineCost,
  } as TransportInput;
}

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
  settlement: costSettlementSchema.optional(),
};

const costPatchShape = {
  costMinor: z.number().int().min(0).optional(),
  currency: currencySchema.optional(),
  ownerType: costOwnerTypeSchema.optional(),
  ownerId: z.string().optional(),
  label: z.string().trim().optional(),
  category: z.string().trim().optional(),
  dueDate: isoDate.optional(),
  settlement: costSettlementSchema.optional(),
};

type CostPatch = {
  costMinor?: number;
  currency?: string;
  ownerType?: string;
  ownerId?: string;
  label?: string;
  category?: string;
  dueDate?: string;
  settlement?: string;
};

type CostRow = {
  tripId: string;
  costMinor: number;
  currency: string;
  paidMinor: number | null;
  paidAt: Date | null;
  dueDate: string | null;
  ownerType: string;
  ownerId: string | null;
  label: string | null;
  category: string | null;
  settlement: string;
};

/**
 * Loads the current Cost for a patch, trip-access-checked. Same
 * notFound()-before-access-check shape as the other loaders above.
 */
async function loadCostForPatch(costId: string): Promise<CostRow> {
  const cost = await db.cost.findUnique({
    where: { id: costId },
    select: {
      tripId: true,
      costMinor: true,
      currency: true,
      paidMinor: true,
      paidAt: true,
      dueDate: true,
      ownerType: true,
      ownerId: true,
      label: true,
      category: true,
      settlement: true,
    },
  });
  if (!cost) notFound();
  await requireTripAccess(cost.tripId);
  return cost;
}

/**
 * Merges a patch onto the current Cost row.
 *
 * `paidMinor`/`paidAt` aren't part of this tool's input (use
 * `mark_cost_paid`/`mark_cost_unpaid`/`update_cost` on the dedicated field
 * — there is none; those two tools own "paid"), yet `updateCost` writes
 * `paidAt: data.paidAt ?? null` on every call — so they're forwarded from
 * the current row to avoid silently un-paying the Cost, UNLESS the patch
 * changes `currency`: `updateCost`'s own rule (P3-3) deliberately clears a
 * stale paid amount recorded in the old currency when a currency change
 * comes with no fresh payment info, and forwarding the old pair here would
 * silently defeat that rule.
 */
function mergeCostPatch(current: CostRow, patch: CostPatch): CostRawInput {
  const currencyChanging = patch.currency !== undefined && patch.currency !== current.currency;
  return {
    costMinor: patch.costMinor ?? current.costMinor,
    currency: patch.currency ?? current.currency,
    ownerType: (patch.ownerType ?? current.ownerType) as CostRawInput["ownerType"],
    ownerId: patch.ownerId ?? current.ownerId ?? undefined,
    label: patch.label ?? current.label ?? undefined,
    category: patch.category ?? current.category ?? undefined,
    dueDate: patch.dueDate ?? current.dueDate ?? undefined,
    settlement: (patch.settlement ?? current.settlement) as CostRawInput["settlement"],
    paidMinor: currencyChanging ? undefined : current.paidMinor ?? undefined,
    paidAt: currencyChanging ? undefined : current.paidAt ? current.paidAt.toISOString().slice(0, 10) : undefined,
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
    (input) => runTool("add_accommodation", () => createAccommodation(input as AccommodationInput)),
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
      runTool("update_accommodation", async () => {
        const current = await loadAccommodationForPatch(accommodationId);
        const inlineCost = await completeInlineCost("ACCOMMODATION", accommodationId, patch);
        return updateAccommodation(accommodationId, mergeAccommodationPatch(current, patch, inlineCost));
      }),
  );

  server.registerTool(
    "delete_accommodation",
    {
      title: "Delete accommodation",
      description: "Permanently deletes an Accommodation. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { accommodationId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ accommodationId }) => runTool("delete_accommodation", () => deleteAccommodation(accommodationId)),
  );

  server.registerTool(
    "add_transport",
    {
      title: "Add transport",
      description: `Adds a Transport leg to a trip. depAt/arrAt are a date and time, e.g. "2026-07-01T08:00". ${MONEY_NOTE}`,
      inputSchema: { tripId: z.string(), ...transportCreateShape },
    },
    ({ tripId, ...rest }) => runTool("add_transport", () => createTransport(tripId, rest as TransportInput)),
  );

  server.registerTool(
    "update_transport",
    {
      title: "Update transport",
      description:
        "Changes only the fields you pass; fields you omit keep their current value. " +
        `${MONEY_NOTE} To change paid status or settlement on an owned Cost, use update_cost/mark_cost_paid/mark_cost_unpaid once it exists.`,
      inputSchema: { transportId: z.string(), ...transportPatchShape },
    },
    ({ transportId, ...patch }) =>
      runTool("update_transport", async () => {
        const current = await loadTransportForPatch(transportId);
        const inlineCost = await completeInlineCost("TRANSPORT", transportId, patch);
        return updateTransport(transportId, mergeTransportPatch(current, patch, inlineCost));
      }),
  );

  server.registerTool(
    "delete_transport",
    {
      title: "Delete transport",
      description: "Permanently deletes a Transport leg. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { transportId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ transportId }) => runTool("delete_transport", () => deleteTransport(transportId)),
  );

  server.registerTool(
    "add_cost",
    {
      title: "Add cost",
      description:
        `Adds a standalone Cost. ${MONEY_NOTE} ownerId is required for TRANSPORT/ACCOMMODATION/ITEM (the owning entity's id); label is required for OTHER. ` +
        "A new Cost is unpaid; use mark_cost_paid to record a payment.",
      inputSchema: { tripId: z.string(), ...costCreateShape },
    },
    ({ tripId, ...rest }) => runTool("add_cost", () => createCost(tripId, rest as CostRawInput)),
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
      runTool("update_cost", async () => {
        const current = await loadCostForPatch(costId);
        return updateCost(costId, mergeCostPatch(current, patch));
      }),
  );

  server.registerTool(
    "delete_cost",
    {
      title: "Delete cost",
      description: "Permanently deletes a Cost. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { costId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ costId }) => runTool("delete_cost", () => deleteCost(costId)),
  );

  server.registerTool(
    "mark_cost_paid",
    {
      title: "Mark cost paid",
      description: `Marks a Cost paid. ${MONEY_NOTE} paidAt is the date it was paid, YYYY-MM-DD.`,
      inputSchema: { costId: z.string(), paidMinor: z.number().int().min(0), paidAt: isoDate },
    },
    ({ costId, paidMinor, paidAt }) => runTool("mark_cost_paid", () => markCostPaid(costId, paidMinor, paidAt)),
  );

  server.registerTool(
    "mark_cost_unpaid",
    {
      title: "Mark cost unpaid",
      description: "Un-marks a Cost as paid. The paid amount is kept as history.",
      inputSchema: { costId: z.string() },
    },
    ({ costId }) => runTool("mark_cost_unpaid", () => markCostUnpaid(costId)),
  );
}
