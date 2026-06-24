/**
 * One-time geocode backfill script.
 *
 * Run command:
 *   npx tsx scripts/backfill-geocode.ts [--dry-run]
 *
 * Or via the npm script:
 *   npm run backfill:geocode [-- --dry-run]
 *
 * What it does:
 *   Scans Item, Accommodation, and Transport rows that have a place string but
 *   are missing lat/lng coordinates, then geocodes each missing side via the
 *   OpenStreetMap Nominatim API (same helper used by the server actions).
 *
 *   - Items:          address set AND (lat IS NULL OR lng IS NULL)
 *   - Accommodation:  address set AND (lat IS NULL OR lng IS NULL)
 *   - Transport dep:  depPlace set AND depLat IS NULL
 *   - Transport arr:  arrPlace set AND arrLat IS NULL
 *
 *   Rows that already have coordinates are skipped (idempotent).
 *   A 1100 ms delay is inserted between every geocode call to respect
 *   Nominatim's ~1 req/sec usage policy.
 *
 *   In --dry-run mode the script logs what it WOULD geocode without writing
 *   anything to the database.
 *
 *   A final summary prints: scanned / geocoded / skipped / failed counts per
 *   entity type, then disconnects the Prisma client.
 */

import { db } from "../lib/db";
import { geocodePlace } from "../lib/geocode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");

function log(msg: string) {
  console.log(msg);
}

async function throttle() {
  await new Promise<void>((r) => setTimeout(r, 1100));
}

interface EntityStats {
  scanned: number;
  geocoded: number;
  skipped: number;
  failed: number;
}

function emptyStats(): EntityStats {
  return { scanned: 0, geocoded: 0, skipped: 0, failed: 0 };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

async function backfillItems(): Promise<EntityStats> {
  const stats = emptyStats();

  const rows = await db.item.findMany({
    where: {
      address: { not: null },
      OR: [{ lat: null }, { lng: null }],
    },
    select: { id: true, address: true },
  });

  stats.scanned = rows.length;
  log(`[items] ${rows.length} row(s) need geocoding`);

  for (const row of rows) {
    const address = row.address as string;

    if (DRY_RUN) {
      log(`  [dry-run] WOULD geocode item ${row.id}: "${address}"`);
      stats.geocoded++;
      continue;
    }

    const coords = await geocodePlace(address);
    await throttle();

    if (coords) {
      await db.item.update({
        where: { id: row.id },
        data: { lat: coords.lat, lng: coords.lng },
      });
      log(`  [items] geocoded ${row.id}: ${coords.lat}, ${coords.lng}`);
      stats.geocoded++;
    } else {
      log(`  [items] FAILED to geocode ${row.id}: "${address}"`);
      stats.failed++;
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Accommodation
// ---------------------------------------------------------------------------

async function backfillAccommodation(): Promise<EntityStats> {
  const stats = emptyStats();

  const rows = await db.accommodation.findMany({
    where: {
      address: { not: null },
      OR: [{ lat: null }, { lng: null }],
    },
    select: { id: true, address: true },
  });

  stats.scanned = rows.length;
  log(`[accommodation] ${rows.length} row(s) need geocoding`);

  for (const row of rows) {
    const address = row.address as string;

    if (DRY_RUN) {
      log(`  [dry-run] WOULD geocode accommodation ${row.id}: "${address}"`);
      stats.geocoded++;
      continue;
    }

    const coords = await geocodePlace(address);
    await throttle();

    if (coords) {
      await db.accommodation.update({
        where: { id: row.id },
        data: { lat: coords.lat, lng: coords.lng },
      });
      log(`  [accommodation] geocoded ${row.id}: ${coords.lat}, ${coords.lng}`);
      stats.geocoded++;
    } else {
      log(`  [accommodation] FAILED to geocode ${row.id}: "${address}"`);
      stats.failed++;
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

interface TransportStats {
  dep: EntityStats;
  arr: EntityStats;
}

async function backfillTransport(): Promise<TransportStats> {
  const depStats = emptyStats();
  const arrStats = emptyStats();

  // Fetch rows where either side is missing coords
  const rows = await db.transport.findMany({
    where: {
      OR: [
        { depPlace: { not: null }, depLat: null },
        { arrPlace: { not: null }, arrLat: null },
      ],
    },
    select: {
      id: true,
      depPlace: true,
      depLat: true,
      arrPlace: true,
      arrLat: true,
    },
  });

  // Count scanned for each side
  for (const row of rows) {
    if (row.depPlace && row.depLat === null) depStats.scanned++;
    if (row.arrPlace && row.arrLat === null) arrStats.scanned++;
  }

  log(
    `[transport] ${depStats.scanned} dep side(s) and ${arrStats.scanned} arr side(s) need geocoding`,
  );

  for (const row of rows) {
    // --- departure side ---
    if (row.depPlace && row.depLat === null) {
      const place = row.depPlace;

      if (DRY_RUN) {
        log(`  [dry-run] WOULD geocode transport ${row.id} dep: "${place}"`);
        depStats.geocoded++;
      } else {
        const coords = await geocodePlace(place);
        await throttle();

        if (coords) {
          await db.transport.update({
            where: { id: row.id },
            data: { depLat: coords.lat, depLng: coords.lng },
          });
          log(
            `  [transport] geocoded dep ${row.id}: ${coords.lat}, ${coords.lng}`,
          );
          depStats.geocoded++;
        } else {
          log(`  [transport] FAILED dep ${row.id}: "${place}"`);
          depStats.failed++;
        }
      }
    }

    // --- arrival side ---
    if (row.arrPlace && row.arrLat === null) {
      const place = row.arrPlace;

      if (DRY_RUN) {
        log(`  [dry-run] WOULD geocode transport ${row.id} arr: "${place}"`);
        arrStats.geocoded++;
      } else {
        const coords = await geocodePlace(place);
        await throttle();

        if (coords) {
          await db.transport.update({
            where: { id: row.id },
            data: { arrLat: coords.lat, arrLng: coords.lng },
          });
          log(
            `  [transport] geocoded arr ${row.id}: ${coords.lat}, ${coords.lng}`,
          );
          arrStats.geocoded++;
        } else {
          log(`  [transport] FAILED arr ${row.id}: "${place}"`);
          arrStats.failed++;
        }
      }
    }
  }

  return { dep: depStats, arr: arrStats };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) {
    log("=== DRY RUN — no writes will be made ===\n");
  }

  const itemStats = await backfillItems();
  const accStats = await backfillAccommodation();
  const { dep: transportDepStats, arr: transportArrStats } =
    await backfillTransport();

  log("\n=== Summary ===");

  function printStats(label: string, s: EntityStats) {
    log(
      `  ${label}: scanned=${s.scanned} geocoded=${s.geocoded} skipped=${s.skipped} failed=${s.failed}`,
    );
  }

  printStats("items", itemStats);
  printStats("accommodation", accStats);
  printStats("transport (dep)", transportDepStats);
  printStats("transport (arr)", transportArrStats);

  if (DRY_RUN) {
    log("\n(dry-run: no rows were updated)");
  }
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
