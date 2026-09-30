import { describe, it, expect } from "vitest";
import { shareOgModel } from "./share-og";

const trip = { name: "Christmas in Europe", startDate: "2026-12-04", endDate: "2027-01-08" };
const stops = [
  { id: "a", name: "London", lat: 51.5, lng: -0.1, arriveDate: "2026-12-05", departDate: "2026-12-10" },
  { id: "b", name: "Paris", lat: 48.9, lng: 2.35, arriveDate: "2026-12-10", departDate: "2026-12-15" },
];

describe("shareOgModel (SHARE.md §3: OG = hero at 1200×630)", () => {
  it("before: day-range sub line and a dashed sketch", () => {
    const m = shareOgModel({ trip, stops, today: "2026-10-01" });
    expect(m.name).toBe("Christmas in Europe");
    expect(m.subLine).toBe("Fri 4 Dec – Fri 8 Jan · 35 nights · 2 stops");
    expect(m.sketch?.solid).toBe(false);
    expect(m.sketch!.points.length).toBeGreaterThanOrEqual(2);
  });
  it("during: still the day-range sub line, dashed", () => {
    const m = shareOgModel({ trip, stops, today: "2026-12-12" });
    expect(m.subLine).toBe("Fri 4 Dec – Fri 8 Jan · 35 nights · 2 stops");
    expect(m.sketch?.solid).toBe(false);
  });
  it("after: month span and a solid sketch", () => {
    const m = shareOgModel({ trip, stops, today: "2027-02-01" });
    expect(m.subLine).toBe("Dec 2026 – Jan 2027");
    expect(m.sketch?.solid).toBe(true);
  });
  it("singular night and stop", () => {
    const m = shareOgModel({ trip: { ...trip, endDate: "2026-12-05" }, stops: [stops[0]], today: "2026-10-01" });
    expect(m.subLine).toBe("Fri 4 Dec – Sat 5 Dec · 1 night · 1 stop");
  });
  it("no sketch without two located stops", () => {
    expect(shareOgModel({ trip, stops: [stops[0]], today: "2026-10-01" }).sketch).toBeNull();
    expect(
      shareOgModel({ trip, stops: [stops[0], { ...stops[1], lat: null, lng: null }], today: "2026-10-01" }).sketch,
    ).toBeNull();
  });
});
