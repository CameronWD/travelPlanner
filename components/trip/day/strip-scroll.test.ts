import { describe, it, expect } from "vitest";
import { centredScrollLeft, phoneStripScroll, wideStripScroll, STRIP_CHIP_GAP_PX } from "./strip-scroll";

describe("centredScrollLeft (ADR 0065: the phone strip pads its ends so every day centres)", () => {
  // 56px chips with an 8px gap; the strip pads (900 - 56) / 2 at each end.
  it("the first day centres with the strip at its start", () => {
    expect(centredScrollLeft(0, 56, STRIP_CHIP_GAP_PX, 900)).toBe(0);
  });
  it("each later day moves the strip on by one chip and gap", () => {
    expect(centredScrollLeft(3, 56, STRIP_CHIP_GAP_PX, 900)).toBe(192);
    expect(centredScrollLeft(35, 56, STRIP_CHIP_GAP_PX, 900)).toBe(35 * 64);
  });
});

describe("wideStripScroll (from lg the strip has no end padding, so it never shows empty space)", () => {
  // 36 days of 56px chips with 8px gaps: 2296px of strip in a 1200px row.
  const content = 36 * 64 - 8;
  it("a day that can reach the centre is centred, as before", () => {
    expect(wideStripScroll(18, 56, STRIP_CHIP_GAP_PX, 1200, content)).toEqual({ scrollLeft: 18 * 64 + 28 - 600, centred: true });
  });
  it("near the first day the strip rests at its start and the day is not under the centre", () => {
    expect(wideStripScroll(0, 56, STRIP_CHIP_GAP_PX, 1200, content)).toEqual({ scrollLeft: 0, centred: false });
    expect(wideStripScroll(8, 56, STRIP_CHIP_GAP_PX, 1200, content)).toEqual({ scrollLeft: 0, centred: false });
  });
  it("near the last day the strip rests at its end", () => {
    expect(wideStripScroll(35, 56, STRIP_CHIP_GAP_PX, 1200, content)).toEqual({ scrollLeft: content - 1200, centred: false });
  });
  it("a trip shorter than the row never scrolls, and no day is under the centre", () => {
    expect(wideStripScroll(2, 56, STRIP_CHIP_GAP_PX, 1200, 5 * 64 - 8)).toEqual({ scrollLeft: 0, centred: false });
  });
});

describe("phoneStripScroll (ADR 0065: the selected day sits in the centre)", () => {
  it("centres the selected chip in the strip's viewport", () => {
    expect(phoneStripScroll({ scrollLeft: 0, viewportWidth: 390, contentWidth: 2000, chipLeft: 471, chipWidth: 48, gap: 8 })).toBe(300);
  });
  it("clamps at the start", () => {
    expect(phoneStripScroll({ scrollLeft: 0, viewportWidth: 390, contentWidth: 2000, chipLeft: 100, chipWidth: 48, gap: 8 })).toBe(0);
  });
});
