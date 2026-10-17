import { describe, expect, it } from "vitest";
import { BOOKING_STATE_LABELS, bookByLabel } from "./booking-state-copy";

describe("Booking state copy (CONTEXT.md)", () => {
  it("names the three states as the glossary does", () => {
    expect(BOOKING_STATE_LABELS).toEqual({ NONE: "No booking needed", TO_BOOK: "To book", BOOKED: "Booked" });
  });
  it("says the book-by date as a day and month", () => {
    expect(bookByLabel("2026-11-20")).toBe("Book by 20 Nov");
  });
});
