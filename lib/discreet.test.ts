import { describe, it, expect } from "vitest";
import {
  DISCREET_COOKIE, DISCREET_LABEL_COOKIE, DEFAULT_DISCREET_LABEL,
  resolveDiscreetLabel, columnLetter, buildStopSheetRows,
} from "@/lib/discreet";

describe("resolveDiscreetLabel", () => {
  it("defaults when empty/nullish", () => {
    expect(resolveDiscreetLabel(undefined)).toBe(DEFAULT_DISCREET_LABEL);
    expect(resolveDiscreetLabel("")).toBe(DEFAULT_DISCREET_LABEL);
    expect(resolveDiscreetLabel("   ")).toBe(DEFAULT_DISCREET_LABEL);
  });
  it("trims and clamps to 40 chars", () => {
    expect(resolveDiscreetLabel("  Q3 Tracker  ")).toBe("Q3 Tracker");
    expect(resolveDiscreetLabel("x".repeat(60))).toHaveLength(40);
  });
});

describe("columnLetter", () => {
  it("maps 0->A, 25->Z, 26->AA", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
  });
});

describe("buildStopSheetRows", () => {
  const base = {
    transports: [{ mode: "CAR", fromStopId: "s1", toStopId: "s2" }],
    costHomeMinorByStopId: { s2: 18000 },
    homeCurrency: "AUD",
  };
  it("derives nights from dates for scheduled stops and lists transport-in", () => {
    const rows = buildStopSheetRows({
      ...base,
      stops: [
        { id: "s1", name: "Queenstown", country: "NZ", arriveDate: "2026-07-12", departDate: "2026-07-15", nights: null, pinned: false, notes: null, accommodations: [] },
        { id: "s2", name: "Te Anau", country: "NZ", arriveDate: "2026-07-15", departDate: "2026-07-17", nights: null, pinned: true, notes: "ferry", accommodations: [{ name: "Lakeview Motel" }] },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "s1", location: "Queenstown", scheduled: true, nights: 3, transportInLabel: null, estCostMinor: 0 });
    expect(rows[1]).toMatchObject({ id: "s2", scheduled: true, nights: 2, pinned: true, transportInLabel: "Car", stayLabel: "Lakeview Motel", estCostMinor: 18000, notes: "ferry" });
  });
  it("uses the nights field for rough stops and blanks dates", () => {
    const rows = buildStopSheetRows({
      ...base, transports: [], costHomeMinorByStopId: {},
      stops: [{ id: "s1", name: "Milford", country: null, arriveDate: null, departDate: null, nights: 1, pinned: false, notes: null, accommodations: [] }],
    });
    expect(rows[0]).toMatchObject({ scheduled: false, nights: 1, arriveDate: null, departDate: null });
  });
});
