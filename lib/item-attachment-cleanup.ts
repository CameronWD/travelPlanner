import type { Prisma } from "@prisma/client";
import { scheduleBlobDeletion } from "@/lib/blob-retention";

/**
 * Delete every ITEM Attachment on the given Items inside the caller's
 * transaction, and record their blobs for retention/sweep (ARCH-DAT-3) in
 * that SAME transaction — the pattern `cleanupTargetSideDataTx` uses, so
 * "rows gone" and "blobs recorded" commit together.
 *
 * Why this exists (final review #2): Items are removed in bulk by a Fork
 * discard (cascade) and a Fork promote (`deleteMany`), neither of which
 * touches Attachments — `Attachment.targetId` is a plain string, not a
 * relation. A Fork copy of an Item photo (spec §I, `copyItemPhoto`) is its
 * own Attachment + storage object, so without this every discarded or
 * superseded copy would leave an orphaned row and a blob nobody sweeps.
 *
 * Plain lib module, not "use server": it does no access check — callers are
 * already access-checked actions (server/actions/forks.ts).
 *
 * Call it BEFORE deleting the Items (it takes their ids). Returns the
 * storage keys scheduled, for tests/logging.
 */
export async function deleteItemAttachmentsTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  itemIds: string[],
): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const where = { tripId, targetType: "ITEM" as const, targetId: { in: itemIds } };
  const attachments = await tx.attachment.findMany({ where, select: { storageKey: true } });
  if (attachments.length === 0) return [];
  await tx.attachment.deleteMany({ where });
  const storageKeys = attachments
    .map((a) => a.storageKey)
    .filter((k): k is string => k != null);
  await scheduleBlobDeletion(storageKeys, tx);
  return storageKeys;
}
