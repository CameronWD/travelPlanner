import { describe, expect, it } from "vitest";
import { needsBookingConfirmation, type ConfirmationSubject } from "./booking-confirmation";

const today = "2026-12-10";

function subject(overrides: Partial<ConfirmationSubject> = {}): ConfirmationSubject {
  return {
    kind: "TRANSPORT",
    id: "t1",
    bookingState: "BOOKED",
    nothingToAttach: false,
    lastDay: "2026-12-20",
    photoAttachmentId: null,
    ...overrides,
  };
}

describe("needsBookingConfirmation", () => {
  it("a Booked subject with nothing attached needs a confirmation", () => {
    expect(needsBookingConfirmation(subject(), [], today)).toBe(true);
  });

  it("only a Booked subject can need one", () => {
    expect(needsBookingConfirmation(subject({ bookingState: "TO_BOOK" }), [], today)).toBe(false);
    expect(needsBookingConfirmation(subject({ bookingState: "NONE" }), [], today)).toBe(false);
  });

  it("nothingToAttach clears the need", () => {
    expect(needsBookingConfirmation(subject({ nothingToAttach: true }), [], today)).toBe(false);
  });

  it("any attached file clears the need", () => {
    expect(needsBookingConfirmation(subject(), ["a1"], today)).toBe(false);
  });

  it("the photo alone does not clear the need", () => {
    expect(needsBookingConfirmation(subject({ photoAttachmentId: "a1" }), ["a1"], today)).toBe(true);
  });

  it("the photo plus another file clears the need", () => {
    expect(needsBookingConfirmation(subject({ photoAttachmentId: "a1" }), ["a1", "a2"], today)).toBe(false);
  });

  it("a subject whose last day has passed no longer needs one", () => {
    expect(needsBookingConfirmation(subject({ lastDay: "2026-12-09" }), [], today)).toBe(false);
  });

  it("a subject whose last day is today still needs one", () => {
    expect(needsBookingConfirmation(subject({ lastDay: "2026-12-10" }), [], today)).toBe(true);
  });

  it("a subject with no date still needs one", () => {
    expect(needsBookingConfirmation(subject({ lastDay: null }), [], today)).toBe(true);
  });
});
