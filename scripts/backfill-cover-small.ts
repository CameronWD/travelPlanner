/**
 * One-time cover-small-copy backfill script (spec 2026-10-06 §H; PX-01).
 *
 * Run command:
 *   npx tsx scripts/backfill-cover-small.ts [--dry-run]
 *
 * Or via the npm script:
 *   npm run backfill:cover-small [-- --dry-run]
 *
 * What it does:
 *   Loads DATABASE_URL and storage credentials from .env.production.local
 *   (via scripts/load-env.ts). Refuses to run if storage is local (would read
 *   covers from this machine's .uploads/) against a remote database, which
 *   would treat every cover as missing.
 *
 *   Scans Trip rows that have a cover photo (coverImageKey set) but no small
 *   copy yet (coverSmallKey IS NULL) — every cover uploaded before Task 3
 *   shipped the small-copy save, plus any New Trip cover from before that
 *   path also started sending one. For each, reads the full cover from
 *   storage, makes a ~480px-wide WebP copy (`lib/cover-small-image.ts`'s
 *   `makeCoverSmall`, a server-side twin of the upload-time browser
 *   compression), saves it at `coverSmallKeyFor(coverImageKey)`, and records
 *   that key — plus `coverAspect`, if the row doesn't already have one — on
 *   the Trip row.
 *
 *   A GIF cover is skipped (no small copy — animation would be lost); a
 *   cover whose bytes can't be read from storage or decoded by sharp is
 *   counted as failed and left untouched. Idempotent: re-running only ever
 *   finds rows still missing `coverSmallKey`, so it's safe to run again
 *   after fixing a failure.
 *
 *   In --dry-run mode the script logs what it WOULD do without writing to
 *   storage or the database.
 *
 *   A final summary prints scanned / made / skipped / failed counts, then
 *   disconnects the Prisma client.
 *
 *   Operator-run only — do NOT wire this into CI or a migration. Needs
 *   production storage credentials and DATABASE_URL in .env.production.local;
 *   run --dry-run first.
 */

import "./load-env";

import { db } from "../lib/db";
import { getStorage } from "../lib/storage";
import { backfillCoverSmall } from "./backfill-cover-small-run";
import { assertStorageMatchesDatabase, describeTarget } from "./lib/storage-target";

const dryRun = process.argv.includes("--dry-run");

async function run() {
  try {
    assertStorageMatchesDatabase(process.env);
    console.log(describeTarget(process.env, dryRun));
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
    await db.$disconnect();
    return;
  }

  return backfillCoverSmall({ db, storage: getStorage(), dryRun, log: (s) => console.log(s) });
}

run()
  .then((r) => {
    if (r) {
      console.log(`\n=== Summary ===\n  trips: scanned=${r.scanned} made=${r.made} skipped=${r.skipped} failed=${r.failed}`);
      if (dryRun) console.log("\n(dry-run: nothing was written)");
    }
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
