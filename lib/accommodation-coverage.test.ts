import { describe, it, expect } from "vitest";
import { uncoveredNights } from "./accommodation-coverage";

const stay = { arriveDate: "2026-07-01", departDate: "2026-07-05" }; // 4 nights

describe("uncoveredNights (spec 2026-09-28 D6; shared with Flag rule 14)", () => {
  it("every night with no Accommodation at all", () => expect(uncoveredNights(stay, [])).toBe(4));
  it("zero when one booking covers the stay", () => expect(uncoveredNights(stay, [{ checkIn: "2026-07-01", checkOut: "2026-07-05" }])).toBe(0));
  it("two bookings covering the stay", () => expect(uncoveredNights(stay, [{ checkIn: "2026-07-01", checkOut: "2026-07-03" }, { checkIn: "2026-07-03", checkOut: "2026-07-05" }])).toBe(0));
  it("two bookings with a gap", () => expect(uncoveredNights(stay, [{ checkIn: "2026-07-01", checkOut: "2026-07-02" }, { checkIn: "2026-07-03", checkOut: "2026-07-05" }])).toBe(1));
  it("overlapping bookings still count each night once", () => expect(uncoveredNights(stay, [{ checkIn: "2026-07-01", checkOut: "2026-07-04" }, { checkIn: "2026-07-02", checkOut: "2026-07-05" }])).toBe(0));
  it("a zero-night stay has nothing to cover", () => expect(uncoveredNights({ arriveDate: "2026-07-01", departDate: "2026-07-01" }, [])).toBe(0));
});
