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
 * Note ROWS inside the caller's transaction and schedules their blobs for
 * retention/sweep (ARCH-DAT-3) in that SAME transaction, via scheduleBlobDeletion's
 * tx-handle overload (fix round 1, I3). Previously the caller collected the
 * returned keys and scheduled them in a separate call AFTER the transaction
 * committed — a blob-destroying delete genuinely couldn't run inside the tx
 * (unrollbackable), but a DeletedBlob row is just an insert, and running it
 * as a separate post-commit step left a crash window where the rows were
 * gone and no DeletedBlob record existed for their blobs: a leak invisible
 * even to the sweep. Doing both inside one tx closes that window — either
 * both commit or neither does.
 *
 * Still returns the storage keys, now purely informational/for tests.
 *
 * A scheduling failure here DOES abort the caller's transaction (final fix
 * wave, C2). scheduleBlobDeletion swallows write failures only on the default
 * client; on a transaction handle it re-throws, because Postgres has already
 * aborted the transaction by then and swallowing merely hides it — the row
 * deletes above would not have committed either, and the caller would have
 * reported success for a delete that never happened.
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
  const storageKeys = attachments.map((a) => a.storageKey).filter((k): k is string => k != null);
  await scheduleBlobDeletion(storageKeys, tx);
  return storageKeys;
}
