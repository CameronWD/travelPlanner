import { describe, it, expect } from "vitest";
import { REAL_PLAN, planScope } from "./plan-scope";

describe("planScope", () => {
  it("REAL_PLAN scopes to the null discriminator", () => {
    expect(REAL_PLAN).toEqual({ forkId: null });
  });

  it("normalises undefined and null to the real plan", () => {
    expect(planScope()).toEqual({ forkId: null });
    expect(planScope(null)).toEqual({ forkId: null });
  });

  it("passes a concrete fork id through", () => {
    expect(planScope("fork-1")).toEqual({ forkId: "fork-1" });
  });
});
