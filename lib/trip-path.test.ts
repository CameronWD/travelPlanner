import { describe, it, expect } from "vitest";
import { tripPath } from "./trip-path";

describe("tripPath (ADR 0064)", () => {
  it("builds the Trip's root and its sub-pages", () => {
    expect(tripPath("christmas-in-europe-2026")).toBe("/trips/christmas-in-europe-2026");
    expect(tripPath("christmas-in-europe-2026", "/day/2026-12-26")).toBe("/trips/christmas-in-europe-2026/day/2026-12-26");
    expect(tripPath("x", "?plan=f1")).toBe("/trips/x?plan=f1");
    expect(tripPath("x", "#stop-s1")).toBe("/trips/x#stop-s1");
  });
  it("encodes the ref (an id fallback is always safe too)", () => {
    expect(tripPath("a/b", "/plan")).toBe("/trips/a%2Fb/plan");
    expect(tripPath("cmtw8sgpw0001osqh3i54rx1o")).toBe("/trips/cmtw8sgpw0001osqh3i54rx1o");
  });
  it("rejects a sub path that would glue onto the ref", () => {
    expect(() => tripPath("x", "plan")).toThrow(/must start with/);
  });
});
