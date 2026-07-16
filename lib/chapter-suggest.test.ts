import { describe, expect, it } from "vitest";
import { combineName, countryRuns } from "./chapter-suggest";

describe("combineName", () => {
  it("returns the single country unchanged", () => {
    expect(combineName(["Germany"])).toBe("Germany");
  });
  it("joins two countries with an ampersand", () => {
    expect(combineName(["Germany", "France"])).toBe("Germany & France");
  });
  it("uses Oxford-style for three", () => {
    expect(combineName(["Germany", "France", "Switzerland"])).toBe("Germany, France & Switzerland");
  });
  it("falls back to a generic label for four or more", () => {
    expect(combineName(["Germany", "France", "Switzerland", "Austria"])).toBe("Multi-country leg");
  });
  it("de-duplicates preserving first-appearance order before counting", () => {
    // Germany, France, Germany → two unique → "Germany & France"
    expect(combineName(["Germany", "France", "Germany"])).toBe("Germany & France");
  });
});

describe("countryRuns", () => {
  it("merges consecutive same-country stops into one run with run-total nights", () => {
    const runs = countryRuns([
      { name: "Helsinki", arriveDate: "2026-06-26", departDate: "2026-06-30", country: "Finland" },
      { name: "Rovaniemi", arriveDate: "2026-06-30", departDate: "2026-07-03", country: "Finland" },
      { name: "London", arriveDate: "2026-07-03", departDate: "2026-07-07", country: "United Kingdom" },
    ]);
    expect(runs).toEqual([
      { country: "Finland", anchorCity: "Helsinki", startDate: "2026-06-26", endDate: "2026-07-03", nights: 7 },
      { country: "United Kingdom", anchorCity: "London", startDate: "2026-07-03", endDate: "2026-07-07", nights: 4 },
    ]);
  });

  it("opens a fresh run each time the country changes, even when it recurs", () => {
    const runs = countryRuns([
      { name: "Munich", arriveDate: "2026-07-01", departDate: "2026-07-03", country: "Germany" },
      { name: "Strasbourg", arriveDate: "2026-07-03", departDate: "2026-07-05", country: "France" },
      { name: "Frankfurt", arriveDate: "2026-07-05", departDate: "2026-07-07", country: "Germany" },
      { name: "Paris", arriveDate: "2026-07-07", departDate: "2026-07-10", country: "France" },
    ]);
    expect(runs.map((r) => r.country)).toEqual(["Germany", "France", "Germany", "France"]);
    expect(runs.map((r) => r.anchorCity)).toEqual(["Munich", "Strasbourg", "Frankfurt", "Paris"]);
  });

  it("skips rough (date-less) and country-less stops, ordering by arrive date", () => {
    const runs = countryRuns([
      { name: "Late", arriveDate: "2026-07-10", departDate: "2026-07-12", country: "Italy" },
      { name: "Rough", arriveDate: null, departDate: null, country: "Spain" },
      { name: "Nowhere", arriveDate: "2026-07-01", departDate: "2026-07-03", country: null },
      { name: "Early", arriveDate: "2026-07-03", departDate: "2026-07-06", country: "France" },
    ]);
    expect(runs.map((r) => r.country)).toEqual(["France", "Italy"]);
  });
});
