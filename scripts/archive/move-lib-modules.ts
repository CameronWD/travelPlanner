/**
 * One-off codemod, spec 2026-10-14 card 3.O (Q9): move one lib area into its
 * folder and re-point every reference, then `git mv` so history follows.
 *
 *   npx tsx scripts/archive/move-lib-modules.ts <auth|money|feedback|map|share> [--dry-run]
 *
 * Reads the tracked file list at run time, so imports added after the plan
 * was written are covered. --dry-run prints what would change and writes
 * nothing. The pure logic and the naming rule live in ./lib-moves.ts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { movesFor, rewritePathMentions, rewriteSource } from "./lib-moves";

const CODE = /\.(tsx?|mts|cts|m?js|cjs)$/;
const TEXT = /\.(md|json|ya?ml|css|prisma)$/;
// Never rewritten: generated output, vendored design exports, applied
// migrations (Prisma checksums them), this codemod, and dated history docs
// (specs, plans, ADRs, audits, follow-ups) that record paths as they were.
const SKIP = [
  /^design_handoff\//,
  /^prisma\/migrations\//,
  /^scripts\/(archive|codemods)\//,
  /^docs\/(specs|superpowers|adr|audits|follow-ups|feedback|plans)\//,
  /^docs\/architecture-sitrep-[\d-]+\.md$/,
  /^docs\/things-to-fix\.md$/,
  /(^|\/)package-lock\.json$/,
];

const folder = process.argv[2] ?? "";
const dryRun = process.argv.includes("--dry-run");
const files = new Set(execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean));
const moves = movesFor(folder, files);

const changed = new Map<string, string>();
for (const file of files) {
  if (SKIP.some((re) => re.test(file))) continue;
  if (!CODE.test(file) && !TEXT.test(file)) continue;
  const src = readFileSync(file, "utf8");
  const out = rewritePathMentions(rewriteSource(src, file, moves, files), moves);
  if (out !== src || file in moves) changed.set(file, out);
}

for (const [from, to] of Object.entries(moves)) console.log(`move  ${from} -> ${to}`);
for (const [file, out] of changed) {
  const before = readFileSync(file, "utf8").split("\n");
  const lines = out.split("\n").flatMap((l, i) => (l !== before[i] ? [i + 1] : []));
  if (lines.length > 0) console.log(`edit  ${file}:${lines.join(",")}`);
}
if (dryRun) process.exit(0);

for (const [from, to] of Object.entries(moves)) {
  mkdirSync(path.dirname(to), { recursive: true });
  execFileSync("git", ["mv", from, to]);
}
for (const [file, out] of changed) writeFileSync(moves[file] ?? file, out);
console.log(`${Object.keys(moves).length} files moved, ${changed.size} files written.`);
