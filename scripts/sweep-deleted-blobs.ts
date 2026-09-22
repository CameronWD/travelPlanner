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
 * Candidates are processed in CHUNK_SIZE-sized batches. For each chunk, the
 * liveness re-check (is this key still referenced by a live Attachment or
 * Trip row?) runs immediately before that chunk is acted on — not as one
 * upfront snapshot for the whole run (fix round 1, I1: the original version
 * checked once for every candidate, then destroyed serially afterward, which
 * left the entire destroy loop as a stale-snapshot window; today that's a
 * small risk since sweeps and restores are both manual, but the code should
 * not claim a guarantee — "re-checked right before acting on it" — that a
 * batch-then-loop shape doesn't provide, especially once this script is the
 * kind of thing that gets put on a cron). Chunking (rather than one
 * `{ in: keys }` query over every candidate) also keeps each liveness query's
 * bind-parameter list bounded — an unbounded IN-list is exactly the kind of
 * thing that blows past Postgres' parameter ceiling on the day the sweep has
 * the most to do.
 *
 * A still-referenced key is skipped: its blob is left alone, AND its
 * DeletedBlob row is removed (fix round 1, C2). That second part matters — a
 * restore may have re-created the row that key belongs to, which means this
 * DeletedBlob record no longer describes a deleted blob at all. Leaving it in
 * place would leave `deletedAt` stuck at the ORIGINAL scheduling time; if
 * that row is deleted again later, `createMany({ skipDuplicates: true })` is
 * a no-op against the stale row (same unique storageKey), so the clock never
 * restarts — the next sweep run would then destroy the blob immediately,
 * with no retention window at all, while dumps from the intervening period
 * still reference it. Clearing the stale row on skip means a future real
 * deletion starts a fresh 35-day clock instead.
 *
 *   npx tsx scripts/sweep-deleted-blobs.ts             # dry run (default)
 *   npx tsx scripts/sweep-deleted-blobs.ts --execute   # apply changes
 *   npx tsx scripts/sweep-deleted-blobs.ts --days=40   # override the retention window
 */
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";

const DEFAULT_RETENTION_DAYS = 35;

/** Keeps each liveness re-check's `{ in: [...] }` list well under Postgres' bind-parameter ceiling. */
const CHUNK_SIZE = 200;

function parseDays(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith("--days="));
  if (!arg) return DEFAULT_RETENTION_DAYS;
  const value = Number(arg.slice("--days=".length));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid --days value: "${arg}". Expected a positive number.`);
  }
  return value;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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

  // Only constructed when we might actually destroy something — a dry run
  // touches neither the storage driver nor the DeletedBlob/Attachment/Trip
  // tables beyond the initial read above.
  const storage = execute ? getStorage() : null;

  let toDestroy = 0;
  let skipped = 0;
  let destroyed = 0;
  let failed = 0;

  for (const batch of chunk(candidates, CHUNK_SIZE)) {
    const batchKeys = batch.map((c) => c.storageKey);

    // Liveness re-check for THIS batch only, immediately before acting on
    // it — see the file-level comment (I1) for why this isn't a single
    // upfront snapshot. A restore may have re-created a row pointing at one
    // of these keys since it was scheduled for deletion; never destroy a
    // blob a live row still references.
    const [liveAttachments, liveCovers] = await Promise.all([
      db.attachment.findMany({
        where: { storageKey: { in: batchKeys } },
        select: { storageKey: true },
      }),
      db.trip.findMany({
        where: { coverImageKey: { in: batchKeys } },
        select: { coverImageKey: true },
      }),
    ]);
    const stillReferenced = new Set<string>([
      ...liveAttachments.map((a) => a.storageKey).filter((k): k is string => k != null),
      ...liveCovers.map((t) => t.coverImageKey).filter((k): k is string => k != null),
    ]);

    for (const c of batch) {
      if (stillReferenced.has(c.storageKey)) {
        skipped++;
        console.log(`  [SKIP] ${c.storageKey} — still referenced by a live row`);
        if (execute) {
          // C2: this DeletedBlob record no longer describes a deleted blob
          // (a restore likely re-created the row) — clear it so a future
          // real deletion of this key starts a fresh retention clock instead
          // of destroying it off the original, stale deletedAt.
          await db.deletedBlob.delete({ where: { id: c.id } }).catch((err) => {
            console.error(`  failed to clear stale DeletedBlob row for ${c.storageKey}:`, err);
          });
        }
        continue;
      }

      toDestroy++;
      if (!execute) {
        console.log(`  [WOULD DESTROY] ${c.storageKey} (scheduled ${c.deletedAt.toISOString()})`);
        continue;
      }

      try {
        await storage!.delete(c.storageKey);
        await db.deletedBlob.delete({ where: { id: c.id } });
        destroyed++;
        console.log(`  [DESTROY] ${c.storageKey} (scheduled ${c.deletedAt.toISOString()})`);
      } catch (err) {
        failed++;
        console.error(`  failed to sweep ${c.storageKey}:`, err);
      }
    }
  }

  if (!execute) {
    console.log(`\n  would destroy: ${toDestroy}`);
    console.log(`  skip (still referenced by a live row — a restore likely re-created it): ${skipped}`);
    console.log("\nDry run — re-run with --execute to apply.");
    return;
  }

  console.log(
    `\nApplied: destroyed ${destroyed}, failed ${failed}, skipped (still referenced) ${skipped}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
