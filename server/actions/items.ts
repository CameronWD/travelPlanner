"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { itemSchema, type ItemInput } from "@/lib/validations/item";
import { stopForDate } from "@/lib/itinerary";
import { geocodePlace } from "@/lib/geocode";
import { recordActivity } from "@/server/actions/activity";
import { entityLabel, describeChanges } from "@/lib/activity";
import { REAL_PLAN } from "@/lib/plan-scope";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ItemActionResult =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up an item and verify the current user has access to its trip.
 * Returns the item (with tripId) or throws notFound().
 */
async function requireItemAccess(itemId: string): Promise<{
  id: string;
  tripId: string;
}> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, tripId: true },
  });
  if (!item) {
    notFound();
  }
  await requireTripAccess(item.tripId);
  return item;
}

function validationErrors(
  error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } },
): ItemActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, msgs] of Object.entries(error.flatten().fieldErrors)) {
    fieldErrors[key] = msgs ?? [];
  }
  return { success: false, errors: fieldErrors };
}

/**
 * Revalidate all relevant trip pages after mutating an item.
 */
function revalidateItemPaths(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/wishlist`);
  revalidatePath(`/trips/${tripId}/calendar`);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new item.
 *
 * - Validates input via itemSchema.
 * - If stopId is provided, verifies it belongs to the trip.
 * - sortOrder = max existing sortOrder in the trip + 1.
 */
export async function createItem(
  tripId: string,
  input: ItemInput,
): Promise<ItemActionResult> {
  await requireTripAccess(tripId);

  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const data = parsed.data;

  // Validate stopId belongs to this trip (and is a real-plan stop)
  if (data.stopId) {
    const stop = await db.stop.findUnique({
      where: { id: data.stopId },
      select: { id: true, tripId: true, forkId: true },
    });
    if (!stop || stop.tripId !== tripId || stop.forkId !== null) {
      return {
        success: false,
        errors: { stopId: ["Stop does not belong to this trip"] },
      };
    }
  }

  // Sort order: max + 1 within the real plan
  const maxItem = await db.item.findFirst({
    where: { tripId, ...REAL_PLAN },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxItem?.sortOrder ?? -1) + 1;

  // Best-effort geocode from address
  let lat: number | null = null;
  let lng: number | null = null;
  if (data.address) {
    const coords = await geocodePlace(data.address);
    lat = coords?.lat ?? null;
    lng = coords?.lng ?? null;
  }

  const created = await db.item.create({
    data: {
      tripId,
      stopId: data.stopId ?? null,
      title: data.title,
      category: data.category,
      date: data.date ?? null,
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      address: data.address ?? null,
      link: data.link ?? null,
      booking: data.booking ?? null,
      notes: data.notes ?? null,
      lat,
      lng,
      sortOrder,
    },
  });

  await recordActivity({ tripId, verb: "CREATED", entityType: "ITEM", entityId: created.id, entityLabel: entityLabel("ITEM", created as unknown as Record<string, unknown>) });
  revalidateItemPaths(tripId);
  return { success: true };
}

/**
 * Update an existing item.
 *
 * - Access-checked via requireItemAccess → requireTripAccess.
 * - If stopId changed, validates it still belongs to the same trip.
 */
export async function updateItem(
  itemId: string,
  input: ItemInput,
): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const data = parsed.data;

  // Validate stopId belongs to this trip (and is a real-plan stop)
  if (data.stopId) {
    const stop = await db.stop.findUnique({
      where: { id: data.stopId },
      select: { id: true, tripId: true, forkId: true },
    });
    if (!stop || stop.tripId !== item.tripId || stop.forkId !== null) {
      return {
        success: false,
        errors: { stopId: ["Stop does not belong to this trip"] },
      };
    }
  }

  const before = await db.item.findUnique({ where: { id: itemId } });

  // Best-effort geocode from address
  let lat: number | null = null;
  let lng: number | null = null;
  if (data.address) {
    const coords = await geocodePlace(data.address);
    lat = coords?.lat ?? null;
    lng = coords?.lng ?? null;
  }

  const updated = await db.item.update({
    where: { id: itemId },
    data: {
      stopId: data.stopId ?? null,
      title: data.title,
      category: data.category,
      date: data.date ?? null,
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      address: data.address ?? null,
      link: data.link ?? null,
      booking: data.booking ?? null,
      notes: data.notes ?? null,
      lat,
      lng,
    },
  });

  await recordActivity({
    tripId: item.tripId,
    verb: "UPDATED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", updated as unknown as Record<string, unknown>),
    changes: describeChanges("ITEM", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });
  revalidateItemPaths(item.tripId);
  return { success: true };
}

/**
 * Delete an item.
 */
export async function deleteItem(itemId: string): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  const doomed = await db.item.findUnique({ where: { id: itemId }, select: { title: true } });
  await db.item.delete({ where: { id: itemId } });
  await recordActivity({ tripId: item.tripId, verb: "DELETED", entityType: "ITEM", entityId: itemId, entityLabel: doomed?.title ?? "" });

  revalidateItemPaths(item.tripId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Scheduling actions
// ---------------------------------------------------------------------------

const scheduleDateSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format")
      .optional(),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format")
      .optional(),
  })
  .refine(
    (data) => {
      if (data.endTime && !data.startTime) return false;
      return true;
    },
    {
      message: "Start time is required when an end time is set",
      path: ["startTime"],
    },
  )
  .refine(
    (data) => {
      if (data.startTime && data.endTime && data.endTime < data.startTime)
        return false;
      return true;
    },
    {
      message: "End time must be on or after start time",
      path: ["endTime"],
    },
  );

export type ScheduleItemInput = z.infer<typeof scheduleDateSchema>;

/**
 * Schedule an item: set its date (and optional times), moving it from the
 * Wishlist onto the Timeline.
 *
 * The date is allowed to be outside the trip date range — this is a soft rule;
 * we store it as-is and the UI can warn.
 */
export async function scheduleItem(
  itemId: string,
  input: ScheduleItemInput,
): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  const parsed = scheduleDateSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const { date, startTime, endTime } = parsed.data;

  const before = await db.item.findUnique({ where: { id: itemId } });

  const updated = await db.item.update({
    where: { id: itemId },
    data: {
      date,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
    },
  });

  await recordActivity({
    tripId: item.tripId,
    verb: "UPDATED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", updated as unknown as Record<string, unknown>),
    changes: describeChanges("ITEM", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });

  revalidateItemPaths(item.tripId);
  return { success: true };
}

/**
 * Unschedule an item: clear its date and times, returning it to the Wishlist.
 */
export async function unscheduleItem(
  itemId: string,
): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  const before = await db.item.findUnique({ where: { id: itemId } });

  const updated = await db.item.update({
    where: { id: itemId },
    data: {
      date: null,
      startTime: null,
      endTime: null,
    },
  });

  await recordActivity({
    tripId: item.tripId,
    verb: "UPDATED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", updated as unknown as Record<string, unknown>),
    changes: describeChanges("ITEM", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });

  revalidateItemPaths(item.tripId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Rescheduling
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Move an item to `targetDateISO`, reassigning its stop to whichever stop covers
 * that day (null on a gap day). Keeps the item's existing start/end time. Used by
 * month-grid drag-to-reschedule and wishlist→day drops. Rejects dates outside the
 * trip window.
 */
export async function rescheduleItem(
  itemId: string,
  targetDateISO: string,
): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  if (!ISO_DATE_RE.test(targetDateISO)) {
    return { success: false, errors: { date: ["Date must be in YYYY-MM-DD format"] } };
  }

  const trip = await db.trip.findUnique({
    where: { id: item.tripId },
    select: { startDate: true, endDate: true },
  });
  if (!trip) notFound();

  // A date-less trip has no calendar window to reschedule onto.
  if (!trip.startDate || !trip.endDate) {
    return { success: false, errors: { date: ["This trip has no dates yet."] } };
  }

  if (targetDateISO < trip.startDate || targetDateISO > trip.endDate) {
    return { success: false, errors: { date: ["That day is outside the trip."] } };
  }

  const stops = await db.stop.findMany({
    // Only scheduled stops can cover a calendar day.
    where: { tripId: item.tripId, arriveDate: { not: null } },
    select: { id: true, name: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
  });

  const covering = stopForDate(
    stops.map((s) => ({
      id: s.id,
      name: s.name ?? "",
      timezone: s.timezone ?? "UTC",
      arriveDate: s.arriveDate!,
      departDate: s.departDate!,
      sortOrder: s.sortOrder,
    })),
    targetDateISO,
  );

  const before = await db.item.findUnique({ where: { id: itemId } });

  const updated = await db.item.update({
    where: { id: itemId },
    data: { date: targetDateISO, stopId: covering?.id ?? null },
  });

  await recordActivity({
    tripId: item.tripId,
    verb: "UPDATED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", updated as unknown as Record<string, unknown>),
    changes: describeChanges("ITEM", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });

  revalidateItemPaths(item.tripId);
  return { success: true };
}
