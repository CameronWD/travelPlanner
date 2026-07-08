"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { resolveRateForTrip, persistRate } from "@/lib/fx";
import { costSchema, type CostRawInput } from "@/lib/validations/cost";
import type { Cost } from "@prisma/client";
import { recordPlanActivity } from "@/lib/activity-guard";
import { entityLabel, describeChanges } from "@/lib/activity";
import { type PlanId } from "@/lib/plan-scope";
import { type ActionResult, validationResult } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type CostActionResult = ActionResult<{ cost?: Pick<Cost, "id"> }>;

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
  forkId: string | null;
}> {
  const cost = await db.cost.findUnique({
    where: { id: costId },
    select: { id: true, tripId: true, forkId: true },
  });
  if (!cost) {
    notFound();
  }
  await requireTripAccess(cost.tripId);
  return cost;
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
  forkId?: PlanId,
): Promise<CostActionResult> {
  await requireTripAccess(tripId);

  const parsed = costSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
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

  // Resolve the rate (incl. any network fetch) BEFORE opening a transaction —
  // a network call must never hold a DB transaction open (ADR 0007).
  const resolved = await resolveRateForTrip(tripId, data.currency, trip.homeCurrency, { db });

  // Persist a freshly fetched rate (if any) and create the cost atomically, so a
  // failed cost write never leaves a half-written rate cache behind.
  const cost = await db.$transaction(async (tx) => {
    if (resolved.persist) {
      await persistRate(tx, tripId, resolved.persist);
    }
    return tx.cost.create({
      data: {
        tripId,
        forkId: forkId ?? null,
        estimatedMinor: data.estimatedMinor,
        actualMinor: data.actualMinor ?? null,
        currency: data.currency,
        rateToHome: resolved.rate,
        paidAt: data.paidAt ?? null,
        ownerType: data.ownerType,
        ownerId: data.ownerId ?? null,
        label: data.label ?? null,
        category: data.category ?? null,
      },
      select: { id: true },
    });
  });

  await recordPlanActivity(forkId, { tripId, verb: "CREATED", entityType: "COST", entityId: cost.id, entityLabel: entityLabel("COST", data as unknown as Record<string, unknown>) });
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
    return validationResult(parsed.error);
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

  const resolved = await resolveRateForTrip(existing.tripId, data.currency, trip.homeCurrency, { db });

  const before = await db.cost.findUnique({ where: { id: costId } });

  const updated = await db.$transaction(async (tx) => {
    if (resolved.persist) {
      await persistRate(tx, existing.tripId, resolved.persist);
    }
    return tx.cost.update({
      where: { id: costId },
      data: {
        estimatedMinor: data.estimatedMinor,
        actualMinor: data.actualMinor ?? null,
        currency: data.currency,
        rateToHome: resolved.rate,
        paidAt: data.paidAt ?? null,
        ownerType: data.ownerType,
        ownerId: data.ownerId ?? null,
        label: data.label ?? null,
        category: data.category ?? null,
      },
    });
  });

  await recordPlanActivity(existing.forkId, {
    tripId: existing.tripId,
    verb: "UPDATED",
    entityType: "COST",
    entityId: costId,
    entityLabel: entityLabel("COST", updated as unknown as Record<string, unknown>),
    changes: describeChanges("COST", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });
  revalidateTripPaths(existing.tripId);
  return { success: true };
}

/**
 * Delete a cost.
 */
export async function deleteCost(costId: string): Promise<CostActionResult> {
  const existing = await requireCostAccess(costId);

  const doomed = await db.cost.findUnique({ where: { id: costId }, select: { label: true } });
  await db.cost.delete({ where: { id: costId } });
  await recordPlanActivity(existing.forkId, { tripId: existing.tripId, verb: "DELETED", entityType: "COST", entityId: costId, entityLabel: doomed?.label ?? "cost" });

  revalidateTripPaths(existing.tripId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Shape of a cost row as rendered by the entity cards. Pages fetch costs
 * inline via `db.cost.findMany` (after `requireTripAccess`) and pass rows
 * matching this shape to the cards.
 *
 * NOTE: this module is `"use server"`, so every runtime export must be an
 * async server action. We therefore keep this an explicit (compile-time only)
 * type rather than deriving it from an exported query helper — which would
 * have been an unauthenticated, callable server action that leaks cost rows
 * by entity id.
 */
export type CostRow = {
  id: string;
  estimatedMinor: number;
  actualMinor: number | null;
  currency: string;
  rateToHome: number | null;
  paidAt: Date | null;
  ownerType: string;
  ownerId: string | null;
  label: string | null;
  category: string | null;
};
