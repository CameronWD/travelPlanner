import { describe, expect, it } from "vitest";
import { toItemCardItem } from "./types";

describe("toItemCardItem", () => {
  it("carries Booking state to the edit dialog (spec 2026-10-17 R2)", () => {
    expect(
      toItemCardItem({ id: "i", title: "T", category: "FOOD", bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-01" }),
    ).toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-01" });
  });

  it("an idea that never read it carries nulls", () => {
    expect(toItemCardItem({ id: "i", title: "T", category: "FOOD" })).toMatchObject({ bookingState: null, bookingStateSet: null, bookBy: null });
  });
});
