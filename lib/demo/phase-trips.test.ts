import { describe, it, expect } from "vitest";
import { buildSketchTrip, buildFinalPrepTrip, buildTravellingTrip, buildPastTrip } from "./phase-trips";
import { planFlagInput } from "./types";
import { detectFlags } from "@/lib/flags";
import { computeTripPhase } from "@/lib/trip-phase";

// today is intentionally frozen; builders take today as a param so tests stay deterministic
const today = "2026-07-19";

describe("phase trips", () => {
  it("sketch trip is date-less (sketching phase) with rough stops", () => {
    const t = buildSketchTrip();
    expect(computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today })).toBe("sketching");
    expect(t.stops.every((s) => !s.arriveDate)).toBe(true);
  });
  it("final-prep trip resolves to final-prep and has a pretrip checklist + soon reminder", () => {
    const t = buildFinalPrepTrip(today);
    expect(computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today })).toBe("final-prep");
    expect((t.checklist ?? []).some((c) => c.kind === "PRETRIP")).toBe(true);
    expect((t.reminders ?? []).length).toBeGreaterThanOrEqual(1);
  });
  it("travelling trip spans today with a located item today and a long-driving-day warning", () => {
    const t = buildTravellingTrip(today);
    expect(computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today })).toBe("travelling");
    expect(t.items.some((i) => i.date === today && i.lat != null && i.lng != null)).toBe(true);
    const flags = detectFlags(planFlagInput(t, { tripStart: t.startDate!, tripEnd: t.endDate! }));
    expect(flags.some((f) => f.severity === "warning" && /driv/i.test(f.message))).toBe(true);
  });
  it("past trip is over and has paid costs + journal for spend-so-far", () => {
    const t = buildPastTrip(today);
    expect(computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today })).toBe("past");
    const allCosts = [...t.costs, ...t.transports.flatMap((x) => x.cost ? [x.cost] : []), ...t.accommodations.flatMap((a) => a.cost ? [a.cost] : [])];
    expect(allCosts.some((c) => c.paid && c.actualMinor != null)).toBe(true);
    expect((t.journal ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("across the four phase trips, transport modes include TRAIN, CAR, FERRY, BUS", () => {
    const modes = new Set<string>([buildFinalPrepTrip(today), buildTravellingTrip(today), buildPastTrip(today)].flatMap((t) => t.transports.map((x) => x.mode)));
    for (const m of ["TRAIN", "CAR", "FERRY", "BUS"]) expect(modes.has(m)).toBe(true);
  });
});
