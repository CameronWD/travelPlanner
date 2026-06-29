"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { stopSchema, type StopInput } from "@/lib/validations/stop";
import { geocodePlace } from "@/lib/geocode";
import { flowDates, computeProjectedEnd, type FlowStop, type FlowConflict } from "@/lib/firm-up";
import { nightsBetween, formatLongDate, addDays } from "@/lib/dates";
import { recordActivity } from "@/server/actions/activity";
import { entityLabel, describeChanges } from "@/lib/activity";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type StopActionResult =
  | { success: true; conflicts?: FlowConflict[] }
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
    },
  });
  if (!stop) {
    notFound();
  }
  // Also verify the user is a member of the trip
  await requireTripAccess(stop.tripId);
  return stop;
}

function validationErrors(error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } }): StopActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, msgs] of Object.entries(error.flatten().fieldErrors)) {
    fieldErrors[key] = msgs ?? [];
  }
  return { success: false, errors: fieldErrors };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new stop in the given trip.
 *
 * Handles both rough and scheduled modes.
 * For scheduled stops: if no lat/lng are provided, best-effort geocodes the name+country.
 * sortOrder is set to (max existing + 1).
 */
export async function createStop(
  tripId: string,
  input: StopInput,
): Promise<StopActionResult> {
  await requireTripAccess(tripId);

  const parsed = stopSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const maxStop = await db.stop.findFirst({
    where: { tripId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxStop?.sortOrder ?? -1) + 1;

  if (parsed.data.mode === "rough") {
    const { name, country, nights, chapterId, notes } = parsed.data;
    const created = await db.stop.create({
      data: {
        tripId,
        name,
        country: country ?? null,
        nights,
        chapterId: chapterId ?? null,
        arriveDate: null,
        departDate: null,
        timezone: null,
        lat: null,
        lng: null,
        notes: notes ?? null,
        pinned: false,
        sortOrder,
      },
    });
    await recordActivity({ tripId, verb: "CREATED", entityType: "STOP", entityId: created.id, entityLabel: entityLabel("STOP", created as unknown as Record<string, unknown>) });
    revalidatePath(`/trips/${tripId}`);
    return { success: true };
  }

  // scheduled
  const { name, country, timezone, arriveDate, departDate, notes } = parsed.data;
  let { lat, lng } = parsed.data;

  // Best-effort geocode if coords are missing
  if (lat === undefined || lng === undefined) {
    const coords = await geocodePlace([name, country].filter(Boolean).join(", "));
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  const created = await db.stop.create({
    data: {
      tripId,
      name,
      country: country ?? null,
      timezone,
      arriveDate,
      departDate,
      lat: lat ?? null,
      lng: lng ?? null,
      notes: notes ?? null,
      pinned: false,
      sortOrder,
    },
  });

  await recordActivity({ tripId, verb: "CREATED", entityType: "STOP", entityId: created.id, entityLabel: entityLabel("STOP", created as unknown as Record<string, unknown>) });
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
    return validationErrors(parsed.error);
  }

  const before = await db.stop.findUnique({ where: { id: stopId } });

  if (parsed.data.mode === "rough") {
    const { name, country, nights, chapterId, notes } = parsed.data;
    const updated = await db.stop.update({
      where: { id: stopId },
      data: {
        name,
        country: country ?? null,
        nights,
        chapterId: chapterId ?? null,
        notes: notes ?? null,
        arriveDate: null,
        departDate: null,
        timezone: null,
      },
    });
    await recordActivity({
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
  if (lat === undefined || lng === undefined) {
    const query = [name, country].filter(Boolean).join(", ");
    const coords = await geocodePlace(query);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  const updated = await db.stop.update({
    where: { id: stopId },
    data: {
      name,
      country: country ?? null,
      timezone,
      arriveDate,
      departDate,
      lat: lat ?? null,
      lng: lng ?? null,
      notes: notes ?? null,
    },
  });

  await recordActivity({
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

  const doomed = await db.stop.findUnique({ where: { id: stopId }, select: { name: true } });
  await db.stop.delete({ where: { id: stopId } });
  await recordActivity({ tripId: stop.tripId, verb: "DELETED", entityType: "STOP", entityId: stopId, entityLabel: doomed?.name ?? "" });

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
    // Lock the trip's stops in sortOrder. A concurrent reorder blocks here until
    // we commit, then re-reads the corrected order — closing the read-then-swap
    // race. Prisma can't express SELECT ... FOR UPDATE on findMany, so use raw SQL.
    const siblings = await tx.$queryRaw<Array<{ id: string; sortOrder: number }>>`
      SELECT "id", "sortOrder"
      FROM "Stop"
      WHERE "tripId" = ${stop.tripId}
      ORDER BY "sortOrder" ASC
      FOR UPDATE
    `;

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
    await recordActivity({
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
 * Internal helper: apply new dates to an already-resolved stop and ripple
 * forward through contiguous following dated non-pinned stops.
 *
 * Callers are responsible for auth (requireStopAccess) and depart>=arrive
 * validation before calling this function.
 */
async function applyStopDates(
  stop: { id: string; tripId: string; sortOrder: number },
  dates: { arriveDate: string; departDate: string },
): Promise<StopActionResult> {
  const before = await db.stop.findUnique({
    where: { id: stop.id },
    select: { name: true, country: true, arriveDate: true, departDate: true, nights: true },
  });

  await db.stop.update({ where: { id: stop.id }, data: { arriveDate: dates.arriveDate, departDate: dates.departDate } });

  await recordActivity({
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

  const following = await db.stop.findMany({
    where: { tripId: stop.tripId, sortOrder: { gt: stop.sortOrder } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true, nights: true, pinned: true, arriveDate: true, departDate: true },
  });

  // Collect the contiguous run of already-dated stops; stop at the first rough stop.
  const run: typeof following = [];
  for (const s of following) {
    if (!s.arriveDate) break;
    run.push(s);
  }

  let conflicts: FlowConflict[] = [];
  let maxDepart = dates.departDate;
  if (run.length > 0) {
    const flowStops: FlowStop[] = run.map((s) => ({
      id: s.id,
      nights: s.arriveDate && s.departDate ? nightsBetween(s.arriveDate, s.departDate) : s.nights,
      pinned: s.pinned,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
    }));
    const flowed = flowDates(flowStops, dates.departDate);
    conflicts = flowed.conflicts;
    for (const r of flowed.results) {
      if (r.departDate > maxDepart) maxDepart = r.departDate;
      if (r.changed && !r.pinned) {
        await db.stop.update({ where: { id: r.id }, data: { arriveDate: r.arriveDate, departDate: r.departDate } });
      }
    }
  }

  // Auto-grow the trip's window so the furthest date we just wrote stays
  // visible in calendar/day/budget views (which only enumerate [start, end]).
  // Never shrink endDate.
  const trip = await db.trip.findUnique({ where: { id: stop.tripId }, select: { endDate: true } });
  if (!trip?.endDate || trip.endDate < maxDepart) {
    await db.trip.update({ where: { id: stop.tripId }, data: { endDate: maxDepart } });
  }

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true, conflicts };
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
}

/**
 * Date all rough stops in the given chapter (or ungrouped if chapterId is null/undefined).
 * Anchor = depart of nearest preceding scheduled stop, else trip.startDate, else args.anchorDate.
 * Geocodes each newly-dated stop (best-effort, for coords) and sets timezone.
 * Updates the chapter's startDate/endDate to span its now-dated stops.
 */
export async function firmUpSegment(args: FirmUpSegmentArgs): Promise<StopActionResult> {
  const { tripId, chapterId } = args;
  await requireTripAccess(tripId);

  const [trip, stops] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, endDate: true } }),
    db.stop.findMany({
      where: { tripId },
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
    const coords = await geocodePlace([s.name, s.country].filter(Boolean).join(", "));
    const timezone = s.timezone ?? tripTz;
    await db.stop.update({
      where: { id: r.id },
      data: {
        arriveDate: r.arriveDate,
        departDate: r.departDate,
        timezone,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      },
    });
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
    const start = results[0].arriveDate;
    const end = results[results.length - 1].departDate;
    const beforeCh = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { name: true, startDate: true, endDate: true },
    });
    await db.chapter.update({ where: { id: chapterId }, data: { startDate: start, endDate: end } });
    await recordActivity({
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
    await recordActivity({
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
  await recordActivity({
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

  await db.stop.update({
    where: { id: stopId },
    data: { arriveDate: null, departDate: null, timezone: null, pinned: false, nights },
  });

  await recordActivity({
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
  await recordActivity({
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
  await recordActivity({
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
      where: { tripId: stop.tripId, chapterId },
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
    await recordActivity({
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
 * sortOrder = index for the given stops, and reassigns a ROUGH stop's chapterId.
 * Dated stops keep date-band chapter membership (chapterId ignored for them).
 * Locked FOR UPDATE to serialise with moveStop/other reorders (cf. ADR 0007).
 */
export async function reorderStops(
  tripId: string,
  items: { id: string; chapterId: string | null }[],
): Promise<StopActionResult> {
  await requireTripAccess(tripId);
  if (items.length === 0) return { success: true };

  // Pre-validate: reject any target chapter that is DATED (has a startDate).
  // We fetch all unique chapterIds from the items list; if any resolved chapter
  // carries a startDate the move is illegal — rough stops can never enter a
  // dated chapter (R1). We don't error on chapters that aren't found here;
  // that case is either irrelevant (dated stop whose chapterId will be ignored)
  // or caught by the DB foreign-key constraint on write.
  const targetChapterIds = [...new Set(items.map((i) => i.chapterId).filter((c): c is string => c != null))];
  if (targetChapterIds.length > 0) {
    const chapters = await db.chapter.findMany({
      where: { id: { in: targetChapterIds }, tripId },
      select: { id: true, startDate: true },
    });
    for (const ch of chapters) {
      if (ch.startDate != null) {
        return {
          success: false,
          errors: { chapterId: ["Can't move a rough stop into a dated chapter."] },
        };
      }
    }
  }

  const ids = items.map((i) => i.id);

  try {
    await db.$transaction(async (tx) => {
      // Lock the trip's stops FOR UPDATE to serialise concurrent reorders (ADR 0007).
      // Prisma can't express SELECT ... FOR UPDATE on findMany, so use raw SQL.
      const rows = await tx.$queryRaw<Array<{ id: string; tripId: string; arriveDate: string | null }>>`
        SELECT "id", "tripId", "arriveDate"
        FROM "Stop"
        WHERE "id" = ANY(${ids})
        FOR UPDATE
      `;
      const byId = new Map(rows.map((r) => [r.id, r]));

      // Every id must exist and belong to this trip.
      for (const id of ids) {
        const r = byId.get(id);
        if (!r || r.tripId !== tripId) throw new Error("STOP_NOT_IN_TRIP");
      }

      // Write sortOrder for every stop; write chapterId only for rough stops.
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const isRough = byId.get(it.id)!.arriveDate == null;
        await tx.stop.update({
          where: { id: it.id },
          data: isRough ? { sortOrder: idx, chapterId: it.chapterId } : { sortOrder: idx },
        });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STOP_NOT_IN_TRIP") {
      return { success: false, errors: { id: ["One or more stops aren't part of this trip."] } };
    }
    throw e;
  }

  revalidatePath(`/trips/${tripId}`);
  return { success: true };
}

/**
 * Compute a trip's projected end + its hard end date in one round trip, for
 * feeding the Flag detector on the Summary and Home (which don't otherwise
 * load the full stop set). See computeProjectedEnd / ADR 0013.
 */
export async function getTripProjection(
  tripId: string,
): Promise<{ projectedEnd: string | null; hardEndDate: string | null }> {
  await requireTripAccess(tripId);
  const [trip, stops] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, hardEndDate: true } }),
    db.stop.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, arriveDate: true, departDate: true, nights: true, pinned: true, sortOrder: true },
    }),
  ]);
  return {
    projectedEnd: computeProjectedEnd(stops, trip?.startDate ?? null),
    hardEndDate: trip?.hardEndDate ?? null,
  };
}
