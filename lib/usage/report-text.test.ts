import { describe, expect, it } from "vitest";
import { renderUsageReport } from "./report-text";
import type { UsageOverview, UsageTripReport } from "./report";

const overview: UsageOverview = {
  recording: true,
  total: 1204,
  fromOtherSites: 12,
  lastReceivedAt: new Date("2026-12-02T09:00:00.000Z"),
};

const report: UsageTripReport = {
  fromOtherSites: 0,
  ai: { microUsd: 420_000, runs: 2, unpriced: 1 },
  google: { from: "2026-12-01", to: "2027-01-09", calls: [{ sku: "routes", count: 120 }] },
  travellers: [
    {
      userId: "u1",
      name: "Olive Northvale",
      days: [
        {
          day: "2026-12-02",
          screens: { day: 12, plan: 3 },
          actions: [{ action: "day-changed", detail: "swipe", count: 20 }],
          screenCount: 15,
          actionCount: 20,
          medianMs: 300,
          savedCopies: 2,
        },
      ],
    },
    {
      userId: "u2",
      name: "Wren Westby",
      days: [{ day: "2026-12-01", screens: { money: 1 }, actions: [], screenCount: 1, actionCount: 0, medianMs: null, savedCopies: 0 }],
    },
  ],
};

describe("renderUsageReport", () => {
  const text = renderUsageReport({ name: "Northvale and Westby" }, overview, report, "Australia/Brisbane");

  it("names the Trip, the zone, the switch and the totals", () => {
    expect(text).toContain("Usage for Northvale and Westby (days in Australia/Brisbane)");
    expect(text).toContain("Recording: on");
    expect(text).toContain("Records from the main site: 1204");
    expect(text).toContain("Last arrived: 2026-12-02T09:00:00.000Z");
    expect(text).toContain("Records from beta and other sites, not counted below: 12");
  });

  it("names each Traveller and each day’s counts", () => {
    expect(text).toContain("Olive Northvale");
    expect(text).toContain("Wren Westby");
    expect(text).toContain("Wed 2 Dec (2026-12-02), 15 screens, 20 actions, median 300 ms, 2 from a saved copy");
    expect(text).toContain("Screens: Day view 12, Plan 3");
    expect(text).toContain("Actions: Changed day by swipe 20");
    expect(text).toContain("Tue 1 Dec (2026-12-01), 1 screen, 0 actions");
  });

  it("gives the AI and Google lines, Google labelled app-wide", () => {
    expect(text).toContain("AI: US$0.42 across 2 runs, 1 with no price");
    expect(text).toContain("Google calls, app-wide, 1 Dec to 9 Jan: routes 120");
  });

  it("says there is no Usage for an empty Trip", () => {
    const empty = renderUsageReport(
      { name: "Northvale" },
      { recording: false, total: 0, fromOtherSites: 0, lastReceivedAt: null },
      { travellers: [], fromOtherSites: 0, ai: { microUsd: 0, runs: 0, unpriced: 0 }, google: null },
      "UTC",
    );
    expect(empty).toContain("No Usage for this Trip yet.");
    expect(empty).toContain("Recording: off");
    expect(empty).toContain("Last arrived: never");
    expect(empty).toContain("AI: no runs");
  });
});
