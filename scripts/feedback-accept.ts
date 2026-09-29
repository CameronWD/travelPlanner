/**
 * Accept a Feedback note written by a non-Admin (ADR 0040, amended 2026-09-29).
 *
 *   npm run feedback:accept -- <id> [--dry-run]
 *
 * NEEDS_REVIEW → OPEN, nothing else: an accepted note simply joins the backlog
 * the next `feedback:pull` prints. Refuses a note in any other status — an
 * Open note needs no accepting and a resolved one is history. Declining is
 * `feedback:resolve -- <id> --wontfix --note "…"`. Writes production, like
 * resolve; prints the database host before touching anything.
 *
 * tsx transpiles this project's scripts to CommonJS (no "type": "module" in
 * package.json), which esbuild refuses to do for top-level await. So env
 * loading lives in scripts/load-env.ts, imported first for its side effect
 * — import execution order guarantees it runs before lib/db reads
 * DATABASE_URL — rather than using top-level `await import(...)`.
 */

import "./load-env";

import { db } from "../lib/db";
import { parseAcceptArgs } from "../lib/feedback-accept-args";

/**
 * The host of DATABASE_URL and nothing else — never the user, password or
 * database name (same as scripts/feedback-resolve.ts).
 */
function targetHost(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "unknown (DATABASE_URL is not set)";
  try {
    return new URL(url).host || "unknown";
  } catch {
    return "unknown (DATABASE_URL is not a URL)";
  }
}

async function main() {
  const parsed = parseAcceptArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exit(1);
  }

  // Before the lookup, so a mistyped id still says which database was asked.
  console.log(`Database: ${targetHost()}`);

  const existing = await db.feedbackNote.findUnique({
    where: { id: parsed.id },
    select: { id: true, body: true, status: true },
  });
  if (!existing) {
    console.error(`No feedback note with id ${parsed.id}.`);
    await db.$disconnect();
    process.exit(1);
  }

  if (existing.status !== "NEEDS_REVIEW") {
    console.error(
      `Not accepting: ${existing.id} is ${existing.status}, not NEEDS_REVIEW.`,
    );
    await db.$disconnect();
    process.exit(1);
  }

  if (parsed.dryRun) {
    console.log(`Dry run — nothing was written.`);
    console.log(`  ${existing.id}: ${existing.body.slice(0, 60)}`);
    console.log(`  status: ${existing.status} → OPEN`);
    await db.$disconnect();
    return;
  }

  await db.feedbackNote.update({
    where: { id: parsed.id },
    data: { status: "OPEN" },
  });

  console.log(`Accepted: ${existing.body.slice(0, 60)}`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
