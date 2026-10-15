import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { walkSources } from "@/test/helpers/walk-sources";

describe("revalidation goes through lib/revalidate.ts (card 2.E)", () => {
  it("no other source file calls revalidatePath or revalidateTag", () => {
    const offenders = ["server", "app", "lib", "components"]
      .flatMap((d) => walkSources(d, { skipTests: true }))
      .filter((f) => f !== "lib/revalidate.ts")
      .filter((f) => /\brevalidate(Path|Tag)\s*\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
