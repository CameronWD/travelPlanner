import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { scheduleBlobDeletion } from "@/lib/blob-retention";
import type { TargetType } from "@/lib/enums";

/**
 * Deletes all Attachment rows and Note rows for the given target, and
 * schedules their blobs for retention/sweep (ARCH-DAT-3) rather than
 * destroying them synchronously. Called from each part-delete action so that
 * orphaned side-data never accumulates after a stop/transport/accommodation/item
 * is removed.
 *
 * scheduleBlobDeletion never throws: a retention-recording failure will not
 * prevent the database rows from being cleaned up.
 */
export async function cleanupTargetSideData(
  tripId: string,
  targetType: TargetType,
  targetId: string,
): Promise<void> {
  const attachments = await db.attachment.findMany({
    where: { tripId, targetType, targetId },
    select: { id: true, storageKey: true },
  });

  await scheduleBlobDeletion(attachments.map((a) => a.storageKey)).catch(() => {});

  await db.attachment.deleteMany({ where: { tripId, targetType, targetId } });
  await db.note.deleteMany({ where: { tripId, targetType, targetId } });
}

/**
 * Deletes all Attachment rows for a globe-scoped target (e.g. a Marker), and
 * schedules their blobs for retention/sweep (ARCH-DAT-3) rather than
 * destroying them synchronously. Unlike cleanupTargetSideData, there is no
 * Note cleanup — Markers carry their note in the marker row itself.
 */
export async function cleanupGlobeAttachments(
  globeId: string,
  targetType: TargetType,
  targetId: string,
): Promise<void> {
  const attachments = await db.attachment.findMany({
    where: { globeId, targetType, targetId },
    select: { id: true, storageKey: true },
  });

  await scheduleBlobDeletion(attachments.map((a) => a.storageKey)).catch(() => {});

  await db.attachment.deleteMany({ where: { globeId, targetType, targetId } });
}

/**
 * Transaction-scoped variant of cleanupTargetSideData: deletes Attachment and
 * Note ROWS inside the caller's transaction and returns the storage keys so
 * the caller can delete the blobs best-effort AFTER commit (a blob delete
 * cannot be rolled back, so it must not run inside the tx).
 */
export async function cleanupTargetSideDataTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  targetType: TargetType,
  targetId: string,
): Promise<string[]> {
  const attachments = await tx.attachment.findMany({
    where: { tripId, targetType, targetId },
    select: { storageKey: true },
  });
  await tx.attachment.deleteMany({ where: { tripId, targetType, targetId } });
  await tx.note.deleteMany({ where: { tripId, targetType, targetId } });
  return attachments.map((a) => a.storageKey).filter((k): k is string => k != null);
}

/**
 * Schedule blobs for retention/sweep (ARCH-DAT-3) — run AFTER the transaction
 * commits. Despite the name (kept for its many callers), this no longer
 * destroys anything synchronously: it records the keys in DeletedBlob via
 * scheduleBlobDeletion, which never throws, so it never fails the mutation.
 */
export async function deleteBlobsBestEffort(storageKeys: string[]): Promise<void> {
  await scheduleBlobDeletion(storageKeys).catch(() => {});
}
