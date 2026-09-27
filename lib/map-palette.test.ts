import { describe, it, expect } from "vitest";
import { travelPhaseHex } from "./map-palette";

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
