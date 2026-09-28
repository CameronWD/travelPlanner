import { describe, it, expect } from "vitest";
import { travelPhaseHex, hueInkHex, MAP_FILL } from "./map-palette";

describe("travelPhaseHex", () => {
  it("returns a distinct hex per phase, light theme", () => {
    const past = travelPhaseHex("past");
    const now = travelPhaseHex("now");
    const upcoming = travelPhaseHex("upcoming");
    expect(new Set([past, now, upcoming]).size).toBe(3);
    [past, now, upcoming].forEach((hex) => expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/));
  });

  it("returns a dark-theme variant when dark is true", () => {
    expect(travelPhaseHex("now", true)).not.toBe(travelPhaseHex("now", false));
  });
});

describe("hueInkHex", () => {
  it("returns the handoff's ink shades for coral and teal", () => {
    expect(hueInkHex("coral")).toBe("#B8391D");
    expect(hueInkHex("teal")).toBe("#2E8A88");
  });
  it("has a value for every hue in both themes", () => {
    for (const h of ["sky", "sun", "leaf", "lilac", "pink", "teal", "coral", "indigo", "stone"] as const) {
      expect(hueInkHex(h, false)).toMatch(/^#[0-9A-F]{6}$/i);
      expect(hueInkHex(h, true)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
  it("exposes the map fill", () => {
    expect(MAP_FILL.light).toBe("#EAF3F2");
  });
});
