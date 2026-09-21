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

  it("re-files an item onto the stop that still covers its day when a stop shortens", () => {
    // Munich 5-10, Strasbourg 10-12, a dinner on the 10th owned by Munich.
    // Shorten Munich to 5-9: the dinner's date does not move, and Strasbourg
    // still covers the 10th (ADR 0055).
    const shifts = shiftItemDates(
      [{ id: "dinner", date: "2026-05-10" }],
      "2026-05-05",
      "2026-05-05",
      "2026-05-09",
      [
        { id: "munich", arriveDate: "2026-05-05", departDate: "2026-05-09" },
        { id: "strasbourg", arriveDate: "2026-05-10", departDate: "2026-05-12" },
      ],
    );

    expect(shifts).toEqual([
      { id: "dinner", date: "2026-05-10", prevDate: "2026-05-10", stopId: "strasbourg" },
    ]);
  });

  it("still un-slots when no stop covers the day", () => {
    const shifts = shiftItemDates(
      [{ id: "dinner", date: "2026-05-10" }],
      "2026-05-05",
      "2026-05-05",
      "2026-05-09",
      [{ id: "munich", arriveDate: "2026-05-05", departDate: "2026-05-09" }],
    );

    expect(shifts).toEqual([
      { id: "dinner", date: null, prevDate: "2026-05-10" },
    ]);
  });

  it("still un-slots when the whole stop moves, even if another stop covers the old day", () => {
    // Munich 5-10 becomes 12-17. The dinner's date WOULD move, so rule 4 does
    // not apply and it un-slots rather than being stranded on the old dates.
    const shifts = shiftItemDates(
      [{ id: "dinner", date: "2026-05-10" }],
      "2026-05-05",
      "2026-05-12",
      "2026-05-13",
      [{ id: "strasbourg", arriveDate: "2026-05-10", departDate: "2026-05-11" }],
    );

    expect(shifts).toEqual([
      { id: "dinner", date: null, prevDate: "2026-05-10" },
    ]);
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
