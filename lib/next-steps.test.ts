import { describe, expect, it } from "vitest";
import { buildNextSteps, type NudgeInput } from "./next-steps";
import type { Flag } from "@/lib/flags";

const NO_NUDGES: NudgeInput = {
  hasDates: true,
  undatedChapterCount: 0,
  hasPackingList: true,
  hasPretripList: true,
  unbookedTransportCount: 0,
};

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
      nudges: { hasDates: true, undatedChapterCount: 2, hasPackingList: false, hasPretripList: false, unbookedTransportCount: 3 },
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
      nudges: { hasDates: true, undatedChapterCount: 0, hasPackingList: false, hasPretripList: false, unbookedTransportCount: 0 },
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
      nudges: { hasDates: false, undatedChapterCount: 0, hasPackingList: false, hasPretripList: false, unbookedTransportCount: 0 },
      tripBasePath: "/trips/t",
    });
    expect(steps[0].title).toMatch(/set your trip dates/i);
  });

  it("caps the list at the limit (default 4)", () => {
    const flags = [warn("a"), warn("b"), warn("c"), warn("d"), warn("e")];
    expect(buildNextSteps({ flags, phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t" })).toHaveLength(4);
    expect(buildNextSteps({ flags, phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t", limit: 2 })).toHaveLength(2);
  });
});
