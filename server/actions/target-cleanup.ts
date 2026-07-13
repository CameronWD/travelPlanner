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
