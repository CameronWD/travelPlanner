import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { walkSources } from "@/test/helpers/walk-sources";

describe("ADR 0074: every action fails as ActionResult", () => {
  const files = walkSources("server/actions", { skipTests: true });
  it.each(files)("%s has no legacy failure shape", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).not.toMatch(/success:\s*false,\s*error\b/);
    expect(src).not.toMatch(/_form/);
    // Task 9: the `{ ok, reason }` / `{ ok, error }` shapes are gone too —
    // every action fails (and succeeds) as an ActionResult.
    expect(src).not.toMatch(/\bok:\s*(true|false)\b/);
  });
});
