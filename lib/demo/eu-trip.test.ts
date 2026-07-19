import { describe, it, expect } from "vitest";
import { buildEuTrip } from "./eu-trip";
import { buildGlobe } from "./globe";
import { planFlagInput, toProjectionStop } from "./types";
import { detectFlags } from "@/lib/flags";
import { computeProjectedEnd } from "@/lib/firm-up";
import { hasOutboundLeg, hasReturnLeg } from "@/lib/home-base";

describe("buildEuTrip", () => {
  const t = buildEuTrip();
  const realPlan = { stops: t.stops, chapters: t.chapters, transports: t.transports, accommodations: t.accommodations, items: t.items, costs: t.costs };

  it("has a home base with outbound and return legs", () => {
    expect(t.home?.name).toBe("Brisbane");
    const legs = t.transports.map((x) => ({
      depIsHome: x.depIsHome, arrIsHome: x.arrIsHome,
      toStopId: x.toStopKey ?? null, fromStopId: x.fromStopKey ?? null,
    }));
    const ordered = [...t.stops].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(hasOutboundLeg(legs, ordered[0].key)).toBe(true);
    expect(hasReturnLeg(legs, ordered[ordered.length - 1].key)).toBe(true);
  });
  it("has 6 scheduled stops, all with a lowercase country code", () => {
    expect(t.stops).toHaveLength(6);
    for (const s of t.stops) { expect(s.arriveDate).toBeTruthy(); expect(s.countryCode).toBe(s.countryCode?.toLowerCase()); }
  });
  it("chapters cover all stops with valid colours", () => {
    const chaptered = new Set(t.stops.map((s) => {
      const arr = s.arriveDate!;
      return t.chapters.some((c) => c.startDate! <= arr && arr <= c.endDate!);
    }));
    expect(chaptered.has(false)).toBe(false);
    const validColours = new Set(["sky","amber","emerald","violet","rose","teal","orange","indigo"]);
    for (const c of t.chapters) expect(validColours.has(c.colour)).toBe(true);
  });
  it("real plan is CLEAN — zero warning-severity flags", () => {
    const flags = detectFlags(planFlagInput(realPlan, { tripStart: t.startDate!, tripEnd: t.endDate!, hardEndDate: t.hardEndDate, home: t.home, roundTrip: t.roundTrip }));
    expect(flags.filter((f) => f.severity === "warning")).toEqual([]);
  });
  it("has >=2 pinned stops", () => {
    expect(t.stops.filter((s) => s.pinned).length).toBeGreaterThanOrEqual(2);
  });
  it("wishlist ideas are trip-wide (no stop, no date) and carry votes", () => {
    const wishlist = t.items.filter((i) => !i.stopKey && !i.date);
    expect(wishlist.length).toBeGreaterThanOrEqual(6);
    expect(wishlist.some((i) => (i.votes?.length ?? 0) > 0)).toBe(true);
  });
  it("has a thing-to-do (stop-attached, undated) and a placed copy (sourceItemKey)", () => {
    expect(t.items.some((i) => i.stopKey && !i.date)).toBe(true);
    expect(t.items.some((i) => i.sourceItemKey)).toBe(true);
  });
  it("links >=2 wishlist ideas to real Globe markers", () => {
    const markerKeys = new Set(buildGlobe().markers.map((m) => m.key));
    const linked = t.items.filter((i) => i.sourceMarkerKey);
    expect(linked.length).toBeGreaterThanOrEqual(2);
    for (const i of linked) expect(markerKeys.has(i.sourceMarkerKey!)).toBe(true);
  });
  it("has two forks; the '+ Switzerland' fork overruns the hard-end date", () => {
    expect(t.forks).toHaveLength(2);
    const ch = t.forks!.find((f) => f.name.includes("Switzerland"))!;
    const projected = computeProjectedEnd(ch.stops.map(toProjectionStop), t.startDate);
    expect(projected! > t.hardEndDate!).toBe(true);
    const flags = detectFlags(planFlagInput(ch, { tripStart: t.startDate!, tripEnd: t.endDate!, hardEndDate: t.hardEndDate, projectedEnd: projected }));
    expect(flags.some((f) => f.severity === "warning")).toBe(true);
  });
  it("records a FORK activity and leaves the two newest activities unread for 'you'", () => {
    expect(t.activities!.some((a) => a.entityType === "FORK")).toBe(true);
    const sorted = [...t.activities!].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
    const newestTwo = sorted.slice(-2);
    expect(newestTwo.every((a) => a.actor === "partner")).toBe(true);
    expect(t.unreadFor).toBe("you");
  });
});
