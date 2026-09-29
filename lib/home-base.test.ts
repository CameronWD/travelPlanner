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

describe("outbound / return legs by shape (ADR 0032 amendment 2026-09-29)", () => {
  it("outbound = a Transport arriving at the first Stop whose departure is not another Stop", () => {
    expect(findOutboundLeg([{ id: "a", depIsHome: true, toStopId: "s1" }], "s1")?.id).toBe("a");
    expect(findOutboundLeg([{ id: "b", depIsHome: false, fromStopId: null, toStopId: "s1" }], "s1")?.id).toBe("b"); // "Brisbane" free text
    expect(findOutboundLeg([{ id: "c", toStopId: "s1" }], "s1")?.id).toBe("c"); // unset departure
  });
  it("a leg from another Stop into the first Stop is not the outbound leg (review focus 5)", () => {
    expect(findOutboundLeg([{ id: "loop", fromStopId: "s2", toStopId: "s1" }], "s1")).toBeNull();
  });
  it("a home-flagged candidate wins over a free-text one, whatever the order", () => {
    const legs = [
      { id: "free", depIsHome: false, fromStopId: null, toStopId: "s1" },
      { id: "home", depIsHome: true, fromStopId: null, toStopId: "s1" },
    ];
    expect(findOutboundLeg(legs, "s1")?.id).toBe("home");
  });
  it("return = a Transport departing the last Stop whose arrival is not another Stop; home-flagged wins", () => {
    expect(findReturnLeg([{ id: "r", fromStopId: "s9", toStopId: null, arrIsHome: false }], "s9")?.id).toBe("r");
    expect(findReturnLeg([{ id: "x", fromStopId: "s9", toStopId: "s3" }], "s9")).toBeNull();
    expect(
      findReturnLeg([{ id: "free", fromStopId: "s9", toStopId: null }, { id: "home", fromStopId: "s9", arrIsHome: true }], "s9")?.id,
    ).toBe("home");
  });
  it("no Stop → no leg", () => {
    expect(findOutboundLeg([{ id: "a", toStopId: "s1" }], null)).toBeNull();
    expect(findReturnLeg([{ id: "a", fromStopId: "s1" }], null)).toBeNull();
  });
  it("hasOutboundLeg / hasReturnLeg use the same rule", () => {
    expect(hasOutboundLeg([{ depIsHome: false, toStopId: "s1" }], "s1")).toBe(true);
    expect(hasOutboundLeg([{ fromStopId: "s0", toStopId: "s1" }], "s1")).toBe(false);
    expect(hasReturnLeg([{ fromStopId: "s9", arrIsHome: false }], "s9")).toBe(true);
    expect(hasReturnLeg([{ fromStopId: "s9", toStopId: "s1" }], "s9")).toBe(false);
  });
});
