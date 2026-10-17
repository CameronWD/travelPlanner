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
  it("an ITEM Flag opens the Item's day; an undated thing to do opens its Stop (spec 2026-10-17 R7)", () => {
    expect(flagHref({ id: "x", severity: "warning", message: "m", targetType: "ITEM", targetId: "i1", date: "2026-07-02", stopId: "s1" }, base))
      .toBe("/trips/t/day/2026-07-02");
    expect(flagHref({ id: "x", severity: "info", message: "m", targetType: "ITEM", targetId: "i1", stopId: "s1" }, base))
      .toBe("/trips/t/plan?stop=s1");
    expect(flagHref({ id: "x", severity: "info", message: "m", targetType: "ITEM", targetId: "i1" }, base))
      .toBe("/trips/t/plan");
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

describe("buildNextSteps — reveal-the-surprise nudge (CONTEXT.md Surprise)", () => {
  const base = "/trips/t";
  const SUBTITLE = "It's time. Open the stop and choose Reveal the surprise.";

  it("asks the planner to reveal a Surprise Stop, opening that Stop on the plan", () => {
    const steps = buildNextSteps({
      flags: [], phase: "planning", tripBasePath: base, limit: 10,
      nudges: makeNudges({ surprisesToReveal: [{ id: "s1", kind: "STOP", label: "Paris", stopId: "s1" }] }),
    });
    expect(steps).toEqual([
      {
        id: "nudge-reveal-surprise-s1",
        title: "Reveal the surprise in Paris?",
        subtitle: SUBTITLE,
        href: "/trips/t/plan?stop=s1",
        severity: "info",
        source: "nudge",
      },
    ]);
  });

  it("asks the planner to reveal a Surprise Item, opening its Stop", () => {
    const steps = buildNextSteps({
      flags: [], phase: "planning", tripBasePath: base, limit: 10,
      nudges: makeNudges({ surprisesToReveal: [{ id: "i1", kind: "ITEM", label: "Dinner at Septime", stopId: "s2" }] }),
    });
    expect(steps).toEqual([
      expect.objectContaining({
        id: "nudge-reveal-surprise-i1",
        title: "Reveal the surprise: Dinner at Septime?",
        subtitle: SUBTITLE,
        href: "/trips/t/plan?stop=s2",
        severity: "info",
        source: "nudge",
      }),
    ]);
  });

  it("an Item with no Stop falls back to its own id in the link", () => {
    const steps = buildNextSteps({
      flags: [], phase: "planning", tripBasePath: base, limit: 10,
      nudges: makeNudges({ surprisesToReveal: [{ id: "i9", kind: "ITEM", label: "Picnic", stopId: null }] }),
    });
    expect(steps[0].href).toBe("/trips/t/plan?stop=i9");
  });

  it("ranks above every Flag (priority 5) and pushes one step per Surprise", () => {
    const steps = buildNextSteps({
      flags: [warn("w")], phase: "planning", tripBasePath: base, limit: 10,
      nudges: makeNudges({
        surprisesToReveal: [
          { id: "s1", kind: "STOP", label: "Paris", stopId: "s1" },
          { id: "i1", kind: "ITEM", label: "Dinner", stopId: "s1" },
        ],
      }),
    });
    expect(steps.map((s) => s.id)).toEqual(["nudge-reveal-surprise-i1", "nudge-reveal-surprise-s1", "w"]);
  });

  it("the wording has no em dash or semicolon", () => {
    const steps = buildNextSteps({
      flags: [], phase: "planning", tripBasePath: base, limit: 10,
      nudges: makeNudges({
        surprisesToReveal: [
          { id: "s1", kind: "STOP", label: "Paris", stopId: "s1" },
          { id: "i1", kind: "ITEM", label: "Dinner", stopId: "s1" },
        ],
      }),
    });
    for (const s of steps) expect(`${s.title} ${s.subtitle}`).not.toMatch(/[—;]/);
  });

  it("no Surprises to reveal, no nudge", () => {
    expect(buildNextSteps({ flags: [], phase: "planning", tripBasePath: base, nudges: makeNudges({ surprisesToReveal: [] }) })).toEqual([]);
  });
});
