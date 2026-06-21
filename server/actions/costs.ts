"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getRateForTrip } from "@/lib/fx";
import { costSchema, type CostRawInput } from "@/lib/validations/cost";
import type { Cost } from "@prisma/client";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type CostActionResult =
  | { success: true; cost?: Pick<Cost, "id"> }
  | { success: false; errors: Record<string, string[]> };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up a cost → requireTripAccess(cost.tripId).
 * Returns the cost with tripId, or notFound().
 */
async function requireCostAccess(costId: string): Promise<{
  id: string;
  tripId: string;
}> {
  const cost = await db.cost.findUnique({
    where: { id: costId },
    select: { id: true, tripId: true },
  });
  if (!cost) {
    notFound();
  }
  await requireTripAccess(cost.tripId);
  return cost;
}

function validationErrors(
  error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } },
): CostActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, msgs] of Object.entries(error.flatten().fieldErrors)) {
    fieldErrors[key] = msgs ?? [];
  }
  return { success: false, errors: fieldErrors };
}

/**
 * Verify an owner entity (transport / accommodation / item) exists and belongs
 * to the given tripId. Returns an error result if the check fails, null if ok.
 */
async function verifyOwnerEntity(
  tripId: string,
  ownerType: string,
  ownerId: string,
): Promise<CostActionResult | null> {
  let entityTripId: string | null = null;

  switch (ownerType) {
    case "TRANSPORT": {
      const t = await db.transport.findUnique({
        where: { id: ownerId },
        select: { tripId: true },
      });
      entityTripId = t?.tripId ?? null;
      break;
    }
    case "ACCOMMODATION": {
      const a = await db.accommodation.findUnique({
        where: { id: ownerId },
        select: { tripId: true },
      });
      entityTripId = a?.tripId ?? null;
      break;
    }
    case "ITEM": {
      const i = await db.item.findUnique({
        where: { id: ownerId },
        select: { tripId: true },
      });
      entityTripId = i?.tripId ?? null;
      break;
    }
  }

  if (!entityTripId) {
    return {
      success: false,
      errors: { ownerId: ["Owner entity not found"] },
    };
  }

  if (entityTripId !== tripId) {
    return {
      success: false,
      errors: { ownerId: ["Owner entity does not belong to this trip"] },
    };
  }

  return null;
}

/**
 * Snapshot the FX rate for the given currency vs the trip's home currency.
 * Returns 1 if same currency, the rate from getRateForTrip otherwise (may be null).
 */
async function snapshotRate(
  tripId: string,
  currency: string,
  homeCurrency: string,
): Promise<number | null> {
  if (currency.toUpperCase() === homeCurrency.toUpperCase()) {
    return 1;
  }
  return getRateForTrip(tripId, currency, homeCurrency, { db });
}

function revalidateTripPaths(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/budget`);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new cost on a trip.
 *
 * - Access-checks via requireTripAccess(tripId).
 * - Validates ownerType + ownerId cross-trip.
 * - Snapshots rateToHome at creation time.
 */
export async function createCost(
  tripId: string,
  input: CostRawInput,
): Promise<CostActionResult> {
  await requireTripAccess(tripId);

  const parsed = costSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const data = parsed.data;

  // Verify owner entity belongs to this trip (for non-OTHER costs)
  if (data.ownerType !== "OTHER" && data.ownerId) {
    const err = await verifyOwnerEntity(tripId, data.ownerType, data.ownerId);
    if (err) return err;
  }

  // Look up the trip's home currency
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { homeCurrency: true },
  });
  if (!trip) {
    return {
      success: false,
      errors: { _form: ["Trip not found"] },
    };
  }

  // Snapshot the rate
  const rateToHome = await snapshotRate(tripId, data.currency, trip.homeCurrency);

  const cost = await db.cost.create({
    data: {
      tripId,
      estimatedMinor: data.estimatedMinor,
      actualMinor: data.actualMinor ?? null,
      currency: data.currency,
      rateToHome,
      paidAt: data.paidAt ?? null,
      ownerType: data.ownerType,
      ownerId: data.ownerId ?? null,
      label: data.label ?? null,
      category: data.category ?? null,
    },
    select: { id: true },
  });

  revalidateTripPaths(tripId);
  return { success: true, cost };
}

/**
 * Update an existing cost.
 *
 * - Access-checks via requireCostAccess → requireTripAccess.
 * - Re-snapshots rateToHome (currency may have changed).
 */
export async function updateCost(
  costId: string,
  input: CostRawInput,
): Promise<CostActionResult> {
  const existing = await requireCostAccess(costId);

  const parsed = costSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const data = parsed.data;

  // Verify owner entity belongs to this trip (for non-OTHER costs)
  if (data.ownerType !== "OTHER" && data.ownerId) {
    const err = await verifyOwnerEntity(existing.tripId, data.ownerType, data.ownerId);
    if (err) return err;
  }

  // Look up the trip's home currency
  const trip = await db.trip.findUnique({
    where: { id: existing.tripId },
    select: { homeCurrency: true },
  });
  if (!trip) {
    return {
      success: false,
      errors: { _form: ["Trip not found"] },
    };
  }

  // Re-snapshot the rate
  const rateToHome = await snapshotRate(existing.tripId, data.currency, trip.homeCurrency);

  await db.cost.update({
    where: { id: costId },
    data: {
      estimatedMinor: data.estimatedMinor,
      actualMinor: data.actualMinor ?? null,
      currency: data.currency,
      rateToHome,
      paidAt: data.paidAt ?? null,
      ownerType: data.ownerType,
      ownerId: data.ownerId ?? null,
      label: data.label ?? null,
      category: data.category ?? null,
    },
  });

  revalidateTripPaths(existing.tripId);
  return { success: true };
}

/**
 * Delete a cost.
 */
export async function deleteCost(costId: string): Promise<CostActionResult> {
  const existing = await requireCostAccess(costId);

  await db.cost.delete({ where: { id: costId } });

  revalidateTripPaths(existing.tripId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all costs for a specific owner entity.
 * Used by server components that render cards.
 */
export async function getCostsForEntity(
  ownerType: "TRANSPORT" | "ACCOMMODATION" | "ITEM",
  ownerId: string,
) {
  return db.cost.findMany({
    where: { ownerType, ownerId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      estimatedMinor: true,
      actualMinor: true,
      currency: true,
      rateToHome: true,
      paidAt: true,
      ownerType: true,
      ownerId: true,
      label: true,
      category: true,
    },
  });
}

export type CostRow = Awaited<ReturnType<typeof getCostsForEntity>>[number];
