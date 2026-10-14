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
 * Real plan only: none of `createAccommodation`/`createTransport`/
 * `createCost`'s optional `forkId` is ever supplied (constraints.md); every
 * PATCH/mark_* loader also scopes its lookup to `forkId: null`, and every
 * other Accommodation/Transport/Cost/Stop id a tool takes goes through
 * `../real-plan.ts` first, so a fork-owned row reads as not found rather
 * than being loaded and acted on.
 *
 * Guiding principle (fix round 1, review): the MCP tool must behave exactly
 * as editing the same thing in the app's own dialogs does
 * (accommodation-form-dialog.tsx, transport-form-dialog.tsx, cost-editor.tsx
 * `parseOwnedFormToInput`, other-cost-editor.tsx `parseFormToInput`) — those
 * dialogs always open pre-filled from the current row and resubmit the
 * complete form, which is the real PATCH-equivalence this file reproduces
 * without the dialog.
 *
 * No `lat`/`lng` on either Accommodation tool (same as Task 12's Item
 * tools): `createAccommodation`/`updateAccommodation` parse a `lat`/`lng`
 * pair but never read it from `data` when building the Prisma write — only
 * the geocoded result of `address` is ever stored — so accepting it here
 * would silently drop the caller's input (ruling 2). Transport's
 * `depLat`/`arrLat`/etc. are geocoded the same way and were never part of
 * this tool's surface either.
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
 * owned Cost exists). But both dialogs always resend the current paid
 * amount/date whenever the Cost is paid (`costToFormState`-equivalent
 * pre-fill, submitted unchanged unless the person edits it), and the action
 * writes `paidAt: data.paidAt ? new Date(...) : null` UNCONDITIONALLY
 * whenever `costMinor`/`currency` are both present — and
 * `accommodationSchema`/`transportSchema` both refuse a `paidAt` with no
 * `paidMinor` ("Enter what you paid"). So `completeInlineCost` forwards the
 * current single owned Cost's `paidMinor` AND `paidAt` together (never one
 * without the other — a cost is only "paid" when both are set, same
 * `Boolean(cost.paidAt)`-and-an-amount signal every dialog uses) whenever
 * the patch touches the inline Cost at all, and errors out (ruling 2 — "no
 * accepted input silently dropped", here as "no silent no-op") rather than
 * calling the action when there's more than one owned Cost (CostEditor is
 * authoritative) or when the caller gives only one half of
 * `costMinor`/`currency` with no existing Cost to complete the other half
 * from.
 *
 * `update_cost` is the same PATCH shape, with one more wrinkle: `paidMinor`/
 * `paidAt` aren't on its schema either (same "use the dedicated tool"
 * reasoning), but `updateCost` writes `paidAt: data.paidAt ?? null`
 * unconditionally — so every patch would un-pay the Cost unless the current
 * `paidMinor`/`paidAt` are forwarded. Every owned-cost dialog (`cost-editor
 * .tsx`, `other-cost-editor.tsx`) resends the current paid pair on every
 * save, currency change included — it never recomputes the amount for the
 * new currency, it just resubmits the same text — so this tool matches that
 * exactly: when the Cost is currently paid (`paidAt` and `paidMinor` both
 * set), both are always forwarded, currency change or not. Only when the
 * Cost is NOT currently paid (either is missing/null) are both left
 * unforwarded, which is also the only case where `updateCost`'s own
 * currency-change clearing rule (comment-tagged P3-3 in
 * `server/actions/costs.ts`) can ever fire — and it's a no-op there anyway.
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
import { TRANSPORT_MODES, COST_SETTLEMENTS } from "@/lib/enum-values";
import { CURRENCY_CODES } from "@/lib/currencies";
import type { AccommodationInput } from "@/lib/validations/accommodation";
import type { TransportInput } from "@/lib/validations/transport";
import type { CostRawInput } from "@/lib/validations/cost";
import { runTool } from "../run-tool";
import { requireRealPlanRow, requireRealPlanRows, type RealPlanKind } from "../real-plan";
import { TRANSPORT_MODE_MEANING, SETTLEMENT_MEANING, describeValues } from "../vocab";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format (24h)");
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

/** The shape every field-error-shaped tool failure shares (ActionFailure). */
export type Failure = { success: false; errors: Record<string, string[]> };
export function isFailure(v: unknown): v is Failure {
  return typeof v === "object" && v !== null && "success" in v && (v as { success: unknown }).success === false;
}

// ---------------------------------------------------------------------------
// Inline cost completion (shared by Accommodation and Transport)
// ---------------------------------------------------------------------------

type InlineCostPatch = { costMinor?: number; currency?: string };
export type InlineCostFields = { costMinor?: number; currency?: string; paidMinor?: number; paidAt?: string };

/**
 * Completes a patch's inline-cost fields from the entity's current single
 * owned Cost. Returns `{}` (no cost keys at all) when the patch doesn't
 * touch the inline Cost — the action's own "no amount provided → skip"
 * path holds. Returns a `Failure` (ruling 2 — don't report success for a
 * no-op) instead of silently doing nothing when the patch touches the
 * inline Cost but there's more than one owned Cost (the action leaves the
 * Cost editor authoritative and makes no write at all), or when there's no
 * single Cost to complete a lone `costMinor`/`currency` from.
 */
export async function completeInlineCost(
  ownerType: "ACCOMMODATION" | "TRANSPORT",
  ownerId: string,
  patch: InlineCostPatch,
): Promise<InlineCostFields | Failure> {
  if (patch.costMinor === undefined && patch.currency === undefined) return {};
  const existing = await db.cost.findMany({
    where: { ownerType, ownerId, forkId: null },
    select: { costMinor: true, currency: true, paidMinor: true, paidAt: true },
  });
  if (existing.length > 1) {
    return {
      success: false,
      errors: { costMinor: ["This has more than one Cost already. Use update_cost to edit a specific one."] },
    };
  }
  const single = existing[0] ?? null;
  const costMinor = patch.costMinor ?? single?.costMinor;
  const currency = patch.currency ?? single?.currency;
  if (costMinor === undefined || currency === undefined) {
    return {
      success: false,
      errors: { costMinor: ["Pass both costMinor and currency to add or change the Cost, or use add_cost/update_cost."] },
    };
  }
  // A Cost is only "paid" when both its amount and its date are set (same
  // signal every cost dialog uses, `Boolean(cost.paidAt)` alongside a
  // parsed paid amount) — a legacy row with only one of the two forwards
  // neither, same as the dialogs opening with the Paid box unticked.
  const isPaid = single?.paidAt != null && single?.paidMinor != null;
  return {
    costMinor,
    currency,
    paidMinor: isPaid ? (single!.paidMinor as number) : undefined,
    paidAt: isPaid ? (single!.paidAt as Date).toISOString().slice(0, 10) : undefined,
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

export type AccommodationRow = {
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
 * missing row (or a fork-owned one — `forkId: null` scopes to the real
 * plan) reads as `notFound()` (mapped by `runTool` to the same "not found"
 * text a non-member's id gets), checked *before* the access check can even
 * run — membership is then verified before any of the row's values are
 * used.
 */
async function loadAccommodationForPatch(accommodationId: string): Promise<AccommodationRow> {
  const acc = await db.accommodation.findUnique({
    where: { id: accommodationId, forkId: null },
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

export function mergeAccommodationPatch(
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

export type TransportRow = {
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
    where: { id: transportId, forkId: null },
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

type Endpoint = { stopId: string | null; place: string | null; isHome: boolean };
type EndpointPatch = { stopId?: string; place?: string; isHome?: boolean };

/**
 * Merges a patch onto one Transport endpoint (departure or arrival).
 *
 * An endpoint is a Stop, a Stop plus its exact departure/arrival point
 * (`depPlace`/`arrPlace` — the station, airport or pier within that Stop),
 * a point alone, Home, or unset. Unlike the sibling Home flag, a Stop and a
 * point are not either/or: `fromStopId`/`toStopId` and `depPlace`/`arrPlace`
 * can be patched together in one call, or separately, and each follows its
 * own rule:
 *
 * - `isHome: true` is still a tool error alongside a stop or a place, and
 *   alone it still clears both to Home.
 * - `stopId: ""` means "unlink the Stop". Given together with a place, the
 *   result is that place with no Stop. Given alone, the endpoint falls back
 *   to its current place, if it has one.
 * - A non-empty `stopId` given together with a place sets both — an empty
 *   place clears the point while still linking the new Stop.
 * - A non-empty `stopId` given alone keeps the current place when it names
 *   the same Stop as before, and clears it (a stale point for a different
 *   place) when it names a different one.
 * - A `place` given alone keeps the current Stop when the endpoint has one
 *   and isn't Home; otherwise (Home, or no Stop) it sets the point with no
 *   Stop.
 * - `isHome: false` alone keeps whatever stop/place the endpoint already
 *   has.
 * - A patch that touches none of these fields keeps the endpoint exactly
 *   as it was.
 *
 * Any path that would otherwise leave the endpoint with neither a Stop nor
 * a place (and not Home) is a tool error instead of a silently invalid
 * state.
 */
function mergeEndpoint(current: Endpoint, patch: EndpointPatch, fields: { stopField: string; placeField: string; homeField: string; label: string }): Endpoint | Failure {
  const stopGiven = patch.stopId !== undefined;
  const placeGiven = patch.place !== undefined;
  const homeGiven = patch.isHome !== undefined;

  const neitherError = (): Failure => ({
    success: false,
    errors: { [fields.stopField]: [`${fields.label} needs a stop or a place.`] },
  });

  if (homeGiven && patch.isHome && (stopGiven || placeGiven)) {
    return {
      success: false,
      errors: { [fields.homeField]: [`${fields.homeField} can't be true together with ${fields.stopField} or ${fields.placeField}.`] },
    };
  }
  if (homeGiven && patch.isHome) {
    return { stopId: null, place: null, isHome: true };
  }

  if (stopGiven && placeGiven) {
    const stopId = patch.stopId === "" ? null : (patch.stopId as string);
    const place = (patch.place as string) || null;
    if (stopId == null && place == null) return neitherError();
    return { stopId, place, isHome: false };
  }

  if (stopGiven) {
    if (patch.stopId === "") {
      const place = current.place;
      if (place == null) return neitherError();
      return { stopId: null, place, isHome: false };
    }
    const stopId = patch.stopId as string;
    const place = stopId === current.stopId ? current.place : null;
    return { stopId, place, isHome: false };
  }

  if (placeGiven) {
    const place = (patch.place as string) || null;
    const stopId = current.stopId != null && !current.isHome ? current.stopId : null;
    return { stopId, place, isHome: false };
  }

  if (homeGiven) {
    if (current.stopId == null && current.place == null) {
      return { success: false, errors: { [fields.stopField]: [`${fields.label} needs a stop or a place when it isn't Home.`] } };
    }
    return { stopId: current.stopId, place: current.place, isHome: false };
  }

  return { stopId: current.stopId, place: current.place, isHome: current.isHome };
}

export function mergeTransportPatch(
  current: TransportRow,
  patch: TransportPatch,
  inlineCost: InlineCostFields,
): TransportInput | Failure {
  const dep = mergeEndpoint(
    { stopId: current.fromStopId, place: current.depPlace, isHome: current.depIsHome },
    { stopId: patch.fromStopId, place: patch.depPlace, isHome: patch.depIsHome },
    { stopField: "fromStopId", placeField: "depPlace", homeField: "depIsHome", label: "Departure" },
  );
  if (isFailure(dep)) return dep;
  const arr = mergeEndpoint(
    { stopId: current.toStopId, place: current.arrPlace, isHome: current.arrIsHome },
    { stopId: patch.toStopId, place: patch.arrPlace, isHome: patch.arrIsHome },
    { stopField: "toStopId", placeField: "arrPlace", homeField: "arrIsHome", label: "Arrival" },
  );
  if (isFailure(arr)) return arr;

  return {
    mode: (patch.mode ?? current.mode) as TransportInput["mode"],
    fromStopId: dep.stopId ?? undefined,
    toStopId: arr.stopId ?? undefined,
    anchorStopId: patch.anchorStopId ?? current.anchorStopId ?? undefined,
    depIsHome: dep.isHome,
    arrIsHome: arr.isHome,
    depPlace: dep.place ?? undefined,
    arrPlace: arr.place ?? undefined,
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
    where: { id: costId, forkId: null },
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
 * Loads a Cost's `tripId` only, for the `mark_cost_paid`/`mark_cost_unpaid`
 * access check. `markCostPaid`/`markCostUnpaid` do their own lookup too,
 * but on a missing row they return `{ success: false, errors: { _form:
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
 * Merges a patch onto the current Cost row.
 *
 * `costMinor`/`currency`/`ownerType` are required on every `CostRawInput`
 * (no fallback), so they're always forwarded when the patch omits them, or
 * `costSchema`'s parse would fail. `dueDate`, `ownerId`, `label`, `category`
 * are written as `data.X ?? null` — forwarded to avoid nulling. `settlement`
 * has a schema `.default("BEFORE")` that fires whenever the key is absent —
 * forwarded, or every patch would silently reset Settlement to Before.
 *
 * `paidMinor`/`paidAt` aren't part of this tool's input at all (use
 * `mark_cost_paid`/`mark_cost_unpaid`) — every owned-cost dialog resends
 * the current paid pair on every save, currency change included, so this
 * forwards both together whenever the Cost is currently paid (`paidAt` and
 * `paidMinor` both set), regardless of what else the patch changes. A Cost
 * that isn't currently paid (either missing) forwards neither — matching a
 * dialog that opens with the Paid box unticked — which also leaves
 * `updateCost`'s own currency-change clearing rule (P3-3) free to fire,
 * harmlessly, since there was nothing paid to clear.
 *
 * `dueDate` also drops out (like the dialogs: `!form.paid &&
 * !isOnTrip(settlement)`) once the Cost reads as paid or its Settlement is
 * On the trip — neither state has a meaningful Due date. Only the
 * forwarded (current-row) dueDate is cleared silently, as the dialogs do; a
 * dueDate the caller passes in that state is a tool error instead, since
 * dropping it would read as success (final review finding 2).
 */
function mergeCostPatch(current: CostRow, patch: CostPatch): CostRawInput | Failure {
  const isPaid = current.paidAt != null && current.paidMinor != null;
  const settlement = (patch.settlement ?? current.settlement) as CostRawInput["settlement"];
  const noDueDate = isPaid || settlement === "ON_TRIP";
  if (noDueDate && patch.dueDate !== undefined) {
    return {
      success: false,
      errors: {
        dueDate: ["A due date only applies to an unpaid cost paid before the trip. Mark it unpaid or change settlement first, or leave dueDate out."],
      },
    };
  }
  const dueDate = noDueDate ? undefined : (patch.dueDate ?? current.dueDate ?? undefined);
  return {
    costMinor: patch.costMinor ?? current.costMinor,
    currency: patch.currency ?? current.currency,
    ownerType: (patch.ownerType ?? current.ownerType) as CostRawInput["ownerType"],
    ownerId: patch.ownerId ?? current.ownerId ?? undefined,
    label: patch.label ?? current.label ?? undefined,
    category: patch.category ?? current.category ?? undefined,
    dueDate,
    settlement,
    paidMinor: isPaid ? (current.paidMinor as number) : undefined,
    paidAt: isPaid ? (current.paidAt as Date).toISOString().slice(0, 10) : undefined,
  };
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
      runTool("add_accommodation", async () => {
        await requireRealPlanRow("stop", input.stopId);
        return createAccommodation(input as AccommodationInput);
      }),
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
        await requireRealPlanRows([["stop", patch.stopId]]);
        const inlineCost = await completeInlineCost("ACCOMMODATION", accommodationId, patch);
        if (isFailure(inlineCost)) return inlineCost;
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
    ({ accommodationId }) => runTool("delete_accommodation", async () => {
        await requireRealPlanRow("accommodation", accommodationId);
        return deleteAccommodation(accommodationId);
      }),
  );

  server.registerTool(
    "add_transport",
    {
      title: "Add transport",
      description:
        `Adds a Transport leg to a trip. depAt/arrAt are a date and time, e.g. "2026-07-01T08:00". ` +
        "Give fromStopId and depPlace together to link a Stop and name the exact departure point (e.g. a station); same for toStopId/arrPlace. " +
        MONEY_NOTE,
      inputSchema: { tripId: z.string(), ...transportCreateShape },
    },
    ({ tripId, ...rest }) =>
      runTool("add_transport", async () => {
        await requireRealPlanRows([
          ["stop", rest.fromStopId || undefined],
          ["stop", rest.toStopId || undefined],
          ["stop", rest.anchorStopId],
        ]);
        return createTransport(tripId, rest as TransportInput);
      }),
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
      runTool("update_transport", async () => {
        const current = await loadTransportForPatch(transportId);
        await requireRealPlanRows([
          ["stop", patch.fromStopId || undefined],
          ["stop", patch.toStopId || undefined],
          ["stop", patch.anchorStopId],
        ]);
        const inlineCost = await completeInlineCost("TRANSPORT", transportId, patch);
        if (isFailure(inlineCost)) return inlineCost;
        const merged = mergeTransportPatch(current, patch, inlineCost);
        if (isFailure(merged)) return merged;
        return updateTransport(transportId, merged);
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
    ({ transportId }) => runTool("delete_transport", async () => {
        await requireRealPlanRow("transport", transportId);
        return deleteTransport(transportId);
      }),
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
      runTool("add_cost", async () => {
        const kind = realPlanKindForOwner(rest.ownerType);
        if (kind && rest.ownerId) await requireRealPlanRow(kind, rest.ownerId);
        return createCost(tripId, rest as CostRawInput);
      }),
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
        if (patch.ownerType !== undefined || patch.ownerId !== undefined) {
          const ownerType = patch.ownerType ?? current.ownerType;
          const ownerId = patch.ownerId ?? current.ownerId;
          const kind = realPlanKindForOwner(ownerType);
          if (kind && ownerId) await requireRealPlanRow(kind, ownerId);
        }
        const merged = mergeCostPatch(current, patch);
        if (isFailure(merged)) return merged;
        return updateCost(costId, merged);
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
    ({ costId }) => runTool("delete_cost", async () => {
        await requireRealPlanRow("cost", costId);
        return deleteCost(costId);
      }),
  );

  server.registerTool(
    "mark_cost_paid",
    {
      title: "Mark cost paid",
      description: `Marks a Cost paid. ${MONEY_NOTE} paidAt is the date it was paid, YYYY-MM-DD.`,
      inputSchema: { costId: z.string(), paidMinor: z.number().int().min(0), paidAt: isoDate },
    },
    ({ costId, paidMinor, paidAt }) =>
      runTool("mark_cost_paid", async () => {
        await loadCostForMark(costId);
        return markCostPaid(costId, paidMinor, paidAt);
      }),
  );

  server.registerTool(
    "mark_cost_unpaid",
    {
      title: "Mark cost unpaid",
      description: "Un-marks a Cost as paid. The paid amount is kept as history.",
      inputSchema: { costId: z.string() },
    },
    ({ costId }) =>
      runTool("mark_cost_unpaid", async () => {
        await loadCostForMark(costId);
        return markCostUnpaid(costId);
      }),
  );
}
