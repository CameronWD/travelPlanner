/**
 * Export Feedback notes to docs/feedback/inbox.md (ADR 0040).
 *
 * Run command:
 *   npx tsx scripts/feedback-pull.ts [--dry-run]
 *
 * Or via the npm script:
 *   npm run feedback:pull [-- --dry-run]
 *
 * What it does:
 *   Reads every FeedbackNote row and rewrites docs/feedback/inbox.md — open
 *   notes grouped by area, resolved ones beneath as history. The file is
 *   generated: hand edits are overwritten on the next run.
 *
 *   READ-ONLY against the database. The only writer is
 *   scripts/feedback-resolve.ts, and it only touches status fields.
 *
 *   Reads production by default when .env.production.local exists (that is
 *   where the notes actually are — the app is used deployed), falling back to
 *   whatever DATABASE_URL is already set. --dry-run prints the markdown to
 *   stdout instead of writing the file.
 *
 *   tsx transpiles this project's scripts to CommonJS (no "type": "module" in
 *   package.json), which esbuild refuses to do for top-level await. So env
 *   loading lives in scripts/load-env.ts, imported first for its side effect
 *   — import execution order guarantees it runs before lib/db reads
 *   DATABASE_URL — rather than using top-level `await import(...)`.
 */

import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "../lib/db";
import { renderInbox } from "../lib/feedback-inbox";
import { FEEDBACK_STATUSES } from "../lib/enums";

const DRY_RUN = process.argv.includes("--dry-run");
const OUT_PATH = path.join(process.cwd(), "docs", "feedback", "inbox.md");

async function main() {
  const rows = await db.feedbackNote.findMany({
    orderBy: { authoredAt: "asc" },
    select: {
      id: true,
      body: true,
      route: true,
      pageLabel: true,
      tripName: true,
      viewport: true,
      userAgent: true,
      status: true,
      authoredAt: true,
      createdAt: true,
      resolvedAt: true,
      resolution: true,
      author: { select: { name: true } },
    },
  });

  const notes = rows.map((row) => ({
    id: row.id,
    body: row.body,
    route: row.route,
    pageLabel: row.pageLabel,
    tripName: row.tripName,
    authorName: row.author.name ?? "Traveller",
    viewport: row.viewport,
    userAgent: row.userAgent,
    status: (FEEDBACK_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as (typeof FEEDBACK_STATUSES)[number])
      : ("OPEN" as const),
    authoredAt: row.authoredAt,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolution: row.resolution,
  }));

  const markdown = renderInbox(notes, new Date());

  if (DRY_RUN) {
    console.log(markdown);
  } else {
    await mkdir(path.dirname(OUT_PATH), { recursive: true });
    await writeFile(OUT_PATH, markdown, "utf8");
    const open = notes.filter((n) => n.status === "OPEN").length;
    console.log(
      `Wrote ${path.relative(process.cwd(), OUT_PATH)} — ${open} open, ${notes.length - open} resolved.`,
    );
  }

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
