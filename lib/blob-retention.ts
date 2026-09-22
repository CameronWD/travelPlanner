import { db } from "@/lib/db";

/**
 * Retain a blob instead of destroying it (ARCH-DAT-3).
 *
 * db-backup.yml keeps dumps for 30 days. A blob destroyed the moment its row
 * is deleted makes every one of those dumps a partial lie: restore it and you
 * get Attachment rows pointing at files that no longer exist. So deletion
 * becomes deferred — the row goes now, the file goes after 35 days.
 *
 * 35, not 30: the blob must outlive the OLDEST dump that still references it,
 * with a few days' margin. Sweep with `npm run sweep:blobs` (dry-run by
 * default, --execute to apply), following scripts/sweep-orphaned-costs.ts.
 *
 * Never throws: a retention-recording failure must not fail the caller's
 * delete. Worst case on a write failure here is the old ARCH-DAT-3 behaviour
 * for that one blob (it isn't swept, so it just lingers) — never a failed
 * user-facing delete.
 */
export async function scheduleBlobDeletion(
  keys: (string | null | undefined)[],
): Promise<void> {
  const storageKeys = keys.filter((k): k is string => !!k);
  if (storageKeys.length === 0) return;

  try {
    await db.deletedBlob.createMany({
      data: storageKeys.map((storageKey) => ({ storageKey })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error(
      "scheduleBlobDeletion: failed to record blob(s) for retention — they will not be swept",
      err,
    );
  }
}
