import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import * as path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { AutoFinding } from "./checks";
import { ROUTES, buildCaptureMatrix, type CaptureSpec } from "./config";
import { exitCodeFor, filterCaptures, mergeRerun, rerunExitCode, shotLocation, summarise, type Manifest, type CaptureRecord } from "./run";

const cap = (o: Partial<CaptureRecord> = {}): CaptureRecord => ({
  id: "deep/plan/deep/390-light", set: "deep", route: "/trips/x/plan", routeLabel: "plan", trip: "deep",
  width: 390, theme: "light", media: "screen", files: ["a.png"], elementCount: 200, findings: 0, ms: 10, ...o,
});
const man = (captures: CaptureRecord[], gaps: Manifest["gaps"] = []): Manifest => ({
  startedAt: "", finishedAt: "", baseUrl: "http://localhost:3000", outDir: "/tmp/x", trips: {}, gaps, captures,
});

describe("exitCodeFor", () => {
  it("0 for a clean run", () => expect(exitCodeFor(man([cap()]))).toBe(0));
  it("1 when nothing was captured", () => expect(exitCodeFor(man([]))).toBe(1));
  it("1 when any capture errored", () => expect(exitCodeFor(man([cap(), cap({ id: "b", error: "timeout" })]))).toBe(1));
  it("1 when a capture measured zero elements (broken probe)", () => expect(exitCodeFor(man([cap({ elementCount: 0 })]))).toBe(1));
  it("skipped captures don't fail the run", () => expect(exitCodeFor(man([cap(), cap({ id: "d", skipped: "n/a: no dated days", elementCount: 0, files: [] })]))).toBe(0));
  it("findings alone don't fail Stage 1", () => expect(exitCodeFor(man([cap({ findings: 12 })]))).toBe(0));
});

describe("summarise", () => {
  it("names gaps and errors loudly", () => {
    const s = summarise(man([cap({ id: "b", error: "timeout" })], [{ key: "travelling", reason: "expected travelling, got past" }]));
    expect(s).toMatch(/COVERAGE GAP.*travelling/);
    expect(s).toMatch(/ERROR.*b.*timeout/);
  });
  it("names zero-element captures and breaks findings down by check", () => {
    const s = summarise(man([cap({ id: "z", elementCount: 0 })]), [
      { id: "1", check: "overlap", captureId: "z", selector: "a", rect: { x: 0, y: 0, w: 1, h: 1 }, detail: "" },
      { id: "2", check: "overlap", captureId: "z", selector: "b", rect: { x: 0, y: 0, w: 1, h: 1 }, detail: "" },
    ]);
    expect(s).toMatch(/ZERO ELEMENTS z/);
    expect(s).toMatch(/overlap: 2/);
    expect(s).toMatch(/RESULT: FAIL/);
  });
});

// Beyond the brief: the rest of run.ts's pure surface.
describe("exitCodeFor: a run that skipped everything proved nothing", () => {
  it("1 when every capture was skipped", () =>
    expect(exitCodeFor(man([cap({ skipped: "coverage gap: x", elementCount: 0, files: [] })]))).toBe(1));
});

const spec = (o: Partial<CaptureSpec> = {}): CaptureSpec => ({
  id: "deep/plan/deep/390-light", set: "deep", route: ROUTES.find((r) => r.label === "plan")!, trip: "deep",
  width: 390, theme: "light", media: "screen", ...o,
});

describe("shotLocation", () => {
  it("pages go under shots/<set>/<routeLabel>/<trip>", () =>
    expect(shotLocation("/tmp/o", spec())).toEqual({ dir: "/tmp/o/shots/deep/plan/deep", baseName: "390-light" }));
  it("overlays go under shots/overlay/<overlayId>, keyboard variants get -kbd", () =>
    expect(shotLocation("/tmp/o", spec({ set: "overlay", overlay: "stop-add", keyboard: true, width: 360 }))).toEqual({
      dir: "/tmp/o/shots/overlay/stop-add",
      baseName: "360-light-kbd",
    }));
});

describe("mergeRerun", () => {
  const f = (captureId: string, id: string): AutoFinding => ({
    id, check: "overlap", captureId, selector: "a", rect: { x: 0, y: 0, w: 1, h: 1 }, detail: "",
  });
  const prev = {
    manifest: {
      ...man(
        [cap({ id: "a" }), cap({ id: "b", error: "timeout" }), cap({ id: "o", overlay: "stop-add", skipped: "coverage gap: x" })],
        [
          { key: "travelling", reason: "drifted" },
          { key: "share", reason: "no share link on settings" },
          { key: "overlay:stop-add", reason: "x (at 390)", captureId: "o" },
        ],
      ),
      startedAt: "t0",
    },
    findings: [f("a", "a1"), f("b", "b1"), f("o", "o1")],
  };
  const next = {
    manifest: { ...man([cap({ id: "b" }), cap({ id: "o", overlay: "stop-add" }), cap({ id: "c" })]), startedAt: "t1" },
    findings: [f("b", "b2"), f("c", "c1")],
  };
  const merged = mergeRerun(prev, next, ["deep", "sketching", "final-prep", "travelling", "past", "empty"]);

  it("replaces re-run captures in place and appends new ones", () => {
    expect(merged.manifest.captures.map((c) => c.id)).toEqual(["a", "b", "o", "c"]);
    expect(merged.manifest.captures[1].error).toBeUndefined();
    expect(exitCodeFor(merged.manifest)).toBe(0);
  });
  it("replaces the re-run captures' findings and keeps the rest", () =>
    expect(merged.findings.map((x) => x.id)).toEqual(["a1", "b2", "c1"]));
  it("drops re-evaluated run-level gaps and re-run captures' gaps, keeps un-evaluated ones", () =>
    expect(merged.manifest.gaps).toEqual([{ key: "share", reason: "no share link on settings" }]));
  it("keeps the first run's start time", () => expect(merged.manifest.startedAt).toBe("t0"));
  it("a re-run that captured something and fixed the errors passes, and says so", () => {
    expect(rerunExitCode(next.manifest, merged.manifest)).toBe(0);
    expect(summarise(merged.manifest, merged.findings, next.manifest)).toMatch(/RESULT: OK/);
  });
});

// Review fix: the merged manifest is the previous run's when this run captured nothing, so its
// exit code alone would pass a typo'd LAYOUT_AUDIT_ONLY. This run's own records must count too.
describe("a filtered re-run that captures nothing fails, even merged into a clean manifest", () => {
  const prev = { manifest: man([cap({ id: "a" }), cap({ id: "b" })]), findings: [] };

  it("no capture matched the filter", () => {
    const next = { manifest: man([]), findings: [] };
    const merged = mergeRerun(prev, next, []);
    expect(exitCodeFor(merged.manifest)).toBe(0); // the trap: the merged manifest alone looks clean
    expect(rerunExitCode(next.manifest, merged.manifest)).toBe(1);
    expect(summarise(merged.manifest, merged.findings, next.manifest)).toMatch(/RESULT: FAIL.*matched no captures/);
  });

  it("every re-run capture was skipped", () => {
    const next = { manifest: man([cap({ id: "b", skipped: "coverage gap: x", elementCount: 0, files: [] })]), findings: [] };
    const merged = mergeRerun(prev, next, []);
    expect(exitCodeFor(merged.manifest)).toBe(0);
    expect(rerunExitCode(next.manifest, merged.manifest)).toBe(1);
    expect(summarise(merged.manifest, merged.findings, next.manifest)).toMatch(/RESULT: FAIL.*all skipped/);
  });

  it("without a merge, this run and the manifest are the same thing", () => {
    const only = man([cap()]);
    expect(rerunExitCode(only, only)).toBe(0);
    expect(summarise(only, [], only)).toMatch(/RESULT: OK/);
  });
});

describe("filterCaptures", () => {
  const specs = [spec({ id: "deep/plan/deep/390-light" }), spec({ id: "overlay/stop-add/360-light" })];
  it("keeps everything when unset or blank", () => {
    expect(filterCaptures(specs, undefined)).toHaveLength(2);
    expect(filterCaptures(specs, "  ")).toHaveLength(2);
  });
  it("is a substring match on the id", () =>
    expect(filterCaptures(specs, "overlay/").map((s) => s.id)).toEqual(["overlay/stop-add/360-light"]));
  it("the documented overlay example matches the real overlay id shape", () => {
    const real = buildCaptureMatrix({ overlays: [{ id: "stop-add", form: true }, { id: "other-cost-add", form: true }], phaseTripsAvailable: [] });
    const hit = filterCaptures(real, "overlay/stop-add/").map((s) => s.id);
    expect(hit).toHaveLength(5);
    expect(hit.every((id) => id.startsWith("overlay/stop-add/"))).toBe(true);
  });
  it("commas separate alternatives", () => expect(filterCaptures(specs, "deep/plan/, stop-add")).toHaveLength(2));
  it("a filter that matches nothing yields nothing (and rerunExitCode then fails the run, merged or not)", () =>
    expect(filterCaptures(specs, "typo")).toEqual([]));
});

// The hard safety rule, pinned: nothing in the harness may import code that can reach a database
// (scripts/load-env.ts prefers .env.production.local — production). An ALLOWLIST, not a
// denylist: a denylist of direct imports misses a transitive path (an `@/…` app module that
// itself imports lib/db). Every module reference in a harness file must be
//   - a relative path resolving inside scripts/layout-audit/, scripts/lib/ or scripts/types/ —
//     to a file this same scan covers, so the rule holds transitively;
//   - a `node:` builtin; or
//   - `playwright`, type-only (resolvePlaywright() loads it at run time).
// Module references are read with the TypeScript parser, so every form counts: import/export
// ... from, bare `import "x"`, `import x = require()`, require(), import(), and `import("x")`
// types. A non-literal require()/import() is rejected (it can't be checked), and so is any use
// of `require` as a value other than resolvePlaywright()'s one alias in audit-browser.ts.
const ROOT = process.cwd();
const HARNESS_DIRS = ["scripts/layout-audit", "scripts/lib", "scripts/types"].map((d) => path.join(ROOT, d));
const BUILTINS = new Set(builtinModules);

interface ModuleRef {
  spec: string | null; // null: not a string literal
  typeOnly: boolean;
  text: string;
}

function moduleRefs(src: string, file: string): { refs: ModuleRef[]; requireAliases: number } {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const refs: ModuleRef[] = [];
  let requireAliases = 0;
  const literal = (n: ts.Node | undefined) => (n && ts.isStringLiteralLike(n) ? n.text : null);
  const add = (node: ts.Node, spec: string | null, typeOnly: boolean) => refs.push({ spec, typeOnly, text: node.getText(sf) });
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const c = node.importClause;
      const named = c?.namedBindings && ts.isNamedImports(c.namedBindings) ? c.namedBindings.elements : undefined;
      const typeOnly = !!c && (c.isTypeOnly || (!c.name && !!named && named.length > 0 && named.every((e) => e.isTypeOnly)));
      add(node, literal(node.moduleSpecifier), typeOnly);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      add(node, literal(node.moduleSpecifier), node.isTypeOnly);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, literal(node.moduleReference.expression), node.isTypeOnly);
    } else if (ts.isImportTypeNode(node)) {
      add(node, ts.isLiteralTypeNode(node.argument) ? literal(node.argument.literal) : null, true);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node, literal(node.arguments[0]), false);
    } else if (ts.isIdentifier(node) && node.text === "require") {
      const p = node.parent;
      if (ts.isCallExpression(p) && p.expression === node) add(p, literal(p.arguments[0]), false);
      else if (!(ts.isPropertyAccessExpression(p) && p.expression === node && p.name.text === "main")) requireAliases++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { refs, requireAliases };
}

/** The file a relative specifier resolves to, or null. */
function resolveLocal(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec);
  for (const f of [base, `${base}.ts`, `${base}.d.ts`, path.join(base, "index.ts")]) {
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
}

/** Why each module reference in `src` (the harness file `file`) breaks the allowlist; empty
 * when it's clean. `scanned` is the set of files this scan covers (absolute paths). */
function violations(src: string, file: string, scanned: Set<string>): string[] {
  const out: string[] = [];
  for (const ref of moduleRefs(src, file).refs) {
    const { spec } = ref;
    if (spec === null) out.push(`${ref.text}: not a string literal, can't be checked`);
    else if (spec.startsWith("node:")) {
      if (!BUILTINS.has(spec.slice("node:".length))) out.push(`${ref.text}: not a node: builtin`);
    } else if (spec === "playwright") {
      if (!ref.typeOnly) out.push(`${ref.text}: playwright must be type-only (resolvePlaywright() loads it)`);
    } else if (spec.startsWith("./") || spec.startsWith("../")) {
      const target = path.resolve(path.dirname(file), spec);
      if (!HARNESS_DIRS.some((d) => target.startsWith(d + path.sep))) {
        out.push(`${ref.text}: resolves outside the harness (${path.relative(ROOT, target)})`);
        continue;
      }
      const resolved = resolveLocal(file, spec);
      if (!resolved) out.push(`${ref.text}: does not resolve to a file`);
      else if (!scanned.has(resolved)) out.push(`${ref.text}: ${path.relative(ROOT, resolved)} is not covered by this scan`);
    } else out.push(`${ref.text}: not a relative harness path, a node: builtin or playwright`);
  }
  return out;
}

describe("safety: harness imports are allowlisted", () => {
  const files = [
    "scripts/layout-audit.ts",
    "scripts/lib/audit-browser.ts",
    ...readdirSync("scripts/layout-audit")
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => `scripts/layout-audit/${f}`),
    ...readdirSync("scripts/types")
      .filter((f) => f.endsWith(".d.ts"))
      .map((f) => `scripts/types/${f}`),
  ].map((f) => path.join(ROOT, f));
  const scanned = new Set(files);
  const inHarness = path.join(ROOT, "scripts/layout-audit/example.ts");
  const check = (src: string, file = inHarness) => violations(src, file, scanned);

  it("rejects anything that could reach a database (positive control)", () => {
    for (const bad of [
      `import { db } from "@/lib/db";`,
      `import { auth } from "@/lib/auth";`, // transitive: lib/auth imports lib/db
      `import "../load-env";`,
      `import "../../scripts/load-env";`,
      `export * from "../load-env";`,
      `await import("../load-env");`,
      `require("dotenv").config();`,
      `import dotenv from "dotenv";`,
      `import { PrismaClient } from "@prisma/client";`,
      `import { db } from "../../lib/db";`,
      `import { BASE_ROUTES } from "../contrast-audit";`,
      `import { chromium } from "playwright";`,
      `import * as fs from "fs";`,
      `const m = require(name);`,
      `const m = await import(name);`,
      `import { x } from "./not-a-file";`,
    ]) expect(check(bad), bad).not.toEqual([]);
    for (const good of [
      `import type { Page } from "playwright";`,
      `import { type Page } from "playwright";`,
      `import * as path from "node:path";`,
      `import { buildCaptureMatrix } from "./config";`,
      `import { resolvePlaywright } from "../lib/audit-browser";`,
      `if (require.main === module) main();`,
    ]) expect(check(good), good).toEqual([]);
    expect(check(`import { OVERLAYS } from "./layout-audit/overlays";`, path.join(ROOT, "scripts/layout-audit.ts"))).toEqual([]);
  });

  it("counts require used as a value, so an alias can't smuggle a load past the scan", () => {
    expect(moduleRefs(`const r = require; r("../load-env");`, inHarness).requireAliases).toBe(1);
    expect(moduleRefs(`if (require.main === module) main();`, inHarness).requireAliases).toBe(0);
  });

  it.each(files.map((f) => path.relative(ROOT, f)))("%s", (rel) => {
    const file = path.join(ROOT, rel);
    const src = readFileSync(file, "utf8");
    expect(violations(src, file, scanned)).toEqual([]);
    // resolvePlaywright()'s `const req = require as NodeRequire` is the one sanctioned alias.
    expect(moduleRefs(src, file).requireAliases).toBe(rel === "scripts/lib/audit-browser.ts" ? 1 : 0);
    expect(src).not.toMatch(/process\.env\.DATABASE_URL/);
  });
});
