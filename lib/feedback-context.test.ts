import { describe, expect, it } from "vitest";
import {
  areaForRoute,
  pageLabelForRoute,
  tripIdFromRoute,
} from "@/lib/feedback-context";

describe("pageLabelForRoute", () => {
  it.each([
    ["/trips", "Trips"],
    ["/trips/new", "New trip"],
    ["/trips/abc123", "Trip home"],
    ["/trips/abc123/plan", "Plan editor"],
    ["/trips/abc123/budget", "Budget"],
    ["/trips/abc123/summary", "Summary"],
    ["/trips/abc123/calendar", "Calendar"],
    ["/trips/abc123/today", "Today"],
    ["/trips/abc123/wishlist", "Wishlist"],
    ["/trips/abc123/checklists", "Checklists"],
    ["/trips/abc123/journal", "Journal"],
    ["/trips/abc123/files", "Files"],
    ["/trips/abc123/activity", "Activity"],
    ["/trips/abc123/compare", "Compare"],
    ["/trips/abc123/settings", "Trip settings"],
    ["/trips/abc123/print", "Print view"],
    ["/trips/abc123/help", "Trip help"],
    ["/globe", "Globe"],
    ["/help", "Help"],
  ])("labels %s as %s", (route, label) => {
    expect(pageLabelForRoute(route)).toBe(label);
  });

  it("ignores a query string", () => {
    expect(pageLabelForRoute("/trips/abc123/budget?fork=f1")).toBe("Budget");
  });

  it("ignores a trailing slash", () => {
    expect(pageLabelForRoute("/globe/")).toBe("Globe");
  });

  it("falls back to the raw path for an unmapped route", () => {
    expect(pageLabelForRoute("/something/new")).toBe("/something/new");
  });
});

describe("tripIdFromRoute", () => {
  it("extracts the id from a trip route", () => {
    expect(tripIdFromRoute("/trips/abc123/budget")).toBe("abc123");
  });

  it("returns null off a trip route", () => {
    expect(tripIdFromRoute("/globe")).toBeNull();
  });

  it("returns null for the trips list and the new-trip route", () => {
    expect(tripIdFromRoute("/trips")).toBeNull();
    expect(tripIdFromRoute("/trips/new")).toBeNull();
  });
});

describe("areaForRoute", () => {
  it.each([
    ["/trips/abc123/plan", "Plan editor"],
    ["/trips/abc123/compare", "Plan editor"],
    ["/trips/abc123/budget", "Money"],
    ["/globe", "Globe"],
    ["/trips/abc123/wishlist", "Wishlist"],
    ["/trips/abc123", "Trip home"],
    ["/trips", "Trips list"],
    ["/help", "Elsewhere"],
  ])("groups %s under %s", (route, area) => {
    expect(areaForRoute(route)).toBe(area);
  });
});
