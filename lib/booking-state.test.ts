import { describe, expect, it } from "vitest";
import { BOOKING_STATES } from "@/lib/enum-values";
import {
  BOOKING_STATE_LABELS, activeBookBy, bookingStateWrite, defaultBookingState,
  derivedBookingState, effectiveBookingState, hasBookingReference, isBookingState,
} from "./booking-state";

describe("BOOKING_STATES", () => {
  it("is the three states, each with its CONTEXT.md label", () => {
    expect(BOOKING_STATES).toEqual(["NONE", "TO_BOOK", "BOOKED"]);
    expect(BOOKING_STATE_LABELS).toEqual({ NONE: "No booking needed", TO_BOOK: "To book", BOOKED: "Booked" });
    expect(isBookingState("TO_BOOK")).toBe(true);
    expect(isBookingState("PENDING")).toBe(false);
    expect(isBookingState(null)).toBe(false);
  });
});

describe("defaultBookingState / derivedBookingState", () => {
  it("an Item needs no booking; Transport and Accommodation are To book", () => {
    expect(defaultBookingState("ITEM")).toBe("NONE");
    expect(defaultBookingState("TRANSPORT")).toBe("TO_BOOK");
    expect(defaultBookingState("ACCOMMODATION")).toBe("TO_BOOK");
  });

  it("a reference means Booked; a blank one is no reference", () => {
    expect(hasBookingReference("BK1")).toBe(true);
    expect(hasBookingReference("   ")).toBe(false);
    expect(hasBookingReference("")).toBe(false);
    expect(hasBookingReference(null)).toBe(false);
    expect(hasBookingReference(undefined)).toBe(false);
    expect(derivedBookingState("ITEM", "BK1")).toBe("BOOKED");
    expect(derivedBookingState("TRANSPORT", " ")).toBe("TO_BOOK");
    expect(derivedBookingState("ACCOMMODATION", null)).toBe("TO_BOOK");
  });
});

describe("effectiveBookingState", () => {
  it("an automatic row follows its reference, whatever is stored", () => {
    expect(effectiveBookingState("TRANSPORT", { bookingState: "BOOKED", bookingStateSet: false }, null)).toBe("TO_BOOK");
    expect(effectiveBookingState("ITEM", { bookingState: "NONE", bookingStateSet: false }, "BK1")).toBe("BOOKED");
    expect(effectiveBookingState("ACCOMMODATION", {}, "ABC")).toBe("BOOKED");
  });

  it("a Traveller-set state wins over a reference", () => {
    expect(effectiveBookingState("TRANSPORT", { bookingState: "TO_BOOK", bookingStateSet: true }, "FR9521")).toBe("TO_BOOK");
    expect(effectiveBookingState("ITEM", { bookingState: "TO_BOOK", bookingStateSet: true }, null)).toBe("TO_BOOK");
  });

  it("a set row holding an unknown value falls back to the derived state", () => {
    expect(effectiveBookingState("ITEM", { bookingState: "PENDING", bookingStateSet: true }, "BK1")).toBe("BOOKED");
  });
});

describe("bookingStateWrite", () => {
  it("on create with no choice, derives from the reference", () => {
    expect(bookingStateWrite("TRANSPORT", null, undefined, "FR9521")).toEqual({ bookingState: "BOOKED", bookingStateSet: false });
    expect(bookingStateWrite("TRANSPORT", null, undefined, null)).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false });
    expect(bookingStateWrite("ITEM", null, undefined, undefined)).toEqual({ bookingState: "NONE", bookingStateSet: false });
  });

  it("an explicit choice is stored as set, whatever the reference", () => {
    expect(bookingStateWrite("ITEM", null, "TO_BOOK", "BK1")).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true });
    expect(bookingStateWrite("TRANSPORT", { bookingState: "BOOKED", bookingStateSet: false }, "NONE", "X")).toEqual({ bookingState: "NONE", bookingStateSet: true });
  });

  it("an explicit To book survives adding a reference later", () => {
    expect(bookingStateWrite("TRANSPORT", { bookingState: "TO_BOOK", bookingStateSet: true }, undefined, "FR9521")).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true });
  });

  it("an automatic row re-derives when its reference changes", () => {
    expect(bookingStateWrite("TRANSPORT", { bookingState: "BOOKED", bookingStateSet: false }, undefined, null)).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false });
    expect(bookingStateWrite("ITEM", { bookingState: "NONE", bookingStateSet: false }, undefined, "BK1")).toEqual({ bookingState: "BOOKED", bookingStateSet: false });
  });

  it("null hands the choice back to automatic", () => {
    expect(bookingStateWrite("ITEM", { bookingState: "NONE", bookingStateSet: true }, null, "BK1")).toEqual({ bookingState: "BOOKED", bookingStateSet: false });
    expect(bookingStateWrite("ACCOMMODATION", { bookingState: "BOOKED", bookingStateSet: true }, null, "")).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false });
  });
});

describe("activeBookBy", () => {
  it("is the book-by date only while To book", () => {
    expect(activeBookBy("TO_BOOK", "2026-11-01")).toBe("2026-11-01");
    expect(activeBookBy("BOOKED", "2026-11-01")).toBeNull();
    expect(activeBookBy("NONE", "2026-11-01")).toBeNull();
    expect(activeBookBy("TO_BOOK", null)).toBeNull();
    expect(activeBookBy("TO_BOOK", "")).toBeNull();
  });
});
