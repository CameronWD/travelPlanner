import { describe, expect, it } from "vitest";
import { MAX_ARRIVE_BY_MINUTES, defaultStartFromSlot, refundLabel, slotLabel, startFromSlot } from "./slot-time";

describe("defaultStartFromSlot (CONTEXT.md Slot time: start no later than slot − arrive-by)", () => {
  it("takes the arrive-by margin off the slot", () => {
    expect(defaultStartFromSlot("12:00", 15)).toBe("11:45");
    expect(defaultStartFromSlot("09:05", 90)).toBe("07:35");
    expect(defaultStartFromSlot("19:30", MAX_ARRIVE_BY_MINUTES)).toBe("07:30");
  });

  it("no margin (or none set) is the slot itself", () => {
    expect(defaultStartFromSlot("12:00", 0)).toBe("12:00");
    expect(defaultStartFromSlot("12:00", null)).toBe("12:00");
    expect(defaultStartFromSlot("12:00", undefined)).toBe("12:00");
  });

  it("never rolls into the day before: clamps at 00:00", () => {
    expect(defaultStartFromSlot("00:10", 15)).toBe("00:00");
  });

  it("a negative margin counts as none", () => {
    expect(defaultStartFromSlot("12:00", -5)).toBe("12:00");
  });

  it("no slot, or a malformed one, gives no default", () => {
    expect(defaultStartFromSlot(null, 15)).toBeNull();
    expect(defaultStartFromSlot("", 15)).toBeNull();
    expect(defaultStartFromSlot("25:00", 0)).toBeNull();
    expect(defaultStartFromSlot("9:00", 0)).toBeNull();
  });
});

describe("startFromSlot (R3: start defaults to slot − arrive-by)", () => {
  it("an explicit start always wins", () => {
    expect(startFromSlot({ date: "2027-06-02", startTime: "11:00", slotTime: "12:00", arriveByMinutes: 15 })).toBe("11:00");
  });
  it("no start, a date and a slot: slot less the margin", () => {
    expect(startFromSlot({ date: "2027-06-02", slotTime: "12:00", arriveByMinutes: 15 })).toBe("11:45");
    expect(startFromSlot({ date: "2027-06-02", startTime: null, slotTime: "19:30", arriveByMinutes: null })).toBe("19:30");
  });
  it("clamps at 00:00 like defaultStartFromSlot", () => {
    expect(startFromSlot({ date: "2027-06-02", slotTime: "00:10", arriveByMinutes: 30 })).toBe("00:00");
  });
  it("no date or no slot: no start", () => {
    expect(startFromSlot({ date: null, slotTime: "12:00", arriveByMinutes: 15 })).toBeNull();
    expect(startFromSlot({ date: "2027-06-02", slotTime: null, arriveByMinutes: 15 })).toBeNull();
    expect(startFromSlot({})).toBeNull();
  });
});

describe("slotLabel / refundLabel", () => {
  it("reads the slot and when to be there", () => {
    expect(slotLabel({ slotTime: "12:00", arriveByMinutes: 15 })).toBe("Slot 12:00 · be there 11:45");
    expect(slotLabel({ slotTime: "12:00", arriveByMinutes: 0 })).toBe("Slot 12:00");
    expect(slotLabel({ slotTime: "12:00", arriveByMinutes: null })).toBe("Slot 12:00");
    expect(slotLabel({ slotTime: null, arriveByMinutes: 15 })).toBeNull();
    expect(slotLabel({})).toBeNull();
  });
  it("only a non-refundable ticket says so (refundable is Boolean?: null = not known)", () => {
    expect(refundLabel(false)).toBe("Non-refundable");
    expect(refundLabel(true)).toBeNull();
    expect(refundLabel(null)).toBeNull();
    expect(refundLabel(undefined)).toBeNull();
  });
});
