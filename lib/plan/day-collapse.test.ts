import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  dayCollapseKey,
  parseCollapsed,
  readCollapsedRaw,
  resetDayCollapse,
  setDayCollapsed,
  subscribeCollapsed,
} from "./day-collapse";

const KEY = "teepee.plan.collapsedDays.t1";

beforeEach(() => {
  resetDayCollapse();
  window.localStorage.clear();
});

describe("day collapse store (spec 2026-10-04 §A)", () => {
  it("every day starts open: nothing stored reads as an empty set", () => {
    expect(readCollapsedRaw("t1")).toBe("");
    expect(parseCollapsed(readCollapsedRaw("t1")).size).toBe(0);
  });

  it("folding keeps only the folded days, per Trip, keyed by Stop and date", () => {
    setDayCollapsed("t1", "par", "2026-12-11", true);
    setDayCollapsed("t1", "par", "2026-12-12", true);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(["par:2026-12-11", "par:2026-12-12"]);
    expect(parseCollapsed(readCollapsedRaw("t1")).has(dayCollapseKey("par", "2026-12-11"))).toBe(true);
    expect(readCollapsedRaw("t2")).toBe("");
  });

  it("a Changeover day folds separately under each of its Stops", () => {
    setDayCollapsed("t1", "par", "2026-12-15", true);
    const folded = parseCollapsed(readCollapsedRaw("t1"));
    expect(folded.has("par:2026-12-15")).toBe(true);
    expect(folded.has("rom:2026-12-15")).toBe(false);
  });

  it("opening the last folded day removes the key", () => {
    setDayCollapsed("t1", "par", "2026-12-11", true);
    setDayCollapsed("t1", "par", "2026-12-11", false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("notifies subscribers on a change, not on a no-op", () => {
    const listener = vi.fn();
    const off = subscribeCollapsed(listener);
    setDayCollapsed("t1", "par", "2026-12-11", true);
    setDayCollapsed("t1", "par", "2026-12-11", true);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    setDayCollapsed("t1", "par", "2026-12-11", false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("junk in storage reads as every day open", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(parseCollapsed(readCollapsedRaw("t1")).size).toBe(0);
    window.localStorage.setItem(KEY, JSON.stringify({ par: true }));
    expect(parseCollapsed(readCollapsedRaw("t1")).size).toBe(0);
    window.localStorage.setItem(KEY, JSON.stringify(["par:2026-12-11", 7, null]));
    expect([...parseCollapsed(readCollapsedRaw("t1"))]).toEqual(["par:2026-12-11"]);
  });

  it("storage that refuses writes still folds the day for this visit", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      setDayCollapsed("t1", "par", "2026-12-11", true);
      expect(parseCollapsed(readCollapsedRaw("t1")).has("par:2026-12-11")).toBe(true);
    } finally {
      setItem.mockRestore();
    }
  });

  it("storage that refuses reads reads as every day open", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    try {
      expect(readCollapsedRaw("t1")).toBe("");
    } finally {
      getItem.mockRestore();
    }
  });
});
