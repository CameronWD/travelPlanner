import { describe, expect, it } from "vitest";
import { atRule, decls, rule } from "@/test/helpers/css";

describe("pointer cursor (Feedback cmumcrjs1000304l71nj6l4fk)", () => {
  it("gives every enabled button, role=button and summary a pointer cursor in one base rule", () => {
    const pointer = rule(':where(button, [role="button"], summary):not(:disabled, [aria-disabled="true"])', atRule("layer", "base"));
    expect(decls(pointer)).toEqual({ cursor: "pointer" });
  });
});
