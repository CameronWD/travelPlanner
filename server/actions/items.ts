"use server";

import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTripAccess, requirePlanAccess, requireRowAccess } from "@/lib/guards";
import { itemSchema, type ItemInput } from "@/lib/validations/item";
import { resolveOwningStop, type ItineraryStop } from "@/lib/itinerary";
import { geocodePlaceDetailed } from "@/lib/geocode";
import { auditedUpdate, recordPlanActivity, recordUpdate } from "@/lib/activity-guard";
import { requireOutsideSurprise, surpriseRootFor } from "@/lib/surprise-guard";
import { entityLabel } from "@/lib/activity";
import { planScope, REAL_PLAN, type PlanId } from "@/lib/plan-scope";
import { resolveRateForTrip, persistRate } from "@/lib/money/fx";
import { getUserGlobe } from "@/lib/globe";
import { markerToWishlistItemData } from "@/lib/marker-to-item";
import type { MarkerView } from "@/components/globe/types";
import { type ActionResult, validationResult } from "@/lib/action-result";
import { applyPatch, type Patch } from "@/lib/patch";
import { completeInlineCost, OWNED_COST_SELECT } from "@/lib/money/cost-patch";
import { cleanupTargetSideDataTx } from "@/server/actions/target-cleanup";
import { deleteOwnedCostsTx } from "@/server/actions/owned-costs";
import { copyItemPhoto } from "@/lib/item-photo-copy";
import { setSurprise, revealSurprise } from "@/server/actions/surprise";
import { validateSurpriseFor } from "@/lib/surprise";
import { revalidateTrip } from "@/lib/revalidate";
import { isoDate, hhmm } from "@/lib/validations/primitives";
import { ARRIVE_BY_NEEDS_SLOT_MESSAGE, arriveByMinutesSchema, slotTimeSchema } from "@/lib/validations/planning";
import { resolveBookingWrite, defaultBookingFields, copiedBookingFields } from "@/lib/booking-state-patch";
import { startFromSlot } from "@/lib/slot-time";
import { openingHoursSchema, parseOpeningHours, serializeOpeningHours } from "@/lib/validations/opening-hours";
import { openingHoursFamilyRoot, openingHoursFamilyWhere, type OpeningHours } from "@/lib/opening-hours";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ItemActionResult = ActionResult;

/**
 * updateItem's "Surprise for…" (CONTEXT.md Surprise), applied after the Item is written
 * (createItem checks first and applies its own):
 * ticked names set (or change) the Surprise; clearing every box on a live one reveals it.
 * Only the planner may do either. setSurprise/revealSurprise refuse anyone else, and
 * that refusal is reported on the field.
 */
async function applySurpriseFor(
  itemId: string,
  forIds: string[] | undefined,
  existing: { surprisePlannerId?: string | null; surpriseRevealedAt?: Date | null } | null,
): Promise<ItemActionResult> {
  if (forIds === undefined) return { success: true };
  let result: ActionResult;
  if (forIds.length > 0) result = await setSurprise({ kind: "ITEM", id: itemId, forIds });
  else if (existing?.surprisePlannerId && !existing.surpriseRevealedAt) result = await revealSurprise({ kind: "ITEM", id: itemId });
  else return { success: true };
  if (result.success) return { success: true };
  const message = Object.values(result.errors).flat()[0] ?? "Couldn't change who this is a surprise for.";
  return { success: false, errors: { surpriseForIds: [message] } };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Thin adapter over `requireRowAccess("item", id)` (lib/guards.ts): loads the
 * Item (id, tripId, forkId, stopId, date, photoAttachmentId — `ROW_SELECT.item`),
 * checks trip access and the live Surprise it is inside, and throws
 * notFound() otherwise.
 */
async function requireItemAccess(itemId: string) {
  const { row, user, surpriseOf } = await requireRowAccess("item", itemId);
  return { ...row, viewerId: user.id, surpriseOf };
}

/**
 * Load the scheduled Stops of one plan, shaped for `resolveOwningStop`
 * (ADR 0049 rule 4). Every call site that moves or places an Item onto a
 * date needs this: `stopForDate` alone resolves a Changeover day — one two
 * consecutive Stops both claim — to the arriving Stop, which would silently
 * move an Item's Cost from one Stop's Budget line to the next every time
 * something landed on that shared day. `resolveOwningStop` avoids that by
 * preferring an existing owner that still covers the date, but it needs the
 * full plan-scoped Stop list to check coverage against.
 *
 * `forkId` is a parameter rather than closed over so each call site scopes
 * to its own plan — a Fork placement validates against Fork Stops, a
 * real-plan move against real-plan Stops (`lib/plan-scope.ts`).
 */
async function loadPlanStopsForOwnership(
  tripId: string,
  forkId: string | null,
): Promise<ItineraryStop[]> {
  const rows = await db.stop.findMany({
    // Only scheduled stops can cover a calendar day.
    where: { tripId, ...planScope(forkId), arriveDate: { not: null } },
    select: { id: true, name: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name ?? "",
    timezone: s.timezone ?? "UTC",
    arriveDate: s.arriveDate!,
    departDate: s.departDate!,
    sortOrder: s.sortOrder,
  }));
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
  forkId?: PlanId,
): Promise<ActionResult<{ id: string }>> {
  const { user, plan } = await requirePlanAccess(tripId, forkId);

  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const data = parsed.data;
  // CONTEXT.md "Booking state": stored as the effective state (a reference implies Booked).
  const booking = resolveBookingWrite("ITEM", null, { bookingState: data.bookingState, bookBy: data.bookBy }, data.booking);
  if ("success" in booking) return booking;

  // Validate stopId belongs to this trip and the same plan
  let stopTimezone: string | null = null;
  if (data.stopId) {
    const stop = await db.stop.findUnique({
      where: { id: data.stopId },
      select: { id: true, tripId: true, forkId: true, timezone: true },
    });
    if (!stop || stop.tripId !== tripId || stop.forkId !== plan) {
      return {
        success: false,
        errors: { stopId: ["Stop does not belong to this trip"] },
      };
    }
    await requireOutsideSurprise(user.id, { stopId: data.stopId });
    stopTimezone = stop.timezone ?? null;
  }

  // "Surprise for…" (CONTEXT.md Surprise) is checked before the write, so a
  // refusal creates nothing and saving again cannot make a duplicate.
  const surpriseForIds = data.surpriseForIds?.length ? [...new Set(data.surpriseForIds)] : null;
  if (surpriseForIds) {
    const memberIds = (await db.tripMember.findMany({ where: { tripId }, select: { userId: true } })).map((m) => m.userId);
    const refused = validateSurpriseFor({
      forIds: surpriseForIds,
      plannerId: user.id,
      memberIds,
      over: { endDate: data.date ?? null, timezone: stopTimezone },
      now: new Date(),
      wishlistIdea: !data.stopId && !data.date,
    });
    if (refused) return { success: false, errors: { surpriseForIds: [Object.values(refused).flat()[0]!] } };
  }

  // Sort order: max + 1 within the target plan
  const maxItem = await db.item.findFirst({
    where: { tripId, ...planScope(plan) },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxItem?.sortOrder ?? -1) + 1;

  // Best-effort geocode from address
  let lat: number | null = null;
  let lng: number | null = null;
  let countryCode: string | null = null;
  if (data.address) {
    const candidate = await geocodePlaceDetailed(data.address);
    lat = candidate?.lat ?? null;
    lng = candidate?.lng ?? null;
    countryCode = candidate?.countryCode?.toLowerCase() ?? null;
  }

  const created = await db.item.create({
    data: {
      tripId,
      forkId: plan,
      stopId: data.stopId ?? null,
      title: data.title,
      category: data.category,
      date: data.date ?? null,
      startTime: data.startTime ?? null, // itemSchema already defaulted it from the slot (R3)
      endTime: data.endTime ?? null,
      address: data.address ?? null,
      link: data.link ?? null,
      booking: data.booking ?? null,
      notes: data.notes ?? null,
      lat,
      lng,
      countryCode,
      sortOrder,
      hiddenFromShares: data.hiddenFromShares ?? false,
      // CONTEXT.md "Slot time" (R3): the ticket's fact; start (above) defaults from it in itemSchema.
      slotTime: data.slotTime ?? null,
      arriveByMinutes: data.arriveByMinutes ?? null,
      refundable: data.refundable ?? null,
      // CONTEXT.md "Opening hours" (R4): a create has no family yet, so nothing is shared.
      openingHours: serializeOpeningHours(data.openingHours),
      ...booking,
    },
  });

  // If an inline cost was supplied, create a single item-owned Cost.
  // Resolve the FX rate BEFORE opening a transaction (network must not hold a
  // DB transaction open — ADR 0007).
  if (data.costMinor !== undefined && data.currency) {
    const trip = await db.trip.findUnique({
      where: { id: tripId },
      select: { homeCurrency: true },
    });
    if (trip) {
      const resolved = await resolveRateForTrip(tripId, data.currency, trip.homeCurrency, { db });
      await db.$transaction(async (tx) => {
        if (resolved.persist) {
          await persistRate(tx, tripId, resolved.persist);
        }
        await (tx as typeof db).cost.create({
          data: {
            tripId,
            forkId: plan,
            ownerType: "ITEM",
            ownerId: created.id,
            costMinor: data.costMinor!,
            paidMinor: data.paidMinor ?? null,
            currency: data.currency!,
            rateToHome: resolved.rate,
            paidAt: data.paidAt ? new Date(data.paidAt) : null,
            label: null,
            category: null,
            settlement: data.settlement ?? "BEFORE",
          },
        });
      });
    }
  }

  await recordPlanActivity(plan, { tripId, verb: "CREATED", entityType: "ITEM", entityId: created.id, entityLabel: entityLabel("ITEM", created) });
  revalidateTrip(tripId, "plan", "money");
  if (surpriseForIds) {
    // Checked above, so a refusal here is a race (say, a Traveller left meanwhile).
    // The Item is saved, so the form must close: report it to the log, not the Traveller.
    const surprised = await setSurprise({ kind: "ITEM", id: created.id, forIds: surpriseForIds });
    if (!surprised.success) console.error("createItem: setSurprise refused after the Item was created", created.id, surprised.errors);
  }
  return { success: true, id: created.id };
}

/**
 * Seed a Trip's Wishlist from a Globe Marker (ADR 0025).
 *
 * - Verifies the caller has access to the trip AND that the Marker lives on the
 *   caller's own Globe (a user is in at most one).
 * - Idempotent: if an unscheduled wishlist Item in this trip already points at
 *   this Marker, returns success without creating a duplicate.
 * - Otherwise copies the Marker into a new wishlist idea (forkId/stopId/date all
 *   null), records provenance via sourceMarkerId, and logs the same activity as
 *   a manual wishlist add.
 */
export async function addMarkerToWishlist(
  markerId: string,
  tripId: string,
): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireTripAccess(tripId);

  const globe = await getUserGlobe(user.id);
  if (!globe) {
    return { success: false, errors: { marker: ["You are not part of a Globe."] } };
  }

  const marker = await db.marker.findUnique({
    where: { id: markerId },
    select: {
      id: true, globeId: true, title: true, category: true, note: true, link: true,
      timing: true, lat: true, lng: true, city: true, country: true, countryCode: true,
    },
  });
  if (!marker || marker.globeId !== globe.id) {
    return { success: false, errors: { marker: ["Marker not found on your Globe."] } };
  }

  // Idempotency: already pulled into this trip's wishlist?
  const existing = await db.item.findFirst({
    where: { tripId, ...REAL_PLAN, stopId: null, date: null, sourceMarkerId: markerId },
    select: { id: true },
  });
  if (existing) return { success: true, id: existing.id };

  const maxItem = await db.item.findFirst({
    where: { tripId, ...planScope(null) },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxItem?.sortOrder ?? -1) + 1;

  const seed = markerToWishlistItemData(marker as unknown as MarkerView);
  const created = await db.item.create({
    data: {
      tripId,
      forkId: null,
      stopId: null,
      date: null,
      sourceMarkerId: markerId,
      title: seed.title,
      category: seed.category,
      lat: seed.lat,
      lng: seed.lng,
      countryCode: seed.countryCode,
      address: seed.address,
      link: seed.link,
      notes: seed.notes,
      sortOrder,
      ...defaultBookingFields("ITEM"),
    },
  });

  await recordPlanActivity(null, {
    tripId,
    verb: "CREATED",
    entityType: "ITEM",
    entityId: created.id,
    entityLabel: entityLabel("ITEM", created),
  });
  revalidateTrip(tripId, "plan");
  return { success: true, id: created.id };
}

/**
 * Update an Item (PATCH, ADR 0075): merges onto the held row —
 * `hiddenFromShares` included, so a patch that only touches `notes` no
 * longer un-hides it. `surpriseForIds` keeps "omitted = leave the Surprise
 * alone". An inline Cost completes from its single owned Cost.
 *
 * - Access-checked via requireItemAccess → requireTripAccess.
 * - If stopId changed, validates it still belongs to the same trip.
 * - Slot time (R3): an empty start on a dated Item with a slot defaults to
 *   slot − arrive-by (startFromSlot, in itemSchema's transform); an existing
 *   start is never moved.
 */
export async function updateItem(
  itemId: string,
  patch: Patch<ItemInput>,
): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);
  const before = await db.item.findUnique({ where: { id: itemId } });
  if (!before) notFound();

  const owned = patch.costMinor != null || patch.currency != null
    ? await db.cost.findMany({ where: { ownerType: "ITEM", ownerId: itemId }, select: OWNED_COST_SELECT })
    : [];
  const inlineCost = completeInlineCost(patch, owned);
  if (inlineCost && "success" in inlineCost) return inlineCost;

  // The current values omit lat/lng/countryCode: the point is geocoded from
  // `address`, never read from the input.
  const parsed = itemSchema.safeParse({
    ...applyPatch<ItemInput>(
      {
        title: before.title, category: before.category as ItemInput["category"], stopId: before.stopId, date: before.date,
        startTime: before.startTime, endTime: before.endTime, address: before.address, link: before.link,
        booking: before.booking, notes: before.notes, hiddenFromShares: before.hiddenFromShares,
        slotTime: before.slotTime, arriveByMinutes: before.arriveByMinutes, refundable: before.refundable,
        openingHours: parseOpeningHours(before.openingHours),
      },
      patch,
    ),
    ...inlineCost,
  });
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const data = parsed.data;
  // The current values above carry no booking fields, so the patch's own
  // reach the schema (validated) and are merged here (lib/booking-state-patch.ts).
  const booking = resolveBookingWrite(
    "ITEM",
    before,
    { bookingState: patch.bookingState, bookBy: patch.bookBy },
    data.booking,
  );
  if ("success" in booking) return booking;

  // Validate stopId belongs to this trip and to the item's own plan.
  if (data.stopId) {
    const stop = await db.stop.findUnique({
      where: { id: data.stopId },
      select: { id: true, tripId: true, forkId: true },
    });
    if (!stop || stop.tripId !== item.tripId || stop.forkId !== item.forkId) {
      return {
        success: false,
        errors: { stopId: ["Stop does not belong to this trip"] },
      };
    }
    await requireOutsideSurprise(item.viewerId, { stopId: data.stopId });
  }

  // Best-effort geocode from address
  let lat: number | null = null;
  let lng: number | null = null;
  let countryCode: string | null = null;
  if (data.address) {
    const candidate = await geocodePlaceDetailed(data.address);
    lat = candidate?.lat ?? null;
    lng = candidate?.lng ?? null;
    countryCode = candidate?.countryCode?.toLowerCase() ?? null;
  }

  // CONTEXT.md "Opening hours": computed before the write (a plain read, like
  // the FX-rate resolve above — ADR 0007 keeps network/extra reads outside a
  // transaction) only when the patch actually names the hours, so a patch
  // that doesn't touch them never re-serialises `before.openingHours` (which
  // may not even parse — fix round 1) back onto the row, and never re-touches
  // the family. The family boundary never crosses a Surprise (fix round 1,
  // CONTEXT.md "Surprise"; ADR 0072): openingHoursFamilyRecipients returns no
  // one when the edited row is itself a live Surprise, and otherwise leaves
  // out every row that is.
  const openingHoursStored = patch.openingHours !== undefined ? serializeOpeningHours(data.openingHours) : undefined;
  const openingHoursRecipients = patch.openingHours !== undefined ? await openingHoursFamilyRecipients(before) : [];

  // The Item row's update is recorded as soon as it lands; the inline Cost
  // write below is a separate row and records nothing of its own here. The
  // family's updateMany (fix round 1) runs in the same transaction as this
  // row's own write, so the two can never land half-done.
  await db.$transaction(async (tx) => {
    await auditedUpdate("ITEM", tx.item, itemId, {
      stopId: data.stopId ?? null,
      title: data.title,
      category: data.category,
      date: data.date ?? null,
      startTime: data.startTime ?? null, // itemSchema already defaulted it from the slot (R3)
      endTime: data.endTime ?? null,
      address: data.address ?? null,
      link: data.link ?? null,
      booking: data.booking ?? null,
      notes: data.notes ?? null,
      lat,
      lng,
      countryCode,
      hiddenFromShares: data.hiddenFromShares ?? false,
      // CONTEXT.md "Slot time" (R3): the ticket's fact; start (above) defaults from it in itemSchema.
      slotTime: data.slotTime ?? null,
      arriveByMinutes: data.arriveByMinutes ?? null,
      refundable: data.refundable ?? null,
      // Omitted entirely when the patch didn't name the hours (fix round 1) —
      // never present to re-serialise `before`'s value back onto the row.
      ...(openingHoursStored !== undefined ? { openingHours: openingHoursStored } : {}),
      ...booking,
    }, item.forkId ?? null, { before });

    if (openingHoursRecipients.length > 0) {
      await tx.item.updateMany({ where: { id: { in: openingHoursRecipients } }, data: { openingHours: openingHoursStored } });
    }
  });

  // Inline cost management (mirrors transport cost logic):
  // 0 existing costs + amount provided → create
  // 1 existing cost + amount provided → update it
  // >1 existing costs → refused above (completeInlineCost); CostEditor is authoritative
  // No amount provided → skip
  if (data.costMinor !== undefined && data.currency) {
    // Loaded above whenever the patch touches the Cost — the only way
    // costMinor/currency reach `data`.
    const existingCosts = owned;

    if (existingCosts.length <= 1) {
      const trip = await db.trip.findUnique({
        where: { id: item.tripId },
        select: { homeCurrency: true },
      });
      if (trip) {
        const resolved = await resolveRateForTrip(item.tripId, data.currency, trip.homeCurrency, { db });
        await db.$transaction(async (tx) => {
          if (resolved.persist) {
            await persistRate(tx, item.tripId, resolved.persist);
          }
          if (existingCosts.length === 0) {
            await (tx as typeof db).cost.create({
              data: {
                tripId: item.tripId,
                forkId: item.forkId ?? null,
                ownerType: "ITEM",
                ownerId: itemId,
                costMinor: data.costMinor!,
                paidMinor: data.paidMinor ?? null,
                currency: data.currency!,
                rateToHome: resolved.rate,
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
            await (tx as typeof db).cost.update({
              where: { id: existingCosts[0].id },
              data: {
                costMinor: data.costMinor!,
                currency: data.currency!,
                rateToHome: resolved.rate,
                paidAt: data.paidAt ? new Date(data.paidAt) : null,
                ...(data.paidMinor !== undefined && { paidMinor: data.paidMinor }),
                ...(data.settlement !== undefined && { settlement: data.settlement }),
              },
            });
          }
        });
      }
    }
    // >1 costs: do nothing — CostEditor is authoritative
  }

  revalidateTrip(item.tripId, "plan", "money");
  return applySurpriseFor(itemId, data.surpriseForIds, before);
}

/**
 * The ids of `item`'s opening-hours family (CONTEXT.md "Opening hours") that
 * may actually receive a shared write: every other row sharing its place,
 * minus `item` itself, minus anything the family boundary must never cross.
 *
 * Fix round 1 (controller ruling): the hours family never crosses a
 * Surprise (CONTEXT.md "Surprise"; ADR 0072). If `item` is itself, right
 * now, inside a live Surprise — its own, or inherited from its Stop — the
 * write must reach only that row, so this returns no one at all (the
 * family is skipped). Otherwise every candidate that is itself inside a
 * live Surprise is left out of the list, so a visible edit never reaches a
 * hidden copy and a hidden copy's edit never reaches a visible row. Used by
 * both `updateItem` and `setOpeningHours`.
 */
async function openingHoursFamilyRecipients(
  item: { id: string; tripId: string; sourceItemId: string | null },
): Promise<string[]> {
  if (await surpriseRootFor({ itemId: item.id })) return [];
  const root = openingHoursFamilyRoot(item);
  const candidates = await db.item.findMany({
    where: { ...openingHoursFamilyWhere(item.tripId, root), id: { not: item.id } },
    select: { id: true },
  });
  const recipients: string[] = [];
  for (const c of candidates) {
    if (!(await surpriseRootFor({ itemId: c.id }))) recipients.push(c.id);
  }
  return recipients;
}

/**
 * Set (or, with null, clear) a thing's opening hours (CONTEXT.md "Opening
 * hours"), for it and every Item sharing its place: the Wishlist idea and
 * each copy placed from it, in any Plan — except across a Surprise boundary
 * (fix round 1; see `openingHoursFamilyRecipients`). Writes only the hours.
 * Unlike a full `updateItem`, it never re-geocodes the address. The MCP tool
 * `set_opening_hours` calls this.
 *
 * The edited row's own write is audited (it gets the Activity entry); the
 * updateMany that shares the value with the rest of the family is silent.
 * Both writes happen in one transaction, so the family can never be left
 * half-updated.
 */
export async function setOpeningHours(itemId: string, hours: OpeningHours | null): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);
  const parsed = z.object({ openingHours: openingHoursSchema.nullable() }).safeParse({ openingHours: hours });
  if (!parsed.success) return validationResult(parsed.error);
  const before = await db.item.findUnique({ where: { id: itemId } });
  if (!before) notFound();
  const next = parsed.data.openingHours;
  const stored = serializeOpeningHours(next);
  const recipients = await openingHoursFamilyRecipients(before);

  const after = await db.$transaction(async (tx) => {
    const updated = await tx.item.update({ where: { id: itemId }, data: { openingHours: stored } });
    if (recipients.length > 0) {
      await tx.item.updateMany({ where: { id: { in: recipients } }, data: { openingHours: stored } });
    }
    return updated;
  });
  await recordUpdate("ITEM", { tripId: item.tripId, plan: item.forkId ?? null, entityId: itemId, before, after });

  revalidateTrip(item.tripId, "plan");
  return { success: true };
}

/**
 * Delete an item.
 */
export async function deleteItem(itemId: string): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  const doomed = await db.item.findUnique({ where: { id: itemId }, select: { title: true } });

  // cleanupTargetSideDataTx schedules attachment blobs for retention inside
  // this same transaction (ARCH-DAT-3) — no post-commit blob call needed.
  await db.$transaction(async (tx) => {
    await tx.item.delete({ where: { id: itemId } });
    await deleteOwnedCostsTx(tx, item.tripId, [
      { type: "ITEM", id: itemId, label: doomed?.title ?? "Item" },
    ]);
    await cleanupTargetSideDataTx(tx, item.tripId, "ITEM", itemId);
  });

  // A Surprise Item deleted by its planner takes its Surprise with it, so its own line is unstamped.
  const surpriseOf = item.surpriseOf?.type === "ITEM" && item.surpriseOf.id === itemId ? null : item.surpriseOf;
  await recordPlanActivity(item.forkId, { tripId: item.tripId, verb: "DELETED", entityType: "ITEM", entityId: itemId, entityLabel: doomed?.title ?? "", surpriseOf });

  revalidateTrip(item.tripId, "plan");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Scheduling actions
// ---------------------------------------------------------------------------

const scheduleDateSchema = z
  .object({
    date: isoDate,
    startTime: hhmm.optional(),
    endTime: hhmm.optional(),
    // CONTEXT.md "Slot time" (R3): scheduling a ticket may name its slot.
    slotTime: slotTimeSchema.optional(),
    arriveByMinutes: arriveByMinutesSchema.optional(),
  });
// The end-needs-start and end ≥ start checks run in scheduleItem, after the
// slot merge, against the start the slot may default (R3).

export type ScheduleItemInput = z.infer<typeof scheduleDateSchema>;

/**
 * Finish a copy-in placement once the placed row has been created: copy the
 * source idea's photo onto it (best-effort), record the CREATED activity,
 * revalidate, and return the standard success result. Shared by
 * `scheduleItem`'s copy-in branch and `placeIdeaAtStop` so photo-copy and
 * activity semantics can't drift between the two placements (fix round 1,
 * Task 15 review).
 */
async function finishPlacedCopy({
  tripId,
  forkId,
  source,
  placed,
}: {
  tripId: string;
  forkId: PlanId | undefined;
  source: { photoAttachmentId: string | null };
  placed: { id: string } & Record<string, unknown>;
}): Promise<ActionResult<{ placedItemId?: string }>> {
  // CONTEXT.md "Item photo" (spec §I): the placed copy gets its OWN photo —
  // its own Attachment row and its own copy of the storage object — never
  // the idea's attachment id. Best-effort: copyItemPhoto reports and
  // returns null on any failure (missing source, storage.copy throwing,
  // …), and the placement must still succeed with no photo rather than
  // fail here (Task 8 brief) — never a dangling photoAttachmentId.
  if (source.photoAttachmentId) {
    const copiedPhotoId = await copyItemPhoto({
      tripId,
      sourcePhotoAttachmentId: source.photoAttachmentId,
      targetItemId: placed.id,
    });
    if (copiedPhotoId) {
      await db.item.update({
        where: { id: placed.id },
        data: { photoAttachmentId: copiedPhotoId },
      });
    }
  }

  await recordPlanActivity(forkId, {
    tripId,
    verb: "CREATED",
    entityType: "ITEM",
    entityId: placed.id,
    entityLabel: entityLabel("ITEM", placed),
  });

  revalidateTrip(tripId, "plan");
  return { success: true, placedItemId: placed.id };
}

/**
 * The fields a copy-in placement always inherits from its source Wishlist
 * idea — source link, title/category, coordinates, address, link, notes, the
 * share-hidden flag and the place's Opening hours (spec 2026-10-17 R4: shared
 * by the family — each row holds a copy and writes go to all of them,
 * lib/opening-hours.ts openingHoursFamilyWhere). The idea's CHOSEN Booking
 * state carries over, with its book-by date while To book; an un-chosen
 * idea's copy re-derives without the reference (never copied), so it needs
 * no booking (lib/booking-state-patch.ts copiedBookingFields). The ticket's
 * Slot time, arrive-by and refundability carry over too (spec 2026-10-17 R3,
 * Section C decision 5). Shared by `scheduleItem`'s copy-in branch (which
 * also sets a date/time and resolves an owning Stop from the date) and
 * `placeIdeaAtStop` (which sets a Stop directly and no date), so the two
 * copies can't drift apart (Task 15 brief).
 */
function ideaCopyData(fullItem: {
  id: string;
  title: string;
  category: string;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  address: string | null;
  link: string | null;
  notes: string | null;
  hiddenFromShares: boolean | null;
  openingHours?: string | null;
  slotTime?: string | null;
  arriveByMinutes?: number | null;
  refundable?: boolean | null;
  bookingState: string;
  bookingStateSet: boolean;
  bookBy: string | null;
}) {
  return {
    sourceItemId: fullItem.id,
    title: fullItem.title,
    category: fullItem.category,
    lat: fullItem.lat ?? null,
    lng: fullItem.lng ?? null,
    countryCode: fullItem.countryCode ?? null,
    address: fullItem.address ?? null,
    link: fullItem.link ?? null,
    notes: fullItem.notes ?? null,
    // A Wishlist idea marked "Hide from shared links" must stay hidden once
    // placed — the placed copy is what the share page actually reads
    // (review fix, Task 9).
    hiddenFromShares: fullItem.hiddenFromShares ?? false,
    openingHours: fullItem.openingHours ?? null,
    // A ticket's facts follow the idea onto its placed copy (R3); scheduleItem
    // may override the slot and margin.
    slotTime: fullItem.slotTime ?? null,
    arriveByMinutes: fullItem.arriveByMinutes ?? null,
    refundable: fullItem.refundable ?? null,
    ...copiedBookingFields(fullItem),
  };
}

/**
 * Schedule an item onto the timeline (ADR 0019 copy-in semantics).
 *
 * - If the target is a Wishlist idea (date===null && forkId===null): CREATE a
 *   placed copy in the target plan (forkId param), setting sourceItemId to the
 *   idea's id. The idea row is left untouched.
 * - If the target already has a date (it's a placed/scheduled item): keep the
 *   existing in-place reschedule behaviour (update date/startTime/endTime).
 *
 * The date is allowed to be outside the trip date range — this is a soft rule;
 * we store it as-is and the UI can warn.
 *
 * With no start, a slot (the call's, else the row's) sets it: slot − arrive-by
 * (R3, startFromSlot). The in-place branch writes slot fields only when sent.
 */
export async function scheduleItem(
  itemId: string,
  input: ScheduleItemInput,
  forkId?: PlanId,
): Promise<ActionResult<{ placedItemId?: string }>> {
  const accessItem = await requireItemAccess(itemId);
  const { plan } = await requirePlanAccess(accessItem.tripId, forkId);

  const parsed = scheduleDateSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const { date, startTime, endTime, slotTime, arriveByMinutes } = parsed.data;

  // Fetch the full item row to determine which branch to take.
  const fullItem = await db.item.findUnique({ where: { id: itemId } });
  if (!fullItem) notFound();

  // The call's slot wins over the row's (R3); a margin still needs a slot.
  const slot = { slotTime: slotTime ?? fullItem.slotTime, arriveByMinutes: arriveByMinutes ?? fullItem.arriveByMinutes };
  if (slot.arriveByMinutes != null && !slot.slotTime) {
    return { success: false, errors: { arriveByMinutes: [ARRIVE_BY_NEEDS_SLOT_MESSAGE] } };
  }
  // With no start, a slot sets it; the end checks see that start.
  const start = startFromSlot({ date, startTime, ...slot });
  if (endTime && !start) {
    return { success: false, errors: { startTime: ["Start time is required when an end time is set"] } };
  }
  if (start && endTime && endTime < start) {
    return { success: false, errors: { endTime: ["End time must be on or after start time"] } };
  }

  const isWishlistIdea =
    fullItem.date === null && fullItem.stopId === null && fullItem.forkId === null;

  if (isWishlistIdea) {
    // --- Copy-in placement branch ---
    // Compute sortOrder scoped to the target plan (highest existing placed sortOrder + 1).
    const maxPlaced = await db.item.findFirst({
      where: {
        tripId: accessItem.tripId,
        ...planScope(plan),
        date: { not: null },
      },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (maxPlaced?.sortOrder ?? -1) + 1;

    // A placed copy is dated, so it sits inside some Stop's stay and must be
    // filed there — otherwise it is invisible in the plan editor's day rows
    // and its Cost rolls up as "Trip-wide / Other" rather than against the
    // Stop it happens in (ADR 0049 rule 5). A Wishlist idea by definition
    // carries no Stop, so there is no prior owner to preserve and a
    // Changeover day simply yields the arriving Stop.
    const planStops = await loadPlanStopsForOwnership(accessItem.tripId, plan);
    const placedStopId = resolveOwningStop(null, date, planStops);
    await requireOutsideSurprise(accessItem.viewerId, { stopId: placedStopId });

    const placed = await db.item.create({
      data: {
        tripId: accessItem.tripId,
        forkId: plan,
        ...ideaCopyData(fullItem),
        stopId: placedStopId,
        date,
        startTime: start,
        slotTime: slot.slotTime ?? null,
        arriveByMinutes: slot.arriveByMinutes ?? null,
        endTime: endTime ?? null,
        sortOrder,
      },
    });

    return finishPlacedCopy({
      tripId: accessItem.tripId,
      forkId: plan,
      source: fullItem,
      placed,
    });
  }

  // --- In-place reschedule branch (item already has a date) ---

  // Writing `stopId` here (ADR 0049 rule 4) is what lets the plan editor hand
  // a move straight to this action instead of hand-guarding against
  // `stopForDate`'s later-Stop tiebreak on a Changeover day.
  const planStops = await loadPlanStopsForOwnership(accessItem.tripId, fullItem.forkId);
  const owningStopId = resolveOwningStop(fullItem.stopId ?? null, date, planStops);
  await requireOutsideSurprise(accessItem.viewerId, { stopId: owningStopId });

  const updated = await db.item.update({
    where: { id: itemId },
    data: {
      date,
      stopId: owningStopId,
      startTime: start,
      endTime: endTime ?? null,
      ...(slotTime !== undefined && { slotTime }),
      ...(arriveByMinutes !== undefined && { arriveByMinutes }),
    },
  });

  // fullItem, read above, is the before snapshot — no second read.
  await recordUpdate("ITEM", {
    tripId: accessItem.tripId,
    plan: accessItem.forkId ?? null,
    entityId: itemId,
    before: fullItem,
    after: updated,
  });

  revalidateTrip(accessItem.tripId, "plan");
  return { success: true };
}

/**
 * Copy a Wishlist idea into a Stop's "things to do" (ADR 0022), with no date.
 *
 * Same copy-in semantics as `scheduleItem`'s copy-in branch — source link,
 * title/category, coordinates, address, link, notes, photo and the
 * share-hidden flag, via the shared `ideaCopyData` helper — but the idea is
 * filed straight onto the given Stop instead of a date-resolved one, and no
 * date/time is set. The idea row itself is left untouched (ADR 0019).
 */
export async function placeIdeaAtStop(
  itemId: string,
  stopId: string,
  forkId?: PlanId,
): Promise<ActionResult<{ placedItemId?: string }>> {
  const accessItem = await requireItemAccess(itemId);
  const { plan } = await requirePlanAccess(accessItem.tripId, forkId);

  const fullItem = await db.item.findUnique({ where: { id: itemId } });
  if (!fullItem) notFound();

  const isWishlistIdea =
    fullItem.date === null && fullItem.stopId === null && fullItem.forkId === null;
  if (!isWishlistIdea) {
    return { success: false, errors: { _: ["Only a Wishlist idea can be added to a Stop."] } };
  }

  const stop = await db.stop.findFirst({
    where: { id: stopId, tripId: accessItem.tripId, ...planScope(plan) },
    select: { id: true },
  });
  if (!stop) {
    return { success: false, errors: { stopId: ["Stop does not belong to this trip"] } };
  }
  await requireOutsideSurprise(accessItem.viewerId, { stopId });

  // Sort order scoped to this Stop's things-to-do pool (ADR 0022
  // THINGS_TO_DO_WHERE: stopId set, date null) — distinct from a placed
  // copy's sortOrder, which is scoped to the whole plan's dated items.
  const maxThing = await db.item.findFirst({
    where: { tripId: accessItem.tripId, ...planScope(plan), stopId, date: null },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxThing?.sortOrder ?? -1) + 1;

  const placed = await db.item.create({
    data: {
      tripId: accessItem.tripId,
      forkId: plan,
      ...ideaCopyData(fullItem),
      stopId,
      date: null,
      startTime: null,
      endTime: null,
      sortOrder,
    },
  });

  return finishPlacedCopy({
    tripId: accessItem.tripId,
    forkId: plan,
    source: fullItem,
    placed,
  });
}

export type UnscheduleResult = ActionResult<{
  /** "placement-removed": row was a placed copy and was deleted (idea survives).
   *  "unslotted": direct-created item; its date was cleared in place. */
  mode: "placement-removed" | "unslotted";
  sourceItemId: string | null;
}>;

/**
 * Unschedule a placed item (ADR 0019 / grilling 2026-09-07).
 *
 * - Placed copy (sourceItemId set): delete only the placement; the idea
 *   survives in the Wishlist.
 * - Direct-created (sourceItemId null): clear the date in place. With a
 *   stopId the item un-slots to that Stop's things-to-do (ADR 0038); with
 *   none it returns to the Wishlist pool. Times are kept — harmless while
 *   undated, and they make undo lossless.
 */
export async function unscheduleItem(itemId: string): Promise<UnscheduleResult> {
  const accessItem = await requireItemAccess(itemId);

  const fullItem = await db.item.findUnique({ where: { id: itemId } });
  if (!fullItem) notFound();

  let mode: "placement-removed" | "unslotted";
  if (fullItem.sourceItemId !== null) {
    // cleanupTargetSideDataTx schedules attachment blobs for retention inside
    // this same transaction (ARCH-DAT-3) — no post-commit blob call needed.
    await db.$transaction(async (tx) => {
      await tx.item.delete({ where: { id: itemId } });
      await deleteOwnedCostsTx(tx, accessItem.tripId, [
        { type: "ITEM", id: itemId, label: fullItem.title ?? "Item" },
      ]);
      await cleanupTargetSideDataTx(tx, accessItem.tripId, "ITEM", itemId);
    });
    mode = "placement-removed";
  } else {
    await db.item.update({ where: { id: itemId }, data: { date: null } });
    mode = "unslotted";
  }

  await recordPlanActivity(accessItem.forkId, {
    tripId: accessItem.tripId,
    verb: mode === "placement-removed" ? "DELETED" : "UPDATED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", fullItem),
  });

  revalidateTrip(accessItem.tripId, "plan");
  return { success: true, mode, sourceItemId: fullItem.sourceItemId ?? null };
}

// ---------------------------------------------------------------------------
// Rescheduling
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Move an item to `targetDateISO`, resolving its owning stop via
 * `resolveOwningStop` (ADR 0049 rule 4) — kept if it still covers the day,
 * otherwise re-filed to whichever stop does (null on a gap day). Keeps the
 * item's existing start/end time. Used by month-grid drag-to-reschedule.
 * Rejects dates outside the trip window.
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

  const planStops = await loadPlanStopsForOwnership(item.tripId, item.forkId);

  // Ownership follows ADR 0049 rule 4: keep the owning Stop while it still
  // covers the date, re-filing only when the move leaves that Stop's stay.
  // The guard's row already carries the current stopId, so the only read of
  // the full row is auditedUpdate's before-snapshot.
  const owningStopId = resolveOwningStop(item.stopId ?? null, targetDateISO, planStops);
  await requireOutsideSurprise(item.viewerId, { stopId: owningStopId });

  await auditedUpdate("ITEM", db.item, itemId, { date: targetDateISO, stopId: owningStopId }, item.forkId ?? null);

  revalidateTrip(item.tripId, "plan");
  return { success: true };
}
