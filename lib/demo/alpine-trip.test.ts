import { describe, it, expect } from "vitest";
import { buildAlpineTrip } from "./alpine-trip";
import { toProjectionStop, planFlagInput } from "./types";
import { computeProjectedEnd } from "@/lib/firm-up";
import { detectFlags } from "@/lib/flags";

describe("buildAlpineTrip", () => {
  const t = buildAlpineTrip();
  it("is anchored but every stop is rough (nights, no dates)", () => {
    expect(t.startDate).toBe("2027-05-01");
    for (const s of t.stops) { expect(s.arriveDate).toBeFalsy(); expect(s.nights).toBeGreaterThan(0); expect(s.countryCode).toBeTruthy(); }
  });
  it("interleaves countries (a country is revisited) — a Combined chapter case", () => {
    const codes = t.stops.sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.countryCode);
    const revisits = codes.some((c, i) => i >= 2 && codes.slice(0, i).includes(c) && codes[i - 1] !== c);
    expect(revisits).toBe(true);
  });
  it("projects past the hard-end date and raises a hard-end warning", () => {
    const projected = computeProjectedEnd(t.stops.map(toProjectionStop), t.startDate);
    expect(projected! > t.hardEndDate!).toBe(true);
    const flags = detectFlags(planFlagInput(t, { tripStart: t.startDate!, tripEnd: projected!, hardEndDate: t.hardEndDate, projectedEnd: projected }));
    expect(flags.some((f) => f.severity === "warning")).toBe(true);
  });
  it("uses CAR and OTHER transport modes", () => {
    const modes = new Set(t.transports.map((x) => x.mode));
    expect(modes.has("CAR")).toBe(true);
    expect(modes.has("OTHER")).toBe(true);
  });
  it("has a rough chapter and an ungrouped tail", () => {
    expect(t.chapters.some((c) => !c.startDate)).toBe(true);
    expect(t.stops.some((s) => !s.chapterKey)).toBe(true);
  });
});
