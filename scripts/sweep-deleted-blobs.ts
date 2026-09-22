/**
 * Sweep for blobs deferred for deletion (ARCH-DAT-3).
 *
 * `scheduleBlobDeletion` (lib/blob-retention.ts) records a storage key in
 * DeletedBlob instead of destroying the object immediately, so a Postgres
 * restore from within db-backup.yml's 30-day retention window still finds
 * the file a restored Attachment/Trip row points at. This script is the
 * other half: it destroys objects whose DeletedBlob record is old enough
 * that no live backup can still reference them (35 days by default — see
 * lib/blob-retention.ts for why 35, not 30).
 *
 * Before destroying a key it re-checks that no live Attachment.storageKey or
 * Trip.coverImageKey points at it — a restore may have re-created the row
 * that key belongs to, and destroying a blob a live row points at is exactly
 * the harm ARCH-DAT-3 exists to prevent. A still-referenced key is skipped
 * (and its DeletedBlob row left in place) rather than swept.
 *
 *   npx tsx scripts/sweep-deleted-blobs.ts             # dry run (default)
 *   npx tsx scripts/sweep-deleted-blobs.ts --execute   # apply changes
 *   npx tsx scripts/sweep-deleted-blobs.ts --days=40   # override the retention window
 */
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";

const DEFAULT_RETENTION_DAYS = 35;

function parseDays(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith("--days="));
  if (!arg) return DEFAULT_RETENTION_DAYS;
  const value = Number(arg.slice("--days=".length));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid --days value: "${arg}". Expected a positive number.`);
  }
  return value;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const days = parseDays(process.argv);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const candidates = await db.deletedBlob.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, storageKey: true, deletedAt: true },
  });

  console.log(
    `${candidates.length} DeletedBlob row(s) older than ${days} days (cutoff ${cutoff.toISOString()})`,
  );

  if (candidates.length === 0) {
    console.log("Nothing to sweep.");
    return;
  }

  // A restore may have re-created a row pointing at one of these keys since
  // it was scheduled for deletion. Never destroy a blob a live row still
  // references — re-check right before acting on it.
  const keys = candidates.map((c) => c.storageKey);
  const [liveAttachments, liveCovers] = await Promise.all([
    db.attachment.findMany({
      where: { storageKey: { in: keys } },
      select: { storageKey: true },
    }),
    db.trip.findMany({
      where: { coverImageKey: { in: keys } },
      select: { coverImageKey: true },
    }),
  ]);
  const stillReferenced = new Set<string>([
    ...liveAttachments.map((a) => a.storageKey).filter((k): k is string => k != null),
    ...liveCovers.map((t) => t.coverImageKey).filter((k): k is string => k != null),
  ]);

  const toSweep = candidates.filter((c) => !stillReferenced.has(c.storageKey));
  const skipped = candidates.filter((c) => stillReferenced.has(c.storageKey));

  console.log(`  would destroy: ${toSweep.length}`);
  console.log(`  skip (still referenced by a live row — a restore likely re-created it): ${skipped.length}`);
  for (const c of skipped) {
    console.log(`  [SKIP] ${c.storageKey} — still referenced by a live row`);
  }
  for (const c of toSweep) {
    console.log(
      `  [${execute ? "DESTROY" : "WOULD DESTROY"}] ${c.storageKey} (scheduled ${c.deletedAt.toISOString()})`,
    );
  }

  if (!execute) {
    console.log("\nDry run — re-run with --execute to apply.");
    return;
  }

  const storage = getStorage();
  let destroyed = 0;
  let failed = 0;
  for (const c of toSweep) {
    try {
      await storage.delete(c.storageKey);
      await db.deletedBlob.delete({ where: { id: c.id } });
      destroyed++;
    } catch (err) {
      failed++;
      console.error(`  failed to sweep ${c.storageKey}:`, err);
    }
  }

  console.log(
    `Applied: destroyed ${destroyed}, failed ${failed}, skipped (still referenced) ${skipped.length}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
