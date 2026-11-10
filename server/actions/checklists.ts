"use server";

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser, requireRowAccess } from "@/lib/guards";
import {
  checklistItemSchema,
  checklistItemUpdateSchema,
  templateSchema,
  type ChecklistItemInput,
  type ChecklistItemUpdateInput,
} from "@/lib/validations/checklist";
import { mergeTemplateTexts, parseTemplateItems, type TemplateEntry } from "@/lib/checklists";
import { type ActionResult, formFail, validationResult } from "@/lib/action-result";
import { buyStateSchema, type BuyState } from "@/lib/enums";
import { recordActivity } from "@/lib/activity-record";
import { recordUpdate } from "@/lib/activity-guard";
import {
  checklistItemSummary,
  checklistTickSummary,
  entityLabel,
  packingMovedSummary,
  templateAppliedSummary,
} from "@/lib/activity";
import { TRAVELLER_SELECT, travellerName, type TravellerLike } from "@/lib/traveller";
import { revalidateTrip } from "@/lib/revalidate";
import {
  canAddPackingTo,
  canManagePackingItem,
  canSeePackingItem,
  packingMineOrSharedWhere,
  toOwnerId,
  type PackingOwnerRef,
} from "@/lib/packing-access";
import { loadPackingViewer } from "@/lib/packing-viewer";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ChecklistActionResult = ActionResult;

export type TemplateListItem = {
  id: string;
  name: string;
  itemCount: number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ChecklistItemAccess = {
  id: string;
  tripId: string;
  kind: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  ownerId: string | null;
  buy: string | null;
  assignedTo: TravellerLike | null;
};

const NOT_YOURS = "That's on someone else's packing list.";

// Edits to your own personal Packing list are bookkeeping, like ticks: not news.
function isOwnPacking(kind: string, ownerId: string | null, userId: string): boolean {
  return kind === "PACKING" && ownerId === userId;
}

/** Diff row for describeChanges — the assignee as a name, never an id. */
function activityRow(item: { text: string; dueDate: string | null; assignedTo: TravellerLike | null }) {
  return {
    text: item.text,
    dueDate: item.dueDate,
    assignedToName: item.assignedTo ? travellerName(item.assignedTo) : null,
  };
}

/**
 * Look up a ChecklistItem and verify the current user has access to its trip.
 * Returns the item (with the fields needed to record Activity) or throws
 * notFound().
 */
async function requireChecklistItemAccess(itemId: string) {
  const { row, user } = await requireRowAccess("checklistItem", itemId);
  return { item: row as ChecklistItemAccess, user };
}

async function isTripMember(tripId: string, userId: string): Promise<boolean> {
  const membership = await db.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
    select: { userId: true },
  });
  return membership !== null;
}

// ---------------------------------------------------------------------------
// ChecklistItem actions
// ---------------------------------------------------------------------------

/**
 * Add a new checklist item to a trip.
 *
 * - Access-checked via requireTripAccess.
 * - If assignedToId is provided, it must be a member of the trip.
 * - sortOrder = max existing sortOrder within (trip, kind) + 1.
 */
export async function addChecklistItem(
  tripId: string,
  input: ChecklistItemInput,
): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireTripAccess(tripId);

  const parsed = checklistItemSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const data = parsed.data;

  let ownerId: string | null = null;
  if (data.kind === "PACKING") {
    ownerId = toOwnerId(data.owner ?? user.id);
    if (ownerId !== null && ownerId !== user.id && !(await isTripMember(tripId, ownerId))) {
      return formFail("They aren't on this trip.");
    }
    if (!canAddPackingTo(ownerId, await loadPackingViewer(tripId, user.id))) {
      return formFail("This trip's packing lists are private.");
    }
  }

  // Validate assignedToId is a member of this trip
  if (data.assignedToId) {
    const membership = await db.tripMember.findUnique({
      where: {
        tripId_userId: { tripId, userId: data.assignedToId },
      },
      select: { userId: true },
    });
    if (!membership) {
      return {
        success: false,
        errors: { assignedToId: ["Assigned user is not a member of this trip"] },
      };
    }
  }

  // sortOrder: max + 1 within (trip, kind)
  const maxItem = await db.checklistItem.findFirst({
    where: { tripId, kind: data.kind },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxItem?.sortOrder ?? -1) + 1;

  const created = await db.checklistItem.create({
    data: {
      tripId,
      kind: data.kind,
      text: data.text,
      done: false,
      dueDate: data.dueDate ?? null,
      assignedToId: data.assignedToId ?? null,
      ownerId,
      sortOrder,
    },
    select: { id: true },
  });

  if (!isOwnPacking(data.kind, ownerId, user.id)) {
    await recordActivity({
      tripId,
      verb: "CREATED",
      entityType: "CHECKLIST_ITEM",
      entityId: created.id,
      entityLabel: entityLabel("CHECKLIST_ITEM", { text: data.text }),
      changes: checklistItemSummary("CREATED", data.text, data.kind),
    });
  }

  revalidateTrip(tripId, "lists");
  return { success: true, id: created.id };
}

/**
 * Update an existing checklist item's editable fields (text, dueDate, assignedToId).
 *
 * - Access-checked via requireChecklistItemAccess → requireTripAccess.
 * - If assignedToId is provided, it must be a trip member.
 */
export async function updateChecklistItem(
  itemId: string,
  input: ChecklistItemUpdateInput,
): Promise<ChecklistActionResult> {
  const { item, user } = await requireChecklistItemAccess(itemId);
  if (item.kind === "PACKING") {
    const viewer = await loadPackingViewer(item.tripId, user.id);
    if (!canManagePackingItem(item.ownerId, viewer)) return formFail(NOT_YOURS);
  }

  const parsed = checklistItemUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const data = parsed.data;

  // Validate assignedToId is a trip member
  if (data.assignedToId) {
    const membership = await db.tripMember.findUnique({
      where: {
        tripId_userId: { tripId: item.tripId, userId: data.assignedToId },
      },
      select: { userId: true },
    });
    if (!membership) {
      return {
        success: false,
        errors: { assignedToId: ["Assigned user is not a member of this trip"] },
      };
    }
  }

  const after = await db.checklistItem.update({
    where: { id: itemId },
    data: {
      ...(data.text !== undefined && { text: data.text }),
      dueDate: data.dueDate !== undefined ? (data.dueDate ?? null) : undefined,
      // Explicit null clears the assignee; undefined leaves it unchanged
      assignedToId:
        data.assignedToId !== undefined ? (data.assignedToId ?? null) : undefined,
    },
    select: { text: true, dueDate: true, assignedTo: { select: TRAVELLER_SELECT } },
  });

  // Checklists and Reminders sit outside any Plan (plan: null).
  if (!isOwnPacking(item.kind, item.ownerId, user.id)) {
    await recordUpdate("CHECKLIST_ITEM", {
      tripId: item.tripId,
      plan: null,
      entityId: itemId,
      before: activityRow(item),
      after: activityRow(after),
    });
  }

  revalidateTrip(item.tripId, "lists");
  return { success: true };
}

/**
 * Toggle the `done` state of a checklist item.
 */
export async function toggleChecklistItem(
  itemId: string,
  done: boolean,
): Promise<ChecklistActionResult> {
  const { item, user } = await requireChecklistItemAccess(itemId);
  if (item.kind === "PACKING") {
    const viewer = await loadPackingViewer(item.tripId, user.id);
    if (!canManagePackingItem(item.ownerId, viewer)) return formFail(NOT_YOURS);
  }

  await db.checklistItem.update({
    where: { id: itemId },
    data: item.kind === "PACKING" ? { done, packedById: done ? user.id : null } : { done },
  });

  // ADR 0012 amendment 2026-10-11: only Pre-trip ticks are news to your
  // partner; Packing/Shopping ticks are personal bookkeeping. A toggle to the
  // state the item is already in (double click, stale UI) is not news either.
  if (item.kind === "PRETRIP" && item.done !== done) {
    await recordActivity({
      tripId: item.tripId,
      verb: "UPDATED",
      entityType: "CHECKLIST_ITEM",
      entityId: itemId,
      entityLabel: entityLabel("CHECKLIST_ITEM", { text: item.text }),
      changes: checklistTickSummary(item.text, done),
    });
  }

  revalidateTrip(item.tripId, "lists");
  return { success: true };
}

/**
 * Set (or clear) a Packing item's shopping "buy" state (spec 2026-10-02 §G):
 * `NEEDED` puts it on the Shopping tab unticked, `BOUGHT` ticks it there, and
 * `null` clears it (the Packing item itself is untouched). Only a Packing
 * item can carry a buy state — PRETRIP/SHOPPING items refuse.
 */
export async function setBuyState(
  itemId: string,
  buy: BuyState | null,
): Promise<ActionResult> {
  const { item, user } = await requireChecklistItemAccess(itemId);

  if (item.kind !== "PACKING") {
    return formFail("Only a Packing item can be marked to buy.");
  }

  const parsedBuy = buyStateSchema.nullable().safeParse(buy);
  if (!parsedBuy.success) {
    return formFail("Invalid buy state.");
  }

  const viewer = await loadPackingViewer(item.tripId, user.id);
  const flipsBetweenBuyStates = item.buy !== null && parsedBuy.data !== null;
  const allowed = flipsBetweenBuyStates
    ? canSeePackingItem(item.ownerId, viewer)
    : canManagePackingItem(item.ownerId, viewer);
  if (!allowed) return formFail(NOT_YOURS);

  await db.checklistItem.update({
    where: { id: itemId },
    data: { buy: parsedBuy.data },
  });

  revalidateTrip(item.tripId, "lists");
  return { success: true };
}

/**
 * Delete a checklist item.
 */
export async function deleteChecklistItem(
  itemId: string,
): Promise<ChecklistActionResult> {
  const { item, user } = await requireChecklistItemAccess(itemId);
  if (item.kind === "PACKING") {
    const viewer = await loadPackingViewer(item.tripId, user.id);
    if (!canManagePackingItem(item.ownerId, viewer)) return formFail(NOT_YOURS);
  }

  await db.checklistItem.delete({ where: { id: itemId } });

  if (!isOwnPacking(item.kind, item.ownerId, user.id)) {
    await recordActivity({
      tripId: item.tripId,
      verb: "DELETED",
      entityType: "CHECKLIST_ITEM",
      entityId: itemId,
      entityLabel: entityLabel("CHECKLIST_ITEM", { text: item.text }),
      changes: checklistItemSummary("DELETED", item.text, item.kind),
    });
  }

  revalidateTrip(item.tripId, "lists");
  return { success: true };
}

/**
 * Reorder a checklist item by swapping its sortOrder with the adjacent item
 * of the same (trip, kind) in the given direction.
 *
 * If the item is already at the top/bottom, this is a no-op.
 *
 * READ COMMITTED is sufficient here because the FOR UPDATE row lock serializes
 * concurrent reorders on the same (trip, kind) list.
 */
export async function reorderChecklistItem(
  itemId: string,
  direction: "up" | "down",
): Promise<ChecklistActionResult> {
  const { item, user } = await requireChecklistItemAccess(itemId);
  if (item.kind === "PACKING") {
    const viewer = await loadPackingViewer(item.tripId, user.id);
    if (!canManagePackingItem(item.ownerId, viewer)) return formFail(NOT_YOURS);
  }

  await db.$transaction(async (tx) => {
    // Lock this (trip, kind) checklist in sortOrder so a concurrent reorder blocks
    // until we commit, then re-reads the corrected order. Raw SQL because Prisma
    // can't express SELECT ... FOR UPDATE on findMany.
    const siblings =
      item.kind === "PACKING"
        ? await tx.$queryRaw<Array<{ id: string; sortOrder: number }>>`
            SELECT "id", "sortOrder"
            FROM "ChecklistItem"
            WHERE "tripId" = ${item.tripId} AND "kind" = ${item.kind}
              AND "ownerId" IS NOT DISTINCT FROM ${item.ownerId}
            ORDER BY "sortOrder" ASC
            FOR UPDATE
          `
        : await tx.$queryRaw<Array<{ id: string; sortOrder: number }>>`
            SELECT "id", "sortOrder"
            FROM "ChecklistItem"
            WHERE "tripId" = ${item.tripId} AND "kind" = ${item.kind}
            ORDER BY "sortOrder" ASC
            FOR UPDATE
          `;

    const idx = siblings.findIndex((s) => s.id === itemId);
    if (idx === -1) return; // item vanished mid-flight — nothing to do

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return; // boundary — no-op

    const current = siblings[idx];
    const neighbour = siblings[swapIdx];

    await tx.checklistItem.update({
      where: { id: current.id },
      data: { sortOrder: neighbour.sortOrder },
    });
    await tx.checklistItem.update({
      where: { id: neighbour.id },
      data: { sortOrder: current.sortOrder },
    });
  });

  revalidateTrip(item.tripId, "lists");
  return { success: true };
}

export async function movePackingItem(
  itemId: string,
  to: PackingOwnerRef,
): Promise<ActionResult> {
  const { item, user } = await requireChecklistItemAccess(itemId);

  if (item.kind !== "PACKING") {
    return formFail("Only a Packing item can be moved.");
  }

  const viewer = await loadPackingViewer(item.tripId, user.id);
  if (!canManagePackingItem(item.ownerId, viewer)) return formFail(NOT_YOURS);

  if (typeof to !== "string" || to === "") return formFail("They aren't on this trip.");
  const toId = toOwnerId(to);
  if (toId === item.ownerId) return { success: true };

  let toName: string | null = null;
  if (toId !== null) {
    const member = await db.tripMember.findUnique({
      where: { tripId_userId: { tripId: item.tripId, userId: toId } },
      select: { user: { select: TRAVELLER_SELECT } },
    });
    if (!member) return formFail("They aren't on this trip.");
    toName = travellerName(member.user);
  }
  if (!canAddPackingTo(toId, viewer)) {
    return formFail("This trip's packing lists are private.");
  }

  const maxItem = await db.checklistItem.findFirst({
    where: { tripId: item.tripId, kind: "PACKING" },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await db.checklistItem.update({
    where: { id: itemId },
    data: { ownerId: toId, sortOrder: (maxItem?.sortOrder ?? -1) + 1 },
  });

  await recordActivity({
    tripId: item.tripId,
    verb: "UPDATED",
    entityType: "CHECKLIST_ITEM",
    entityId: itemId,
    entityLabel: entityLabel("CHECKLIST_ITEM", { text: item.text }),
    changes: packingMovedSummary(item.text, toName),
  });

  revalidateTrip(item.tripId, "lists");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Packing template actions
// ---------------------------------------------------------------------------

/**
 * Save the current trip's PACKING items as a named template owned by the
 * current user.
 */
export async function saveAsTemplate(
  tripId: string,
  name: string,
): Promise<{ success: true; templateId: string } | { success: false; errors: Record<string, string[]> }> {
  const { user } = await requireTripAccess(tripId);

  const parsed = templateSchema.safeParse({ name });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[key] = msgs ?? [];
    }
    return { success: false, errors: fieldErrors };
  }

  const packingItems = await db.checklistItem.findMany({
    where: { tripId, ...packingMineOrSharedWhere(user.id) },
    orderBy: { sortOrder: "asc" },
    select: { text: true, ownerId: true },
  });

  const entries: TemplateEntry[] = [
    ...packingItems.filter((i) => i.ownerId !== null).map((i) => ({ text: i.text, shared: false })),
    ...packingItems.filter((i) => i.ownerId === null).map((i) => ({ text: i.text, shared: true })),
  ];

  const template = await db.packingTemplate.create({
    data: {
      ownerId: user.id,
      name: parsed.data.name,
      itemsJson: JSON.stringify(entries),
    },
    select: { id: true },
  });

  return { success: true, templateId: template.id };
}

/**
 * Apply a packing template to a trip's PACKING list.
 *
 * - Template must be owned by the current user (IDOR protection).
 * - Items already on the trip's PACKING list (case-insensitive) are skipped.
 */
export async function applyTemplate(
  tripId: string,
  templateId: string,
): Promise<ChecklistActionResult> {
  const { user } = await requireTripAccess(tripId);

  const template = await db.packingTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, ownerId: true, name: true, itemsJson: true },
  });

  if (!template || template.ownerId !== user.id) {
    notFound();
  }

  const entries = parseTemplateItems(template.itemsJson);
  if (!entries) {
    return {
      success: false,
      errors: { _root: ["Template data is corrupted"] },
    };
  }

  const existingItems = await db.checklistItem.findMany({
    where: { tripId, ...packingMineOrSharedWhere(user.id) },
    select: { text: true, sortOrder: true, ownerId: true },
  });

  const ownTexts = existingItems.filter((i) => i.ownerId === user.id).map((i) => i.text);
  const sharedTexts = existingItems.filter((i) => i.ownerId === null).map((i) => i.text);
  const newPersonal = mergeTemplateTexts(
    ownTexts,
    entries.filter((e) => !e.shared).map((e) => e.text),
  );
  const newShared = mergeTemplateTexts(
    sharedTexts,
    entries.filter((e) => e.shared).map((e) => e.text),
  );
  const totalAdded = newPersonal.length + newShared.length;

  if (totalAdded === 0) {
    return { success: true };
  }

  const maxSortOrder = existingItems.reduce(
    (max, i) => Math.max(max, i.sortOrder),
    -1,
  );

  const creates = [
    ...newPersonal.map((text) => ({ text, ownerId: user.id as string | null })),
    ...newShared.map((text) => ({ text, ownerId: null as string | null })),
  ].map((c, i) => ({
    tripId,
    kind: "PACKING",
    text: c.text,
    ownerId: c.ownerId,
    done: false,
    sortOrder: maxSortOrder + 1 + i,
  }));

  await db.checklistItem.createMany({ data: creates });

  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "CHECKLIST_ITEM",
    entityId: null,
    entityLabel: template.name,
    changes: templateAppliedSummary(totalAdded, template.name),
  });

  revalidateTrip(tripId, "lists");
  return { success: true };
}

/**
 * List the current user's packing templates with item counts.
 */
export async function listTemplates(): Promise<TemplateListItem[]> {
  const user = await requireUser();

  const templates = await db.packingTemplate.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, itemsJson: true },
  });

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    itemCount: parseTemplateItems(t.itemsJson)?.length ?? 0,
  }));
}

/**
 * Delete a packing template. Only the owner can delete it.
 */
export async function deleteTemplate(
  templateId: string,
): Promise<ChecklistActionResult> {
  const user = await requireUser();

  const template = await db.packingTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, ownerId: true },
  });

  if (!template || template.ownerId !== user.id) {
    notFound();
  }

  await db.packingTemplate.delete({ where: { id: templateId } });

  return { success: true };
}
