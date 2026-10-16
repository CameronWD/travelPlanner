import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { walkSources } from "@/test/helpers/walk-sources";

/**
 * ADR 0064: every internal Trip link goes through lib/trip-path.ts. Exempt:
 * `revalidatePath(…)` (takes the rewrite's destination — the id path; Next
 * docs "Using revalidatePath with rewrites") and `/api/trips/…` routes (ids).
 */
const ROOTS = ["app", "components", "lib", "server"];
const ALLOWED_FILES = new Set([
  "lib/trip-path.ts",
  "lib/trip-links.guard.test.ts",
  // revalidation takes the id path (ADR 0064)
  "lib/revalidate.ts",
]);
const HAND_BUILT = [/\/trips\/\$\{/, /["'`]\/trips\/["'`]\s*\+/];
const EXEMPT = [/revalidatePath\(/, /\/api\/trips\//];

export function isHandBuiltTripLink(line: string): boolean {
  if (EXEMPT.some((re) => re.test(line))) return false;
  return HAND_BUILT.some((re) => re.test(line));
}

describe("trip links go through tripPath (ADR 0064)", () => {
  it("the scanner flags hand-built links and spares the exemptions", () => {
    expect(isHandBuiltTripLink("href={`/trips/${tripId}/plan`}")).toBe(true);
    expect(isHandBuiltTripLink('const u = "/trips/" + id;')).toBe(true);
    expect(isHandBuiltTripLink("revalidatePath(`/trips/${tripId}/plan`);")).toBe(false);
    expect(isHandBuiltTripLink("url: `/api/trips/${tripId}/cover`,")).toBe(false);
    expect(isHandBuiltTripLink('href={tripPath(slug, "/plan")}')).toBe(false);
  });

  it("finds no hand-built /trips/${…} link outside lib/trip-path.ts", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walkSources(root, { skipTests: true })) {
        const rel = file.split(path.sep).join("/");
        if (ALLOWED_FILES.has(rel)) continue;
        readFileSync(file, "utf8").split("\n").forEach((line, i) => {
          if (isHandBuiltTripLink(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
