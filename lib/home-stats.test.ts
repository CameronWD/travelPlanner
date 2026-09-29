import { describe, expect, it } from "vitest";
import { homeStats } from "./home-stats";

const stops = (codes: (string | null)[]) => codes.map((countryCode) => ({ countryCode }));

describe("homeStats (Feedback cmumctx4r000504l7lkixq9us)", () => {
  it("gives nights, Stops, countries and Chapters when the toggle is on", () => {
    expect(
      homeStats({ startDate: "2026-12-04", endDate: "2027-01-08", stops: stops(["FR", "IT", "IT", null]), chaptersEnabled: true, chapterCount: 3 }),
    ).toEqual([
      { label: "Nights", value: "35" },
      { label: "Stops", value: "4" },
      { label: "Countries", value: "2" },
      { label: "Chapters", value: "3" },
    ]);
  });

  it("singularises", () => {
    expect(homeStats({ startDate: "2026-12-04", endDate: "2026-12-05", stops: stops(["FR"]), chaptersEnabled: true, chapterCount: 1 }).map((s) => s.label)).toEqual([
      "Night", "Stop", "Country", "Chapter",
    ]);
  });

  it("omits Chapters when the toggle is off, and countries when none are located", () => {
    const out = homeStats({ startDate: "2026-12-04", endDate: "2027-01-08", stops: stops([null, null]), chaptersEnabled: false, chapterCount: 2 });
    expect(out.map((s) => s.label)).toEqual(["Nights", "Stops"]);
  });

  it("is empty for a date-less Trip with no Stops — the row must not render", () => {
    expect(homeStats({ startDate: null, endDate: null, stops: [], chaptersEnabled: false, chapterCount: 0 })).toEqual([]);
  });
});
