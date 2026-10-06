import { describe, it, expect } from "vitest";
import { moveItemInDays } from "./calendar-move";
import type { DayPlan } from "@/lib/itinerary";

const day = (dateISO: string, untimed: string[] = [], timed: Array<[string, string]> = []): DayPlan => ({
  dateISO, stop: null, transportEntries: [], accommodationEntries: [],
  untimedItems: untimed.map((id) => ({ kind: "item" as const, item: { id, title: id, category: "OTHER", date: dateISO, startTime: null } })),
  timedItems: timed.map(([id, t]) => ({ kind: "item" as const, item: { id, title: id, category: "OTHER", date: dateISO, startTime: t } })),
});

describe("moveItemInDays (spec 2026-10-06 §W)", () => {
  it("moves an untimed item to the target day and re-dates it", () => {
    const out = moveItemInDays([day("2026-08-02", ["a"]), day("2026-08-03")], "a", "2026-08-03");
    expect(out[0].untimedItems).toEqual([]);
    expect(out[1].untimedItems.map((e) => [e.item.id, e.item.date])).toEqual([["a", "2026-08-03"]]);
  });
  it("keeps a timed item timed, in start-time order", () => {
    const out = moveItemInDays([day("2026-08-02", [], [["a", "09:00"]]), day("2026-08-03", [], [["b", "08:00"], ["c", "11:00"]])], "a", "2026-08-03");
    expect(out[1].timedItems.map((e) => e.item.id)).toEqual(["b", "a", "c"]);
  });
  it("returns the days unchanged when the item or target day isn't there", () => {
    const days = [day("2026-08-02", ["a"])];
    expect(moveItemInDays(days, "zzz", "2026-08-02")).toBe(days);
    expect(moveItemInDays(days, "a", "2026-09-01")).toBe(days);
  });
});
