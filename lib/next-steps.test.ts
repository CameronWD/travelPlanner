import { describe, expect, it } from "vitest";
import { buildNextSteps, type NudgeInput } from "./next-steps";
import type { Flag } from "@/lib/flags";

function makeNudges(overrides: Partial<NudgeInput> = {}): NudgeInput {
  return {
    hasDates: true,
    undatedChapterCount: 0,
    hasPackingList: true,
    hasPretripList: true,
    unbookedTransportCount: 0,
    hasHomeBase: true,
    hasOutboundLeg: true,
    hasReturnLeg: true,
    roundTrip: false,
    homeName: null,
    firstStopName: null,
    lastStopName: null,
    ...overrides,
  };
}

const NO_NUDGES: NudgeInput = makeNudges();

const warn = (id: string): Flag => ({ id, severity: "warning", message: `warn ${id}`, targetType: "STOP", targetId: id });
const info = (id: string): Flag => ({ id, severity: "info", message: `info ${id}`, targetType: "DAY", date: "2026-07-01" });

describe("buildNextSteps", () => {
  it("returns an empty list when there is nothing to do", () => {
    expect(buildNextSteps({ flags: [], phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t" })).toEqual([]);
  });

  it("ranks warnings above info flags", () => {
    const steps = buildNextSteps({ flags: [info("a"), warn("b")], phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t" });
    expect(steps.map((s) => s.id)).toEqual(["b", "a"]);
    expect(steps[0].severity).toBe("warning");
  });

  it("links STOP/TRANSPORT/TRIP flags to the plan canvas and DAY flags to the day", () => {
    const steps = buildNextSteps({ flags: [warn("b"), info("a")], phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t" });
    expect(steps.find((s) => s.id === "b")?.href).toBe("/trips/t/plan");
    expect(steps.find((s) => s.id === "a")?.href).toBe("/trips/t/day/2026-07-01");
  });

  it("adds forward nudges for gaps", () => {
    const steps = buildNextSteps({
      flags: [],
      phase: "planning",
      nudges: makeNudges({ hasDates: true, undatedChapterCount: 2, hasPackingList: false, hasPretripList: false, unbookedTransportCount: 3 }),
      tripBasePath: "/trips/t",
    });
    const titles = steps.map((s) => s.title);
    expect(titles.some((t) => /chapter/i.test(t))).toBe(true);
    expect(titles.some((t) => /packing/i.test(t))).toBe(true);
    expect(steps.every((s) => s.source === "nudge")).toBe(true);
  });

  it("boosts packing/pretrip nudges to the top in final-prep", () => {
    const steps = buildNextSteps({
      flags: [info("empty-day")],
      phase: "final-prep",
      nudges: makeNudges({ hasDates: true, undatedChapterCount: 0, hasPackingList: false, hasPretripList: false, unbookedTransportCount: 0 }),
      tripBasePath: "/trips/t",
    });
    expect(steps[0].title).toMatch(/packing/i);
    expect(steps[1].title).toMatch(/pre-?trip/i);
    expect(steps[steps.length - 1].title).toMatch(/info empty-day/);
  });

  it("nudges to set dates when the trip has none", () => {
    const steps = buildNextSteps({
      flags: [],
      phase: "sketching",
      nudges: makeNudges({ hasDates: false, undatedChapterCount: 0, hasPackingList: false, hasPretripList: false, unbookedTransportCount: 0 }),
      tripBasePath: "/trips/t",
    });
    expect(steps[0].title).toMatch(/set your trip dates/i);
    expect(steps[0].subtitle).toMatch(/firming up/i);
  });

  it("nudge-unbooked-transport has a subtitle and kind=transport", () => {
    const steps = buildNextSteps({
      flags: [],
      phase: "planning",
      nudges: makeNudges({ unbookedTransportCount: 2 }),
      tripBasePath: "/trips/t",
    });
    const step = steps.find((s) => s.id === "nudge-unbooked-transport");
    expect(step).toBeDefined();
    expect(step!.subtitle).toBeTruthy();
    expect(step!.kind).toBe("transport");
  });

  it("caps the list at the limit (default 4)", () => {
    const flags = [warn("a"), warn("b"), warn("c"), warn("d"), warn("e")];
    expect(buildNextSteps({ flags, phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t" })).toHaveLength(4);
    expect(buildNextSteps({ flags, phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t", limit: 2 })).toHaveLength(2);
  });

  it("nudges to set a home base, then to add outbound/return legs", () => {
    const base = { flags: [], phase: "planning" as const, tripBasePath: "/trips/t1", limit: 10 };
    const noHome = buildNextSteps({ ...base, nudges: makeNudges({ hasHomeBase: false }) });
    expect(noHome.map((s) => s.id)).toContain("nudge-set-home-base");

    const withHome = buildNextSteps({ ...base, nudges: makeNudges({
      hasHomeBase: true, homeName: "Sydney", firstStopName: "Paris", lastStopName: "Rome",
      hasOutboundLeg: false, hasReturnLeg: false, roundTrip: true,
    }) });
    const ids = withHome.map((s) => s.id);
    expect(ids).toContain("nudge-add-outbound-flight");
    expect(ids).toContain("nudge-add-return-flight");
    const outbound = withHome.find((s) => s.id === "nudge-add-outbound-flight")!;
    expect(outbound.title).toContain("Paris");
    expect(outbound.subtitle).toContain("Sydney");
    expect(outbound.kind).toBe("transport");
  });
});
