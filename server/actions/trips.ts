"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { requireUser, requireTripAccess } from "@/lib/guards";
import {
  createTripSchema,
  tripSchema,
  type CreateTripInput,
  type TripInput,
} from "@/lib/validations/trip";

export type CreateTripResult =
  | { success: true; tripId: string }
  | { success: false; errors: Record<string, string[]> };

/**
 * Server action: validate input, create a Trip and an owner TripMember for the
 * current user in a transaction, then redirect to the new trip overview.
 *
 * Returns a typed error result on validation failure so the form can show
 * errors inline. On success it redirects (Next.js redirect throws, so it never
 * actually returns the success object in production — but it's typed for test
 * purposes).
 */
export async function createTrip(
  input: CreateTripInput,
): Promise<CreateTripResult> {
  const user = await requireUser();

  const parsed = createTripSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, msgs] of Object.entries(
      parsed.error.flatten().fieldErrors,
    )) {
      fieldErrors[key] = msgs ?? [];
    }
    return { success: false, errors: fieldErrors };
  }

  const { name, startDate, endDate, homeCurrency } = parsed.data;

  const trip = await db.$transaction(async (tx) => {
    const newTrip = await tx.trip.create({
      data: {
        name,
        startDate,
        endDate,
        homeCurrency,
        createdById: user.id,
      },
    });

    await tx.tripMember.create({
      data: {
        tripId: newTrip.id,
        userId: user.id,
        role: "owner",
      },
    });

    return newTrip;
  });

  redirect(`/trips/${trip.id}`);

  // TypeScript: redirect() throws, but the return type still needs to match.
  // This line is unreachable in practice.
  return { success: true, tripId: trip.id };
}

// ---------------------------------------------------------------------------
// updateTrip
// ---------------------------------------------------------------------------

export type UpdateTripResult =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

/**
 * Update a trip's name, dates, and home currency.
 *
 * Note: changing homeCurrency doesn't retro-convert already-snapshotted cost
 * rates (rateToHome on Cost rows). That's intentional — the budget page can
 * refresh rates explicitly when needed.
 */
export async function updateTrip(
  tripId: string,
  input: TripInput,
): Promise<UpdateTripResult> {
  await requireTripAccess(tripId);

  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, msgs] of Object.entries(
      parsed.error.flatten().fieldErrors,
    )) {
      fieldErrors[key] = msgs ?? [];
    }
    return { success: false, errors: fieldErrors };
  }

  const { name, startDate, endDate, homeCurrency } = parsed.data;

  await db.trip.update({
    where: { id: tripId },
    data: { name, startDate, endDate, homeCurrency },
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// deleteTrip
// ---------------------------------------------------------------------------

export type DeleteTripResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Delete a trip. Owner-only.
 *
 * Cascade-deletes all stops, items, costs, members, invites, etc. via Prisma's
 * onDelete: Cascade relations. After deletion, redirects to /trips.
 */
export async function deleteTrip(tripId: string): Promise<DeleteTripResult> {
  const { membership } = await requireTripAccess(tripId);

  if (membership.role !== "owner") {
    return { success: false, error: "Only the trip owner can delete the trip." };
  }

  // Best-effort: remove attachment blobs before the rows cascade away, so we
  // don't orphan files in storage. Failures here must not block the delete.
  const attachments = await db.attachment.findMany({
    where: { tripId, storageKey: { not: null } },
    select: { storageKey: true },
  });
  if (attachments.length > 0) {
    const storage = getStorage();
    await Promise.all(
      attachments.map((a) =>
        a.storageKey ? storage.delete(a.storageKey).catch(() => {}) : null,
      ),
    );
  }

  await db.trip.delete({ where: { id: tripId } });

  redirect("/trips");

  // Unreachable — redirect() throws, return satisfies the type.
  return { success: true };
}
