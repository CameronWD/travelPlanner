import { describe, expect, it } from "vitest";
import { buildNextSteps, flagHref, type NudgeInput } from "./next-steps";
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

  it("links a STOP Flag to its Stop and DAY flags to the day", () => {
    const steps = buildNextSteps({ flags: [warn("b"), info("a")], phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t" });
    expect(steps.find((s) => s.id === "b")?.href).toBe("/trips/t/plan?stop=b");
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

describe("flagHref (spec 2026-10-06 §F)", () => {
  const base = "/trips/t";
  it("a TRANSPORT Flag on a leg lands on the Stop it was raised for", () => {
    expect(flagHref({ id: "x", severity: "warning", message: "m", targetType: "TRANSPORT", targetId: "t1", stopId: "s1" }, base))
      .toBe("/trips/t/plan?stop=s1");
  });
  it("a missing leg opens the Add-transport form between its ends", () => {
    expect(flagHref({ id: "x", severity: "info", message: "m", targetType: "TRANSPORT", connection: { from: "home", to: "s1" } }, base))
      .toBe("/trips/t/plan?add=transport&from=home&to=s1");
  });
  it("TRIP Flags and Flags with no Stop stay on the plan", () => {
    expect(flagHref({ id: "x", severity: "info", message: "m", targetType: "TRIP" }, base)).toBe("/trips/t/plan");
    expect(flagHref({ id: "x", severity: "info", message: "m", targetType: "TRANSPORT" }, base)).toBe("/trips/t/plan");
  });
  it("outbound/return nudges open the Add-transport form when the Stop ids are known", () => {
    const steps = buildNextSteps({
      flags: [], phase: "planning", tripBasePath: base, limit: 10,
      nudges: makeNudges({ hasHomeBase: true, homeName: "Sydney", firstStopName: "Paris", lastStopName: "Rome",
        firstStopId: "s1", lastStopId: "s2", hasOutboundLeg: false, hasReturnLeg: false, roundTrip: true }),
    });
    expect(steps.find((s) => s.id === "nudge-add-outbound-flight")?.href).toBe("/trips/t/plan?add=transport&from=home&to=s1");
    expect(steps.find((s) => s.id === "nudge-add-return-flight")?.href).toBe("/trips/t/plan?add=transport&from=s2&to=home");
  });
});
