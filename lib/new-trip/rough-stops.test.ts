import { describe, it, expect } from "vitest";
import { defaultStopNights, roughStopRows, DEFAULT_ROUGH_NIGHTS } from "./rough-stops";

describe("defaultStopNights", () => {
  it("is empty for no stops", () => {
    expect(defaultStopNights(0, "2026-07-01", "2026-07-10")).toEqual([]);
  });
  it("splits the trip's nights, earlier stops taking the remainder", () => {
    expect(defaultStopNights(3, "2026-07-01", "2026-07-11")).toEqual([4, 3, 3]);
  });
  it("gives every stop the default without dates", () => {
    expect(defaultStopNights(2)).toEqual([DEFAULT_ROUGH_NIGHTS, DEFAULT_ROUGH_NIGHTS]);
  });
});

describe("roughStopRows", () => {
  it("builds rough real-plan rows in order", () => {
    const rows = roughStopRows(
      [{ name: "Kyoto", lat: 35, lng: 135.7, countryCode: "JP" }, { name: "Nara", nights: 1 }],
      { startDate: "2026-04-01", endDate: "2026-04-07" },
    );
    expect(rows).toEqual([
      expect.objectContaining({ name: "Kyoto", lat: 35, lng: 135.7, countryCode: "jp", nights: 3, sortOrder: 0, forkId: null, arriveDate: null, departDate: null, timezone: null, pinned: false, chapterId: null }),
      expect.objectContaining({ name: "Nara", lat: null, lng: null, countryCode: null, nights: 1, sortOrder: 1 }),
    ]);
  });
});
