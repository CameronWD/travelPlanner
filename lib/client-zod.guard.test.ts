import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Spec 2026-10-06 §R: zod stays on the server. Walk every "use client"
 * file's static and dynamic imports (type-only imports are erased; a
 * "use server" module is a reference, not bundled) and fail if any reached
 * module imports zod.
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

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function valueImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
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
  return out;
}

const directive = (file: string, d: string) => new RegExp(`^\\s*["']${d}["']`).test(readFileSync(file, "utf8"));

describe("zod stays on the server (spec 2026-10-06 §R)", () => {
  it("no client component reaches a module that imports zod", () => {
    const offenders = new Map<string, string>();
    const entries = ROOTS.flatMap((r) => walk(path.join(ROOT, r))).filter((f) => directive(f, "use client"));
    for (const entry of entries) {
      const seen = new Set<string>();
      const stack: [string, string[]][] = [[entry, [entry]]];
      while (stack.length) {
        const [file, trail] = stack.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        if (directive(file, "use server")) continue;
        for (const spec of valueImports(file)) {
          if (spec === "zod" || spec.startsWith("zod/")) {
            const rel = path.relative(ROOT, file);
            if (!offenders.has(rel)) offenders.set(rel, trail.map((t) => path.relative(ROOT, t)).join(" -> "));
            continue;
          }
          const next = resolve(file, spec);
          if (next) stack.push([next, [...trail, next]]);
        }
      }
    }
    expect([...offenders].map(([f, via]) => `${f}  via  ${via}`)).toEqual([]);
  });
});
