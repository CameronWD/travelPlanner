"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { stopSchema, type StopInput } from "@/lib/validations/stop";
import { geocodePlace } from "@/lib/geocode";
import { flowDates, type FlowStop } from "@/lib/firm-up";
import { nightsBetween } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type StopActionResult =
  | { success: true }
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
    await db.stop.create({
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

  await db.stop.create({
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

  if (parsed.data.mode === "rough") {
    const { name, country, nights, chapterId } = parsed.data;
    await db.stop.update({
      where: { id: stopId },
      data: {
        name,
        country: country ?? null,
        nights,
        chapterId: chapterId ?? null,
        arriveDate: null,
        departDate: null,
        timezone: null,
      },
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

  await db.stop.update({
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

  await db.stop.delete({ where: { id: stopId } });

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
  await db.$transaction(async (tx) => {
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
    if (idx === -1) return; // stop vanished mid-flight — nothing to do

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return; // no neighbour — no-op

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
  });

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Set the arrive/depart dates on a stop and ripple forward through
 * contiguous following dated non-pinned stops.
 */
export async function setStopDates(
  stopId: string,
  dates: { arriveDate: string; departDate: string },
): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
  if (dates.departDate < dates.arriveDate) {
    return { success: false, errors: { departDate: ["Depart date must be on or after arrive date"] } };
  }

  await db.stop.update({ where: { id: stopId }, data: { arriveDate: dates.arriveDate, departDate: dates.departDate } });

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

  if (run.length > 0) {
    const flowStops: FlowStop[] = run.map((s) => ({
      id: s.id,
      nights: s.nights,
      pinned: s.pinned,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
    }));
    const { results } = flowDates(flowStops, dates.departDate);
    for (const r of results) {
      if (r.changed && !r.pinned) {
        await db.stop.update({ where: { id: r.id }, data: { arriveDate: r.arriveDate, departDate: r.departDate } });
      }
    }
  }

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
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
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true } }),
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

  const { results } = flowDates(
    segment.map((s) => ({ id: s.id, nights: s.nights, pinned: false, arriveDate: null, departDate: null })),
    anchor,
  );

  const tripTz = stops.find((s) => s.timezone)?.timezone ?? "UTC";
  const segById = Object.fromEntries(segment.map((s) => [s.id, s]));
  for (const r of results) {
    const s = segById[r.id];
    let timezone = s.timezone ?? null;
    if (!timezone) {
      const coords = await geocodePlace([s.name, s.country].filter(Boolean).join(", "));
      timezone = tripTz;
      await db.stop.update({
        where: { id: r.id },
        data: {
          arriveDate: r.arriveDate,
          departDate: r.departDate,
          timezone,
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        },
      });
    } else {
      await db.stop.update({ where: { id: r.id }, data: { arriveDate: r.arriveDate, departDate: r.departDate, timezone } });
    }
  }

  if (chapterId) {
    const start = results[0].arriveDate;
    const end = results[results.length - 1].departDate;
    await db.chapter.update({ where: { id: chapterId }, data: { startDate: start, endDate: end } });
  }

  revalidatePath(`/trips/${tripId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Task 12: toggleStopPin, makeStopRough, assignStopToChapter
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
  await db.stop.update({
    where: { id: stopId },
    data: { arriveDate: null, departDate: null, timezone: null, pinned: false, nights },
  });
  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Assign (or unassign) a stop to a chapter, appending to the end of that chapter's order.
 */
export async function assignStopToChapter(stopId: string, chapterId: string | null): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
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
  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}
