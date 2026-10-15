import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { walkSources } from "./walk-sources";

describe("walkSources", () => {
  it("skips dot-directories and node_modules, keeping ordinary files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "walk-sources-"));
    mkdirSync(path.join(dir, ".hidden"));
    writeFileSync(path.join(dir, ".hidden", "x.ts"), "");
    mkdirSync(path.join(dir, "node_modules"));
    writeFileSync(path.join(dir, "node_modules", "y.ts"), "");
    writeFileSync(path.join(dir, "z.ts"), "");

    const found = walkSources(dir).map((f) => path.basename(f));
    expect(found).toEqual(["z.ts"]);
  });
});
