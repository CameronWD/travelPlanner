import { describe, expect, it } from "vitest";
import { ACTION_DETAILS, USAGE_ACTIONS, USAGE_SCREENS } from "./lists";
import { SCREEN_LABELS, actionLabel, formatMicroUsd } from "./labels";

describe("usage labels", () => {
  it("names every screen", () => {
    for (const screen of USAGE_SCREENS) expect(SCREEN_LABELS[screen]).toBeTruthy();
    expect(Object.keys(SCREEN_LABELS).sort()).toEqual([...USAGE_SCREENS].sort());
  });

  it("names every action, with and without each of its details", () => {
    for (const action of USAGE_ACTIONS) {
      expect(actionLabel(action, null)).toMatch(/^[A-Z]/);
      const details = (ACTION_DETAILS as Record<string, readonly string[]>)[action] ?? [];
      for (const detail of details) {
        expect(actionLabel(action, detail as never)).not.toBe(actionLabel(action, null));
      }
    }
  });

  it("reads each action the way the plan words it", () => {
    expect(actionLabel("day-changed", "swipe")).toBe("Changed day by swipe");
    expect(actionLabel("more-row-chosen", "wishlist")).toBe("Chose Wishlist from More");
    expect(actionLabel("review-started", "deep")).toBe("Started a Deep Review");
    expect(actionLabel("directions-tapped", null)).toBe("Tapped Directions");
    expect(actionLabel("directions-back-tapped", null)).toBe("Tapped Directions back");
  });

  it("formats millionths of a dollar", () => {
    expect(formatMicroUsd(420_000)).toBe("US$0.42");
    expect(formatMicroUsd(0)).toBe("US$0.00");
  });
});
