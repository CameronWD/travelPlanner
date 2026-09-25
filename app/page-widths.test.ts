import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("page widths", () => {
  it("no page or layout uses the old shell widths", () => {
    const out = execSync(
      `grep -rlE "max-w-(5xl|6xl|7xl)" app components --include=*.tsx || true`,
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });
});
