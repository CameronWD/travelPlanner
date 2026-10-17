import { describe, expect, it } from "vitest";
import { MAX_ARRIVE_BY_MINUTES, defaultStartFromSlot } from "./slot-time";

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
