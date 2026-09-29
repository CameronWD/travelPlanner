import { describe, it, expect } from "vitest";
import { easeOut, panelProgress, settledPanel } from "./carousel-maths";

describe("settledPanel", () => {
  it("names the panel a scroller rests on, within a pixel", () => {
    expect(settledPanel(0, 390)).toBe(0);
    expect(settledPanel(390, 390)).toBe(1);
    expect(settledPanel(781, 390)).toBe(2);
  });
  it("is null between two panels, or with no width", () => {
    expect(settledPanel(200, 390)).toBeNull();
    expect(settledPanel(390, 0)).toBeNull();
  });
});

describe("panelProgress", () => {
  it("is 0 on the day shown, +1 on the next, −1 on the previous, fractional between", () => {
    expect(panelProgress(390, 1, 390)).toBe(0);
    expect(panelProgress(780, 1, 390)).toBe(1);
    expect(panelProgress(0, 1, 390)).toBe(-1);
    expect(panelProgress(585, 1, 390)).toBe(0.5);
    expect(panelProgress(100, 1, 0)).toBe(0);
  });
});

describe("easeOut", () => {
  it("starts at 0, ends at 1, is fast early and clamps", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.8);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });
});
