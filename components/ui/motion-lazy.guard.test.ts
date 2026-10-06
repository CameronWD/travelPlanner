import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Spec 2026-10-06 §Q: the app renders `m.*` inside LazyMotion (domAnimation),
 * never the full `motion.*` bundle. A file that imports the `motion` value
 * from "motion/react" is the regression (TypeScript catches any `motion.*`
 * use without that import).
 */
const ROOTS = ["app", "components", "lib"];
const IMPORTS_MOTION = /import\s*\{([^}]*)\}\s*from\s*["']motion\/react["']/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("LazyMotion only (spec 2026-10-06 §Q)", () => {
  it("no app file imports the full `motion` component bundle", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(path.join(process.cwd(), root))) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(IMPORTS_MOTION)) {
          const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
          if (names.includes("motion")) offenders.push(path.relative(process.cwd(), file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
