import type { db as realDb } from "../lib/db";
import type { Storage } from "../lib/storage";
import { coverSmallKeyFor } from "../lib/cover";
import { isGif, makeCoverSmall } from "../lib/cover-small-image";

export interface BackfillCoverSmallDeps {
  db: { trip: Pick<typeof realDb.trip, "findMany" | "updateMany"> };
  storage: Pick<Storage, "read" | "save">;
  dryRun: boolean;
  log: (s: string) => void;
}

export interface BackfillCoverSmallResult {
  scanned: number;
  made: number;
  skipped: number;
  failed: number;
}

/**
 * One-off operator backfill for PX-01 (`docs/open-follow-ups.md`): makes the
 * ~480px WebP "small copy" for every Trip cover uploaded before the small-copy
 * code shipped (Task 3), and for every cover still missing one (New Trip's
 * path only started sending one in that same change).
 *
 * Shaped like `scripts/backfill-cover-aspect.ts` — a loop over candidate
 * rows, reads from storage rather than touching the filesystem directly — but
 * split into a deps-injected core (this file) and a thin entry point
 * (`scripts/backfill-cover-small.ts`) so the loop itself is unit-testable
 * against a fake db/storage instead of a real Postgres + blob store.
 *
 * Per row: save the small WebP first, THEN update the Trip row — a save (or
 * update) that fails, or a row whose cover can't be read/decoded, leaves the
 * row exactly as it was, counted as failed, and never throws out of the loop
 * for a single row: `storage.read`/`storage.save`/`db.trip.updateMany` are
 * each wrapped so a real driver's rejection (network error, a non-ENOENT
 * read failure, a dropped connection) doesn't abort the whole run. If the
 * update fails after the save already landed, the row is left with its
 * small blob saved but `coverSmallKey` still null — harmless, since a
 * re-run's `coverSmallKey: null` filter picks the row up again and
 * overwrites the same key. A GIF cover (no small copy — animation would be
 * lost) is counted as skipped, not failed. `coverAspect` is only included
 * in the update when the row doesn't already have one, matching
 * `scripts/backfill-cover-aspect.ts`'s own job rather than redoing it.
 *
 * The update is a guarded `updateMany` — `where: { id, coverImageKey: key,
 * coverSmallKey: null }` — not a plain `update` by id: between this row's
 * `findMany` read and its update, the trip's cover can change (a traveller
 * uploads a new one, or another run of this same script gets there first),
 * and a plain `update` would overwrite that newer cover's `coverSmallKey`
 * with a small copy made from the stale bytes this loop iteration read. The
 * guard makes the update a no-op in that case — `count` comes back 0 — which
 * this counts as skipped, not failed: the freshly-made small blob is simply
 * orphaned (nothing points at its key), which is harmless, and the row's
 * actual current cover gets its own small copy from a later run.
 */
export async function backfillCoverSmall(deps: BackfillCoverSmallDeps): Promise<BackfillCoverSmallResult> {
  const { db, storage, dryRun, log } = deps;

  const rows = await db.trip.findMany({
    where: { coverImageKey: { not: null }, coverSmallKey: null },
    select: { id: true, coverImageKey: true, coverAspect: true },
  });

  log(`[trips] ${rows.length} row(s) need a small cover copy`);

  let made = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const key = row.coverImageKey as string;

    let bytes: Buffer | null;
    try {
      bytes = await storage.read(key);
    } catch (err) {
      log(`  [trips] FAILED to read ${row.id} (key "${key}": ${err instanceof Error ? err.message : String(err)})`);
      failed++;
      continue;
    }
    if (!bytes) {
      log(`  [trips] FAILED to read ${row.id} (key "${key}" missing from storage)`);
      failed++;
      continue;
    }

    if (isGif(bytes)) {
      log(`  [trips] skipped ${row.id} (key "${key}": GIF, no small copy would be made)`);
      skipped++;
      continue;
    }

    const small = await makeCoverSmall(bytes);
    if (!small) {
      log(`  [trips] FAILED to decode ${row.id} (key "${key}")`);
      failed++;
      continue;
    }

    const smallKey = coverSmallKeyFor(key);
    const aspect = small.width / small.height;

    if (dryRun) {
      log(`  [dry-run] WOULD save ${smallKey} and set trip ${row.id} coverSmallKey${row.coverAspect == null ? `, coverAspect=${aspect}` : ""}`);
      made++;
      continue;
    }

    try {
      await storage.save(smallKey, small.webp, "image/webp");
    } catch (err) {
      log(`  [trips] FAILED to save ${smallKey} for ${row.id} (${err instanceof Error ? err.message : String(err)})`);
      failed++;
      continue;
    }

    let count: number;
    try {
      const result = await db.trip.updateMany({
        where: { id: row.id, coverImageKey: key, coverSmallKey: null },
        data: {
          coverSmallKey: smallKey,
          ...(row.coverAspect == null ? { coverAspect: aspect } : {}),
        },
      });
      count = result.count;
    } catch (err) {
      log(`  [trips] FAILED to update ${row.id} after saving ${smallKey} (${err instanceof Error ? err.message : String(err)})`);
      failed++;
      continue;
    }

    if (count === 0) {
      log(`  [trips] skipped ${row.id} (cover changed mid-run; orphaned ${smallKey} is harmless)`);
      skipped++;
      continue;
    }

    log(`  [trips] set ${row.id} coverSmallKey=${smallKey}`);
    made++;
  }

  return { scanned: rows.length, made, skipped, failed };
}
