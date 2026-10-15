import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { walkSources } from "@/test/helpers/walk-sources";

/**
 * Spec 2026-10-06 §Q: the app renders `m.*` inside LazyMotion (domAnimation),
 * never the full `motion.*` bundle. A file that imports the `motion` value
 * from "motion/react" is the regression (TypeScript catches any `motion.*`
 * use without that import).
 */
const ROOTS = ["app", "components", "lib"];
const IMPORTS_MOTION = /import\s*\{([^}]*)\}\s*from\s*["']motion\/react["']/g;

describe("LazyMotion only (spec 2026-10-06 §Q)", () => {
  it("no app file imports the full `motion` component bundle", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walkSources(root, { skipTests: true })) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(IMPORTS_MOTION)) {
          const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
          if (names.includes("motion")) offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
