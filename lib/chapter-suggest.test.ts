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
      { name: "Helsinki", arriveDate: "2026-06-26", departDate: "2026-06-30", countryCode: "fi" },
      { name: "Rovaniemi", arriveDate: "2026-06-30", departDate: "2026-07-03", countryCode: "fi" },
      { name: "London", arriveDate: "2026-07-03", departDate: "2026-07-07", countryCode: "gb" },
    ]);
    expect(runs).toEqual([
      { country: "Finland", anchorCity: "Helsinki", startDate: "2026-06-26", endDate: "2026-07-03", nights: 7 },
      { country: "United Kingdom", anchorCity: "London", startDate: "2026-07-03", endDate: "2026-07-07", nights: 4 },
    ]);
  });

  it("opens a fresh run each time the country changes, even when it recurs", () => {
    const runs = countryRuns([
      { name: "Munich", arriveDate: "2026-07-01", departDate: "2026-07-03", countryCode: "de" },
      { name: "Strasbourg", arriveDate: "2026-07-03", departDate: "2026-07-05", countryCode: "fr" },
      { name: "Frankfurt", arriveDate: "2026-07-05", departDate: "2026-07-07", countryCode: "de" },
      { name: "Paris", arriveDate: "2026-07-07", departDate: "2026-07-10", countryCode: "fr" },
    ]);
    expect(runs.map((r) => r.country)).toEqual(["Germany", "France", "Germany", "France"]);
    expect(runs.map((r) => r.anchorCity)).toEqual(["Munich", "Strasbourg", "Frankfurt", "Paris"]);
  });

  it("skips rough (date-less) and countryCode-less stops, ordering by arrive date", () => {
    const runs = countryRuns([
      { name: "Late", arriveDate: "2026-07-10", departDate: "2026-07-12", countryCode: "it" },
      { name: "Rough", arriveDate: null, departDate: null, countryCode: "es" },
      { name: "Nowhere", arriveDate: "2026-07-01", departDate: "2026-07-03", countryCode: null },
      { name: "Early", arriveDate: "2026-07-03", departDate: "2026-07-06", countryCode: "fr" },
    ]);
    expect(runs.map((r) => r.country)).toEqual(["France", "Italy"]);
  });
});

import { zoneIntervals } from "./chapter-suggest";

// Minimal run factory — only country matters for zone detection.
function run(country: string): CountryRunForTest {
  return { country, anchorCity: country, startDate: "2026-01-01", endDate: "2026-01-02", nights: 1 };
}
type CountryRunForTest = { country: string; anchorCity: string; startDate: string; endDate: string; nights: number };

describe("zoneIntervals", () => {
  it("returns no zones when every country is unique", () => {
    expect(zoneIntervals([run("Finland"), run("United Kingdom"), run("Italy")])).toEqual([]);
  });

  it("spans a single recurring country from its first to last run", () => {
    // Germany, France, Germany → Germany recurs at 0 and 2
    expect(zoneIntervals([run("Germany"), run("France"), run("Germany")])).toEqual([[0, 2]]);
  });

  it("merges interlocking recurrences into one zone", () => {
    // Germany(0,2), France(1,3) → [0,2] and [1,3] merge → [0,3]
    expect(zoneIntervals([run("Germany"), run("France"), run("Germany"), run("France")])).toEqual([[0, 3]]);
  });

  it("keeps two separate tangles separate when a clean country sits between them", () => {
    // Germany(0,2), Italy(3) clean, Spain(4,6)
    const runs = [run("Germany"), run("France"), run("Germany"), run("Italy"), run("Spain"), run("Portugal"), run("Spain")];
    expect(zoneIntervals(runs)).toEqual([[0, 2], [4, 6]]);
  });

  it("does not merge adjacent-but-non-overlapping tangles", () => {
    // Germany(0,2), Spain(3,5) — touch at the 2|3 boundary but share no index
    const runs = [run("Germany"), run("France"), run("Germany"), run("Spain"), run("Portugal"), run("Spain")];
    expect(zoneIntervals(runs)).toEqual([[0, 2], [3, 5]]);
  });
});

import { buildChapters } from "./chapter-suggest";

// Full run factory with dates + nights for edge-peel behavior.
function frun(country: string, city: string, start: string, end: string, nights: number): CountryRunForTest {
  return { country, anchorCity: city, startDate: start, endDate: end, nights };
}

describe("buildChapters", () => {
  it("emits standalone chapters for clean unique-country runs", () => {
    const runs = [
      frun("Finland", "Helsinki", "2026-06-26", "2026-07-03", 7),
      frun("United Kingdom", "London", "2026-07-03", "2026-07-07", 4),
    ];
    const out = buildChapters(runs, zoneIntervals(runs));
    expect(out.map((c) => c.name)).toEqual(["Finland", "United Kingdom"]);
  });

  it("combines a short interleaved zone into one chapter spanning it", () => {
    const runs = [
      frun("Germany", "Munich", "2026-07-01", "2026-07-03", 2),
      frun("France", "Strasbourg", "2026-07-03", "2026-07-05", 2),
      frun("Germany", "Frankfurt", "2026-07-05", "2026-07-07", 2),
      frun("France", "Paris", "2026-07-07", "2026-07-10", 3),
    ];
    const out = buildChapters(runs, zoneIntervals(runs));
    expect(out).toEqual([
      { name: "Germany & France", startDate: "2026-07-01", endDate: "2026-07-10", anchorCity: "Munich" },
    ]);
  });

  it("keeps a substantial stay sandwiched inside the zone in the combined band", () => {
    const runs = [
      frun("Germany", "Munich", "2026-07-01", "2026-07-03", 2),
      frun("France", "Paris", "2026-07-03", "2026-07-10", 7), // interior, 7 nights
      frun("Germany", "Frankfurt", "2026-07-10", "2026-07-12", 2),
    ];
    const out = buildChapters(runs, zoneIntervals(runs));
    expect(out.map((c) => c.name)).toEqual(["Germany & France"]);
    expect(out[0].startDate).toBe("2026-07-01");
    expect(out[0].endDate).toBe("2026-07-12");
  });

  it("peels a substantial run off the FRONT of a zone as its own chapter", () => {
    const runs = [
      frun("France", "Paris", "2026-07-01", "2026-07-08", 7), // front, 7 nights
      frun("Germany", "Munich", "2026-07-08", "2026-07-10", 2),
      frun("France", "Strasbourg", "2026-07-10", "2026-07-12", 2),
      frun("Germany", "Frankfurt", "2026-07-12", "2026-07-14", 2),
    ];
    const out = buildChapters(runs, zoneIntervals(runs));
    expect(out.map((c) => c.name)).toEqual(["France", "Germany & France"]);
    expect(out[0]).toMatchObject({ startDate: "2026-07-01", endDate: "2026-07-08", anchorCity: "Paris" });
    expect(out[1]).toMatchObject({ startDate: "2026-07-08", endDate: "2026-07-14" });
  });

  it("double edge-peel leaves two same-named standalones around the core", () => {
    // Paris(7) · Munich(2) · Lyon(7): both French weeks peel, Germany core remains.
    const runs = [
      frun("France", "Paris", "2026-07-01", "2026-07-08", 7),
      frun("Germany", "Munich", "2026-07-08", "2026-07-10", 2),
      frun("France", "Lyon", "2026-07-10", "2026-07-17", 7),
    ];
    const out = buildChapters(runs, zoneIntervals(runs));
    // Names still collide here; disambiguation is Task 6. Assert structure + order.
    expect(out.map((c) => c.name)).toEqual(["France", "Germany", "France"]);
    expect(out.map((c) => c.anchorCity)).toEqual(["Paris", "Munich", "Lyon"]);
  });
});

import { disambiguateNames, suggestChapters, suggestRoughChapters } from "./chapter-suggest";

describe("disambiguateNames", () => {
  it("appends the anchor city to chapters that share an identical name", () => {
    const out = disambiguateNames([
      { name: "France", startDate: "2026-07-01", endDate: "2026-07-08", anchorCity: "Paris" },
      { name: "Germany", startDate: "2026-07-08", endDate: "2026-07-10", anchorCity: "Munich" },
      { name: "France", startDate: "2026-07-10", endDate: "2026-07-17", anchorCity: "Lyon" },
    ]);
    expect(out.map((c) => c.name)).toEqual(["France (Paris)", "Germany", "France (Lyon)"]);
  });
  it("leaves a solo+combo pair alone (not an exact clash)", () => {
    const out = disambiguateNames([
      { name: "France", startDate: "2026-07-01", endDate: "2026-07-08", anchorCity: "Paris" },
      { name: "Germany & France", startDate: "2026-07-08", endDate: "2026-07-14", anchorCity: "Munich" },
    ]);
    expect(out.map((c) => c.name)).toEqual(["France", "Germany & France"]);
  });
});

describe("suggestChapters (end to end)", () => {
  it("matches the previous suggester for clean country blocks (seam-trimmed)", () => {
    const runs = suggestChapters([
      { name: "Helsinki", arriveDate: "2026-06-26", departDate: "2026-06-30", countryCode: "fi" },
      { name: "Rovaniemi", arriveDate: "2026-06-30", departDate: "2026-07-03", countryCode: "fi" },
      { name: "London", arriveDate: "2026-07-03", departDate: "2026-07-07", countryCode: "gb" },
    ]);
    expect(runs).toEqual([
      { name: "Finland", startDate: "2026-06-26", endDate: "2026-07-02" },
      { name: "United Kingdom", startDate: "2026-07-03", endDate: "2026-07-07" },
    ]);
  });

  it("combines the canonical ping-pong route into one chapter", () => {
    const runs = suggestChapters([
      { name: "Munich", arriveDate: "2026-07-01", departDate: "2026-07-03", countryCode: "de" },
      { name: "Strasbourg", arriveDate: "2026-07-03", departDate: "2026-07-05", countryCode: "fr" },
      { name: "Frankfurt", arriveDate: "2026-07-05", departDate: "2026-07-07", countryCode: "de" },
      { name: "Paris", arriveDate: "2026-07-07", departDate: "2026-07-10", countryCode: "fr" },
    ]);
    expect(runs).toEqual([
      { name: "Germany & France", startDate: "2026-07-01", endDate: "2026-07-10" },
    ]);
  });

  it("disambiguates a double edge-peel with the anchor city", () => {
    const runs = suggestChapters([
      { name: "Paris", arriveDate: "2026-07-01", departDate: "2026-07-08", countryCode: "fr" },
      { name: "Munich", arriveDate: "2026-07-08", departDate: "2026-07-10", countryCode: "de" },
      { name: "Lyon", arriveDate: "2026-07-10", departDate: "2026-07-17", countryCode: "fr" },
    ]);
    expect(runs.map((r) => r.name)).toEqual(["France (Paris)", "Germany", "France (Lyon)"]);
  });

  it("returns no runs for an empty or fully-rough trip", () => {
    expect(suggestChapters([])).toEqual([]);
    expect(suggestChapters([{ name: "X", arriveDate: null, departDate: null, countryCode: "es" }])).toEqual([]);
  });
});

describe("suggestRoughChapters", () => {
  const s = (id: string, countryCode: string | null, sortOrder: number, chapterId: string | null = null) =>
    ({ id, countryCode, chapterId, sortOrder });

  it("groups consecutive same-country rough stops in sortOrder", () => {
    const out = suggestRoughChapters([
      s("rome", "it", 0), s("florence", "it", 1), s("paris", "fr", 2), s("lyon", "fr", 3),
    ]);
    expect(out).toEqual([
      { name: "Italy", stopIds: ["rome", "florence"] },
      { name: "France", stopIds: ["paris", "lyon"] },
    ]);
  });

  it("skips stops already in a chapter and country-less stops (which break a run)", () => {
    const out = suggestRoughChapters([
      s("a", "it", 0, "existing"), s("b", null, 1), s("c", "it", 2),
    ]);
    expect(out).toEqual([{ name: "Italy", stopIds: ["c"] }]);
  });
});
