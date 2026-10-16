import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { walkSources } from "@/test/helpers/walk-sources";

describe("page widths", () => {
  it("no page or layout uses the old shell widths", () => {
    const offenders = ["app", "components"]
      .flatMap((dir) => walkSources(dir, { exts: [".tsx"] }))
      .filter((file) => /max-w-(5xl|6xl|7xl)/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
