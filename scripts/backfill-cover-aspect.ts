/**
 * One-time cover-aspect backfill script (spec F — cmuj4l1d9).
 *
 * Run command:
 *   npx tsx scripts/backfill-cover-aspect.ts [--dry-run]
 *
 * Or via the npm script:
 *   npm run backfill:cover-aspect [-- --dry-run]
 *
 * Settings from .env.production.local override shell variables (scripts/load-env.ts
 * uses override: true), so storage settings must be edited in that file.
 *
 * What it does:
 *   Loads DATABASE_URL and storage credentials from .env.production.local
 *   (via scripts/load-env.ts). Refuses to run if storage is local (would read
 *   covers from this machine's .uploads/) against a remote database, which
 *   would treat every cover as missing.
 *
 *   Scans Trip rows that have a cover photo (coverImageKey set) but no
 *   stored aspect ratio yet (coverAspect IS NULL), reads each cover's pixel
 *   dimensions from its header bytes (lib/image-size.ts's readImageSize —
 *   no full image decode), and stores width/height as Trip.coverAspect.
 *
 *   lib/storage.ts's Storage interface has no ranged read, so this reads the
 *   whole object from storage and only looks at the first 64KB of the
 *   returned bytes — plenty for every format readImageSize supports
 *   (PNG/JPEG/GIF/WebP headers all land well inside that prefix).
 *
 *   A cover whose bytes can't be read from storage, or whose format/
 *   dimensions can't be parsed, is left with coverAspect: null (the
 *   trips-list card falls back to its own client-side portrait detection for
 *   it) and counted as failed.
 *
 *   In --dry-run mode the script logs what it WOULD write without touching
 *   the database.
 *
 *   A final summary prints scanned / updated / failed counts, then
 *   disconnects the Prisma client.
 *
 *   Operator-run only — do NOT wire this into CI or a migration.
 */

import "./load-env";

import { db } from "../lib/db";
import { getStorage } from "../lib/storage";
import { readImageSize } from "../lib/image-size";
import { assertStorageMatchesDatabase, describeTarget } from "./lib/storage-target";

const DRY_RUN = process.argv.includes("--dry-run");

// Header formats readImageSize supports never need more than this many
// bytes — see its module doc (PNG IHDR, JPEG SOFn, GIF, WebP chunks).
const HEADER_PREFIX_BYTES = 64 * 1024;

function log(msg: string) {
  console.log(msg);
}

async function main() {
  log(describeTarget(process.env, DRY_RUN));
  try {
    assertStorageMatchesDatabase(process.env);
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
    return;
  }

  if (DRY_RUN) {
    log("=== DRY RUN — no writes will be made ===\n");
  }

  const rows = await db.trip.findMany({
    where: { coverImageKey: { not: null }, coverAspect: null },
    select: { id: true, coverImageKey: true },
  });

  log(`[trips] ${rows.length} row(s) need a cover aspect`);

  const storage = getStorage();
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    const key = row.coverImageKey as string;

    const bytes = await storage.read(key);
    if (!bytes) {
      log(`  [trips] FAILED to read ${row.id} (key "${key}" missing from storage)`);
      failed++;
      continue;
    }

    const header = bytes.subarray(0, HEADER_PREFIX_BYTES);
    const size = readImageSize(header);
    if (!size) {
      log(`  [trips] FAILED to parse dimensions for ${row.id} (key "${key}")`);
      failed++;
      continue;
    }

    const aspect = size.width / size.height;

    if (DRY_RUN) {
      log(
        `  [dry-run] WOULD set trip ${row.id} coverAspect=${aspect} (${size.width}x${size.height})`,
      );
      updated++;
      continue;
    }

    await db.trip.update({ where: { id: row.id }, data: { coverAspect: aspect } });
    log(`  [trips] set ${row.id} coverAspect=${aspect} (${size.width}x${size.height})`);
    updated++;
  }

  log("\n=== Summary ===");
  log(`  trips: scanned=${rows.length} updated=${updated} failed=${failed}`);

  if (DRY_RUN) {
    log("\n(dry-run: no rows were updated)");
  }
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
