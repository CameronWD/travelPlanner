/**
 * Close a Feedback note (ADR 0040).
 *
 * Run command:
 *   npm run feedback:resolve -- <id> --note "what you did" [--wontfix] [--dry-run] [--site <name>]
 *
 * Status changes when the work actually lands — this is the only writer to the
 * FeedbackNote table outside the app, and it touches only status, resolution
 * and resolvedAt. Re-run `npm run feedback:pull` afterwards to refresh the
 * inbox.
 *
 * scripts/load-env.ts prefers .env.production.local, so in practice this
 * writes to production. It therefore prints the target database *host* before
 * touching anything (host only — a connection string carries the password),
 * and `--dry-run` reports the change without making it.
 *
 * tsx transpiles this project's scripts to CommonJS (no "type": "module" in
 * package.json), which esbuild refuses to do for top-level await. So env
 * loading lives in scripts/load-env.ts, imported first for its side effect
 * — import execution order guarantees it runs before lib/db reads
 * DATABASE_URL — rather than using top-level `await import(...)`.
 */

import "./load-env";

import { db } from "../lib/db";
import { parseResolveArgs } from "../lib/feedback-resolve-args";
import { siteMismatchWarning } from "../lib/feedback-resolve-site";
import { siteLabel, siteOf } from "../lib/feedback-site";

/**
 * The host of DATABASE_URL and nothing else — never the user, password or
 * database name. The operator needs to know which environment they just
 * changed; they do not need the credentials echoed into their scrollback.
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

function quote(value: string | null): string {
  return value === null ? "(none)" : `"${value}"`;
}

async function main() {
  const parsed = parseResolveArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exit(1);
  }

  // Printed BEFORE the lookup, not after: a mistyped id exits at the
  // not-found check below, and "no feedback note with id X" is exactly the
  // moment the operator needs to know which database was asked — this script
  // normally writes production (FN-06).
  console.log(`Database: ${targetHost()}`);

  const existing = await db.feedbackNote.findUnique({
    where: { id: parsed.id },
    select: {
      id: true,
      body: true,
      status: true,
      resolution: true,
      resolvedAt: true,
      site: true,
    },
  });
  if (!existing) {
    console.error(`No feedback note with id ${parsed.id}.`);
    process.exit(1);
  }

  console.log(`Site: ${siteLabel(siteOf(existing.site))}`);
  const mismatchWarning = siteMismatchWarning(existing.site, parsed.site);
  if (mismatchWarning) {
    console.log(mismatchWarning);
  }

  if (parsed.dryRun) {
    console.log(`Dry run — nothing was written.`);
    console.log(`  ${existing.id}: ${existing.body.slice(0, 60)}`);
    console.log(`  status:     ${existing.status} → ${parsed.status}`);
    console.log(
      `  resolution: ${quote(existing.resolution)} → ${quote(parsed.resolution)}`,
    );
    console.log(
      `  resolvedAt: ${existing.resolvedAt?.toISOString() ?? "(none)"} → now`,
    );
    await db.$disconnect();
    return;
  }

  await db.feedbackNote.update({
    where: { id: parsed.id },
    data: {
      status: parsed.status,
      resolution: parsed.resolution,
      resolvedAt: new Date(),
    },
  });

  console.log(
    `${parsed.status === "DONE" ? "Done" : "Won't fix"}: ${existing.body.slice(0, 60)}`,
  );
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
