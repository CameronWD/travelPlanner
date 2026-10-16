"use server";

import { db } from "@/lib/db";
import { requireTripAccess, requirePlanAccess, requireRowAccess } from "@/lib/guards";
import { resolveRateForTrip, persistRate } from "@/lib/fx";
import { costSchema, paidAtStringSchema, MAX_AMOUNT_MINOR, type CostRawInput } from "@/lib/validations/cost";
import type { Cost } from "@prisma/client";
import { auditedUpdate, recordPlanActivity, recordUpdate } from "@/lib/activity-guard";
import { requireOutsideSurprise, type SurpriseRoot } from "@/lib/surprise-guard";
import { entityLabel } from "@/lib/activity";
import { type PlanId } from "@/lib/plan-scope";
import { type ActionResult, validationResult, formFail } from "@/lib/action-result";
import { revalidateTrip } from "@/lib/revalidate";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type CostActionResult = ActionResult<{ cost?: Pick<Cost, "id"> }>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up a cost → requireTripAccess(cost.tripId), then refuse a viewer
 * surprised by what the cost is owned by (CONTEXT.md Surprise).
 * Returns the cost with tripId, the viewer and the live Surprise it is
 * inside, or notFound().
 */
async function requireCostAccess(costId: string): Promise<{
  id: string;
  tripId: string;
  forkId: string | null;
  currency: string;
  ownerType: string;
  ownerId: string | null;
  viewerId: string;
  surpriseOf: SurpriseRoot | null;
}> {
  const { row, user, surpriseOf } = await requireRowAccess("cost", costId);
  return { ...row, viewerId: user.id, surpriseOf };
}

/**
 * Verify an owner entity (transport / accommodation / item) exists and belongs
 * to the given tripId. Returns an error result if the check fails, null if ok.
 * Then refuses (notFound) a viewer surprised by the owner (CONTEXT.md Surprise).
 */
async function verifyOwnerEntity(
  viewerId: string,
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

  await requireOutsideSurprise(viewerId, { costOwner: { ownerType, ownerId } });
  return null;
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
  const { user, plan } = await requirePlanAccess(tripId, forkId);

  const parsed = costSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const data = parsed.data;

  // Verify owner entity belongs to this trip (for non-OTHER costs)
  if (data.ownerType !== "OTHER" && data.ownerId) {
    const err = await verifyOwnerEntity(user.id, tripId, data.ownerType, data.ownerId);
    if (err) return err;
  }

  // Look up the trip's home currency
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { homeCurrency: true },
  });
  if (!trip) {
    return formFail("Trip not found");
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
        forkId: plan,
        costMinor: data.costMinor,
        paidMinor: data.paidMinor ?? null,
        currency: data.currency,
        rateToHome: resolved.rate,
        paidAt: data.paidAt ?? null,
        dueDate: data.dueDate ?? null,
        ownerType: data.ownerType,
        ownerId: data.ownerId ?? null,
        label: data.label ?? null,
        category: data.category ?? null,
        settlement: data.settlement,
      },
      select: { id: true },
    });
  });

  await recordPlanActivity(plan, { tripId, verb: "CREATED", entityType: "COST", entityId: cost.id, entityLabel: entityLabel("COST", data) });
  revalidateTrip(tripId, "money");
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
    const err = await verifyOwnerEntity(existing.viewerId, existing.tripId, data.ownerType, data.ownerId);
    if (err) return err;
  }

  // Look up the trip's home currency
  const trip = await db.trip.findUnique({
    where: { id: existing.tripId },
    select: { homeCurrency: true },
  });
  if (!trip) {
    return formFail("Trip not found");
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
        costMinor: data.costMinor,
        currency: data.currency,
        rateToHome: resolved.rate,
        paidAt: data.paidAt ?? null,
        dueDate: data.dueDate ?? null,
        ownerType: data.ownerType,
        ownerId: data.ownerId ?? null,
        label: data.label ?? null,
        category: data.category ?? null,
        settlement: data.settlement,
        // paidMinor is included only when the caller actually provided a
        // value — un-ticking Paid sends paidMinor: undefined (never null) so
        // the paid amount survives as history (CONTEXT.md "Paid"); omitting
        // the key here leaves Prisma's existing value untouched instead of
        // nulling it out.
        ...(data.paidMinor !== undefined && { paidMinor: data.paidMinor }),
        // A preserved (history) paid amount is denominated in the OLD currency; a
        // currency change with no accompanying payment invalidates it (P3-3).
        ...(data.currency !== existing.currency && data.paidMinor === undefined && !data.paidAt
          ? { paidMinor: null }
          : {}),
      },
    });
  });

  // Recorded only once the transaction has committed.
  await recordUpdate("COST", {
    tripId: existing.tripId,
    plan: existing.forkId ?? null,
    entityId: costId,
    before,
    after: updated,
  });
  revalidateTrip(existing.tripId, "money");
  return { success: true };
}

/**
 * Delete a cost.
 */
export async function deleteCost(costId: string): Promise<CostActionResult> {
  const existing = await requireCostAccess(costId);

  const doomed = await db.cost.findUnique({ where: { id: costId }, select: { label: true } });
  await db.cost.delete({ where: { id: costId } });
  await recordPlanActivity(existing.forkId, { tripId: existing.tripId, verb: "DELETED", entityType: "COST", entityId: costId, entityLabel: doomed?.label ?? "cost", surpriseOf: existing.surpriseOf });

  revalidateTrip(existing.tripId, "money");
  return { success: true };
}

/**
 * Mark a single Cost paid from the Budget checklist, without opening its
 * dialog. The amount is required (ADR 0037) — the caller offers it pre-filled
 * with the cost amount, so the common case is one tap.
 */
export async function markCostPaid(
  costId: string,
  paidMinor: number,
  paidAt: string,
): Promise<CostActionResult> {
  const cost = await db.cost.findUnique({
    where: { id: costId },
    select: { id: true, tripId: true, forkId: true, ownerType: true, ownerId: true },
  });
  if (!cost) return formFail("Cost not found");
  const { user } = await requireTripAccess(cost.tripId);
  await requireOutsideSurprise(user.id, { costOwner: cost });

  if (!Number.isInteger(paidMinor) || paidMinor < 0) {
    return { success: false, errors: { paidMinor: ["Enter what you paid"] } };
  }

  if (paidMinor > MAX_AMOUNT_MINOR) {
    return { success: false, errors: { paidMinor: ["Amount is too large"] } };
  }

  const parsedDate = paidAtStringSchema.safeParse(paidAt);
  if (!parsedDate.success) {
    return { success: false, errors: { paidAt: ["Enter when you paid"] } };
  }

  await auditedUpdate(
    "COST",
    db.cost,
    costId,
    { paidMinor, paidAt: new Date(parsedDate.data) },
    cost.forkId ?? null,
  );
  revalidateTrip(cost.tripId, "money");
  return { success: true };
}

/** Un-mark a Cost as paid. The paid amount stays as history. */
export async function markCostUnpaid(costId: string): Promise<CostActionResult> {
  const cost = await db.cost.findUnique({
    where: { id: costId },
    select: { id: true, tripId: true, forkId: true, ownerType: true, ownerId: true },
  });
  if (!cost) return formFail("Cost not found");
  const { user } = await requireTripAccess(cost.tripId);
  await requireOutsideSurprise(user.id, { costOwner: cost });

  await auditedUpdate("COST", db.cost, costId, { paidAt: null }, cost.forkId ?? null);
  revalidateTrip(cost.tripId, "money");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

// CostRow lives in lib/money/cost-row.ts; re-exported (type-only, erased) for the 27 component importers.
export type { CostRow } from "@/lib/money/cost-row";
