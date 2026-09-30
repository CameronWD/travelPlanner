import { describe, it, expect } from "vitest";
import { isTripHomePath, isTripPath, isTripsActive, isGlobeActive, isTripDayPath, isPageHeaderPath } from "./app-paths";

describe("app-paths", () => {
  it.each([
    ["/trips/t1", true],
    ["/trips/t1/", true],
    ["/trips/t1/plan", false],
    ["/trips/t1/day/2026-12-04", false],
    ["/trips", false],
    ["/trips/new", false],
    [null, false],
  ] as const)("isTripHomePath(%s) → %s", (path, expected) => {
    expect(isTripHomePath(path)).toBe(expected);
  });

  it("isTripPath excludes /trips and /trips/new", () => {
    expect(isTripPath("/trips/t1/plan")).toBe(true);
    expect(isTripPath("/trips")).toBe(false);
    expect(isTripPath("/trips/new")).toBe(false);
  });

  it("lights Trips on the list and New trip, Globe on any globe route", () => {
    expect(isTripsActive("/trips")).toBe(true);
    expect(isTripsActive("/trips/new")).toBe(true);
    expect(isTripsActive("/trips/t1")).toBe(false);
    expect(isGlobeActive("/globe/g1")).toBe(true);
    expect(isGlobeActive("/globetrotter")).toBe(false);
  });
  it("isTripDayPath", () => {
    expect(isTripDayPath("/trips/t1/day")).toBe(true);
    expect(isTripDayPath("/trips/t1/day/2026-12-12")).toBe(true);
    expect(isTripDayPath("/trips/t1/day/2026-12-12/")).toBe(true);
    expect(isTripDayPath("/trips/t1/calendar")).toBe(false);
    expect(isTripDayPath("/trips/t1")).toBe(false);
    expect(isTripDayPath(null)).toBe(false);
  });
});

describe("isPageHeaderPath", () => {
  const routes = ["budget", "files"];
  it.each([
    ["/trips/t1/budget", true],
    ["/trips/christmas-in-europe-2026/budget/", true],
    ["/trips/t1/files", true],
    ["/trips/t1/files/x", false],
    ["/trips/t1/plan", false],
    ["/trips/t1/settings", false],
    ["/trips/t1", false],
    ["/trips/t1/day/2026-12-12", false],
    ["/trips/new", false],
    [null, false],
  ] as const)("%s → %s", (path, expected) => {
    expect(isPageHeaderPath(path, routes)).toBe(expected);
  });
  it("defaults to the shared route list", () => {
    expect(isPageHeaderPath("/trips/abc/plan")).toBe(true);
    expect(isPageHeaderPath("/trips/t1/checklists")).toBe(true);
    expect(isPageHeaderPath("/trips/t1/calendar")).toBe(true);
    expect(isPageHeaderPath("/trips/t1/wishlist")).toBe(true);
  });
});
