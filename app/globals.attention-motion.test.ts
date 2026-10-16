import { describe, it, expect } from "vitest";
import { decls, keyframes, reducedMotion, rule, utility } from "@/test/helpers/css";

describe("Feedback launcher attention pulse (spec 2026-10-01 §G)", () => {
  it("defines a two-beat scale pulse on the bounce ease", () => {
    const pulse = keyframes("tp-attention");
    expect(pulse.nodes?.filter((n) => n.type === "rule")).toHaveLength(2);
    expect(decls(rule(["0%", "100%"], pulse))).toEqual({ transform: "scale(1)" });
    expect(decls(rule("50%", pulse))).toEqual({ transform: "scale(1.12)" });
    expect(decls(utility("tp-attention"))).toEqual({ animation: "tp-attention 360ms var(--ease-bounce) 2" });
  });
  it("is nothing at all under reduced motion — a pointer, not information", () => {
    expect(decls(rule(".tp-attention", reducedMotion()))).toEqual({ animation: "none !important" });
  });
});
