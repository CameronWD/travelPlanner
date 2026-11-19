import { describe, it, expect } from "vitest";
import { dayFromPathname } from "./day-path";

describe("dayFromPathname", () => {
  it("reads the date from a Day page's address, slug or id", () => {
    expect(dayFromPathname("/trips/christmas-in-europe-2026/day/2026-12-26")).toBe("2026-12-26");
    expect(dayFromPathname("/trips/cmtw8sgpw0001osqh3i54rx1o/day/2027-01-08")).toBe("2027-01-08");
  });
  it("is null anywhere else", () => {
    for (const p of ["/trips/x/day", "/trips/x/day/nope", "/trips/x/day/2026-12-26/extra", "/trips/x/plan", "/trips", "/day/2026-12-26", ""]) expect(dayFromPathname(p)).toBeNull();
  });
});
