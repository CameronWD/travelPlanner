import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { walkSources } from "@/test/helpers/walk-sources";

/**
 * Spec 2026-10-06 §R: `lib/enums.ts` builds zod schemas at module load, so
 * anything importing it pulls zod into the browser. Only server-side
 * validation may import it; everyone else imports the plain values from
 * `lib/enum-values.ts`.
 */
const ROOTS = ["app", "components", "lib"];
const ALLOWED = [
  /^lib\/validations\//,
  /^lib\/enums\.ts$/,
  /^lib\/enums\.test\.ts$/,
  // Claude connection tools (spec 2026-10-09): every file under lib/mcp/ is
  // reached only from app/api/mcp/route.ts (runtime "nodejs"), never from a
  // "use client" component or a page the client bundles — so the zod cost of
  // @/lib/enums never reaches the browser from here, the exact thing this
  // guard exists to prevent.
  /^lib\/mcp\//,
];

describe("lib/enum-values (spec 2026-10-06 §R)", () => {
  it("is zod-free and lib/enums re-exports the same values", async () => {
    expect(readFileSync(path.join(process.cwd(), "lib/enum-values.ts"), "utf8")).not.toMatch(/from ["']zod/);
    const values = await import("./enum-values");
    const enums = await import("./enums");
    expect(enums.TRANSPORT_MODES).toBe(values.TRANSPORT_MODES);
    expect(enums.isOnTrip).toBe(values.isOnTrip);
  });

  it("only server-side validation imports @/lib/enums", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walkSources(root)) {
        const rel = file.split(path.sep).join("/");
        if (ALLOWED.some((re) => re.test(rel))) continue;
        if (/from ["']@\/lib\/enums["']/.test(readFileSync(file, "utf8"))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
