"use server";

import { notFound } from "next/navigation";
import type { Prisma, Transport } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePlanAccess, requireRowAccess } from "@/lib/guards";
import { layoverSchema, transportSchema, type LayoverInput, type TransportInput } from "@/lib/validations/transport";
import { wallTimeToInstant } from "@/lib/wall-time";
import { resolveEndpointZones } from "@/lib/time-display";
import { endZones } from "@/lib/leg-zones";
import { pointTimezone } from "@/lib/tz-point";
import { isValidTimeZone } from "@/lib/tz";
import { geocodePlaceDetailed } from "@/lib/geocode";
import { pickedPlace, placeForSave, samePlaceText, type SavedPlace } from "@/lib/place-save";
import { auditedUpdate, recordPlanActivity, recordUpdate } from "@/lib/activity-guard";
import { entityLabel } from "@/lib/activity";
import { planScope, type PlanId } from "@/lib/plan-scope";
import { resolveRateForTrip, persistRate } from "@/lib/money/fx";
import { type ActionFailure, type ActionResult, type FieldErrors, validationResult, formFail, fail } from "@/lib/action-result";
import { mergeTransportPatch, type TransportPatch } from "@/lib/transport-patch";
import { completeInlineCost, OWNED_COST_SELECT, type OwnedCostRow } from "@/lib/money/cost-patch";
import { paidCurrencyProblem, storedPaidCurrency } from "@/lib/money/paid-currency";
import { cleanupTargetSideDataTx } from "@/server/actions/target-cleanup";
import { deleteOwnedCostsTx, deleteRefundsProblemTx } from "@/server/actions/owned-costs";
import type { DeleteRefundAnswer } from "@/lib/money/delete-refund";
import { lockPlanTransportsTx } from "@/server/actions/stop-flow";
import { growTripEndTx, tripWindowScopes } from "@/server/actions/trip-window";
import { revalidateTrip } from "@/lib/revalidate";
import { resolveBookingWrite, type BookingFields } from "@/lib/booking-state-patch";
import { transportBookingSubject } from "@/lib/booking-state";
import { TRANSPORT_DETAIL_KEYS, type TransportDetailKey } from "@/lib/transport-details";
import { toPatch } from "@/lib/patch";
import { transportClearable } from "@/lib/transport-clearable";
import { creationAnchor, groupTransportsBySlot, resolveTransportSlot } from "@/lib/transport-anchor";
import { orderPlanStops } from "@/lib/plan-order";
import { isConnection } from "@/lib/connections";

function detailColumns(data: Partial<Record<TransportDetailKey, string | null>>) {
  return Object.fromEntries(TRANSPORT_DETAIL_KEYS.map((k) => [k, data[k] || null])) as Record<TransportDetailKey, string | null>;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type TransportActionResult = ActionResult;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Thin adapter over `requireRowAccess("transport", id)` (lib/guards.ts):
 * loads the Transport (id, tripId, forkId — `ROW_SELECT.transport`), checks
 * trip access, and throws notFound() otherwise. No Surprise check of its own
 * (a Transport is never a Surprise root; CONTEXT.md Surprise — Accommodation
 * and Transport cannot be surprised yet).
 */
async function requireTransportAccess(transportId: string) {
  const { row } = await requireRowAccess("transport", transportId);
  return row;
}

/**
 * If fromStopId or toStopId are provided, verify they belong to `tripId` and the same plan.
 * Returns an error result if validation fails, null if ok.
 */
async function validateStopBelongsToTrip(
  tripId: string,
  stopIds: (string | undefined | null)[],
  forkId?: PlanId,
): Promise<ActionFailure | null> {
  const ids = stopIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return null;

  const targetForkId = forkId ?? null;
  const stops = await db.stop.findMany({
    where: { id: { in: ids }, ...planScope(forkId) },
    select: { id: true, tripId: true, forkId: true },
  });

  for (const id of ids) {
    const stop = stops.find((s) => s.id === id);
    if (!stop || stop.tripId !== tripId || stop.forkId !== targetForkId) {
      return formFail("Selected stop does not belong to this trip");
    }
  }
  return null;
}

type EndsBefore = {
  depPlace: string | null; depLat: number | null; depLng: number | null; depPlaceId: string | null;
  arrPlace: string | null; arrLat: number | null; arrLng: number | null; arrPlaceId: string | null;
  depCountryCode?: string | null; depRegion?: string | null; arrCountryCode?: string | null; arrRegion?: string | null;
};

async function endPlaces(
  data: Pick<TransportInput, "depPlaceId" | "depLat" | "depLng" | "depCountryCode" | "depRegion" | "arrPlaceId" | "arrLat" | "arrLng" | "arrCountryCode" | "arrRegion">,
  text: { depPlace: string | null; arrPlace: string | null },
  before?: EndsBefore,
) {
  const end = (place: string | null, pick: SavedPlace | null, held: { text: string | null; place: SavedPlace } | null) =>
    placeForSave({ text: place, pick: place ? pick : null, before: held, lookUp: geocodePlaceDetailed });
  const [dep, arr] = await Promise.all([
    end(
      text.depPlace,
      pickedPlace({ placeId: data.depPlaceId, lat: data.depLat, lng: data.depLng, countryCode: data.depCountryCode, region: data.depRegion }),
      before ? { text: before.depPlace, place: { lat: before.depLat, lng: before.depLng, countryCode: before.depCountryCode ?? null, region: before.depRegion ?? null, placeId: before.depPlaceId } } : null,
    ),
    end(
      text.arrPlace,
      pickedPlace({ placeId: data.arrPlaceId, lat: data.arrLat, lng: data.arrLng, countryCode: data.arrCountryCode, region: data.arrRegion }),
      before ? { text: before.arrPlace, place: { lat: before.arrLat, lng: before.arrLng, countryCode: before.arrCountryCode ?? null, region: before.arrRegion ?? null, placeId: before.arrPlaceId } } : null,
    ),
  ]);
  return {
    depLat: dep.place.lat, depLng: dep.place.lng, depPlaceId: dep.place.placeId,
    arrLat: arr.place.lat, arrLng: arr.place.lng, arrPlaceId: arr.place.placeId,
    depCountryCode: dep.place.countryCode, depRegion: dep.place.region,
    arrCountryCode: arr.place.countryCode, arrRegion: arr.place.region,
  };
}

type EndKinds = { fromStopId: string | null; toStopId: string | null; depIsHome: boolean; arrIsHome: boolean };
type EndCoords = { depLat: number | null; depLng: number | null; arrLat: number | null; arrLng: number | null };
type HeldEnds = Partial<EndKinds & EndCoords & {
  depPlace: string | null; arrPlace: string | null; depTimezone: string | null; arrTimezone: string | null;
}>;
type SentEnds = { depPlace: string | null; arrPlace: string | null; depPick: SavedPlace | null; arrPick: SavedPlace | null };

const sameCoord = (a: number | null | undefined, b: number | null) =>
  a == null || b == null ? a == null && b == null : Math.round(a * 1e5) === Math.round(b * 1e5);

type HeldEnd = { wasPlace: boolean; text?: string | null; lat?: number | null; lng?: number | null; zone?: string | null };
type SentEnd = { text: string | null; pick: SavedPlace | null };

// "Its place changed" is read from what the save sends, never from what a lookup
// resolved: a legacy row's time must read where it always has until then.
function placeEndZone(isPlace: boolean, lat: number | null, lng: number | null, held?: HeldEnd, sent?: SentEnd): string | null {
  if (!isPlace) return null;
  if (!held?.wasPlace || !sent) return pointTimezone(lat, lng);
  const changed = sent.pick
    ? !sameCoord(held.lat, sent.pick.lat) || !sameCoord(held.lng, sent.pick.lng)
    : !samePlaceText(held.text, sent.text);
  return changed ? pointTimezone(lat, lng) : (held.zone ?? null);
}

function placeEndZones(ends: EndKinds, coords: EndCoords, before?: HeldEnds, sent?: SentEnds) {
  return {
    depTimezone: placeEndZone(
      !ends.fromStopId && !ends.depIsHome, coords.depLat, coords.depLng,
      before && { wasPlace: !before.fromStopId && !before.depIsHome, text: before.depPlace, lat: before.depLat, lng: before.depLng, zone: before.depTimezone },
      sent && { text: sent.depPlace, pick: sent.depPick },
    ),
    arrTimezone: placeEndZone(
      !ends.toStopId && !ends.arrIsHome, coords.arrLat, coords.arrLng,
      before && { wasPlace: !before.toStopId && !before.arrIsHome, text: before.arrPlace, lat: before.arrLat, lng: before.arrLng, zone: before.arrTimezone },
      sent && { text: sent.arrPlace, pick: sent.arrPick },
    ),
  };
}

type PlaceZones = { depTimezone: string | null; arrTimezone: string | null };
type RowEnds = EndKinds & { anchorStopId: string | null; depPlace: string | null; arrPlace: string | null };
type EndPlaceColumns = Awaited<ReturnType<typeof endPlaces>>;

// Interpret wall-time strings in the endpoint Stop's timezone, or the
// Trip's Home timezone for a Home end (P0-1; home-timezone-departure-points).
async function wallZones(tripId: string, ends: EndKinds) {
  const endpointIds = [ends.fromStopId, ends.toStopId].filter((v): v is string => v !== null);
  const endpointStops = endpointIds.length
    ? await db.stop.findMany({ where: { id: { in: endpointIds } }, select: { id: true, timezone: true } })
    : [];
  const tzOf = (id: string | null | undefined) =>
    id ? endpointStops.find((s) => s.id === id)?.timezone ?? null : null;
  const home = ends.depIsHome || ends.arrIsHome
    ? await db.trip.findUnique({ where: { id: tripId }, select: { homeTimezone: true } })
    : null;
  return (zones: PlaceZones) => {
    const { fromTimezone, toTimezone } = endZones({ fromStopId: ends.fromStopId, toStopId: ends.toStopId, ...zones }, tzOf);
    return resolveEndpointZones(fromTimezone, toTimezone, {
      depIsHome: ends.depIsHome,
      arrIsHome: ends.arrIsHome,
      homeTimezone: home?.homeTimezone ?? null,
    });
  };
}

function rowColumns(
  data: Pick<TransportInput, "mode" | "notes"> & { reference?: string | null } & Partial<Record<TransportDetailKey, string | null>>,
  ends: RowEnds,
  times: { depAt: Date | null; arrAt: Date | null },
  places: EndPlaceColumns,
  zones: PlaceZones,
  booking: BookingFields,
) {
  return {
    mode: data.mode,
    depIsHome: ends.depIsHome,
    arrIsHome: ends.arrIsHome,
    fromStopId: ends.fromStopId,
    toStopId: ends.toStopId,
    anchorStopId: ends.anchorStopId,
    depPlace: ends.depPlace,
    depAt: times.depAt,
    arrPlace: ends.arrPlace,
    arrAt: times.arrAt,
    reference: data.reference ?? null,
    ...detailColumns(data),
    notes: data.notes ?? null,
    ...places,
    ...zones,
    ...booking,
  };
}

type PreparedRow = { columns: ReturnType<typeof rowColumns>; readZones: Awaited<ReturnType<typeof wallZones>> };
type PreparedUpdate = PreparedRow & { data: TransportInput; owned: OwnedCostRow[] };

async function prepareCreateRow(
  tripId: string,
  plan: PlanId,
  data: TransportInput,
  importZones?: { depTimezone?: string; arrTimezone?: string },
): Promise<ActionFailure | PreparedRow> {
  // CONTEXT.md "Booking state": stored as the effective state (a reference implies Booked).
  const booking = resolveBookingWrite(transportBookingSubject(data.mode), null, { bookingState: data.bookingState, bookBy: data.bookBy }, data.reference);
  if ("success" in booking) return booking;

  const paidCurrency = createdPaidCurrency(data);
  if (paidCurrency != null) {
    const trip = await db.trip.findUnique({ where: { id: tripId }, select: { homeCurrency: true } });
    const problem = trip && paidCurrencyProblem(paidCurrency, { currency: data.currency!, storedPaidCurrency: null }, trip.homeCurrency);
    if (problem) return fail({ paidCurrency: [problem] });
  }

  // Normalise home-base flags: a home endpoint owns no stop and no free-text
  // place. Its coordinates resolve from the trip at read time.
  const depIsHome = data.depIsHome ?? false;
  const arrIsHome = data.arrIsHome ?? false;
  const depPlace = depIsHome ? null : (data.depPlace || null);
  const arrPlace = arrIsHome ? null : (data.arrPlace || null);

  // Normalise empty stop IDs to null (also cleared when home flag is set)
  const fromStopId = depIsHome ? null : (data.fromStopId || null);
  const toStopId = arrIsHome ? null : (data.toStopId || null);
  const anchorStopId = data.anchorStopId || null;

  // Validate stop ownership (same plan)
  const stopError = await validateStopBelongsToTrip(tripId, [fromStopId, toStopId, anchorStopId], plan);
  if (stopError) return stopError;

  const kinds = { fromStopId, toStopId, depIsHome, arrIsHome };
  const readZones = await wallZones(tripId, kinds);
  // Home endpoints are not looked up — coords resolve from the trip at read time.
  const ends = await endPlaces(data, { depPlace, arrPlace });
  const pointZones = placeEndZones(kinds, ends);
  // The booking import's country zone for a place it could not find: a guess, but it shows the time on the ticket.
  const importZone = (isPlace: boolean, zone: unknown) => (isPlace && typeof zone === "string" && isValidTimeZone(zone) ? zone : null);
  const zones = {
    depTimezone: pointZones.depTimezone ?? importZone(!fromStopId && !depIsHome, importZones?.depTimezone),
    arrTimezone: pointZones.arrTimezone ?? importZone(!toStopId && !arrIsHome, importZones?.arrTimezone),
  };
  const { depTz, arrTz } = readZones(zones);
  const times = { depAt: wallTimeToInstant(data.depAt, depTz), arrAt: wallTimeToInstant(data.arrAt, arrTz) };
  return { columns: rowColumns(data, { ...kinds, anchorStopId, depPlace, arrPlace }, times, ends, zones, booking), readZones };
}

async function prepareUpdateRow(
  transport: { tripId: string; forkId: string | null },
  before: Transport,
  patch: TransportPatch,
): Promise<ActionFailure | PreparedUpdate> {
  const merged = mergeTransportPatch(before, patch);
  if ("success" in merged) return merged;
  const touchesCost = patch.costMinor != null || patch.currency != null;
  const owned = touchesCost
    ? await db.cost.findMany({ where: { ownerType: "TRANSPORT", ownerId: before.id }, select: OWNED_COST_SELECT })
    : [];
  const trip = touchesCost ? await db.trip.findUnique({ where: { id: transport.tripId }, select: { homeCurrency: true } }) : null;
  const inlineCost = completeInlineCost(patch, owned, trip?.homeCurrency ?? null);
  if (inlineCost && "success" in inlineCost) return inlineCost;

  // The booking fields aren't endpoint rules (lib/transport-patch.ts): validated here, merged by resolveBookingWrite.
  const parsed = transportSchema.safeParse({
    ...merged,
    ...inlineCost,
    bookingState: patch.bookingState ?? undefined,
    bookBy: patch.bookBy ?? undefined,
    // A picked end (lib/place-save.ts) isn't an endpoint rule either; nothing is merged from the row.
    depPlaceId: patch.depPlaceId ?? undefined, depLat: patch.depLat ?? undefined, depLng: patch.depLng ?? undefined,
    arrPlaceId: patch.arrPlaceId ?? undefined, arrLat: patch.arrLat ?? undefined, arrLng: patch.arrLng ?? undefined,
    depCountryCode: patch.depCountryCode ?? undefined, depRegion: patch.depRegion ?? undefined,
    arrCountryCode: patch.arrCountryCode ?? undefined, arrRegion: patch.arrRegion ?? undefined,
  });
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const data = parsed.data;
  const paidCurrencyBreak = trip && paidCurrencyProblem(
    data.paidCurrency ?? null,
    { currency: data.currency!, storedPaidCurrency: owned[0]?.paidCurrency ?? null },
    trip.homeCurrency,
  );
  if (paidCurrencyBreak) return fail({ paidCurrency: [paidCurrencyBreak] });
  // The subject follows the mode AFTER the write, so a mode change on an
  // unchosen leg re-derives its state (a drive needs no booking).
  const booking = resolveBookingWrite(
    transportBookingSubject(data.mode),
    before,
    { bookingState: patch.bookingState, bookBy: patch.bookBy },
    data.reference,
  );
  if ("success" in booking) return booking;

  // A home endpoint owns no stop; the merge keeps only a point it already held.
  const depIsHome = data.depIsHome ?? false;
  const arrIsHome = data.arrIsHome ?? false;
  const depPlace = data.depPlace || null;
  const arrPlace = data.arrPlace || null;

  // Normalise empty stop IDs to null (also cleared when home flag is set)
  const fromStopId = depIsHome ? null : (data.fromStopId || null);
  const toStopId = arrIsHome ? null : (data.toStopId || null);
  const anchorStopId = data.anchorStopId || null;

  const stopError = await validateStopBelongsToTrip(
    transport.tripId,
    [fromStopId, toStopId, anchorStopId],
    transport.forkId,
  );
  if (stopError) return stopError;

  const kinds = { fromStopId, toStopId, depIsHome, arrIsHome };
  const readZones = await wallZones(transport.tripId, kinds);
  // Home endpoints are not looked up — coords resolve from the trip at read time.
  const ends = await endPlaces(data, { depPlace, arrPlace }, before);
  const zones = placeEndZones(kinds, ends, before, {
    depPlace,
    arrPlace,
    depPick: depPlace ? pickedPlace({ placeId: data.depPlaceId, lat: data.depLat, lng: data.depLng }) : null,
    arrPick: arrPlace ? pickedPlace({ placeId: data.arrPlaceId, lat: data.arrLat, lng: data.arrLng }) : null,
  });
  const { depTz, arrTz } = readZones(zones);
  const times = { depAt: wallTimeToInstant(data.depAt, depTz), arrAt: wallTimeToInstant(data.arrAt, arrTz) };
  return { columns: rowColumns(data, { ...kinds, anchorStopId, depPlace, arrPlace }, times, ends, zones, booking), readZones, data, owned };
}

type InlineCostFields = Pick<TransportInput, "costMinor" | "currency" | "paidMinor" | "paidAt" | "paidCurrency" | "settlement">;
type InlineCostRate = Awaited<ReturnType<typeof resolveRateForTrip>>;

// Resolve the FX rate BEFORE opening a transaction (network must not hold a
// DB transaction open — ADR 0007).
async function inlineCostRate(tripId: string, data: InlineCostFields): Promise<InlineCostRate | null> {
  if (data.costMinor === undefined || !data.currency) return null;
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { homeCurrency: true },
  });
  return trip ? resolveRateForTrip(tripId, data.currency, trip.homeCurrency, { db }) : null;
}

function createdPaidCurrency(data: InlineCostFields): string | null {
  return data.costMinor !== undefined && data.currency && data.paidMinor != null ? storedPaidCurrency(data.paidCurrency, data.currency) : null;
}

async function writeInlineCostTx(
  tx: Prisma.TransactionClient,
  cost: { tripId: string; plan: PlanId; ownerId: string; data: InlineCostFields; existing: readonly OwnedCostRow[]; rate: InlineCostRate },
) {
  const { tripId, plan, ownerId, data, existing, rate } = cost;
  if (rate.persist) {
    await persistRate(tx, tripId, rate.persist);
  }
  if (existing.length === 0) {
    const paidCurrency = createdPaidCurrency(data);
    await tx.cost.create({
      data: {
        tripId,
        forkId: plan,
        ownerType: "TRANSPORT",
        ownerId,
        costMinor: data.costMinor!,
        paidMinor: data.paidMinor ?? null,
        ...(paidCurrency != null && { paidCurrency }),
        currency: data.currency!,
        rateToHome: rate.rate,
        paidAt: data.paidAt ? new Date(data.paidAt) : null,
        label: null,
        category: null,
        settlement: data.settlement ?? "BEFORE",
      },
    });
  } else {
    // exactly 1 existing cost. paidMinor is included only when the
    // caller actually provided a value — un-ticking Paid sends
    // paidMinor: undefined (never null) so the paid amount survives
    // as history (CONTEXT.md "Paid"); omitting the key here leaves
    // Prisma's existing value untouched instead of nulling it out.
    await tx.cost.update({
      where: { id: existing[0].id },
      data: {
        costMinor: data.costMinor!,
        currency: data.currency!,
        rateToHome: rate.rate,
        paidAt: data.paidAt ? new Date(data.paidAt) : null,
        ...(data.paidMinor !== undefined && { paidMinor: data.paidMinor }),
        ...(data.paidCurrency !== undefined && { paidCurrency: data.paidCurrency }),
        ...(data.settlement !== undefined && { settlement: data.settlement }),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new transport for a trip.
 *
 * sortOrder = max existing + 1.
 * If fromStopId/toStopId are provided they must belong to the same trip.
 */
export async function createTransport(
  tripId: string,
  input: TransportInput,
  forkId?: PlanId,
  importZones?: { depTimezone?: string; arrTimezone?: string },
): Promise<ActionResult<{ id: string }>> {
  const { plan } = await requirePlanAccess(tripId, forkId);

  const parsed = transportSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const data = parsed.data;
  const row = await prepareCreateRow(tripId, plan, data, importZones);
  if ("success" in row) return row;

  // Determine sort order
  const maxTransport = await db.transport.findFirst({
    where: { tripId, ...planScope(plan) },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxTransport?.sortOrder ?? -1) + 1;

  const created = await db.transport.create({
    data: { tripId, forkId: plan, ...row.columns, sortOrder },
  });
  // F4: a dated return leg can push the soft end to the day it lands home
  // (real plan only; never shrinks — the helper's write is conditional).
  const grownTo = await growTripEndTx(db, tripId, plan);

  // If an inline cost was supplied, create a single transport-owned Cost.
  const rate = await inlineCostRate(tripId, data);
  if (rate) {
    await db.$transaction((tx) => writeInlineCostTx(tx, { tripId, plan, ownerId: created.id, data, existing: [], rate }));
  }

  await recordPlanActivity(plan, { tripId, verb: "CREATED", entityType: "TRANSPORT", entityId: created.id, entityLabel: entityLabel("TRANSPORT", created) });
  revalidateTrip(tripId, "plan", "money", ...tripWindowScopes(grownTo));
  return { success: true, id: created.id };
}

/**
 * Update a Transport (PATCH, ADR 0075): merges onto the held row
 * (`lib/transport-patch.ts` — the endpoint rules); an inline Cost completes
 * from its single owned Cost.
 *
 * Looks up the transport → requireTripAccess(transport.tripId).
 */
export async function updateTransport(
  transportId: string,
  patch: TransportPatch,
): Promise<TransportActionResult> {
  const transport = await requireTransportAccess(transportId);
  const before = await db.transport.findUnique({ where: { id: transportId } });
  if (!before) notFound();

  const row = await prepareUpdateRow(transport, before, patch);
  if ("success" in row) return row;

  await auditedUpdate("TRANSPORT", db.transport, transportId, row.columns, transport.forkId ?? null, { before });
  // F4: re-dating (or re-homing) a leg can push the soft end to the day it lands home.
  const grownTo = await growTripEndTx(db, transport.tripId, transport.forkId ?? null);

  // Inline cost management:
  // 0 existing costs + amount provided → create
  // 1 existing cost + amount provided → update it
  // >1 existing costs → refused above (completeInlineCost); CostEditor is authoritative
  // No amount provided → skip
  if (row.owned.length <= 1) {
    const rate = await inlineCostRate(transport.tripId, row.data);
    if (rate) {
      await db.$transaction((tx) =>
        writeInlineCostTx(tx, { tripId: transport.tripId, plan: transport.forkId ?? null, ownerId: transportId, data: row.data, existing: row.owned, rate }),
      );
    }
  }

  revalidateTrip(transport.tripId, "plan", "money", ...tripWindowScopes(grownTo));
  return { success: true };
}

const DAY_MS = 24 * 60 * 60 * 1000;

const PLACE_KEYS = new Set(["place", "placeId", "lat", "lng"]);
const LAYOVER_REFUSED = "This transport can't take a layover.";

async function inConnection(before: Transport, plan: PlanId) {
  const others = await db.transport.findMany({
    where: { tripId: before.tripId, ...planScope(plan), id: { not: before.id } },
    select: {
      id: true, mode: true, depPlace: true, arrPlace: true, depPlaceId: true, arrPlaceId: true, depAt: true, arrAt: true,
      fromStopId: true, toStopId: true, depIsHome: true, arrIsHome: true, reference: true,
    },
  });
  return others.some((other) => isConnection(before, other) || isConnection(other, before));
}

function layoverFieldRefusal(errors: FieldErrors, stopover: string): ActionFailure {
  return fail(Object.fromEntries(Object.entries(errors).map(([key, messages]) =>
    PLACE_KEYS.has(key)
      ? ["layoverPlace", [`Add where the ${stopover} is.`]]
      : [`layover${key[0].toUpperCase()}${key.slice(1)}`, messages],
  )));
}

function layoverTimeRefusals(
  stopover: string,
  t: { departs: Date | null; lands: Date | null; leaves: Date | null; arrives: Date | null },
): FieldErrors | null {
  const landAt = !t.lands
    ? (stopover === "layover" ? "Add when you land." : "Add when you arrive there.")
    : t.departs && t.lands <= t.departs ? "Landing must be after you depart."
    : null;
  const leaveAt = !t.leaves
    ? "Add when you leave."
    : t.lands && t.leaves < t.lands ? "You can't leave before you land."
    : t.arrives && t.arrives <= t.leaves ? `Arriving must be after you leave the ${stopover}.`
    : t.lands && t.leaves.getTime() - t.lands.getTime() >= DAY_MS ? "A layover is under a day. For a longer stay, add a Stop."
    : null;
  if (!landAt && !leaveAt) return null;
  return { ...(landAt && { layoverLandAt: [landAt] }), ...(leaveAt && { layoverLeaveAt: [leaveAt] }) };
}

async function planStopsInOrder(tripId: string, plan: PlanId) {
  return orderPlanStops(
    await db.stop.findMany({
      where: { tripId, ...planScope(plan) },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true, arriveDate: true, departDate: true },
    }),
  );
}

function sortOrdersAfter(slotRows: readonly { id: string; sortOrder: number }[], firstId: string) {
  const at = slotRows.findIndex((r) => r.id === firstId);
  const second = slotRows[at].sortOrder + 1;
  const moved: { id: string; sortOrder: number }[] = [];
  let previous = second;
  for (const row of slotRows.slice(at + 1)) {
    const sortOrder = Math.max(row.sortOrder, previous + 1);
    if (sortOrder !== row.sortOrder) moved.push({ id: row.id, sortOrder });
    previous = sortOrder;
  }
  return { second, moved };
}

async function layoverTarget(target: { tripId: string; forkId?: string } | { transportId: string }) {
  if ("tripId" in target) {
    const { plan } = await requirePlanAccess(target.tripId, target.forkId);
    return { tripId: target.tripId, plan, held: null };
  }
  const transport = await requireTransportAccess(target.transportId);
  const before = await db.transport.findUnique({ where: { id: target.transportId } });
  if (!before) notFound();
  return { tripId: transport.tripId, plan: transport.forkId ?? null, held: { transport, before } };
}

async function prepareSecondRow(
  tripId: string,
  plan: PlanId,
  journey: TransportInput,
  layover: LayoverInput,
  first: PreparedRow,
  before: Transport | null,
): Promise<ActionFailure | PreparedRow> {
  const arrIsHome = journey.arrIsHome ?? false;
  const ends: RowEnds = {
    fromStopId: null,
    depIsHome: false,
    depPlace: first.columns.arrPlace,
    toStopId: arrIsHome ? null : (journey.toStopId || null),
    arrIsHome,
    arrPlace: arrIsHome ? null : (journey.arrPlace || null),
    anchorStopId: first.columns.anchorStopId,
  };
  const stopError = await validateStopBelongsToTrip(tripId, [ends.toStopId], plan);
  if (stopError) return stopError;

  const readZones = await wallZones(tripId, ends);
  // An edit hands the journey's arrival end over from the edited row: held as that row held it.
  const heldArrival = before && { ...before, depPlace: null, depLat: null, depLng: null, depPlaceId: null };
  const resolved = await endPlaces(
    { ...journey, depPlaceId: undefined, depLat: undefined, depLng: undefined },
    { depPlace: null, arrPlace: ends.arrPlace },
    heldArrival ?? undefined,
  );
  const { arrTimezone } = placeEndZones(ends, resolved, heldArrival ?? undefined, heldArrival ? {
    depPlace: null,
    arrPlace: ends.arrPlace,
    depPick: null,
    arrPick: ends.arrPlace ? pickedPlace({ placeId: journey.arrPlaceId, lat: journey.arrLat, lng: journey.arrLng }) : null,
  } : undefined);
  const places = {
    ...resolved,
    depLat: first.columns.arrLat,
    depLng: first.columns.arrLng,
    depPlaceId: first.columns.arrPlaceId,
    depCountryCode: first.columns.arrCountryCode,
    depRegion: first.columns.arrRegion,
  };
  const zones = { depTimezone: first.columns.arrTimezone, arrTimezone };
  const { depTz, arrTz } = readZones(zones);
  const { mode, reference, carrier, bookingState, bookingStateSet, bookBy } = first.columns;
  const times = { depAt: wallTimeToInstant(layover.leaveAt, depTz), arrAt: wallTimeToInstant(journey.arrAt, arrTz) };
  const details = { carrier, serviceNumber: layover.serviceNumber, seat: layover.seat };
  return {
    columns: rowColumns({ mode, reference, ...details }, ends, times, places, zones, { bookingState, bookingStateSet, bookBy }),
    readZones,
  };
}

// A layover the map cannot find gets the zone its first row's arrival would
// borrow anyway, stored on both ends so both times read, check and show in one zone.
async function zoneForUnfoundLayover(tripId: string, first: PreparedRow, second: PreparedRow) {
  const journeyZones = await wallZones(tripId, {
    fromStopId: first.columns.fromStopId,
    toStopId: second.columns.toStopId,
    depIsHome: first.columns.depIsHome,
    arrIsHome: second.columns.arrIsHome,
  });
  return journeyZones({ depTimezone: first.columns.depTimezone, arrTimezone: second.columns.arrTimezone }).depTz;
}

function rezoned<R extends PreparedRow>(
  row: R,
  zone: Partial<PlaceZones>,
  depWall: TransportInput["depAt"],
  arrWall: TransportInput["arrAt"],
): R {
  const zones = { depTimezone: row.columns.depTimezone, arrTimezone: row.columns.arrTimezone, ...zone };
  const { depTz, arrTz } = row.readZones(zones);
  return {
    ...row,
    columns: { ...row.columns, ...zones, depAt: wallTimeToInstant(depWall, depTz), arrAt: wallTimeToInstant(arrWall, arrTz) },
  };
}

export async function saveTransportWithLayover(
  target: { tripId: string; forkId?: string } | { transportId: string },
  input: TransportInput,
  layover: LayoverInput,
): Promise<ActionResult<{ firstId: string; secondId: string }>> {
  const { tripId, plan, held } = await layoverTarget(target);

  const parsed = transportSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const journey = parsed.data;
  if (journey.mode === "CAR" || (held && (await inConnection(held.before, plan)))) return formFail(LAYOVER_REFUSED);
  const stopover = journey.mode === "FLIGHT" ? "layover" : "change";
  const parsedLayover = layoverSchema.safeParse(layover);
  if (!parsedLayover.success) return layoverFieldRefusal(validationResult(parsedLayover.error).errors, stopover);
  const stop = parsedLayover.data;

  if (journey.anchorStopId) {
    const anchorError = await validateStopBelongsToTrip(tripId, [journey.anchorStopId], plan);
    if (anchorError) return anchorError;
  }
  const orderedStops = await planStopsInOrder(tripId, plan);
  const anchorStopId = creationAnchor({
    anchorStopId: journey.anchorStopId || null,
    fromStopId: journey.depIsHome ? null : journey.fromStopId || null,
    toStopId: journey.arrIsHome ? null : journey.toStopId || null,
  }, orderedStops) ?? undefined;

  const pick = pickedPlace({ placeId: stop.placeId, lat: stop.lat, lng: stop.lng });
  const firstInput: TransportInput = {
    ...journey,
    anchorStopId,
    toStopId: undefined,
    arrIsHome: false,
    arrPlace: stop.place,
    arrPlaceId: pick ? stop.placeId : undefined,
    arrLat: pick ? stop.lat : undefined,
    arrLng: pick ? stop.lng : undefined,
    arrCountryCode: undefined,
    arrRegion: undefined,
    arrAt: stop.landAt,
  };
  let first: ActionFailure | PreparedUpdate = held
    ? await prepareUpdateRow(held.transport, held.before, toPatch(firstInput, transportClearable(firstInput)))
    : await prepareCreateRow(tripId, plan, firstInput).then((row) => ("success" in row ? row : { ...row, data: firstInput, owned: [] }));
  if ("success" in first) return first;
  const prepared = await prepareSecondRow(tripId, plan, journey, stop, first, held?.before ?? null);
  if ("success" in prepared) return prepared;
  let second: PreparedRow = prepared;
  if (!first.columns.arrTimezone) {
    const guess = await zoneForUnfoundLayover(tripId, first, second);
    first = rezoned(first, { arrTimezone: guess }, first.data.depAt, first.data.arrAt);
    second = rezoned(second, { depTimezone: guess }, stop.leaveAt, journey.arrAt);
  }

  const refusals = layoverTimeRefusals(stopover, {
    departs: first.columns.depAt,
    lands: first.columns.arrAt,
    leaves: second.columns.depAt,
    arrives: second.columns.arrAt,
  });
  if (refusals) return fail(refusals);

  const rate = first.owned.length <= 1 ? await inlineCostRate(tripId, first.data) : null;

  // Activity rows are written outside this transaction, so they wait for it to commit.
  const saved = await db.$transaction(async (tx) => {
    const locked = await lockPlanTransportsTx(tx, tripId, plan);
    let firstRow: Transport;
    if (held) {
      firstRow = await tx.transport.update({ where: { id: held.before.id }, data: first.columns });
    } else {
      const sortOrder = Math.max(-1, ...locked.map((r) => r.sortOrder)) + 1;
      firstRow = await tx.transport.create({ data: { tripId, forkId: plan, ...first.columns, sortOrder } });
    }
    const planRows = await tx.transport.findMany({
      where: { tripId, ...planScope(plan) },
      select: { id: true, anchorStopId: true, fromStopId: true, toStopId: true, sortOrder: true },
    });
    const slotRows = groupTransportsBySlot(planRows, orderedStops).get(resolveTransportSlot(firstRow, orderedStops)) ?? [];
    const order = sortOrdersAfter(slotRows, firstRow.id);
    for (const row of order.moved) {
      await tx.transport.update({ where: { id: row.id }, data: { sortOrder: row.sortOrder } });
    }
    const secondRow = await tx.transport.create({
      data: { tripId, forkId: plan, ...second.columns, nothingToAttach: firstRow.nothingToAttach, sortOrder: order.second },
    });
    if (rate) await writeInlineCostTx(tx, { tripId, plan, ownerId: firstRow.id, data: first.data, existing: first.owned, rate });
    const grownTo = await growTripEndTx(tx, tripId, plan);
    return { firstRow, secondRow, grownTo };
  });

  const { firstRow, secondRow, grownTo } = saved;
  if (held) await recordUpdate("TRANSPORT", { tripId, plan, entityId: firstRow.id, before: held.before, after: firstRow });
  else await recordPlanActivity(plan, { tripId, verb: "CREATED", entityType: "TRANSPORT", entityId: firstRow.id, entityLabel: entityLabel("TRANSPORT", firstRow) });
  await recordPlanActivity(plan, { tripId, verb: "CREATED", entityType: "TRANSPORT", entityId: secondRow.id, entityLabel: entityLabel("TRANSPORT", secondRow) });
  revalidateTrip(tripId, "plan", "money", ...tripWindowScopes(grownTo));
  return { success: true, firstId: firstRow.id, secondId: secondRow.id };
}

/**
 * Reorder transport legs — update anchorStopId + sortOrder for each item.
 * Verifies every leg belongs to tripId within planScope(forkId) before writing.
 */
export async function reorderTransports(
  tripId: string,
  items: { id: string; anchorStopId: string | null; sortOrder: number }[],
  forkId?: PlanId,
): Promise<TransportActionResult> {
  const { plan } = await requirePlanAccess(tripId, forkId);
  if (items.length === 0) return { success: true };

  // Verify all ids belong to this trip + plan before opening a transaction.
  const ids = items.map((i) => i.id);
  const rows = await db.transport.findMany({
    where: { id: { in: ids }, tripId, ...planScope(plan) },
    select: { id: true },
  });
  const foundIds = new Set(rows.map((r) => r.id));
  for (const id of ids) {
    if (!foundIds.has(id)) {
      return { success: false, errors: { id: ["One or more transport legs aren't part of this trip."] } };
    }
  }

  await db.$transaction(async (tx) => {
    // Lock the WHOLE plan's transports FOR UPDATE, in canonical id order
    // (ADR 0007) — previously this path took no lock at all.
    await lockPlanTransportsTx(tx, tripId, plan);

    for (const item of items) {
      await (tx as typeof db).transport.update({
        where: { id: item.id },
        data: { anchorStopId: item.anchorStopId, sortOrder: item.sortOrder },
      });
    }
  });

  revalidateTrip(tripId, "plan");
  return { success: true };
}

/**
 * Delete a transport.
 */
export async function deleteTransport(
  transportId: string,
  refunds?: readonly DeleteRefundAnswer[],
): Promise<TransportActionResult> {
  const transport = await requireTransportAccess(transportId);

  const doomed = await db.transport.findUnique({ where: { id: transportId } });
  const ownerLabel = entityLabel("TRANSPORT", doomed ?? {});

  // cleanupTargetSideDataTx schedules attachment blobs for retention inside
  // this same transaction (ARCH-DAT-3) — no post-commit blob call needed.
  const owner = { type: "TRANSPORT", id: transportId, label: ownerLabel } as const;
  const refused = await db.$transaction(async (tx) => {
    const problem = await deleteRefundsProblemTx(tx, transport.tripId, owner, refunds);
    if (problem) return problem;
    await tx.transport.delete({ where: { id: transportId } });
    await deleteOwnedCostsTx(tx, transport.tripId, [owner], refunds);
    await cleanupTargetSideDataTx(tx, transport.tripId, "TRANSPORT", transportId);
    return null;
  });
  if (refused) return formFail(refused);

  await recordPlanActivity(transport.forkId, { tripId: transport.tripId, verb: "DELETED", entityType: "TRANSPORT", entityId: transportId, entityLabel: ownerLabel });

  revalidateTrip(transport.tripId, "plan");
  return { success: true };
}
