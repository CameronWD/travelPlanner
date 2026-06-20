"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { itemSchema, type ItemInput } from "@/lib/validations/item";

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

  // Validate stopId belongs to this trip
  if (data.stopId) {
    const stop = await db.stop.findUnique({
      where: { id: data.stopId },
      select: { id: true, tripId: true },
    });
    if (!stop || stop.tripId !== tripId) {
      return {
        success: false,
        errors: { stopId: ["Stop does not belong to this trip"] },
      };
    }
  }

  // Sort order: max + 1 within the trip
  const maxItem = await db.item.findFirst({
    where: { tripId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxItem?.sortOrder ?? -1) + 1;

  await db.item.create({
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
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      sortOrder,
    },
  });

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

  // Validate stopId belongs to this trip
  if (data.stopId) {
    const stop = await db.stop.findUnique({
      where: { id: data.stopId },
      select: { id: true, tripId: true },
    });
    if (!stop || stop.tripId !== item.tripId) {
      return {
        success: false,
        errors: { stopId: ["Stop does not belong to this trip"] },
      };
    }
  }

  await db.item.update({
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
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    },
  });

  revalidateItemPaths(item.tripId);
  return { success: true };
}

/**
 * Delete an item.
 */
export async function deleteItem(itemId: string): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  await db.item.delete({ where: { id: itemId } });

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

  await db.item.update({
    where: { id: itemId },
    data: {
      date,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
    },
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

  await db.item.update({
    where: { id: itemId },
    data: {
      date: null,
      startTime: null,
      endTime: null,
    },
  });

  revalidateItemPaths(item.tripId);
  return { success: true };
}
