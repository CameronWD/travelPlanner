/**
 * The Item family (CONTEXT.md "Opening hours", "Try list"; spec 2026-10-17
 * R4, R6): a thing to do and the copies placed from it share the place's
 * Opening hours and one Try list. Each row holds its own copy (copied on
 * place by ideaCopyData), and a write goes to the whole family: the root (the
 * source idea, or the Item itself) and every Item placed from it. That way
 * reads never join, and a copy keeps its values if the idea is deleted
 * (sourceItemId SetNull). A Fork's copy has no sourceItemId, so it leaves the
 * family.
 *
 * The family never crosses a Surprise (CONTEXT.md "Surprise"; ADR 0072): a
 * write on a row inside a live Surprise reaches only that row, and a visible
 * write never reaches a hidden row.
 *
 * Callers write the edited row and the family in ONE transaction and record
 * Activity only after it commits (recordActivity writes through the global
 * db — lib/activity-guard.ts), so the family is never left half-updated and no
 * phantom UPDATED line survives a rollback.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { surpriseRootFor, type SurpriseClient } from "@/lib/surprise-guard";

/** The columns a family shares. Each is the stored JSON string, or null to clear. */
export type ItemFamilyData = { openingHours?: string | null; tryList?: string | null };

export type ItemFamilyClient = Pick<Prisma.TransactionClient, "item">;
/** What itemFamilyRecipients reads through: the family and its Surprise checks. */
export type ItemFamilyReadClient = ItemFamilyClient & SurpriseClient;

export function itemFamilyRoot(item: { id: string; sourceItemId: string | null }): string {
  return item.sourceItemId ?? item.id;
}

export function itemFamilyWhere(tripId: string, rootId: string) {
  return { tripId, OR: [{ id: rootId }, { sourceItemId: rootId }] as [{ id: string }, { sourceItemId: string }] };
}

/**
 * The ids of `item`'s family that may receive a shared write: every other row
 * of the family, minus anything inside a live Surprise. If `item` itself is
 * inside one (its own, or inherited from its Stop), no one: the write reaches
 * only that row. `client` lets a caller read the family, and its Surprise
 * checks, inside its own transaction (one connection, not two).
 */
export async function itemFamilyRecipients(
  item: { id: string; tripId: string; sourceItemId: string | null },
  client: ItemFamilyReadClient = db,
): Promise<string[]> {
  if (await surpriseRootFor({ itemId: item.id }, undefined, client)) return [];
  const candidates = await client.item.findMany({
    where: { ...itemFamilyWhere(item.tripId, itemFamilyRoot(item)), id: { not: item.id } },
    select: { id: true },
  });
  const recipients: string[] = [];
  for (const c of candidates) {
    if (!(await surpriseRootFor({ itemId: c.id }, undefined, client))) recipients.push(c.id);
  }
  return recipients;
}

/**
 * itemFamilyRecipients for a save that may also change where the Item stands
 * (CONTEXT.md "Surprise"; ADR 0072). The Surprise part of a save
 * (applySurpriseFor) lands after the family write, and the family is read from
 * the Item as it is now, so a save that makes the Item a Surprise, or moves it
 * into a Stop inside a live Surprise, would otherwise broadcast the new text to
 * the visible idea and its copies. Either way it reaches no one: only the
 * edited row takes the change.
 */
export async function itemFamilyRecipientsForSave(
  item: { id: string; tripId: string; sourceItemId: string | null },
  save: { surpriseForIds?: readonly string[] | null; stopId?: string | null },
  client: ItemFamilyReadClient = db,
): Promise<string[]> {
  if (save.surpriseForIds && save.surpriseForIds.length > 0) return [];
  if (save.stopId && (await surpriseRootFor({ stopId: save.stopId }, undefined, client))) return [];
  return itemFamilyRecipients(item, client);
}

/** Share `data` with `recipients` inside the caller's transaction. Silent: the edited row's own write carries the Activity. */
export async function writeItemFamily(tx: ItemFamilyClient, recipients: readonly string[], data: ItemFamilyData): Promise<void> {
  if (recipients.length === 0 || Object.keys(data).length === 0) return;
  await tx.item.updateMany({ where: { id: { in: [...recipients] } }, data });
}
