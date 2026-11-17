import { describe, it, expect } from "vitest";
import { dayThings, stopBands } from "./month-layout";

const t = (id: string, title: string, startTime?: string) => ({ id, title, startTime });

describe("dayThings", () => {
  it("names three and counts the rest", () => {
    const r = dayThings(Array.from({ length: 7 }, (_, i) => t(`i${i}`, `T${i}`)));
    expect(r.shown).toHaveLength(3);
    expect(r.more).toBe(4);
  });

  it("is empty for no things", () => {
    expect(dayThings([])).toEqual({ shown: [], more: 0 });
  });

  it("lists timed first by time, then untimed in order, with the time in the label", () => {
    const r = dayThings([t("a", "Lunch"), t("b", "Louvre", "10:30"), t("c", "Dinner"), t("d", "Coffee", "08:00")], 4);
    expect(r.shown.map((s) => s.label)).toEqual(["08:00 Coffee", "10:30 Louvre", "Lunch", "Dinner"]);
    expect(r.more).toBe(0);
  });
});

describe("stopBands", () => {
  const week = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19"];
  const paris = { id: "p", name: "Paris", arriveDate: "2026-07-13", departDate: "2026-07-15", sortOrder: 0 };
  const london = { id: "l", name: "London", arriveDate: "2026-07-15", departDate: "2026-07-19", sortOrder: 1 };

  it("gives the Changeover day to the arriving Stop", () => {
    expect(stopBands(week, [paris, london])).toEqual([
      { stopId: "p", name: "Paris", startCol: 0, span: 2 },
      { stopId: "l", name: "London", startCol: 2, span: 5 },
    ]);
  });

  it("skips days with no band and starts a new band after a gap", () => {
    const days = [null, "2026-07-14", "2026-07-15", null, "2026-07-17", null, null];
    expect(stopBands(days, [paris, london])).toEqual([
      { stopId: "p", name: "Paris", startCol: 1, span: 1 },
      { stopId: "l", name: "London", startCol: 2, span: 1 },
      { stopId: "l", name: "London", startCol: 4, span: 1 },
    ]);
  });
});
