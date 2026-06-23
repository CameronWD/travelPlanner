"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";
import {
  checklistItemSchema,
  checklistItemUpdateSchema,
  templateSchema,
  type ChecklistItemInput,
  type ChecklistItemUpdateInput,
} from "@/lib/validations/checklist";
import { mergeTemplateTexts } from "@/lib/checklists";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ChecklistActionResult =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

export type TemplateListItem = {
  id: string;
  name: string;
  itemCount: number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up a ChecklistItem and verify the current user has access to its trip.
 * Returns the item (with id + tripId + kind) or throws notFound().
 */
async function requireChecklistItemAccess(itemId: string): Promise<{
  id: string;
  tripId: string;
  kind: string;
}> {
  const item = await db.checklistItem.findUnique({
    where: { id: itemId },
    select: { id: true, tripId: true, kind: true },
  });
  if (!item) {
    notFound();
  }
  await requireTripAccess(item.tripId);
  return item;
}

function validationErrors(
  error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } },
): ChecklistActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, msgs] of Object.entries(error.flatten().fieldErrors)) {
    fieldErrors[key] = msgs ?? [];
  }
  return { success: false, errors: fieldErrors };
}

function revalidateChecklistPaths(tripId: string) {
  revalidatePath(`/trips/${tripId}/checklists`);
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
): Promise<ChecklistActionResult> {
  const { user } = await requireTripAccess(tripId);
  void user; // used implicitly by the guard

  const parsed = checklistItemSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const data = parsed.data;

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

  await db.checklistItem.create({
    data: {
      tripId,
      kind: data.kind,
      text: data.text,
      done: false,
      dueDate: data.dueDate ?? null,
      assignedToId: data.assignedToId ?? null,
      sortOrder,
    },
  });

  revalidateChecklistPaths(tripId);
  return { success: true };
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
  const item = await requireChecklistItemAccess(itemId);

  const parsed = checklistItemUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
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

  await db.checklistItem.update({
    where: { id: itemId },
    data: {
      ...(data.text !== undefined && { text: data.text }),
      dueDate: data.dueDate !== undefined ? (data.dueDate ?? null) : undefined,
      // Explicit null clears the assignee; undefined leaves it unchanged
      assignedToId:
        data.assignedToId !== undefined ? (data.assignedToId ?? null) : undefined,
    },
  });

  revalidateChecklistPaths(item.tripId);
  return { success: true };
}

/**
 * Toggle the `done` state of a checklist item.
 */
export async function toggleChecklistItem(
  itemId: string,
  done: boolean,
): Promise<ChecklistActionResult> {
  const item = await requireChecklistItemAccess(itemId);

  await db.checklistItem.update({
    where: { id: itemId },
    data: { done },
  });

  revalidateChecklistPaths(item.tripId);
  return { success: true };
}

/**
 * Delete a checklist item.
 */
export async function deleteChecklistItem(
  itemId: string,
): Promise<ChecklistActionResult> {
  const item = await requireChecklistItemAccess(itemId);

  await db.checklistItem.delete({ where: { id: itemId } });

  revalidateChecklistPaths(item.tripId);
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
  const item = await requireChecklistItemAccess(itemId);

  await db.$transaction(async (tx) => {
    // Lock this (trip, kind) checklist in sortOrder so a concurrent reorder blocks
    // until we commit, then re-reads the corrected order. Raw SQL because Prisma
    // can't express SELECT ... FOR UPDATE on findMany.
    const siblings = await tx.$queryRaw<Array<{ id: string; sortOrder: number }>>`
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

  revalidateChecklistPaths(item.tripId);
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

  // Collect PACKING item texts for this trip (sorted for determinism)
  const packingItems = await db.checklistItem.findMany({
    where: { tripId, kind: "PACKING" },
    orderBy: { sortOrder: "asc" },
    select: { text: true },
  });

  const texts = packingItems.map((i) => i.text);

  const template = await db.packingTemplate.create({
    data: {
      ownerId: user.id,
      name: parsed.data.name,
      itemsJson: JSON.stringify(texts),
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
    select: { id: true, ownerId: true, itemsJson: true },
  });

  if (!template || template.ownerId !== user.id) {
    notFound();
  }

  let templateTexts: string[] = [];
  try {
    templateTexts = JSON.parse(template.itemsJson) as string[];
  } catch {
    return {
      success: false,
      errors: { _root: ["Template data is corrupted"] },
    };
  }

  // Fetch existing PACKING items for this trip
  const existingItems = await db.checklistItem.findMany({
    where: { tripId, kind: "PACKING" },
    select: { text: true, sortOrder: true },
  });

  const existingTexts = existingItems.map((i) => i.text);
  const newTexts = mergeTemplateTexts(existingTexts, templateTexts);

  if (newTexts.length === 0) {
    // Nothing new to add
    return { success: true };
  }

  // sortOrder: start after current max
  const maxSortOrder = existingItems.reduce(
    (max, i) => Math.max(max, i.sortOrder),
    -1,
  );

  const creates = newTexts.map((text, i) => ({
    tripId,
    kind: "PACKING",
    text,
    done: false,
    sortOrder: maxSortOrder + 1 + i,
  }));

  await db.checklistItem.createMany({ data: creates });

  revalidateChecklistPaths(tripId);
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

  return templates.map((t) => {
    let count = 0;
    try {
      const items = JSON.parse(t.itemsJson) as unknown[];
      count = Array.isArray(items) ? items.length : 0;
    } catch {
      // malformed json — treat as 0 items
    }
    return { id: t.id, name: t.name, itemCount: count };
  });
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
