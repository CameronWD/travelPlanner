import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

describe("layout primitives in globals.css", () => {
  it("defines the three shared page widths as container tokens", () => {
    expect(css).toMatch(/--container-page-wide:\s*100rem;/);
    expect(css).toMatch(/--container-reading:\s*38rem;/);
    expect(css).toMatch(/--container-dialog:\s*30rem;/);
  });

  it("defines a tap-target utility that expands the hit area to 44px", () => {
    const block = css.slice(css.indexOf("@utility tap-target"));
    expect(block).toMatch(/position:\s*relative/);
    expect(block).toMatch(/min-width:\s*2\.75rem/);
    expect(block).toMatch(/min-height:\s*2\.75rem/);
  });
});
