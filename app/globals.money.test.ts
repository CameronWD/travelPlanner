import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(__dirname, "globals.css"), "utf8");

describe("globals.css Money utilities (MONEY.md §1)", () => {
  it("defines bg-unpaid-stripe as a card / teal-12% repeating stripe, from tokens", () => {
    const block = css.match(/@utility bg-unpaid-stripe\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(block).toContain("repeating-linear-gradient");
    expect(block).toContain("hsl(var(--card))");
    expect(block).toContain("hsl(var(--teal) / 0.12)");
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
