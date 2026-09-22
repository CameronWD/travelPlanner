"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { stopSchema, type StopInput } from "@/lib/validations/stop";
import { geocodePlaceDetailed } from "@/lib/geocode";
import { flowDates, computeProjectedEnd, planTripFirmUp, type FlowConflict } from "@/lib/firm-up";
import { nightsBetween, formatLongDate, addDays } from "@/lib/dates";
import { type PayloadShiftResult } from "@/lib/payload-shift";
import { recordPlanActivity } from "@/lib/activity-guard";
import { entityLabel, describeChanges } from "@/lib/activity";
import { planScope, type PlanId } from "@/lib/plan-scope";
import { insertionOrder, collisionPush } from "@/lib/reorder";
import { compareScheduled, orderPlanStops } from "@/lib/plan-order";
import { chapterSpan } from "@/lib/chapter-span";
import { type ActionResult, validationResult } from "@/lib/action-result";
import { cleanupTargetSideDataTx, deleteBlobsBestEffort } from "@/server/actions/target-cleanup";
import { deleteOwnedCostsTx } from "@/server/actions/owned-costs";
import { recomputeChapterSpans, shiftStopPayloadTx, reflowSpanTx, lockPlanStopsTx } from "@/server/actions/stop-flow";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type StopActionResult = ActionResult<{
  conflicts?: FlowConflict[];
  changed?: { id: string; arriveDate: string; departDate: string }[];
  payload?: PayloadShiftResult;
}>;

/** Richer result returned by reorderStops (and reorderChapters) — includes
 *  the reflow payload so Task 10 can build the "X stops shifted" undo toast. */
export type ReorderResult =
  | {
      success: true;
      /** Stops whose arrive/departDate changed as a result of the reflow. */
      changed: { id: string; arriveDate: string; departDate: string }[];
      /** Pin-infeasibility conflicts (the pin stays fixed; caller may show a warning). */
      conflicts: FlowConflict[];
      /** ADR 0038: payload (Item/Accommodation) shifts riding along the re-dated stops, for Undo. */
      payload?: PayloadShiftResult;
    }
  | { success: false; errors: Record<string, string[]> };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up a stop and verify the current user has access to its trip.
 * Returns the stop (with its tripId and extra fields) or throws notFound().
 */
async function requireStopAccess(stopId: string): Promise<{
  id: string;
  tripId: string;
  sortOrder: number;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
  pinned: boolean;
  forkId: string | null;
}> {
  const stop = await db.stop.findUnique({
    where: { id: stopId },
    select: {
      id: true,
      tripId: true,
      sortOrder: true,
      arriveDate: true,
      departDate: true,
      nights: true,
      pinned: true,
      forkId: true,
    },
  });
  if (!stop) {
    notFound();
  }
  // Also verify the user is a member of the trip
  await requireTripAccess(stop.tripId);
  return stop;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new stop in the given trip.
 *
 * Handles both rough and scheduled modes.
 * For scheduled stops: if no lat/lng are provided, best-effort geocodes the name+country.
 * sortOrder is set to (max existing + 1) by default, or inserted after `afterStopId` when provided.
 *
 * @param afterStopId  Optional anchor: insert the new stop immediately after this stop.
 *                     Pass null or omit to append at the end (unchanged default behaviour).
 */
export async function createStop(
  tripId: string,
  input: StopInput,
  forkId?: PlanId,
  afterStopId?: string | null,
): Promise<StopActionResult> {
  await requireTripAccess(tripId);

  const parsed = stopSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  if (afterStopId) {
    // -----------------------------------------------------------------------
    // INSERT PATH — locked transaction (ADR 0007)
    //
    // Two concurrent inserts after the same anchor would read the same snapshot
    // and produce duplicate sortOrder values unless serialised. We lock the
    // trip's stops FOR UPDATE before computing the insertion position, then
    // renumber siblings and create the new stop inside the same transaction —
    // mirroring the pattern used by moveStop and reorderStops.
    // -----------------------------------------------------------------------

    // For both scheduled and rough stops, geocode outside the transaction (network
    // call; must not hold a DB lock while waiting for an external service — ADR 0007).
    let lat: number | undefined;
    let lng: number | undefined;
    let derivedCountryCode: string | null = null;
    if (parsed.data.mode === "scheduled") {
      const { name, country } = parsed.data;
      ({ lat, lng } = parsed.data);
      if (lat === undefined || lng === undefined) {
        const coords = await geocodePlaceDetailed([name, country].filter(Boolean).join(", "));
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
          derivedCountryCode = coords.countryCode ?? null;
        }
      }
    } else {
      // rough: derive country like scheduled stops do (best-effort; failure just leaves coords null)
      const { name, country } = parsed.data;
      let roughLat: number | undefined;
      let roughLng: number | undefined;
      let roughCountryCode: string | null = null;
      const coords = await geocodePlaceDetailed([name, country].filter(Boolean).join(", "));
      if (coords) {
        roughLat = coords.lat;
        roughLng = coords.lng;
        roughCountryCode = coords.countryCode ?? null;
      }
      // Store on the outer variables so the rough branch inside the tx can read them.
      lat = roughLat;
      lng = roughLng;
      derivedCountryCode = roughCountryCode;
    }

    // Chapter membership validation for rough stops is a pure read that doesn't
    // race with stop inserts, so it can run before the transaction.
    let effectiveChapterId: string | null = null;
    if (parsed.data.mode === "rough") {
      // We can't yet resolve the anchor's chapterId (that's inside the tx), so
      // we validate any explicitly supplied chapterId here; anchor-inherited
      // chapterId is validated inline inside the transaction instead.
      const explicitChapterId = parsed.data.chapterId ?? null;
      if (explicitChapterId) {
        const chapter = await db.chapter.findUnique({
          where: { id: explicitChapterId },
          select: { forkId: true },
        });
        if (!chapter || chapter.forkId !== (forkId ?? null)) {
          return { success: false, errors: { chapterId: ["Chapter does not belong to this plan"] } };
        }
        effectiveChapterId = explicitChapterId;
      }
    }

    const created = await db.$transaction(async (tx) => {
      // Lock the trip's stops FOR UPDATE to serialise concurrent inserts (ADR 0007:
      // canonical full-plan lock, acquired in id order via lockPlanStopsTx).
      const siblings = await lockPlanStopsTx(tx, tripId, forkId ?? null);

      const result = insertionOrder(siblings, afterStopId);
      const { sortOrder, renumber } = result;

      // Inherit chapter placement from the anchor stop if it has one.
      const anchor = siblings.find((s) => s.id === afterStopId);
      let anchorChapterId: string | null = null;
      let anchorChapterSortOrder: number | null = null;
      if (anchor?.chapterId) {
        anchorChapterId = anchor.chapterId;
        anchorChapterSortOrder = (anchor.chapterSortOrder ?? 0) + 1;
      }

      // Bump later siblings to open the slot.
      for (const s of renumber) {
        await tx.stop.update({ where: { id: s.id }, data: { sortOrder: s.sortOrder } });
      }

      if (parsed.data.mode === "rough") {
        const { name, country, nights, notes } = parsed.data;

        // If no explicit chapterId was supplied, fall back to the anchor's chapter.
        // (Explicit chapterId was already validated above; anchor-inherited needs no
        // extra validation — it belongs to the same trip by construction.)
        const resolvedChapterId = effectiveChapterId ?? anchorChapterId ?? null;
        const chapterSortOrder = anchorChapterSortOrder ?? 0;

        // lat/lng/derivedCountryCode were geocoded before this transaction opened (ADR 0007).
        return tx.stop.create({
          data: {
            tripId,
            forkId: forkId ?? null,
            name,
            country: country ?? null,
            countryCode: derivedCountryCode,
            nights,
            chapterId: resolvedChapterId,
            chapterSortOrder,
            arriveDate: null,
            departDate: null,
            timezone: null,
            lat: lat ?? null,
            lng: lng ?? null,
            notes: notes ?? null,
            pinned: false,
            sortOrder,
          },
        });
      }

      // scheduled
      const { name, country, timezone, arriveDate, departDate, notes } = parsed.data;
      // FIX 2 (scheduled + afterStopId): inherit anchor's chapter placement so
      // the scheduled stop lands in the same chapter as the anchor, matching
      // the rough-stop path's behaviour.
      const resolvedChapterId = anchorChapterId ?? null;
      const chapterSortOrder = anchorChapterSortOrder ?? 0;

      return tx.stop.create({
        data: {
          tripId,
          forkId: forkId ?? null,
          name,
          country: country ?? null,
          timezone,
          arriveDate,
          departDate,
          lat: lat ?? null,
          lng: lng ?? null,
          countryCode: derivedCountryCode,
          notes: notes ?? null,
          chapterId: resolvedChapterId,
          chapterSortOrder,
          pinned: false,
          sortOrder,
        },
      });
    });

    await recordPlanActivity(forkId, { tripId, verb: "CREATED", entityType: "STOP", entityId: created.id, entityLabel: entityLabel("STOP", created as unknown as Record<string, unknown>) });
    revalidatePath(`/trips/${tripId}`);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // APPEND PATH — no transaction needed (a racing plain append only yields
  // consecutive orders, no collision).
  // -------------------------------------------------------------------------

  const maxStop = await db.stop.findFirst({
    where: { tripId, ...planScope(forkId) },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxStop?.sortOrder ?? -1) + 1;

  if (parsed.data.mode === "rough") {
    const { name, country, nights, chapterId, notes } = parsed.data;

    // Validate chapterId belongs to the same plan if provided
    if (chapterId) {
      const chapter = await db.chapter.findUnique({
        where: { id: chapterId },
        select: { forkId: true },
      });
      if (!chapter || chapter.forkId !== (forkId ?? null)) {
        return { success: false, errors: { chapterId: ["Chapter does not belong to this plan"] } };
      }
    }

    // ROUGH APPEND PATH: geocode ran before this write; no FOR UPDATE lock is held here
    // (a racing plain append only yields consecutive sortOrders — no collision, cf. ADR 0007).
    // rough create (append): derive country like scheduled stops do (best-effort; failure leaves coords null)
    let appendRoughLat: number | null = null;
    let appendRoughLng: number | null = null;
    let appendRoughCountryCode: string | null = null;
    const appendRoughCoords = await geocodePlaceDetailed([name, country].filter(Boolean).join(", "));
    if (appendRoughCoords) {
      appendRoughLat = appendRoughCoords.lat;
      appendRoughLng = appendRoughCoords.lng;
      appendRoughCountryCode = appendRoughCoords.countryCode ?? null;
    }

    const created = await db.stop.create({
      data: {
        tripId,
        forkId: forkId ?? null,
        name,
        country: country ?? null,
        countryCode: appendRoughCountryCode,
        nights,
        chapterId: chapterId ?? null,
        chapterSortOrder: 0,
        arriveDate: null,
        departDate: null,
        timezone: null,
        lat: appendRoughLat,
        lng: appendRoughLng,
        notes: notes ?? null,
        pinned: false,
        sortOrder,
      },
    });
    await recordPlanActivity(forkId, { tripId, verb: "CREATED", entityType: "STOP", entityId: created.id, entityLabel: entityLabel("STOP", created as unknown as Record<string, unknown>) });
    revalidatePath(`/trips/${tripId}`);
    return { success: true };
  }

  // scheduled (append)
  const { name, country, timezone, arriveDate, departDate, notes } = parsed.data;
  let { lat, lng } = parsed.data;

  // Best-effort geocode if coords are missing
  let appendCountryCode: string | null = null;
  if (lat === undefined || lng === undefined) {
    const coords = await geocodePlaceDetailed([name, country].filter(Boolean).join(", "));
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
      appendCountryCode = coords.countryCode ?? null;
    }
  }

  const created = await db.stop.create({
    data: {
      tripId,
      forkId: forkId ?? null,
      name,
      country: country ?? null,
      timezone,
      arriveDate,
      departDate,
      lat: lat ?? null,
      lng: lng ?? null,
      countryCode: appendCountryCode,
      notes: notes ?? null,
      pinned: false,
      sortOrder,
    },
  });

  await recordPlanActivity(forkId, { tripId, verb: "CREATED", entityType: "STOP", entityId: created.id, entityLabel: entityLabel("STOP", created as unknown as Record<string, unknown>) });
  revalidatePath(`/trips/${tripId}`);
  return { success: true };
}

/**
 * Update an existing stop.
 *
 * Handles both rough and scheduled modes.
 * Verifies the stop belongs to a trip the user can access.
 * For scheduled: optionally re-geocodes if lat/lng are still absent.
 */
export async function updateStop(
  stopId: string,
  input: StopInput,
): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);

  const parsed = stopSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const before = await db.stop.findUnique({ where: { id: stopId } });

  if (parsed.data.mode === "rough") {
    const { name, country, nights, chapterId, notes } = parsed.data;

    // rough update: derive country like scheduled stops do (best-effort; failure leaves coords null)
    let updateRoughLat: number | null | undefined;
    let updateRoughLng: number | null | undefined;
    let updateRoughCountryCode: string | null = null;
    const updateRoughCoords = await geocodePlaceDetailed([name, country].filter(Boolean).join(", "));
    if (updateRoughCoords) {
      updateRoughLat = updateRoughCoords.lat;
      updateRoughLng = updateRoughCoords.lng;
      updateRoughCountryCode = updateRoughCoords.countryCode ?? null;
    }

    // On a geocode miss, omit lat/lng from the update so we don't clobber previously-good
    // coordinates — unlike create paths which write explicit null.
    const updated = await db.stop.update({
      where: { id: stopId },
      data: {
        name,
        country: country ?? null,
        countryCode: updateRoughCountryCode,
        ...(updateRoughLat !== undefined ? { lat: updateRoughLat, lng: updateRoughLng } : {}),
        nights,
        chapterId: chapterId ?? null,
        notes: notes ?? null,
        arriveDate: null,
        departDate: null,
        timezone: null,
      },
    });
    await recordPlanActivity(stop.forkId, {
      tripId: stop.tripId,
      verb: "UPDATED",
      entityType: "STOP",
      entityId: stopId,
      entityLabel: entityLabel("STOP", updated as unknown as Record<string, unknown>),
      changes: describeChanges("STOP", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
    });
    revalidatePath(`/trips/${stop.tripId}`);
    return { success: true };
  }

  // scheduled
  const { name, country, timezone, arriveDate, departDate, notes } = parsed.data;
  let { lat, lng } = parsed.data;

  // Best-effort geocode if coords are missing on update too
  let updateCountryCode: string | null = null;
  if (lat === undefined || lng === undefined) {
    const query = [name, country].filter(Boolean).join(", ");
    const coords = await geocodePlaceDetailed(query);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
      updateCountryCode = coords.countryCode ?? null;
    }
  }

  // Wrap the stop mutation + chapter span recompute in a single transaction so
  // the chapter band always stays in sync with its dated members (bug #3).
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.stop.update({
      where: { id: stopId },
      data: {
        name,
        country: country ?? null,
        timezone,
        arriveDate,
        departDate,
        lat: lat ?? null,
        lng: lng ?? null,
        countryCode: updateCountryCode,
        notes: notes ?? null,
      },
    });
    // ADR 0038: the form edit shifts this stop's own payload only (no
    // collision-push through followers — that ripple is setStopDates' job,
    // exercised via the reorder dialog). Renames rarely touch dates, so this
    // covers the common "renamed while dates unchanged" case with no writes.
    if (before?.arriveDate && (before.arriveDate !== arriveDate || before.departDate !== departDate)) {
      await shiftStopPayloadTx(tx, { id: stopId, arriveDate: before.arriveDate }, arriveDate, departDate);
    }
    await recomputeChapterSpans(tx, stop.tripId, stop.forkId);
    return result;
  });

  await recordPlanActivity(stop.forkId, {
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stopId,
    entityLabel: entityLabel("STOP", updated as unknown as Record<string, unknown>),
    changes: describeChanges("STOP", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });
  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Delete a stop.
 *
 * Verifies the stop belongs to a trip the user can access.
 */
export async function deleteStop(stopId: string): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);

  // Read names BEFORE the delete: the DB cascades Accommodation rows with the
  // Stop, and converted costs need the accommodation's name for their label.
  const cascadedAccommodations = await db.accommodation.findMany({
    where: { stopId },
    select: { id: true, name: true },
  });
  const doomed = await db.stop.findUnique({ where: { id: stopId }, select: { name: true } });

  const storageKeys = await db.$transaction(async (tx) => {
    await tx.stop.delete({ where: { id: stopId } });
    await deleteOwnedCostsTx(
      tx,
      stop.tripId,
      cascadedAccommodations.map((a) => ({
        type: "ACCOMMODATION" as const,
        id: a.id,
        label: a.name ?? "Accommodation",
      })),
    );
    const keys = await cleanupTargetSideDataTx(tx, stop.tripId, "STOP", stopId);
    for (const acc of cascadedAccommodations) {
      keys.push(...(await cleanupTargetSideDataTx(tx, stop.tripId, "ACCOMMODATION", acc.id)));
    }
    return keys;
  });
  await deleteBlobsBestEffort(storageKeys);

  await recordPlanActivity(stop.forkId, { tripId: stop.tripId, verb: "DELETED", entityType: "STOP", entityId: stopId, entityLabel: doomed?.name ?? "" });

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Move a stop up or down in sortOrder by swapping with its adjacent neighbour.
 *
 * 'up' means decreasing sortOrder (towards the first stop in the list).
 * 'down' means increasing sortOrder (towards the last stop).
 *
 * If there is no adjacent stop in the given direction the action is a no-op.
 */
export async function moveStop(
  stopId: string,
  direction: "up" | "down",
): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);

  // READ COMMITTED is sufficient here — the FOR UPDATE row lock is what serializes concurrent reorders.
  const moved = await db.$transaction(async (tx) => {
    // Lock the trip's stops. A concurrent reorder blocks here until we commit,
    // then re-reads the corrected order — closing the read-then-swap race
    // (ADR 0007: canonical full-plan lock, acquired in id order via lockPlanStopsTx).
    const siblings = await lockPlanStopsTx(tx, stop.tripId, stop.forkId ?? null);

    const idx = siblings.findIndex((s) => s.id === stopId);
    if (idx === -1) return false; // stop vanished mid-flight — nothing to do

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return false; // no neighbour — no-op

    const current = siblings[idx];
    const neighbour = siblings[swapIdx];

    await tx.stop.update({
      where: { id: current.id },
      data: { sortOrder: neighbour.sortOrder },
    });
    await tx.stop.update({
      where: { id: neighbour.id },
      data: { sortOrder: current.sortOrder },
    });
    return true;
  });

  if (moved) {
    const named = await db.stop.findUnique({ where: { id: stopId }, select: { name: true } });
    await recordPlanActivity(stop.forkId, {
      tripId: stop.tripId,
      verb: "UPDATED",
      entityType: "STOP",
      entityId: stopId,
      entityLabel: named?.name ?? "",
      changes: { summary: `Moved ${named?.name ?? "a stop"} ${direction === "up" ? "earlier" : "later"} in the route` },
    });
  }

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Internal helper: apply new dates to an already-resolved stop.
 *
 * ADR 0038 collision-push: a date edit ripples ONLY on collision. Scheduled
 * stops after the edited one (in date order, not sortOrder) are pushed just
 * far enough to clear an overlap with the edited stop's new stay — a gap
 * absorbs the push and stops anything further downstream from moving. If the
 * edit instead creates an overlap with the PRECEDING stop, that stop is never
 * moved; the conflict is flagged on the edited stop itself. The edited stop's
 * own slotted Items/Accommodation (and every pushed follower's) ride along via
 * shiftStopPayloadTx, whose pre-images come back on `payload` for Undo.
 *
 * Callers are responsible for auth (requireStopAccess) and depart>=arrive
 * validation before calling this function.
 */
async function applyStopDates(
  stop: { id: string; tripId: string; sortOrder: number; forkId: string | null },
  dates: { arriveDate: string; departDate: string },
): Promise<StopActionResult> {
  const before = await db.stop.findUnique({
    where: { id: stop.id },
    select: { name: true, country: true, arriveDate: true, departDate: true, nights: true },
  });

  let changed: { id: string; arriveDate: string; departDate: string }[] = [];
  let conflicts: FlowConflict[] = [];
  const payload: PayloadShiftResult = { items: [], accommodations: [] };
  let maxDepart = dates.departDate;

  await db.$transaction(async (tx) => {
    // Lock the WHOLE plan's stops FOR UPDATE, in canonical id order, before
    // writing any dates (ADR 0007: every tx that writes a plan's Stop
    // ordering or dates takes this same lock — closes an ABBA deadlock
    // against the id-ordered canonical paths and the lost-update window on
    // the unlocked `others` read below).
    await lockPlanStopsTx(tx, stop.tripId, stop.forkId);

    await tx.stop.update({
      where: { id: stop.id },
      data: { arriveDate: dates.arriveDate, departDate: dates.departDate },
    });
    if (before?.arriveDate) {
      const shifted = await shiftStopPayloadTx(
        tx, { id: stop.id, arriveDate: before.arriveDate }, dates.arriveDate, dates.departDate,
      );
      payload.items.push(...shifted.items);
      payload.accommodations.push(...shifted.accommodations);
    }

    // ADR 0038 collision-push: followers = scheduled stops after the edited
    // stop in date order; each moves only as far as needed (gaps absorb).
    const others = (await tx.stop.findMany({
      where: { tripId: stop.tripId, id: { not: stop.id }, arriveDate: { not: null }, ...planScope(stop.forkId) },
      select: { id: true, name: true, arriveDate: true, departDate: true, sortOrder: true, pinned: true },
    })) as Array<{ id: string; name: string; arriveDate: string; departDate: string; sortOrder: number; pinned: boolean }>;
    others.sort(compareScheduled);

    const preceding = others.filter((s) => s.arriveDate < dates.arriveDate).pop();
    if (preceding && preceding.departDate > dates.arriveDate) {
      conflicts.push({
        stopId: stop.id,
        message: `These dates overlap ${preceding.name}'s stay (until ${preceding.departDate}).`,
      });
    }

    const followers = others.filter((s) => s.arriveDate >= dates.arriveDate);
    const pushed = collisionPush(followers, dates.departDate);
    conflicts = conflicts.concat(pushed.conflicts);
    const preById = new Map(others.map((s) => [s.id, s]));
    for (const r of pushed.results) {
      const pre = preById.get(r.id)!;
      await tx.stop.update({ where: { id: r.id }, data: { arriveDate: r.arriveDate, departDate: r.departDate } });
      const shifted = await shiftStopPayloadTx(tx, { id: r.id, arriveDate: pre.arriveDate }, r.arriveDate, r.departDate);
      payload.items.push(...shifted.items);
      payload.accommodations.push(...shifted.accommodations);
      if (r.departDate > maxDepart) maxDepart = r.departDate;
    }
    changed = pushed.results.map((r) => ({ id: r.id, arriveDate: r.arriveDate, departDate: r.departDate }));

    // Bands self-heal on any member date change (ADR 0021 §4).
    await recomputeChapterSpans(tx, stop.tripId, stop.forkId);

    // Auto-grow the trip window; never shrink endDate.
    const trip = await tx.trip.findUnique({ where: { id: stop.tripId }, select: { endDate: true } });
    if (!trip?.endDate || trip.endDate < maxDepart) {
      await tx.trip.update({ where: { id: stop.tripId }, data: { endDate: maxDepart } });
    }
  });

  await recordPlanActivity(stop.forkId, {
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stop.id,
    entityLabel: entityLabel("STOP", (before ?? {}) as Record<string, unknown>),
    changes: describeChanges(
      "STOP",
      (before ?? {}) as Record<string, unknown>,
      { ...(before ?? {}), arriveDate: dates.arriveDate, departDate: dates.departDate } as Record<string, unknown>,
    ),
  });

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true, conflicts, changed, payload };
}

/**
 * Set the arrive/depart dates on a stop and ripple forward through
 * contiguous following dated non-pinned stops.
 */
export async function setStopDates(
  stopId: string,
  dates: { arriveDate: string; departDate: string },
): Promise<StopActionResult> {
  if (dates.departDate < dates.arriveDate) {
    return { success: false, errors: { departDate: ["Depart date must be on or after arrive date"] } };
  }
  const stop = await requireStopAccess(stopId);
  return applyStopDates(stop, dates);
}

// ---------------------------------------------------------------------------
// firmUpSegment
// ---------------------------------------------------------------------------

export interface FirmUpSegmentArgs {
  tripId: string;
  chapterId?: string | null;
  anchorDate?: string;
  forkId?: PlanId;
}

/**
 * Date all rough stops in the given chapter (or ungrouped if chapterId is null/undefined).
 * Anchor = depart of nearest preceding scheduled stop, else trip.startDate, else args.anchorDate.
 * Geocodes each newly-dated stop (best-effort, for coords) and sets timezone.
 * Updates the chapter's startDate/endDate to span its now-dated stops.
 */
export async function firmUpSegment(args: FirmUpSegmentArgs): Promise<StopActionResult> {
  const { tripId, chapterId, forkId } = args;
  await requireTripAccess(tripId);

  const [trip, rawStops] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, endDate: true } }),
    db.stop.findMany({
      where: { tripId, ...planScope(forkId) },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        sortOrder: true,
        chapterId: true,
        nights: true,
        pinned: true,
        arriveDate: true,
        departDate: true,
        timezone: true,
        name: true,
        country: true,
      },
    }),
  ]);
  // ADR 0038: flow follows canonical plan order (dates rule for scheduled
  // stops), not raw sortOrder — matters for both the anchor walk-back below
  // and the order rough segment members flow in.
  const stops = orderPlanStops(rawStops);

  const segment = stops.filter((s) => (s.chapterId ?? null) === (chapterId ?? null) && !s.arriveDate);
  if (segment.length === 0) {
    revalidatePath(`/trips/${tripId}`);
    return { success: true };
  }

  const firstIdx = stops.findIndex((s) => s.id === segment[0].id);
  let anchor: string | null = null;
  for (let i = firstIdx - 1; i >= 0; i--) {
    if (stops[i].departDate) { anchor = stops[i].departDate; break; }
  }
  anchor = anchor ?? trip?.startDate ?? args.anchorDate ?? null;
  if (!anchor) {
    return { success: false, errors: { anchorDate: ["Pick a start date for this leg — the trip has no dates yet."] } };
  }

  const { results, conflicts } = flowDates(
    segment.map((s) => ({ id: s.id, nights: s.nights, pinned: false, arriveDate: null, departDate: null })),
    anchor,
  );

  const tripTz = stops.find((s) => s.timezone)?.timezone ?? "UTC";
  const segById = Object.fromEntries(segment.map((s) => [s.id, s]));
  for (const r of results) {
    const s = segById[r.id];
    const coords = await geocodePlaceDetailed([s.name, s.country].filter(Boolean).join(", "));
    const timezone = s.timezone ?? tripTz;
    const previousArrive = s.arriveDate;
    await db.stop.update({
      where: { id: r.id },
      data: {
        arriveDate: r.arriveDate,
        departDate: r.departDate,
        timezone,
        ...(coords ? { lat: coords.lat, lng: coords.lng, countryCode: coords.countryCode ?? null } : {}),
      },
    });
    // ADR 0038: if this stop had a prior arrive date and the flowed dates
    // actually moved it, its slotted Items/Accommodation ride along. A
    // previously-rough stop (no prior arrive) has nothing to offset from.
    if (previousArrive && (previousArrive !== r.arriveDate || s.departDate !== r.departDate)) {
      await shiftStopPayloadTx(db, { id: r.id, arriveDate: previousArrive }, r.arriveDate, r.departDate);
    }
  }

  // Grow the trip's window to cover the freshly-dated segment. Without this any
  // stop dated past the current endDate silently drops out of every dated view
  // (calendar/day/today/print/share) and the budget. Only set startDate when it
  // was null (a date-less trip firmed up for the first time) — never move an
  // existing start; never shrink endDate.
  const firstArrive = results[0].arriveDate;
  const lastDepart = results[results.length - 1].departDate;
  const newStart = trip?.startDate ?? firstArrive;
  const newEnd = !trip?.endDate || trip.endDate < lastDepart ? lastDepart : trip.endDate;
  if (newStart !== trip?.startDate || newEnd !== trip?.endDate) {
    await db.trip.update({ where: { id: tripId }, data: { startDate: newStart, endDate: newEnd } });
  }

  if (chapterId) {
    // Build the full set of dated stops in this chapter: stops that were already
    // dated (excluded from `segment`) plus `results` (just dated by flowDates).
    // Using chapterSpan's min/max is strictly more correct than positional
    // results[0]/results[last] — it handles pinned stops interleaved with fresh ones.
    const alreadyDated = stops.filter(
      (s) => (s.chapterId ?? null) === (chapterId ?? null) && s.arriveDate != null,
    );
    const { startDate: start, endDate: end } = chapterSpan([...alreadyDated, ...results]);
    const beforeCh = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { name: true, startDate: true, endDate: true },
    });
    await db.chapter.update({ where: { id: chapterId }, data: { startDate: start, endDate: end } });
    await recordPlanActivity(forkId, {
      tripId,
      verb: "UPDATED",
      entityType: "CHAPTER",
      entityId: chapterId,
      entityLabel: beforeCh?.name ?? "",
      changes: describeChanges(
        "CHAPTER",
        (beforeCh ?? {}) as Record<string, unknown>,
        { ...(beforeCh ?? {}), startDate: start, endDate: end } as Record<string, unknown>,
      ),
    });
  } else {
    const firstArrive = results[0].arriveDate;
    const lastDepart = results[results.length - 1].departDate;
    const n = results.length;
    await recordPlanActivity(forkId, {
      tripId,
      verb: "UPDATED",
      entityType: "STOP",
      entityId: segment[0].id,
      entityLabel: segment[0].name ?? "",
      changes: { summary: `Firmed up ${n} ${n === 1 ? "stop" : "stops"} · ${formatLongDate(firstArrive)} – ${formatLongDate(lastDepart)}` },
    });
  }

  revalidatePath(`/trips/${tripId}`);
  return { success: true, conflicts };
}

// ---------------------------------------------------------------------------
// firmUpTrip — date EVERY rough stop across the whole trip in one action
// ---------------------------------------------------------------------------

/**
 * Date every rough stop across the whole trip, flowing from the trip start date
 * (or a caller anchor, or the earliest scheduled arrival) in stop order.
 * Scheduled and Pinned stops are fixed boundaries it flows around; conflicts are
 * surfaced (pins are never overwritten). Grows the trip window and brings each
 * chapter's band onto its now-dated stops. Best-effort geocode per dated stop.
 */
export async function firmUpTrip(tripId: string, anchorDate?: string, forkId?: PlanId): Promise<StopActionResult> {
  await requireTripAccess(tripId);

  const [trip, stops] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, endDate: true } }),
    db.stop.findMany({
      where: { tripId, ...planScope(forkId) },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, sortOrder: true, chapterId: true, nights: true, pinned: true,
        arriveDate: true, departDate: true, timezone: true, name: true, country: true,
      },
    }),
  ]);
  // ADR 0038: no orderPlanStops wrap needed here — planTripFirmUp orders its
  // input canonically (dates rule) internally, so the invariant lives in one
  // place (lib/firm-up.ts) rather than being duplicated at each call site.

  const rough = stops.filter((s) => !s.arriveDate);
  if (rough.length === 0) {
    revalidatePath(`/trips/${tripId}`);
    return { success: true };
  }

  const earliestScheduled = stops.reduce<string | null>(
    (min, s) => (s.arriveDate && (min === null || s.arriveDate < min) ? s.arriveDate : min),
    null,
  );
  const anchor = trip?.startDate ?? anchorDate ?? earliestScheduled ?? null;
  if (!anchor) {
    return { success: false, errors: { anchorDate: ["Set a start date for the trip first."] } };
  }

  const { results, conflicts } = planTripFirmUp(stops, anchor);

  const tripTz = stops.find((s) => s.timezone)?.timezone ?? "UTC";
  const stopById = Object.fromEntries(stops.map((s) => [s.id, s]));
  for (const r of results) {
    const s = stopById[r.id];
    const coords = await geocodePlaceDetailed([s.name, s.country].filter(Boolean).join(", "));
    const previousArrive = s.arriveDate;
    await db.stop.update({
      where: { id: r.id },
      data: {
        arriveDate: r.arriveDate,
        departDate: r.departDate,
        timezone: s.timezone ?? tripTz,
        ...(coords ? { lat: coords.lat, lng: coords.lng, countryCode: coords.countryCode ?? null } : {}),
      },
    });
    // ADR 0038: if this stop had a prior arrive date and the flowed dates
    // actually moved it, its slotted Items/Accommodation ride along. A
    // previously-rough stop (no prior arrive) has nothing to offset from.
    if (previousArrive && (previousArrive !== r.arriveDate || s.departDate !== r.departDate)) {
      await shiftStopPayloadTx(db, { id: r.id, arriveDate: previousArrive }, r.arriveDate, r.departDate);
    }
  }

  // Merge freshly-dated rough stops with already-scheduled stops for window +
  // chapter-span computation.
  const datedById = new Map<string, { arriveDate: string; departDate: string }>();
  for (const s of stops) {
    if (s.arriveDate && s.departDate) datedById.set(s.id, { arriveDate: s.arriveDate, departDate: s.departDate });
  }
  for (const r of results) datedById.set(r.id, { arriveDate: r.arriveDate, departDate: r.departDate });

  // Grow the trip window: never shrink endDate; only set startDate when it was null.
  let maxDepart = anchor;
  for (const d of datedById.values()) if (d.departDate > maxDepart) maxDepart = d.departDate;
  const newStart = trip?.startDate ?? anchor;
  const newEnd = !trip?.endDate || trip.endDate < maxDepart ? maxDepart : trip.endDate;
  if (newStart !== trip?.startDate || newEnd !== trip?.endDate) {
    await db.trip.update({ where: { id: tripId }, data: { startDate: newStart, endDate: newEnd } });
  }

  // Recompute each chapter's band from its now-dated stops, then trim seams so
  // adjacent chapters don't share a boundary day. flowDates hands off
  // arrive == previous depart, and chaptersOverlap (lib/chapters.ts) is inclusive,
  // so untrimmed bands would falsely "overlap" and block a later add/edit-chapter.
  // Mirrors the seam trim in suggestChapters.
  const chapterSpans: { id: string; start: string; end: string }[] = [];
  const chapterIds = [...new Set(stops.map((s) => s.chapterId).filter((c): c is string => Boolean(c)))];
  for (const chId of chapterIds) {
    const spanStops = stops.filter((s) => s.chapterId === chId && datedById.has(s.id));
    if (spanStops.length === 0) continue;
    let start = datedById.get(spanStops[0].id)!.arriveDate;
    let end = datedById.get(spanStops[0].id)!.departDate;
    for (const s of spanStops) {
      const d = datedById.get(s.id)!;
      if (d.arriveDate < start) start = d.arriveDate;
      if (d.departDate > end) end = d.departDate;
    }
    chapterSpans.push({ id: chId, start, end });
  }
  chapterSpans.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  for (let i = 0; i < chapterSpans.length - 1; i++) {
    const next = chapterSpans[i + 1];
    if (chapterSpans[i].end >= next.start) {
      const trimmed = addDays(next.start, -1);
      chapterSpans[i].end = trimmed < chapterSpans[i].start ? chapterSpans[i].start : trimmed;
    }
  }
  for (const span of chapterSpans) {
    await db.chapter.update({ where: { id: span.id }, data: { startDate: span.start, endDate: span.end } });
  }

  await recordPlanActivity(forkId, {
    tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: rough[0].id,
    entityLabel: rough[0].name ?? "",
    changes: { summary: `Dated ${rough.length} ${rough.length === 1 ? "stop" : "stops"} from ${formatLongDate(anchor)}` },
  });

  revalidatePath(`/trips/${tripId}`);
  return { success: true, conflicts };
}

// ---------------------------------------------------------------------------
// toggleStopPin, makeStopRough, assignStopToChapter
// ---------------------------------------------------------------------------

/**
 * Toggle the pinned state of a stop.
 * Only stops with dates can be pinned.
 */
export async function toggleStopPin(stopId: string): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
  if (!stop.arriveDate) {
    return { success: false, errors: { pinned: ["Only a stop with dates can be pinned."] } };
  }
  await db.stop.update({ where: { id: stopId }, data: { pinned: !stop.pinned } });
  const named = await db.stop.findUnique({ where: { id: stopId }, select: { name: true } });
  await recordPlanActivity(stop.forkId, {
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stopId,
    entityLabel: named?.name ?? "",
    changes: describeChanges("STOP", { pinned: stop.pinned }, { pinned: !stop.pinned }),
  });
  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Convert a scheduled stop back to rough, preserving the nights duration.
 */
export async function makeStopRough(stopId: string): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
  const nights =
    stop.arriveDate && stop.departDate
      ? nightsBetween(stop.arriveDate, stop.departDate)
      : (stop.nights ?? 1);

  const before = await db.stop.findUnique({
    where: { id: stopId },
    select: { name: true, arriveDate: true, departDate: true, pinned: true, nights: true },
  });

  // Wrap the stop mutation + chapter span recompute in a single transaction so
  // clearing a stop's dates also updates (or reverts to null) its chapter's band
  // (fixes the "chapter left stranded with dates after last dated stop removed"
  // case described in #3/#8 and ADR 0021).
  await db.$transaction(async (tx) => {
    await tx.stop.update({
      where: { id: stopId },
      data: { arriveDate: null, departDate: null, timezone: null, pinned: false, nights },
    });
    await recomputeChapterSpans(tx, stop.tripId, stop.forkId);
  });

  await recordPlanActivity(stop.forkId, {
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stopId,
    entityLabel: entityLabel("STOP", (before ?? {}) as Record<string, unknown>),
    changes: describeChanges(
      "STOP",
      (before ?? {}) as Record<string, unknown>,
      { ...(before ?? {}), arriveDate: null, departDate: null, pinned: false, nights } as Record<string, unknown>,
    ),
  });

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Update the free-text notes on a stop.
 * Trims whitespace; stores null when the trimmed string is empty.
 */
export async function setStopNotes(stopId: string, notes: string): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
  const trimmed = notes.trim();
  const before = await db.stop.findUnique({ where: { id: stopId } });
  const updated = await db.stop.update({ where: { id: stopId }, data: { notes: trimmed === "" ? null : trimmed } });
  await recordPlanActivity(stop.forkId, {
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stopId,
    entityLabel: entityLabel("STOP", updated as unknown as Record<string, unknown>),
    changes: describeChanges("STOP", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });
  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Set the number of nights for a stop.
 *
 * - Rough stops: writes the `nights` field directly.
 * - Scheduled stops: recomputes `departDate` from `arriveDate + nights` and
 *   delegates to `setStopDates` (inheriting its ripple + conflict logic).
 */
export async function setStopNights(stopId: string, nights: number): Promise<StopActionResult> {
  if (!Number.isInteger(nights) || nights < 0 || nights > 366) {
    return { success: false, errors: { nights: ["Nights must be between 0 and 366"] } };
  }
  const stop = await requireStopAccess(stopId);
  if (stop.arriveDate) {
    const departDate = addDays(stop.arriveDate, nights);
    return applyStopDates(stop, { arriveDate: stop.arriveDate, departDate });
  }
  const before = await db.stop.findUnique({ where: { id: stopId } });
  const updated = await db.stop.update({ where: { id: stopId }, data: { nights } });
  await recordPlanActivity(stop.forkId, {
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stopId,
    entityLabel: entityLabel("STOP", updated as unknown as Record<string, unknown>),
    changes: describeChanges("STOP", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });
  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Assign (or unassign) a stop to a chapter, appending to the end of that chapter's order.
 */
export async function assignStopToChapter(stopId: string, chapterId: string | null): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
  const before = await db.stop.findUnique({ where: { id: stopId }, select: { name: true, chapterId: true } });
  let chapterSortOrder = 0;
  if (chapterId) {
    const last = await db.stop.findFirst({
      where: { tripId: stop.tripId, chapterId, ...planScope(stop.forkId) },
      orderBy: { chapterSortOrder: "desc" },
      select: { chapterSortOrder: true },
    });
    chapterSortOrder = (last?.chapterSortOrder ?? -1) + 1;
  }
  await db.stop.update({ where: { id: stopId }, data: { chapterId, chapterSortOrder } });
  if ((before?.chapterId ?? null) !== (chapterId ?? null)) {
    const [fromCh, toCh] = await Promise.all([
      before?.chapterId ? db.chapter.findUnique({ where: { id: before.chapterId }, select: { name: true } }) : Promise.resolve(null),
      chapterId ? db.chapter.findUnique({ where: { id: chapterId }, select: { name: true } }) : Promise.resolve(null),
    ]);
    await recordPlanActivity(stop.forkId, {
      tripId: stop.tripId,
      verb: "UPDATED",
      entityType: "STOP",
      entityId: stopId,
      entityLabel: before?.name ?? "",
      changes: [{ field: "chapter", label: "Chapter", from: fromCh?.name ?? "", to: toCh?.name ?? "" }],
    });
  }
  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Reorder stops to an explicit new order (drag-and-drop). Rewrites global
 * sortOrder = index and chapterId for every stop (rough or scheduled).
 * After the positional writes, reflows ONLY the span between the moved
 * stop(s)' old and new chronological positions via reflowSpanTx, preserving
 * gaps elsewhere (ADR 0038). Returns the reflow payload so Task 10 can build
 * the "X stops shifted" undo toast.
 * Locked FOR UPDATE to serialise with moveStop/other reorders (cf. ADR 0007).
 *
 * @param movedStopIds  The actively dragged stop(s), used by spanReflow to
 *                       decide lead-in gaps within the affected span.
 */
export async function reorderStops(
  tripId: string,
  items: { id: string; chapterId: string | null }[],
  forkId?: PlanId,
  movedStopIds?: string[],
): Promise<ReorderResult> {
  await requireTripAccess(tripId);
  if (items.length === 0) return { success: true, changed: [], conflicts: [] };

  // Derive the plan (forkId) from the stops being reordered. They all belong to
  // a single plan; reject a mixed-plan payload. Chapters are then validated
  // within that plan only (I3) — closing a cross-plan write vector where a
  // crafted payload could point a stop at another plan's chapter.
  const reorderIds = items.map((i) => i.id);
  const reorderStopRows = await db.stop.findMany({
    where: { id: { in: reorderIds }, tripId },
    select: { id: true, forkId: true, arriveDate: true },
  });
  const planForkIds = new Set(reorderStopRows.map((s) => s.forkId));
  if (planForkIds.size > 1) {
    return {
      success: false,
      errors: { id: ["Stops in a reorder must all belong to the same plan."] },
    };
  }
  // Prefer the caller-supplied plan (the editor threads the active forkId); fall
  // back to the plan derived from the stops themselves.
  const reorderForkId: PlanId = forkId ?? reorderStopRows[0]?.forkId ?? null;
  const preKnownArriveDate = new Map(reorderStopRows.map((s) => [s.id, s.arriveDate]));

  // Pre-validate: rough stops cannot enter a DATED chapter (R1).
  // Dated stops may enter any chapter (ADR 0021).
  // We do this check outside the tx using the pre-fetched stop arriveDates.
  const targetChapterIds = [...new Set(items.map((i) => i.chapterId).filter((c): c is string => c != null))];
  const chapterStartDates = new Map<string, string | null>();
  if (targetChapterIds.length > 0) {
    const chapters = await db.chapter.findMany({
      where: { id: { in: targetChapterIds }, tripId, ...planScope(reorderForkId) },
      select: { id: true, startDate: true },
    });
    for (const ch of chapters) {
      chapterStartDates.set(ch.id, ch.startDate);
    }
  }

  // Enforce rough-into-dated-chapter rule before opening the tx.
  for (const it of items) {
    if (it.chapterId == null) continue;
    const isRough = (preKnownArriveDate.get(it.id) ?? null) == null;
    if (isRough && chapterStartDates.has(it.chapterId) && chapterStartDates.get(it.chapterId) != null) {
      return { success: false, errors: { chapterId: ["Can't move a rough stop into a dated chapter."] } };
    }
  }

  const ids = items.map((i) => i.id);

  let changed: { id: string; arriveDate: string; departDate: string }[] = [];
  let conflicts: FlowConflict[] = [];
  let payload: PayloadShiftResult = { items: [], accommodations: [] };

  try {
    await db.$transaction(async (tx) => {
      // Lock the WHOLE plan's stops FOR UPDATE, in canonical id order, to
      // serialise concurrent reorders (ADR 0007 — never just the dragged ids).
      const lockedRows = await lockPlanStopsTx(tx, tripId, reorderForkId);
      const byId = new Map(lockedRows.map((r) => [r.id, r]));

      // Every id must exist in the locked (plan-scoped) set. The query is
      // already tripId-scoped, so a passed-in id that isn't in this plan
      // simply won't appear here — no separate tripId check needed.
      for (const id of ids) {
        const r = byId.get(id);
        if (!r) throw new Error("STOP_NOT_IN_TRIP");
      }

      // Write sortOrder + chapterId for ALL stops (both rough and scheduled — ADR 0021).
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        await tx.stop.update({
          where: { id: it.id },
          data: { sortOrder: idx, chapterId: it.chapterId },
        });
      }

      // ADR 0038: reflow only the span between the moved stop(s)' old and new
      // chronological positions, shift its payload, and self-heal chapter
      // bands — all via the shared reflowSpanTx (also used by reorderChapters).
      const reflow = await reflowSpanTx(tx, tripId, reorderForkId, new Set(movedStopIds ?? []));
      changed = reflow.changed;
      conflicts = reflow.conflicts;
      payload = reflow.payload;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STOP_NOT_IN_TRIP") {
      return { success: false, errors: { id: ["One or more stops aren't part of this trip."] } };
    }
    throw e;
  }

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/plan`);
  return { success: true, changed, conflicts, payload };
}

/**
 * Restore stops to an explicit pre-drag snapshot (the Undo of a scheduled
 * reorder — ADR 0021). Unlike reorderStops this performs NO reflow: it writes
 * each entry's sortOrder, chapterId, arriveDate and departDate VERBATIM so a
 * drag is reverted exactly — order, chapter membership AND dates. Runs inside a
 * FOR UPDATE-locked transaction (ADR 0007) and recomputes chapter spans so the
 * date-bands track the restored dates.
 *
 * @param entries  Snapshot captured before the drag: every affected stop's
 *                 id + sortOrder + chapterId + arrive/departDate.
 * @param forkId   Plan being edited. Defaults to the plan the stops belong to.
 * @param payload  ADR 0038: pre-image Item dates / Accommodation check-in-out
 *                 to restore verbatim alongside the stops (the Undo of a
 *                 payload shift caused by the drag being reverted). An Item
 *                 entry may also carry the `stopId` it was owned by, which an
 *                 ADR 0055 re-file supplies so Undo puts its Cost back on the
 *                 Budget line it came from; without one only the date is
 *                 written, exactly as before.
 */
export async function restoreStops(
  entries: { id: string; sortOrder: number; chapterId: string | null; arriveDate: string | null; departDate: string | null }[],
  forkId?: PlanId,
  payload?: { items: { id: string; date: string | null; stopId?: string | null }[]; accommodations: { id: string; checkIn: string; checkOut: string }[] },
): Promise<StopActionResult> {
  if (entries.length === 0) return { success: true };

  const ids = entries.map((e) => e.id);

  // Resolve the trip + plan from the stops being restored (mirrors reorderStops).
  // All entries belong to one trip/plan; a mixed-plan payload is rejected.
  const rows = await db.stop.findMany({
    where: { id: { in: ids } },
    select: { id: true, tripId: true, forkId: true },
  });
  if (rows.length === 0) {
    return { success: false, errors: { id: ["No matching stops to restore."] } };
  }
  const tripIds = new Set(rows.map((r) => r.tripId));
  if (tripIds.size > 1) {
    return { success: false, errors: { id: ["Stops in a restore must all belong to the same trip."] } };
  }
  const tripId = rows[0].tripId;
  await requireTripAccess(tripId);

  const planForkIds = new Set(rows.map((r) => r.forkId));
  if (planForkIds.size > 1) {
    return { success: false, errors: { id: ["Stops in a restore must all belong to the same plan."] } };
  }
  const restoreForkId: PlanId = forkId ?? rows[0].forkId ?? null;

  // ARCH-TEN-1: the guard above authorised the Stops' Trip only — the payload
  // names Items and Accommodations by id alone, so without this every
  // authenticated Traveller could rewrite another tenancy's rows via Undo.
  // Verify ownership BEFORE the transaction so a rejected call writes nothing.
  // Id lists are de-duplicated via Set before counting: Prisma's `in` filter
  // returns one row per DISTINCT id, so a payload that (harmlessly) names the
  // same id twice must not fail the length check meant to catch a missing row.
  const payloadItemIds = [...new Set((payload?.items ?? []).map((i) => i.id))];
  if (payloadItemIds.length > 0) {
    const owned = await db.item.findMany({
      where: { id: { in: payloadItemIds } },
      select: { id: true, tripId: true },
    });
    if (owned.length !== payloadItemIds.length || owned.some((i) => i.tripId !== tripId)) {
      return { success: false, errors: { id: ["Restore payload names items from another trip."] } };
    }
  }

  // ARCH-TEN-1 follow-up: an Item entry may also carry the Stop it is being
  // re-filed onto (ADR 0055's re-file Undo). That `stopId` is caller-supplied
  // too — validating only the Item's own tripId above would still let a
  // Traveller re-file their own (validated) Item onto another tenancy's Stop.
  const payloadStopIds = [
    ...new Set((payload?.items ?? []).map((i) => i.stopId).filter((id): id is string => !!id)),
  ];
  if (payloadStopIds.length > 0) {
    const owned = await db.stop.findMany({
      where: { id: { in: payloadStopIds } },
      select: { id: true, tripId: true },
    });
    if (owned.length !== payloadStopIds.length || owned.some((s) => s.tripId !== tripId)) {
      return { success: false, errors: { id: ["Restore payload re-files an item onto a stop from another trip."] } };
    }
  }

  const payloadAccIds = [...new Set((payload?.accommodations ?? []).map((a) => a.id))];
  if (payloadAccIds.length > 0) {
    // Accommodation carries tripId directly (prisma/schema.prisma) — no need
    // to join through Stop.
    const owned = await db.accommodation.findMany({
      where: { id: { in: payloadAccIds } },
      select: { id: true, tripId: true },
    });
    if (owned.length !== payloadAccIds.length || owned.some((a) => a.tripId !== tripId)) {
      return { success: false, errors: { id: ["Restore payload names accommodations from another trip."] } };
    }
  }

  await db.$transaction(async (tx) => {
    // Lock the WHOLE plan's stops FOR UPDATE, in canonical id order, to
    // serialise with concurrent reorders (ADR 0007 — never a subset: the
    // recomputeChapterSpans call below reads the whole plan while this lock
    // is held).
    await lockPlanStopsTx(tx, tripId, restoreForkId);

    // Write every snapshotted field verbatim — no reflow, no derivation.
    for (const e of entries) {
      await tx.stop.update({
        where: { id: e.id },
        data: {
          sortOrder: e.sortOrder,
          chapterId: e.chapterId,
          arriveDate: e.arriveDate,
          departDate: e.departDate,
        },
      });
    }

    // ADR 0038: restore the payload's pre-image dates verbatim, same as stops.
    for (const item of payload?.items ?? []) {
      await tx.item.update({
        where: { id: item.id },
        // ADR 0055: an entry that names its owning Stop is the Undo of a
        // re-file, so put the Item back on it. A plain date restore emits the
        // same `{ date }` write it always did.
        data: { date: item.date, ...(item.stopId ? { stopId: item.stopId } : {}) },
      });
    }
    for (const acc of payload?.accommodations ?? []) {
      await tx.accommodation.update({ where: { id: acc.id }, data: { checkIn: acc.checkIn, checkOut: acc.checkOut } });
    }

    // Bring chapter date-bands back in sync with the restored dates.
    await recomputeChapterSpans(tx, tripId, restoreForkId);
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/plan`);
  return { success: true };
}

/**
 * Compute a trip's projected end + its hard end date in one round trip, for
 * feeding the Flag detector on the Summary and Home (which don't otherwise
 * load the full stop set). See computeProjectedEnd / ADR 0013.
 */
export async function getTripProjection(
  tripId: string,
  forkId?: PlanId,
): Promise<{ projectedEnd: string | null; hardEndDate: string | null }> {
  await requireTripAccess(tripId);
  const [trip, stops] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, hardEndDate: true } }),
    db.stop.findMany({
      where: { tripId, ...planScope(forkId) },
      orderBy: { sortOrder: "asc" },
      select: { id: true, arriveDate: true, departDate: true, nights: true, pinned: true, sortOrder: true },
    }),
  ]);
  return {
    projectedEnd: computeProjectedEnd(stops, trip?.startDate ?? null),
    hardEndDate: trip?.hardEndDate ?? null,
  };
}
