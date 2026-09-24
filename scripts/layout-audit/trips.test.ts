import { describe, expect, it } from "vitest";
import { parseTripLinks, matchTrips, verifyPhases, TRIP_NAMES } from "./trips";

describe("parseTripLinks", () => {
  it("keeps /trips/<id> links, drops /trips/new and sub-routes, dedupes by id", () => {
    expect(parseTripLinks([
      { href: "/trips/new", text: "New trip" },
      { href: "/trips/abc", text: "  EU Christmas 2026  PLANNING · 73 days " },
      { href: "/trips/abc", text: "Open" },
      { href: "/trips/abc/plan", text: "Plan" },
      { href: "/help", text: "Help" },
    ])).toEqual([{ id: "abc", name: "EU Christmas 2026  PLANNING · 73 days" }]);
  });
});

describe("matchTrips", () => {
  it("matches by name and prefers the tightest match", () => {
    const { found, missing } = matchTrips([
      { id: "ai", name: "AI TRIP - EU Christmas" },
      { id: "eu", name: "EU Christmas 2026 PLANNING" },
      { id: "jp", name: "Japan someday" },
    ]);
    expect(found.deep).toBe("eu");
    expect(found.sketching).toBe("jp");
    expect(missing).toContain("past");
    expect(missing).toContain("empty");
  });
  it("uses the literal names from the spec", () => expect(TRIP_NAMES.deep).toBe("EU Christmas 2026"));
});

describe("verifyPhases", () => {
  it("passes matching phases and records drift as a gap", () => {
    const r = verifyPhases([
      { key: "travelling", tripId: "t", expected: "travelling", actual: "past" },
      { key: "past", tripId: "p", expected: "past", actual: "past" },
      { key: "sketching", tripId: "s", expected: "sketching", actual: null },
    ]);
    expect(r.ok).toEqual(["past"]);
    expect(r.gaps.map((g) => g.key)).toEqual(["travelling", "sketching"]);
    expect(r.gaps[0].reason).toMatch(/expected travelling.*past/);
    expect(r.gaps[1].reason).toMatch(/no data-trip-phase marker/);
  });
});
