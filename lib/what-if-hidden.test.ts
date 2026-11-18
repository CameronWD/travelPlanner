import { describe, expect, it } from "vitest";
import { WHAT_IF_PLANS_HIDDEN, resolvePlan } from "@/lib/plan-scope";
import { showForkSwitcher } from "@/lib/trip-phase";

describe("What-if plans hidden (resolvers)", () => {
  it("is switched on", () => {
    expect(WHAT_IF_PLANS_HIDDEN).toBe(true);
  });

  it("resolvePlan returns the real plan for a ?plan= naming a Fork, even with Forks enabled", () => {
    expect(resolvePlan({ plan: "fork-1", forksEnabled: true })).toBeNull();
    expect(resolvePlan({ plan: ["fork-1", "fork-2"], forksEnabled: true })).toBeNull();
  });

  it("showForkSwitcher is false for a trip with Forks enabled in every pre-departure phase", () => {
    for (const phase of ["sketching", "planning", "final-prep"] as const) {
      expect(showForkSwitcher(true, phase)).toBe(false);
    }
  });
});
