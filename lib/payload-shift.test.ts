import { describe, expect, it } from "vitest";
import { shiftItemDates, shiftAccommodationDates } from "./payload-shift";

describe("shiftItemDates", () => {
  // Stop moves 06-12→06-14 (2 days later), still 3 nights (new depart 06-17).
  it("keeps each slotted item's offset from the arrive date", () => {
    const shifts = shiftItemDates(
      [{ id: "louvre", date: "2026-06-14" }, { id: "todo", date: null }],
      "2026-06-12", "2026-06-14", "2026-06-17",
    );
    expect(shifts).toEqual([{ id: "louvre", date: "2026-06-16", prevDate: "2026-06-14" }]);
  });

  it("un-slots an item whose day falls off a shortened stay", () => {
    // Stay shrinks to 1 night (06-12 → 06-13); day-3 item can't fit.
    const shifts = shiftItemDates([{ id: "versailles", date: "2026-06-15" }], "2026-06-12", "2026-06-12", "2026-06-13");
    expect(shifts).toEqual([{ id: "versailles", date: null, prevDate: "2026-06-15" }]);
  });

  it("un-slots an item dated before the stay (stranded data)", () => {
    const shifts = shiftItemDates([{ id: "x", date: "2026-06-10" }], "2026-06-12", "2026-06-14", "2026-06-17");
    expect(shifts).toEqual([{ id: "x", date: null, prevDate: "2026-06-10" }]);
  });

  it("returns nothing when dates are unchanged", () => {
    expect(shiftItemDates([{ id: "a", date: "2026-06-13" }], "2026-06-12", "2026-06-12", "2026-06-15")).toEqual([]);
  });
});

describe("shiftAccommodationDates", () => {
  it("shifts check-in/out by the stop's arrive delta", () => {
    const shifts = shiftAccommodationDates([{ id: "hotel", checkIn: "2026-06-12", checkOut: "2026-06-15" }], 2);
    expect(shifts).toEqual([{
      id: "hotel", checkIn: "2026-06-14", checkOut: "2026-06-17",
      prevCheckIn: "2026-06-12", prevCheckOut: "2026-06-15",
    }]);
  });

  it("is empty for a zero delta", () => {
    expect(shiftAccommodationDates([{ id: "hotel", checkIn: "2026-06-12", checkOut: "2026-06-15" }], 0)).toEqual([]);
  });
});
