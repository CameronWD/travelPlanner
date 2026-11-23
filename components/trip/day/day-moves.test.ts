import { describe, it, expect } from "vitest";
import { afterPush, isQuickPress, keepFilled, QUICK_PRESS_MS } from "./day-moves";

describe("isQuickPress (from lg, a press soon after the last cuts rather than crossfades)", () => {
  it("the first press of a run crossfades", () => {
    expect(isQuickPress(null, 1000)).toBe(false);
  });
  it("a press within QUICK_PRESS_MS of the last is quick", () => {
    expect(isQuickPress(1000, 1000 + QUICK_PRESS_MS - 1)).toBe(true);
  });
  it("a press after a pause crossfades again", () => {
    expect(isQuickPress(1000, 1000 + QUICK_PRESS_MS)).toBe(false);
  });
});

describe("afterPush (what the carousel does when its push ends)", () => {
  it("the day shown is the day in view: nothing", () => {
    expect(afterPush({ wide: true, pushed: "13", shown: "13", view: "13", committing: false })).toBe("none");
    expect(afterPush({ wide: false, pushed: "13", shown: "13", view: "13", committing: false })).toBe("none");
  });
  it("from lg, presses moved the view on while the push was in flight: push the day in view", () => {
    expect(afterPush({ wide: true, pushed: "13", shown: "13", view: "16", committing: false })).toBe("push");
  });
  it("from lg, a press is still waiting to commit behind a view transition: leave it to that commit", () => {
    expect(afterPush({ wide: true, pushed: "13", shown: "13", view: "16", committing: true })).toBe("none");
  });
  it("the push ended without landing on the day it was for: park back on the day shown", () => {
    expect(afterPush({ wide: true, pushed: "13", shown: "12", view: "13", committing: false })).toBe("reconcile");
  });
  it("below lg it parks back whenever the day shown is not the day in view, as before", () => {
    expect(afterPush({ wide: false, pushed: "13", shown: "12", view: "13", committing: false })).toBe("reconcile");
    expect(afterPush({ wide: false, pushed: "13", shown: "13", view: "16", committing: false })).toBe("reconcile");
  });
});

describe("keepFilled (the day shown keeps content an earlier payload sent)", () => {
  it("adds each filled day, newest payload first, and never forgets one a later payload left out", () => {
    const first = keepFilled(new Map(), [{ iso: "10", content: "a10" }, { iso: "11", filled: true, content: "a11" }, { iso: "14", filled: false, content: "skel" }]);
    expect([...first]).toEqual([["10", "a10"], ["11", "a11"]]);
    const second = keepFilled(first, [{ iso: "10", filled: false, content: "skel" }, { iso: "11", content: "b11" }, { iso: "14", content: "b14" }]);
    expect(Object.fromEntries(second)).toEqual({ "10": "a10", "11": "b11", "14": "b14" });
    expect(Object.fromEntries(first)).toEqual({ "10": "a10", "11": "a11" });
  });
});
