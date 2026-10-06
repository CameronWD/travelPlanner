import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Spec 2026-10-06 §R: zod stays on the server. Walk every "use client"
 * file's static and dynamic imports (type-only imports are erased; a
 * "use server" module is a reference, not bundled) and fail if any reached
 * module imports zod.
 *
 * Perf: file contents, directive checks, parsed value-import lists and
 * resolve() results are memoised at module scope, and each module's set of
 * "offender modules reachable from here" is computed once and cached
 * (DFS with a per-call in-progress guard: a module currently being walked
 * is treated as reaching no offenders on that path, so a cycle can't loop
 * forever — matching the original per-entry "seen" set's behaviour of
 * never re-entering a node already on the current walk). That means a
 * module reachable from many "use client" entries is only read, parsed and
 * walked once for the whole test run instead of once per entry.
 */
const ROOT = process.cwd();
const ROOTS = ["app", "components", "lib"];
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+([^;]*?)\s+from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const sourceCache = new Map<string, string>();
function source(file: string): string {
  let src = sourceCache.get(file);
  if (src === undefined) {
    src = readFileSync(file, "utf8");
    sourceCache.set(file, src);
  }
  return src;
}

const resolveCache = new Map<string, string | null>();
function resolve(from: string, spec: string): string | null {
  const key = `${from}\u0000${spec}`;
  if (resolveCache.has(key)) return resolveCache.get(key)!;
  let result: string | null = null;
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else {
    resolveCache.set(key, null);
    return null;
  }
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) {
      result = c;
      break;
    }
  }
  resolveCache.set(key, result);
  return result;
}

const valueImportsCache = new Map<string, string[]>();
function valueImports(file: string): string[] {
  const cached = valueImportsCache.get(file);
  if (cached) return cached;
  const src = source(file);
  const out: string[] = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    if (m[2]) {
      const clause = m[1].trim();
      if (/^type\b/.test(clause)) continue;
      const braces = clause.match(/^\{([^}]*)\}$/);
      if (braces && braces[1].split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue;
      out.push(m[2]);
    } else out.push((m[3] ?? m[4])!);
  }
  valueImportsCache.set(file, out);
  return out;
}

const directiveCache = new Map<string, Map<string, boolean>>();
function directive(file: string, d: string): boolean {
  let perFile = directiveCache.get(file);
  if (!perFile) {
    perFile = new Map();
    directiveCache.set(file, perFile);
  }
  let result = perFile.get(d);
  if (result === undefined) {
    result = new RegExp(`^\\s*["']${d}["']`).test(source(file));
    perFile.set(d, result);
  }
  return result;
}

const isZodSpec = (spec: string) => spec === "zod" || spec.startsWith("zod/");

// Per-module memoised "which offender modules (files that themselves
// contain a zod import) are reachable from here, and via what chain".
// Keyed by absolute file path; value maps an offender's absolute path to
// the chain of absolute paths from `file` down to (and including) that
// offender.
const offendersCache = new Map<string, Map<string, string[]>>();
// Files currently being walked on the active call stack — revisiting one
// (a cycle) contributes nothing further on that path, same as the original
// per-entry `seen` set never re-processing a node already on the stack.
const inProgress = new Set<string>();

function offendersFrom(file: string): Map<string, string[]> {
  const cached = offendersCache.get(file);
  if (cached) return cached;
  if (inProgress.has(file)) return new Map();
  if (directive(file, "use server")) {
    const empty = new Map<string, string[]>();
    offendersCache.set(file, empty);
    return empty;
  }
  inProgress.add(file);
  const result = new Map<string, string[]>();
  if (valueImports(file).some(isZodSpec)) {
    result.set(file, [file]);
  }
  for (const spec of valueImports(file)) {
    if (isZodSpec(spec)) continue;
    const next = resolve(file, spec);
    if (!next) continue;
    for (const [offender, chain] of offendersFrom(next)) {
      if (!result.has(offender)) result.set(offender, [file, ...chain]);
    }
  }
  inProgress.delete(file);
  offendersCache.set(file, result);
  return result;
}

describe("zod stays on the server (spec 2026-10-06 §R)", () => {
  it(
    "no client component reaches a module that imports zod",
    () => {
      const offenders = new Map<string, string>();
      const entries = ROOTS.flatMap((r) => walk(path.join(ROOT, r))).filter((f) => directive(f, "use client"));
      for (const entry of entries) {
        for (const [offenderAbs, chain] of offendersFrom(entry)) {
          const rel = path.relative(ROOT, offenderAbs);
          if (!offenders.has(rel)) {
            offenders.set(rel, chain.map((t) => path.relative(ROOT, t)).join(" -> "));
          }
        }
      }
      expect([...offenders].map(([f, via]) => `${f}  via  ${via}`)).toEqual([]);
    },
    30_000,
  );
});
