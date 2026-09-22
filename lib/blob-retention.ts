import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Anything that can take a DeletedBlob write: the global db, or a tx handle. */
type BlobDeletionClient = Pick<typeof db, "deletedBlob"> | Prisma.TransactionClient;

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
 *
 * `client` defaults to the global `db` but accepts a Prisma transaction
 * handle instead (fix round 1, I3). Pass one when the row this blob's
 * deletion accompanies is being deleted inside the same `$transaction` — that
 * makes "row gone" and "blob recorded" commit together, so a process crash
 * between what would otherwise be two separate statements can never leave a
 * blob with no DeletedBlob record and no row pointing at it either (a leak
 * invisible even to the sweep). This still never throws: a client-level
 * failure is caught the same way regardless of which client was passed, so
 * it still can't roll back a transaction whose other statements succeeded.
 */
export async function scheduleBlobDeletion(
  keys: (string | null | undefined)[],
  client: BlobDeletionClient = db,
): Promise<void> {
  const storageKeys = keys.filter((k): k is string => !!k);
  if (storageKeys.length === 0) return;

  try {
    await client.deletedBlob.createMany({
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
