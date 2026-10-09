import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("runAsTraveller is only reachable from the MCP route", () => {
  it("is imported only by app/api/mcp/route.ts (and tests)", () => {
    const out = execSync(`git grep -l "runAsTraveller" -- '*.ts' '*.tsx'`, { encoding: "utf8" });
    const importers = out.split("\n").filter(Boolean)
      .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
      .filter((f) => f !== "lib/mcp/acting-traveller.ts");
    for (const f of importers) expect(["app/api/mcp/route.ts"]).toContain(f);
  });
  it("lib/mcp/acting-traveller.ts has no 'use server' directive", () => {
    expect(readFileSync("lib/mcp/acting-traveller.ts", "utf8")).not.toMatch(/^\s*["']use server["']/m);
  });
});
