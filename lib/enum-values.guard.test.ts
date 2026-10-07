import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Spec 2026-10-06 §R: `lib/enums.ts` builds zod schemas at module load, so
 * anything importing it pulls zod into the browser. Only server-side
 * validation may import it; everyone else imports the plain values from
 * `lib/enum-values.ts`.
 */
const ROOTS = ["app", "components", "lib"];
const ALLOWED = [/^lib\/validations\//, /^lib\/enums\.ts$/, /^lib\/enums\.test\.ts$/];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

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
      for (const file of walk(path.join(process.cwd(), root))) {
        const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
        if (ALLOWED.some((re) => re.test(rel))) continue;
        if (/from ["']@\/lib\/enums["']/.test(readFileSync(file, "utf8"))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
