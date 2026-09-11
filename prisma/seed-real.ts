import { pathToFileURL } from "node:url";
import { buildChristmasEurope2026, summariseRealTrip } from "../lib/real-trip/christmas-europe-2026";
import {
  ensureRealUser,
  assertNoExistingRealTrip,
  persistRealTrip,
  addExistingUserAsMember,
  REAL_PARTNER_EMAIL,
} from "./real/persist";

/**
 * Seeds Cam's real "Christmas in Europe 2026" trip under his account.
 *
 * ADDITIVE — it never deletes. If a trip of the same name already exists the
 * run aborts rather than wiping or duplicating it.
 *
 * Note: neither this module nor `./real/persist` imports `@/lib/db` at the
 * top level — `db` throws at module-evaluation time if DATABASE_URL isn't
 * set, and this sandbox has no local Postgres (the only DATABASE_URL ever
 * available here points at production). The dry-run path below never touches
 * `db`, so it needs no credentials and can't reach a database, real or
 * otherwise.
 *
 *   npm run db:seed:real:dry   # print what would be written, touch nothing
 *   npm run db:seed:real       # write it
 */
export async function seedReal(opts: { dryRun?: boolean } = {}): Promise<void> {
  const trip = buildChristmasEurope2026();

  if (opts.dryRun) {
    console.log("\n--- DRY RUN — nothing will be written ---\n");
    console.log(summariseRealTrip(trip));
    console.log("\n--- end dry run ---\n");
    return;
  }

  await assertNoExistingRealTrip(trip.name);
  const user = await ensureRealUser();
  const tripId = await persistRealTrip(trip, user);
  const added = await addExistingUserAsMember(tripId, REAL_PARTNER_EMAIL);
  console.log(`\n✅ Seeded "${trip.name}" for ${user.email}.`);
  console.log(
    added
      ? `   ${REAL_PARTNER_EMAIL} added as a member.\n`
      : `   ⚠️  No account found for ${REAL_PARTNER_EMAIL} — invite them from the app.\n`,
  );
}

/**
 * Arguments that aren't the one supported flag. A non-empty result is a hard
 * error at the call site: given the stakes (a typo like --dryrun silently
 * falling through to a real write), an unrecognised argument must abort
 * rather than be ignored. Kept separate from the `isMain` block below so
 * it's testable without touching `process.argv` or spawning a subprocess.
 */
export function unsupportedSeedArgs(argv: string[]): string[] {
  return argv.filter((a) => a !== "--dry-run");
}

/**
 * Close the Prisma connection on the way out, best-effort.
 *
 * Dry runs never open one, so there is nothing to disconnect — and importing
 * `@/lib/db` would defeat the point of a dry run. On the failure path the
 * import itself can throw (`db` throws at module-evaluation time when
 * DATABASE_URL is absent, which may well be *why* we're exiting), so the whole
 * thing is swallowed: a disconnect that fails must not replace the original
 * error with its own rejection, or hijack the non-zero exit.
 */
export async function disconnectQuietly(dryRun: boolean): Promise<void> {
  if (dryRun) return;
  try {
    const { db } = await import("../lib/db");
    await db.$disconnect();
  } catch {
    // Nothing useful to do — the process is on its way out either way.
  }
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const unknown = unsupportedSeedArgs(argv);
  if (unknown.length > 0) {
    console.error(
      `seed-real: unrecognised argument(s) ${unknown.map((a) => `"${a}"`).join(", ")}. ` +
        `The only supported flag is --dry-run.`,
    );
    process.exit(1);
  }
  const dryRun = argv.includes("--dry-run");
  seedReal({ dryRun })
    .then(async () => {
      // Dry runs never open a connection, so there's nothing to disconnect —
      // and importing `@/lib/db` here would defeat the point of a dry run.
      if (dryRun) return;
      const { db } = await import("../lib/db");
      await db.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await disconnectQuietly(dryRun);
      process.exit(1);
    });
}
