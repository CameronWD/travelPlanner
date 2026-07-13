import { describe, it, expect } from "vitest";
import { tripHomeBase, resolveEndpoint, hasOutboundLeg, hasReturnLeg, findOutboundLeg, findReturnLeg } from "@/lib/home-base";

describe("tripHomeBase", () => {
  it("returns null when no homeName", () => {
    expect(tripHomeBase({ homeName: null, homeLat: 1, homeLng: 2, homeCountryCode: "au" })).toBeNull();
  });
  it("returns the base when named", () => {
    expect(tripHomeBase({ homeName: "Sydney", homeLat: -33.8, homeLng: 151.2, homeCountryCode: "au" }))
      .toEqual({ name: "Sydney", lat: -33.8, lng: 151.2, countryCode: "au" });
  });
});

describe("resolveEndpoint", () => {
  const home = { name: "Sydney", lat: -33.8, lng: 151.2, countryCode: "au" };
  const stopsById = { s1: { name: "Paris", lat: 48.8, lng: 2.3 } };
  it("resolves a home endpoint to the home base", () => {
    expect(resolveEndpoint({ isHome: true, home, stopsById }))
      .toEqual({ label: "Sydney", lat: -33.8, lng: 151.2, isHome: true });
  });
  it("resolves a stop endpoint to the stop", () => {
    expect(resolveEndpoint({ isHome: false, stopId: "s1", home, stopsById }))
      .toEqual({ label: "Paris", lat: 48.8, lng: 2.3, isHome: false });
  });
  it("falls back to free-text place + its coords", () => {
    expect(resolveEndpoint({ isHome: false, place: "CDG Airport", lat: 49, lng: 2.5, home, stopsById }))
      .toEqual({ label: "CDG Airport", lat: 49, lng: 2.5, isHome: false });
  });
  it("is empty when unset", () => {
    expect(resolveEndpoint({ isHome: false, home, stopsById })).toEqual({ label: null, lat: null, lng: null, isHome: false });
  });
});

describe("leg presence", () => {
  it("detects an outbound leg home->first", () => {
    expect(hasOutboundLeg([{ depIsHome: true, toStopId: "s1" }], "s1")).toBe(true);
    expect(hasOutboundLeg([{ depIsHome: true, toStopId: "s2" }], "s1")).toBe(false);
    expect(hasOutboundLeg([{ depIsHome: false, toStopId: "s1" }], "s1")).toBe(false);
  });
  it("detects a return leg last->home", () => {
    expect(hasReturnLeg([{ arrIsHome: true, fromStopId: "s9" }], "s9")).toBe(true);
    expect(hasReturnLeg([{ arrIsHome: true, fromStopId: "s1" }], "s9")).toBe(false);
  });
});

describe("findOutboundLeg / findReturnLeg", () => {
  it("returns the outbound leg departing home to the first stop", () => {
    const legs = [
      { id: "t1", depIsHome: true, toStopId: "s1" },
      { id: "t2", depIsHome: false, toStopId: "s1" },
    ];
    expect(findOutboundLeg(legs, "s1")?.id).toBe("t1");
    expect(findOutboundLeg(legs, "s2")).toBeNull();
    expect(findOutboundLeg(legs, null)).toBeNull();
  });
  it("returns the return leg arriving home from the last stop", () => {
    const legs = [{ id: "t9", arrIsHome: true, fromStopId: "s9" }];
    expect(findReturnLeg(legs, "s9")?.id).toBe("t9");
    expect(findReturnLeg(legs, "s1")).toBeNull();
    expect(findReturnLeg(legs, null)).toBeNull();
  });
});
