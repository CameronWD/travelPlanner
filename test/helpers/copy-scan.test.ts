import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIB_EXCLUSIONS, copyScanFiles, scanSource } from "./copy-scan";

const v = (src: string) => scanSource("x.tsx", src).map((x) => x.rule);

it("flags em-dashes in strings, templates and JSX text", () => {
  expect(v(`const a = "one — two";`)).toEqual(["em-dash"]);
  expect(v("const a = `x — ${b} — y`;")).toEqual(["em-dash", "em-dash"]);
  expect(v(`const C = () => <p>Hello — there</p>;`)).toEqual(["em-dash"]);
});

it("allows a lone em-dash placeholder", () =>
  expect(v(`const C = () => <td>{"—"}</td>; const d = "—";`)).toEqual([]));

it("ignores comments, imports, directives, console and reportError context", () => {
  expect(
    v(
      `"use client";\n// a — b\n/* c — d */\nimport x from "a—b";\nconsole.warn("x — y");\nreportError(e, { route: "a — b", source: "server" });`,
    ),
  ).toEqual([]);
});

it("exempts route/source only inside a reportError(...) call argument", () => {
  expect(v(`reportError(e, { route: "a — b" });`)).toEqual([]);
  expect(v(`const x = { source: "a — b" };`)).toEqual(["em-dash"]);
});

it("flags Failed to and Please try again", () => {
  expect(v(`toast.error("Failed to reorder stops.")`)).toEqual(["failed-to"]);
  expect(v(`const e = "Upload failed. Please try again.";`)).toEqual(["please-try-again"]);
});

it("reports line numbers", () => expect(scanSource("x.ts", `\n\nconst a = "a — b";`)[0].line).toBe(3));

it("normalises whitespace before matching phrase rules, so a wrapped JSX phrase is still caught", () => {
  expect(v(`const C = () => <p>Please try\n   again.</p>;`)).toEqual(["please-try-again"]);
  expect(v(`const e = \`Upload failed.\n    Please   try\tagain.\`;`)).toEqual(["please-try-again"]);
});

it("flags a lone em-dash JsxText that sits between sibling expressions", () => {
  expect(v(`const C = () => <span>{a} — {b}</span>;`)).toEqual(["em-dash"]);
  expect(v(`const C = () => <span>{a}—{b}</span>;`)).toEqual(["em-dash"]);
});

it("still allows a lone em-dash JsxText that is the only child of its element", () => {
  expect(v(`const C = () => <td> — </td>;`)).toEqual([]);
  expect(v(`const C = () => <td>—</td>;`)).toEqual([]);
});

it("still allows a string or template literal whose whole text is exactly an em-dash", () => {
  expect(v(`const a = "—"; const b = \`—\`;`)).toEqual([]);
});

it("flags a lone em-dash in a template literal's head/middle/tail segment, between interpolations", () => {
  expect(v("const s = `${a} — ${b}`;")).toEqual(["em-dash"]);
  expect(v("const s = `${a} —`;")).toEqual(["em-dash"]);
  expect(v("const s = `— ${b}`;")).toEqual(["em-dash"]);
});

describe("lib/ exclusion mechanism", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-scan-lib-"));
    fs.mkdirSync(path.join(root, "lib", "demo"), { recursive: true });
    fs.mkdirSync(path.join(root, "lib", "real-trip"), { recursive: true });
    fs.mkdirSync(path.join(root, "lib", "sub"), { recursive: true });
    // One file per LIB_EXCLUSIONS entry that is a whole-subtree prefix, plus
    // the exact-file entries, so every current exclusion is exercised.
    fs.writeFileSync(path.join(root, "lib", "demo", "index.ts"), "export const a = 1;");
    fs.writeFileSync(path.join(root, "lib", "real-trip", "trip.ts"), "export const a = 1;");
    fs.writeFileSync(path.join(root, "lib", "db.ts"), "export const a = 1;");
    fs.writeFileSync(path.join(root, "lib", "sweep-blobs-driver.ts"), "export const a = 1;");
    fs.writeFileSync(path.join(root, "lib", "feedback-inbox.ts"), "export const a = 1;");
    fs.writeFileSync(path.join(root, "lib", "access-requests.ts"), "export const a = 1;");
    // Not excluded: should still be scanned, including in a subdirectory.
    fs.writeFileSync(path.join(root, "lib", "kept.ts"), "export const a = 1;");
    fs.writeFileSync(path.join(root, "lib", "sub", "kept2.ts"), "export const a = 1;");
    // A test file: never scanned regardless of exclusion.
    fs.writeFileSync(path.join(root, "lib", "kept.test.ts"), "export const a = 1;");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("every LIB_EXCLUSIONS entry has a reason", () => {
    for (const e of LIB_EXCLUSIONS) expect(e.reason.length).toBeGreaterThan(0);
  });

  it("excludes files and whole subtrees named in LIB_EXCLUSIONS", () => {
    const files = copyScanFiles(root);
    for (const e of LIB_EXCLUSIONS) {
      expect(files.some((f) => f === e.prefix || f.startsWith(e.prefix))).toBe(false);
    }
  });

  it("still scans lib/ files not named in LIB_EXCLUSIONS, including nested ones", () => {
    const files = copyScanFiles(root);
    expect(files).toContain("lib/kept.ts");
    expect(files).toContain("lib/sub/kept2.ts");
  });

  it("never scans test files even when not excluded", () => {
    const files = copyScanFiles(root);
    expect(files).not.toContain("lib/kept.test.ts");
  });
});
