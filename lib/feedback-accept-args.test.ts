import { describe, expect, it } from "vitest";
import { parseAcceptArgs } from "./feedback-accept-args";

describe("parseAcceptArgs", () => {
  it("takes an id and optional --dry-run", () => {
    expect(parseAcceptArgs(["n1"])).toEqual({ id: "n1", dryRun: false });
    expect(parseAcceptArgs(["n1", "--dry-run"])).toEqual({ id: "n1", dryRun: true });
    expect(parseAcceptArgs(["--dry-run", "n1"])).toEqual({ id: "n1", dryRun: true });
  });

  it("rejects unknown flags, extra args and a missing id", () => {
    expect(parseAcceptArgs(["n1", "--note", "x"])).toEqual({ error: "Unknown flag --note" });
    expect(parseAcceptArgs(["n1", "n2"])).toEqual({ error: "Unexpected argument n2" });
    expect("error" in parseAcceptArgs([])).toBe(true);
    expect("error" in parseAcceptArgs(["--dry-run"])).toBe(true);
  });
});
