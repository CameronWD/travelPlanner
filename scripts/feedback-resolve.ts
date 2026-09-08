/**
 * Close a Feedback note (ADR 0040).
 *
 * Run command:
 *   npm run feedback:resolve -- <id> --note "what you did" [--wontfix]
 *
 * Status changes when the work actually lands — this is the only writer to the
 * FeedbackNote table outside the app, and it touches only status, resolution
 * and resolvedAt. Re-run `npm run feedback:pull` afterwards to refresh the
 * inbox.
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

async function main() {
  const parsed = parseResolveArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exit(1);
  }

  const existing = await db.feedbackNote.findUnique({
    where: { id: parsed.id },
    select: { id: true, body: true },
  });
  if (!existing) {
    console.error(`No feedback note with id ${parsed.id}.`);
    process.exit(1);
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
