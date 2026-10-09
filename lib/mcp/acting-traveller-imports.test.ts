import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// --untracked so a new, not-yet-committed importer is caught locally too.
function grepFiles(pattern: string): string[] {
  try {
    const out = execSync(`git grep --untracked -l -e "${pattern}" -- '*.ts' '*.tsx' '*.js' '*.mjs' '*.cjs'`, { encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch {
    return []; // git grep exits 1 when nothing matches
  }
}

const isTest = (f: string) => /\.test\.tsx?$/.test(f);
const MODULE = "lib/mcp/acting-traveller.ts";

const IMPORTER_ALLOWLIST = [
  "lib/guards.ts",
  "server/actions/activity.ts",
  "lib/mcp/run-tool.ts",
  "app/api/mcp/route.ts",
];

// Any import, re-export, dynamic import or require whose specifier ends in
// acting-traveller (with or without an extension).
const SPECIFIER = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']*\/acting-traveller(?:\.[cm]?[jt]s)?)["']/g;
const STAR_REEXPORT = /export\s*\*\s*(?:as\s+\w+\s*)?from\s*["'][^"']*\/acting-traveller(?:\.[cm]?[jt]s)?["']/;

describe("runAsTraveller is only reachable from the MCP route", () => {
  it("is referenced only by app/api/mcp/route.ts (and tests)", () => {
    const importers = grepFiles("runAsTraveller")
      .filter((f) => !isTest(f))
      .filter((f) => f !== MODULE);
    for (const f of importers) expect(["app/api/mcp/route.ts"]).toContain(f);
  });

  it("the module is imported or re-exported only by the allowlisted files", () => {
    const importers = grepFiles("acting-traveller")
      .filter((f) => !isTest(f))
      .filter((f) => f !== MODULE)
      .filter((f) => [...readFileSync(f, "utf8").matchAll(SPECIFIER)].length > 0);
    expect(importers.length).toBeGreaterThan(0); // the scan itself works
    for (const f of importers) expect(IMPORTER_ALLOWLIST).toContain(f);
  });

  it("no file star-re-exports the module", () => {
    const offenders = grepFiles("acting-traveller")
      .filter((f) => f !== MODULE)
      .filter((f) => STAR_REEXPORT.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("lib/mcp/acting-traveller.ts has no 'use server' directive", () => {
    expect(readFileSync(MODULE, "utf8")).not.toMatch(/^\s*["']use server["']/m);
  });
});
