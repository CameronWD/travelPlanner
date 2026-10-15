"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser, requireRowAccess } from "@/lib/guards";
import {
  checklistItemSchema,
  checklistItemsSchema,
  checklistItemUpdateSchema,
  templateSchema,
  type ChecklistItemInput,
  type ChecklistItemUpdateInput,
} from "@/lib/validations/checklist";
import { mergeTemplateTexts } from "@/lib/checklists";
import { type ActionResult, formFail, validationResult } from "@/lib/action-result";
import { buyStateSchema, type BuyState } from "@/lib/enums";
import { recordActivity } from "@/server/actions/activity";
import {
  checklistItemsAddedSummary,
  checklistItemSummary,
  checklistListName,
  checklistTickSummary,
  describeChanges,
  entityLabel,
  templateAppliedSummary,
} from "@/lib/activity";
import { TRAVELLER_SELECT, travellerName, type TravellerLike } from "@/lib/traveller";

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
  assignedTo: TravellerLike | null;
};

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
async function requireChecklistItemAccess(itemId: string): Promise<ChecklistItemAccess> {
  return (await requireRowAccess("checklistItem", itemId)).row;
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
    return validationResult(parsed.error);
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

  const created = await db.checklistItem.create({
    data: {
      tripId,
      kind: data.kind,
      text: data.text,
      done: false,
      dueDate: data.dueDate ?? null,
      assignedToId: data.assignedToId ?? null,
      sortOrder,
    },
    select: { id: true },
  });

  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "CHECKLIST_ITEM",
    entityId: created.id,
    entityLabel: entityLabel("CHECKLIST_ITEM", { text: data.text }),
    changes: checklistItemSummary("CREATED", data.text, data.kind),
  });

  revalidateChecklistPaths(tripId);
  return { success: true };
}

/**
 * Add several checklist items in one write, with ONE recordActivity call for
 * the whole batch — e.g. AI packing "Add all", which would otherwise call
 * addChecklistItem once per suggestion and flood the Traveller's partner's
 * bell with one CREATED line per item.
 *
 * - Access-checked via requireTripAccess.
 * - Each text is validated like addChecklistItem's `text` (trim, max
 *   length), but a blank (after trim) is silently dropped rather than
 *   rejected; an overlong text still fails validation for the whole call.
 * - sortOrder continues from the current max within (trip, kind).
 * - Nothing to add (every text blank, or an empty list) → nothing is
 *   written or recorded.
 */
export async function addChecklistItems(
  tripId: string,
  kind: ChecklistItemInput["kind"],
  texts: string[],
): Promise<ChecklistActionResult> {
  const { user } = await requireTripAccess(tripId);
  void user; // used implicitly by the guard

  const parsed = checklistItemsSchema.safeParse({ kind, texts });
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const toAdd = parsed.data.texts.filter((text) => text.length > 0);
  if (toAdd.length === 0) {
    return { success: true };
  }

  // sortOrder: continue from max within (trip, kind)
  const maxItem = await db.checklistItem.findFirst({
    where: { tripId, kind: parsed.data.kind },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const startSortOrder = (maxItem?.sortOrder ?? -1) + 1;

  await db.checklistItem.createMany({
    data: toAdd.map((text, i) => ({
      tripId,
      kind: parsed.data.kind,
      text,
      done: false,
      sortOrder: startSortOrder + i,
    })),
  });

  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "CHECKLIST_ITEM",
    entityId: null,
    entityLabel: checklistListName(parsed.data.kind),
    changes: checklistItemsAddedSummary(toAdd.length, parsed.data.kind),
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

  await recordActivity({
    tripId: item.tripId,
    verb: "UPDATED",
    entityType: "CHECKLIST_ITEM",
    entityId: itemId,
    entityLabel: entityLabel("CHECKLIST_ITEM", { text: after.text }),
    changes: describeChanges("CHECKLIST_ITEM", activityRow(item), activityRow(after)),
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

  revalidateChecklistPaths(item.tripId);
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
  const item = await requireChecklistItemAccess(itemId);

  if (item.kind !== "PACKING") {
    return formFail("Only a Packing item can be marked to buy.");
  }

  const parsedBuy = buyStateSchema.nullable().safeParse(buy);
  if (!parsedBuy.success) {
    return formFail("Invalid buy state.");
  }

  await db.checklistItem.update({
    where: { id: itemId },
    data: { buy: parsedBuy.data },
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

  await recordActivity({
    tripId: item.tripId,
    verb: "DELETED",
    entityType: "CHECKLIST_ITEM",
    entityId: itemId,
    entityLabel: entityLabel("CHECKLIST_ITEM", { text: item.text }),
    changes: checklistItemSummary("DELETED", item.text, item.kind),
  });

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
    select: { id: true, ownerId: true, name: true, itemsJson: true },
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

  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "CHECKLIST_ITEM",
    entityId: null,
    entityLabel: template.name,
    changes: templateAppliedSummary(newTexts.length, template.name),
  });

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
