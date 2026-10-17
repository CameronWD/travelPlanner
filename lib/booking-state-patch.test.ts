import { describe, expect, it } from "vitest";
import {
  BOOK_BY_NEEDS_TO_BOOK,
  copiedBookingFields,
  defaultBookingFields,
  resolveBookingWrite,
  type BookingFields,
} from "./booking-state-patch";

const unchosenToBook: BookingFields = { bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2026-11-20" };
const chosenToBook: BookingFields = { bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-11-20" };

describe("resolveBookingWrite (CONTEXT.md Booking state, spec R2)", () => {
  it("a new thing with no reference: Transport and Accommodation are To book, an Item needs no booking", () => {
    expect(resolveBookingWrite("TRANSPORT", null, {}, null)).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
    expect(resolveBookingWrite("ACCOMMODATION", null, {}, "  ")).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
    expect(resolveBookingWrite("ITEM", null, {}, undefined)).toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
  });

  it("a reference implies Booked", () => {
    expect(resolveBookingWrite("TRANSPORT", null, {}, "QF1")).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    expect(resolveBookingWrite("ITEM", null, {}, "BK-9")).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
  });

  it("a chosen state wins over the reference, and a book-by date rides with To book", () => {
    expect(resolveBookingWrite("ITEM", null, { bookingState: "TO_BOOK", bookBy: "2026-11-20" }, "BK-9"))
      .toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-11-20" });
  });

  it("an un-chosen To book leg that gains a reference becomes Booked and drops its book-by date", () => {
    expect(resolveBookingWrite("TRANSPORT", unchosenToBook, {}, "ICE 512")).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
  });

  it("a Traveller's To book stays To book when a reference is added, keeping its book-by date", () => {
    expect(resolveBookingWrite("TRANSPORT", chosenToBook, {}, "ICE 512")).toEqual(chosenToBook);
  });

  it("bookBy undefined keeps it; null clears it", () => {
    expect(resolveBookingWrite("TRANSPORT", unchosenToBook, { bookBy: undefined }, null)).toEqual(unchosenToBook);
    expect(resolveBookingWrite("TRANSPORT", unchosenToBook, { bookBy: null }, null)).toEqual({ ...unchosenToBook, bookBy: null });
  });

  it("choosing Booked clears the book-by date", () => {
    expect(resolveBookingWrite("ACCOMMODATION", chosenToBook, { bookingState: "BOOKED" }, null))
      .toEqual({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
  });

  it("bookingState null clears the Traveller's choice and re-derives", () => {
    expect(resolveBookingWrite("ITEM", { bookingState: "BOOKED", bookingStateSet: true, bookBy: null }, { bookingState: null }, null))
      .toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
  });

  it("refuses a book-by date for something that isn't To book", () => {
    expect(resolveBookingWrite("ITEM", null, { bookingState: "BOOKED", bookBy: "2026-11-20" }, null))
      .toEqual({ success: false, errors: { bookBy: [BOOK_BY_NEEDS_TO_BOOK] } });
    expect(resolveBookingWrite("TRANSPORT", unchosenToBook, { bookBy: "2026-11-21" }, "QF1"))
      .toEqual({ success: false, errors: { bookBy: [BOOK_BY_NEEDS_TO_BOOK] } });
  });

  it("takes a Prisma row's string-typed state as `current`", () => {
    const row = { bookingState: "NONE" as string, bookingStateSet: true, bookBy: null };
    expect(resolveBookingWrite("TRANSPORT", row, {}, "QF1")).toEqual({ bookingState: "NONE", bookingStateSet: true, bookBy: null });
  });
});

describe("defaultBookingFields / copiedBookingFields", () => {
  it("defaults per kind", () => {
    expect(defaultBookingFields("TRANSPORT")).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
    expect(defaultBookingFields("ITEM")).toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
  });

  it("a placed copy keeps the idea's chosen state and book-by date", () => {
    expect(copiedBookingFields({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-11-20" }))
      .toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-11-20" });
    expect(copiedBookingFields({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null }))
      .toEqual({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
  });

  it("an un-chosen idea's copy re-derives without the reference (which is not copied)", () => {
    expect(copiedBookingFields({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null }))
      .toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
  });
});
