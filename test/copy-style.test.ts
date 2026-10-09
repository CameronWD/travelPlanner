import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { copyScanFiles, scanSource } from "./helpers/copy-scan";

/** Spec 2026-10-08 §K. Each entry needs a reason a reviewer would accept. */
const ALLOWLIST: { file: string; includes: string; reason: string }[] = [];

/** Files not yet brought to the house style (spec §F). Tasks remove their files; the list must end empty and be deleted. */
const PENDING = new Set<string>([
  "app/(app)/layout.tsx",
  "app/(app)/trips/[tripId]/files/page.tsx",
  "app/(app)/trips/[tripId]/journal/page.tsx",
  "app/(app)/trips/[tripId]/print/page.tsx",
  "app/global-error.tsx",
  "app/opengraph-image.tsx",
  "lib/release-notes.ts",
  "server/actions/ai.ts",
  "server/actions/attachments.ts",
  "server/actions/chapters.ts",
  "server/actions/cover.ts",
  "server/actions/digest.ts",
  "server/actions/globe.ts",
  "server/actions/push.ts",
  "server/actions/share.ts",
  "server/actions/stops.ts",
  "server/actions/trips.ts",
]);

const root = path.resolve(__dirname, "..");
const violations = copyScanFiles(root)
  .flatMap((f) => scanSource(f, fs.readFileSync(path.join(root, f), "utf8")))
  .filter((v) => !ALLOWLIST.some((a) => a.file === v.file && v.text.includes(a.includes)));

it("Traveller-facing copy has no em-dashes, 'Failed to' or 'Please try again'", () => {
  const live = violations.filter((v) => !PENDING.has(v.file));
  expect(live.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.text}`)).toEqual([]);
});

it("every pending file still has something to fix (remove clean files from PENDING)", () => {
  const dirty = new Set(violations.map((v) => v.file));
  expect([...PENDING].filter((f) => !dirty.has(f))).toEqual([]);
});
