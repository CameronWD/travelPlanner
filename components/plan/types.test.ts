import { describe, expect, it } from "vitest";
import { toItemCardItem } from "./types";

describe("toItemCardItem", () => {
  it("carries Booking state to the edit dialog (spec 2026-10-17 R2)", () => {
    expect(
      toItemCardItem({ id: "i", title: "T", category: "FOOD", bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-01" }),
    ).toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-01" });
  });

  it("an idea that never read it carries nulls", () => {
    expect(toItemCardItem({ id: "i", title: "T", category: "FOOD", bookingStateSet: false })).toMatchObject({ bookingState: null, bookingStateSet: false, bookBy: null });
  });

  it("hands the edit dialog the Item's Slot time, so saving another field never clears it (R3)", () => {
    expect(
      toItemCardItem({ id: "i1", bookingStateSet: false, title: "Tour", category: "ACTIVITY", date: "2027-06-02", startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: false }),
    ).toMatchObject({ slotTime: "12:00", arriveByMinutes: 15, refundable: false });
    expect(toItemCardItem({ id: "i2", bookingStateSet: false, title: "Walk", category: "OTHER" })).toMatchObject({ slotTime: null, arriveByMinutes: null, refundable: null });
  });

  it("carries the opening hours to the edit dialog", () => {
    const hours = {
      week: { sat: [["10:00", "14:00"]] as [string, string][] },
      seasons: [],
      closed: [],
    };
    expect(toItemCardItem({ id: "i1", bookingStateSet: false, title: "Market", category: "FOOD", openingHours: hours }).openingHours).toEqual(hours);
    expect(toItemCardItem({ id: "i2", bookingStateSet: false, title: "Walk", category: "OTHER" }).openingHours).toBeNull();
  });

  it("carries the Try list to the edit dialog", () => {
    const list = [{ id: "e1", text: "Lebkuchen", tried: true }];
    expect(toItemCardItem({ id: "i1", title: "Market", category: "FOOD", bookingStateSet: false, tryList: list }).tryList).toEqual(list);
    expect(toItemCardItem({ id: "i2", title: "Walk", category: "OTHER", bookingStateSet: false }).tryList).toBeNull();
  });
});
