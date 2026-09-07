import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import type { TargetType } from "@/lib/enums";

/**
 * Deletes all Attachment rows (and their stored blobs, best-effort) and Note
 * rows for the given target. Called from each part-delete action so that
 * orphaned side-data never accumulates after a stop/transport/accommodation/item
 * is removed.
 *
 * Storage deletes are best-effort: a failure to remove a blob will not prevent
 * the database rows from being cleaned up.
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

  const storage = getStorage();
  for (const a of attachments) {
    if (a.storageKey) {
      try {
        await storage.delete(a.storageKey);
      } catch {
        // best-effort: ignore storage errors so DB cleanup always runs
      }
    }
  }

  await db.attachment.deleteMany({ where: { tripId, targetType, targetId } });
  await db.note.deleteMany({ where: { tripId, targetType, targetId } });
}

/**
 * Deletes all Attachment rows (and their stored blobs, best-effort) for a
 * globe-scoped target (e.g. a Marker). Unlike cleanupTargetSideData, there is
 * no Note cleanup — Markers carry their note in the marker row itself.
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

  const storage = getStorage();
  for (const a of attachments) {
    if (a.storageKey) {
      try {
        await storage.delete(a.storageKey);
      } catch {
        // best-effort: ignore storage errors so DB cleanup always runs
      }
    }
  }

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

/** Best-effort blob deletion — run AFTER the transaction commits. */
export async function deleteBlobsBestEffort(storageKeys: string[]): Promise<void> {
  if (storageKeys.length === 0) return;
  const storage = getStorage();
  for (const key of storageKeys) {
    try {
      await storage.delete(key);
    } catch {
      // best-effort: an unreferenced blob is harmless; never fail the mutation
    }
  }
}
