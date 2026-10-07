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
 * resolve() results are memoised at module scope, so each file is only
 * read and parsed once for the whole test run no matter how many "use
 * client" entries reach it. The reachability walk itself is NOT memoised
 * across entries — it stays a fresh per-entry `seen` set and stack walk,
 * exactly as the original, because a cross-entry memo of "offenders
 * reachable from module M" is unsound in the presence of import cycles: a
 * node first reached while an ancestor is mid-walk can get a result cached
 * from a truncated traversal, and a different entry that reaches that node
 * directly (not through the cycle) would then read the stale, incomplete
 * answer. (An earlier version of this file did exactly that and silently
 * hid a real offender behind a cycle — see `findOffenders` below and its
 * unit test for the minimal repro.) Per-file caching alone already gets
 * the win: every module is read/parsed once, and only the O(entries ×
 * subgraph) graph walk remains, same as before but over cached data.
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

/**
 * The reachability walk, factored out so it can be exercised directly
 * against a tiny in-memory graph (see the unit test below) without going
 * through the filesystem. `childrenOf`/`importsZodDirectly`/`isServer` are
 * the only seams the real guard needs from the filesystem-backed caches
 * above; the walk itself is the same fresh-per-entry `seen` + stack DFS as
 * the original implementation, just reading from memoised lookups.
 *
 * Returns a map of offender id -> " -> "-joined chain from `entry` down to
 * (and including) that offender, for every node reachable from `entry`
 * (not cut off by a "use server" boundary) that itself imports zod.
 */
function findOffenders(
  entry: string,
  childrenOf: (node: string) => string[],
  importsZodDirectly: (node: string) => boolean,
  isServer: (node: string) => boolean,
): Map<string, string> {
  const offenders = new Map<string, string>();
  const seen = new Set<string>();
  const stack: [string, string[]][] = [[entry, [entry]]];
  while (stack.length) {
    const [node, trail] = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    if (isServer(node)) continue;
    if (importsZodDirectly(node) && !offenders.has(node)) {
      offenders.set(node, trail.join(" -> "));
    }
    for (const next of childrenOf(node)) {
      if (!seen.has(next)) stack.push([next, [...trail, next]]);
    }
  }
  return offenders;
}

function childrenOf(file: string): string[] {
  const out: string[] = [];
  for (const spec of valueImports(file)) {
    if (isZodSpec(spec)) continue;
    const next = resolve(file, spec);
    if (next) out.push(next);
  }
  return out;
}

function importsZodDirectly(file: string): boolean {
  return valueImports(file).some(isZodSpec);
}

function isServerModule(file: string): boolean {
  return directive(file, "use server");
}

describe("zod stays on the server (spec 2026-10-06 §R)", () => {
  it(
    "no client component reaches a module that imports zod",
    () => {
      const offenders = new Map<string, string>();
      const entries = ROOTS.flatMap((r) => walk(path.join(ROOT, r))).filter((f) => directive(f, "use client"));
      for (const entry of entries) {
        const found = findOffenders(entry, childrenOf, importsZodDirectly, isServerModule);
        for (const [offenderAbs, trail] of found) {
          const rel = path.relative(ROOT, offenderAbs);
          if (!offenders.has(rel)) {
            offenders.set(
              rel,
              trail
                .split(" -> ")
                .map((t) => path.relative(ROOT, t))
                .join(" -> "),
            );
          }
        }
      }
      expect([...offenders].map(([f, via]) => `${f}  via  ${via}`)).toEqual([]);
    },
    30_000,
  );
});

describe("findOffenders walker", () => {
  it("finds an offender reached only through a cycle, from every entry that reaches it", () => {
    // E -> A -> {B, Z}; B -> A (cycle back to A); F -> B. Z imports zod.
    // A memo keyed only by node (no entry context) that caches a result
    // computed while an ancestor is mid-walk would wrongly cache A's (or
    // B's) answer as "no offenders" the first time it's reached through
    // the cycle, hiding Z from whichever entry discovers it second. The
    // fresh-per-entry walk below must find Z from both E and F.
    const graph: Record<string, string[]> = {
      E: ["A"],
      A: ["B", "Z"],
      B: ["A"],
      F: ["B"],
      Z: [],
    };
    const children = (n: string) => graph[n] ?? [];
    const importsZod = (n: string) => n === "Z";
    const isServer = () => false;

    const fromE = findOffenders("E", children, importsZod, isServer);
    expect([...fromE.keys()]).toEqual(["Z"]);
    expect(fromE.get("Z")).toBe("E -> A -> Z");

    const fromF = findOffenders("F", children, importsZod, isServer);
    expect([...fromF.keys()]).toEqual(["Z"]);
    expect(fromF.get("Z")).toBe("F -> B -> A -> Z");
  });

  it("does not walk into a \"use server\" module", () => {
    const graph: Record<string, string[]> = { E: ["S"], S: ["Z"], Z: [] };
    const children = (n: string) => graph[n] ?? [];
    const importsZod = (n: string) => n === "Z";
    const isServer = (n: string) => n === "S";

    expect(findOffenders("E", children, importsZod, isServer).size).toBe(0);
  });
});
