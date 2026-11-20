import { describe, it, expect } from "vitest";
import { screenForPath, isTripScreen } from "./screens";

describe("screenForPath", () => {
  it.each([
    ["/trips", "trips"],
    ["/trips/", "trips"],
    ["/trips/new", "new-trip"],
    ["/globe", "globe"],
    ["/globe/something", "globe"],
    ["/account", "account"],
    ["/help", "help"],
    ["/admin", "admin"],
    ["/whats-new", "whats-new"],
    ["/trips/northvale-loop", "trip-home"],
    ["/trips/northvale-loop/", "trip-home"],
    ["/trips/x/plan", "plan"],
    ["/trips/x/day", "day"],
    ["/trips/x/day/2026-12-02", "day"],
    ["/trips/northvale-loop/day/2026-12-02", "day"],
    ["/trips/x/budget", "money"],
    ["/trips/x/calendar", "calendar"],
    ["/trips/x/checklists", "checklists"],
    ["/trips/x/files", "files"],
    ["/trips/x/activity", "activity"],
    ["/trips/x/summary", "summary"],
    ["/trips/x/print", "print"],
    ["/trips/x/reviews", "reviews"],
    ["/trips/x/wishlist", "wishlist"],
    ["/trips/x/journal", "journal"],
    ["/trips/x/settings", "settings"],
    ["/trips/x/help", "trip-help"],
    ["/trips/x/more", "more"],
  ])("%s is %s", (path, screen) => {
    expect(screenForPath(path)).toBe(screen);
  });

  it.each([
    "/",
    "/privacy",
    "/terms",
    "/connect",
    "/share/abc",
    "/trips/x/today",
    "/trips/x/compare",
    "/trips/x/day/2026-12-02/extra",
    "/trips/x/plan/extra",
    "/trips/x/more/extra",
    "/trips/x/unknown",
    "/trips/x/constructor",
    "/trips/new/extra",
    "/account/extra",
    "/admin/extra",
    "/whats-new/extra",
    "/api/trips/x/plan",
    "",
  ])("%s is not a screen", (path) => {
    expect(screenForPath(path)).toBeNull();
  });

  it("tells trip screens from app screens", () => {
    expect(isTripScreen("plan")).toBe(true);
    expect(isTripScreen("more")).toBe(true);
    expect(isTripScreen("trips")).toBe(false);
    expect(isTripScreen("whats-new")).toBe(false);
  });
});
