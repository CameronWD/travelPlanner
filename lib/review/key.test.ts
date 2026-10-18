import { describe, expect, it } from "vitest";
import { findingKey } from "./key";

describe("findingKey (R10: category + target)", () => {
  it("an Item, leg, stay or Stop is keyed by its id, not by its day", () => {
    expect(findingKey({ category: "CLOSURE", targetType: "ITEM", targetId: "i1", date: "2027-06-04" })).toBe("CLOSURE|ITEM|i1");
    expect(findingKey({ category: "BOOKING", targetType: "TRANSPORT", targetId: "t1" })).toBe("BOOKING|TRANSPORT|t1");
  });

  it("a day is keyed by its date", () => {
    expect(findingKey({ category: "HOLIDAY", targetType: "DAY", date: "2027-06-10" })).toBe("HOLIDAY|DAY|2027-06-10");
  });

  it("the Trip has no target id", () => {
    expect(findingKey({ category: "PACKING", targetType: "TRIP" })).toBe("PACKING|TRIP|-");
  });

  it("a restated Flag adds its own id, so two Flags on one target stay apart", () => {
    const before = findingKey({ category: "CLOSURE", targetType: "ITEM", targetId: "i1", flagId: "item-before-open-i1" });
    const after = findingKey({ category: "CLOSURE", targetType: "ITEM", targetId: "i1", flagId: "item-after-close-i1" });
    expect(before).toBe("CLOSURE|ITEM|i1|item-before-open-i1");
    expect(before).not.toBe(after);
  });

  it("the same category on a different target is a different key", () => {
    expect(findingKey({ category: "CLOSURE", targetType: "ITEM", targetId: "i1" })).not.toBe(findingKey({ category: "CLOSURE", targetType: "ITEM", targetId: "i2" }));
  });
});
