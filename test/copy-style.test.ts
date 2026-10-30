import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { copyScanFiles, scanSource } from "./helpers/copy-scan";

/** Spec 2026-10-08 §K. Each entry needs a reason a reviewer would accept. */
const ALLOWLIST: { file: string; includes: string; reason: string }[] = [];

const root = path.resolve(__dirname, "..");
const violations = copyScanFiles(root)
  .flatMap((f) => scanSource(f, fs.readFileSync(path.join(root, f), "utf8")))
  .filter((v) => !ALLOWLIST.some((a) => a.file === v.file && v.text.includes(a.includes)));

it("Traveller-facing copy has no em-dashes, 'Failed to' or 'Please try again'", () => {
  expect(violations.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.text}`)).toEqual([]);
});
