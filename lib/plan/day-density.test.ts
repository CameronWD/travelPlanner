import { describe, it, expect } from "vitest";
import { daySlots, dayLoadLabel, dayTag, DOT_CAP } from "./day-density";

const ROME = { arriveDate: "2026-12-15", departDate: "2026-12-18" };
const busy = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, date: "2026-12-16", category: i % 2 ? "FOOD" : "SIGHTSEEING" }));
const ITEMS = [{ id: "a", date: "2026-12-15", category: "FOOD" }, ...busy, { id: "x", date: "2026-12-30", category: "FOOD" }];

describe("daySlots", () => {
  it("one slot per day of the stay, arrive → depart inclusive", () => {
    const slots = daySlots(ROME, ITEMS);
    expect(slots.map((s) => s.dateISO)).toEqual(["2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"]);
    expect(slots[0]).toMatchObject({ dow: "TUE", num: 15, count: 1, dots: ["FOOD"] });
  });

  it("caps the dots at five but counts every plan", () => {
    const slot = daySlots(ROME, ITEMS)[1];
    expect(slot.count).toBe(6);
    expect(slot.dots).toHaveLength(DOT_CAP);
  });

  it("an empty day has no dots; items outside the stay are ignored", () => {
    const slots = daySlots(ROME, ITEMS);
    expect(slots[2]).toMatchObject({ count: 0, dots: [] });
    expect(slots.reduce((n, s) => n + s.count, 0)).toBe(7);
  });

  it("carries the day title", () => {
    expect(daySlots(ROME, [], { "2026-12-17": { title: "Vatican day" } })[2].title).toBe("Vatican day");
  });

  it("flags the changeover days from the neighbours (ADR 0049)", () => {
    const slots = daySlots(ROME, [], undefined, { prevDepartDate: "2026-12-15", nextArriveDate: "2026-12-18" });
    expect(slots.map((s) => s.changeover)).toEqual(["arrive", null, null, "depart"]);
    expect(daySlots(ROME, []).every((s) => s.changeover === null)).toBe(true);
  });
});

describe("dayLoadLabel", () => {
  it("free, counted, full, titled, tagged", () => {
    expect(dayLoadLabel({ count: 0 })).toBe("Free day");
    expect(dayLoadLabel({ count: 1 })).toBe("1 plan");
    expect(dayLoadLabel({ count: 2 })).toBe("2 plans");
    expect(dayLoadLabel({ count: 5, title: "Versailles day" })).toBe("Versailles day · full");
    expect(dayLoadLabel({ count: 2, title: "Versailles day" })).toBe("Versailles day · 2 plans");
    expect(dayLoadLabel({ count: 2 }, "Arrive")).toBe("Arrive · 2 plans");
    expect(dayLoadLabel({ count: 0 }, "Leave")).toBe("Leave · Free day");
  });
});

describe("dayTag", () => {
  it("Arrive on the first day, Leave on the last, nothing between", () => {
    expect(dayTag(ROME, "2026-12-15")).toBe("Arrive");
    expect(dayTag(ROME, "2026-12-18")).toBe("Leave");
    expect(dayTag(ROME, "2026-12-16")).toBeNull();
    expect(dayTag({ arriveDate: "2026-12-15", departDate: "2026-12-15" }, "2026-12-15")).toBe("Arrive");
  });
});
