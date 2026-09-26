import { describe, it, expect } from "vitest";
import {
  REAL_PLAN,
  planScope,
  isPlanPlacement,
  PLAN_PLACEMENT_WHERE,
  WISHLIST_IDEA_WHERE,
  firstSearchParam,
  resolvePlan,
} from "./plan-scope";

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

describe("isPlanPlacement (ADR 0022 discriminator)", () => {
  it("is true for a dateless stop-attached thing-to-do (stopId set, date null)", () => {
    expect(isPlanPlacement({ stopId: "stop-1", date: null })).toBe(true);
  });

  it("is true for a scheduled placement (date set, stopId null)", () => {
    expect(isPlanPlacement({ stopId: null, date: "2026-10-01" })).toBe(true);
  });

  it("is true when both stopId and date are set", () => {
    expect(isPlanPlacement({ stopId: "stop-1", date: "2026-10-01" })).toBe(true);
  });

  it("is false for a trip-wide wishlist idea (both null)", () => {
    expect(isPlanPlacement({ stopId: null, date: null })).toBe(false);
  });
});

describe("PLAN_PLACEMENT_WHERE / WISHLIST_IDEA_WHERE fragments", () => {
  it("PLAN_PLACEMENT_WHERE matches placement iff stopId OR date is non-null", () => {
    expect(PLAN_PLACEMENT_WHERE).toEqual({
      OR: [{ stopId: { not: null } }, { date: { not: null } }],
    });
  });

  it("WISHLIST_IDEA_WHERE matches only the both-null idea", () => {
    expect(WISHLIST_IDEA_WHERE).toEqual({ stopId: null, date: null });
  });
});

describe("firstSearchParam", () => {
  it("passes a single string through unchanged", () => {
    expect(firstSearchParam("fork-1")).toBe("fork-1");
  });

  it("takes the first entry of a repeated param", () => {
    // Next.js hands a string[] at runtime for ?plan=a&plan=b, even though the
    // page's searchParams type claims `string`. Handing that array to
    // db.fork.findFirst({ where: { id } }) 500s the page (AB-02).
    expect(firstSearchParam(["fork-1", "fork-2"])).toBe("fork-1");
  });

  it("is null for an absent param", () => {
    expect(firstSearchParam(undefined)).toBeNull();
  });

  it("is null for an empty repeated param", () => {
    expect(firstSearchParam([])).toBeNull();
  });

  it("is null for an empty string, which is not a fork id", () => {
    expect(firstSearchParam("")).toBeNull();
  });
});

describe("resolvePlan (plan variants opt-in, spec B3)", () => {
  it("ignores ?plan= when plan variants are off — the real plan", () => {
    expect(resolvePlan({ plan: "fork-1", forksEnabled: false })).toBeNull();
  });

  it("passes ?plan= through when plan variants are on", () => {
    expect(resolvePlan({ plan: "fork-1", forksEnabled: true })).toBe("fork-1");
  });

  it("takes the first value of a repeated ?plan= param", () => {
    expect(resolvePlan({ plan: ["a", "b"], forksEnabled: true })).toBe("a");
  });

  it("is the real plan when no ?plan= is given", () => {
    expect(resolvePlan({ plan: undefined, forksEnabled: true })).toBeNull();
  });
});
