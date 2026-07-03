import { describe, it, expect } from "vitest";
import {
  REAL_PLAN,
  planScope,
  isPlanPlacement,
  PLAN_PLACEMENT_WHERE,
  WISHLIST_IDEA_WHERE,
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
