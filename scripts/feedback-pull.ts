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
 *   notes grouped by area, then needs-review ones in their own section;
 *   resolved ones are counted, not listed. The file is
 *   generated: hand edits are overwritten on the next run.
 *
 *   READ-ONLY against the database. The only writers are
 *   scripts/feedback-resolve.ts and scripts/feedback-accept.ts, and they only
 *   touch status fields.
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
import { PICTURES_REPO_DIR, renderInbox, toInboxNote } from "../lib/feedback/inbox";
import { picturesOnDisk, pullPictures } from "../lib/feedback/pull-pictures";
import { getStorage } from "../lib/storage";

const DRY_RUN = process.argv.includes("--dry-run");
const OUT_PATH = path.join(process.cwd(), "docs", "feedback", "inbox.md");
const PICTURES_DIR = path.join(process.cwd(), PICTURES_REPO_DIR);

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
      authorName: true,
      site: true,
      pictures: {
        orderBy: { position: "asc" },
        select: { id: true, storageKey: true, mime: true, size: true, position: true },
      },
    },
  });

  const notes = rows.map(toInboxNote);

  if (DRY_RUN) {
    // Downloads nothing, so it lists what is already on disk.
    const present = await picturesOnDisk({ notes: rows, dir: PICTURES_DIR });
    console.log(renderInbox(notes, new Date(), present));
  } else {
    // Pictures first: the inbox lists only the ones that actually landed. A
    // storage that throws (bad R2 config) must not cost the inbox itself.
    let written = 0;
    let missing = 0;
    let pullFailed = false;
    try {
      ({ written, missing } = await pullPictures({
        notes: rows,
        storage: getStorage(),
        dir: PICTURES_DIR,
      }));
    } catch (err) {
      console.error("Could not download pictures:", err);
      pullFailed = true;
      process.exitCode = 1;
    }
    const present = await picturesOnDisk({ notes: rows, dir: PICTURES_DIR });
    const markdown = renderInbox(notes, new Date(), present);
    await mkdir(path.dirname(OUT_PATH), { recursive: true });
    await writeFile(OUT_PATH, markdown, "utf8");
    const open = notes.filter((n) => n.status === "OPEN").length;
    const needs = notes.filter((n) => n.status === "NEEDS_REVIEW").length;
    const resolved = notes.length - open - needs;
    const pictures = rows
      .filter((r) => r.status === "OPEN" || r.status === "NEEDS_REVIEW")
      .reduce((total, r) => total + r.pictures.length, 0);
    const unread = pullFailed
      ? ", the download failed — check STORAGE_DRIVER and the R2 variables in .env.production.local"
      : missing > 0
        ? `, ${missing} could not be downloaded — check STORAGE_DRIVER and the R2 variables in .env.production.local`
        : "";
    console.log(
      `Wrote ${path.relative(process.cwd(), OUT_PATH)} — ${open} open, ${needs} needs review, ${resolved} resolved, ${pictures} pictures (${written} downloaded${unread}).`,
    );
  }

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
