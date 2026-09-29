import { describe, it, expect } from "vitest";
import { desktopStripScroll, phoneStripScroll, STRIP_CHIP_GAP_PX } from "./strip-scroll";

// Desktop chips are 56px (w-14) with an 8px gap: a 64px stride.
const desk = { viewportWidth: 640, contentWidth: 36 * 64 - 8, chipWidth: 56, gap: STRIP_CHIP_GAP_PX };

describe("desktopStripScroll (spec 2026-09-29 D2)", () => {
  it("a fresh strip with day 1 selected stays at the first day", () => {
    expect(desktopStripScroll({ ...desk, scrollLeft: 0, chipLeft: 0 })).toBe(0);
  });
  it("leaves the strip where it is when the selected day and a day either side are in view (review focus 4)", () => {
    expect(desktopStripScroll({ ...desk, scrollLeft: 0, chipLeft: 3 * 64 })).toBe(0);
    expect(desktopStripScroll({ ...desk, scrollLeft: 320, chipLeft: 8 * 64 })).toBe(320);
  });
  it("scrolls right only far enough to show the selected day with one day's margin", () => {
    // chip 12 spans 768–824; plus one stride of margin = 888; 888 − 640 = 248.
    expect(desktopStripScroll({ ...desk, scrollLeft: 0, chipLeft: 12 * 64 })).toBe(248);
  });
  it("scrolls left only far enough to show the selected day with one day's margin", () => {
    // chip 8 starts at 512; minus one stride = 448.
    expect(desktopStripScroll({ ...desk, scrollLeft: 600, chipLeft: 8 * 64 })).toBe(448);
  });
  it("never scrolls a trip whose days all fit", () => {
    expect(desktopStripScroll({ ...desk, contentWidth: 500, scrollLeft: 0, chipLeft: 400 })).toBe(0);
  });
  it("clamps at the end of the strip", () => {
    expect(desktopStripScroll({ ...desk, scrollLeft: 0, chipLeft: 35 * 64 })).toBe(desk.contentWidth - desk.viewportWidth);
  });
});

describe("phoneStripScroll (unchanged rule)", () => {
  it("puts the selected day third, its two predecessors in view", () => {
    // Phone chips are 48px (w-12) + 8px gap: 56px stride. Chip 5 at 280 → 280 − 112.
    expect(phoneStripScroll({ scrollLeft: 0, viewportWidth: 360, contentWidth: 2000, chipLeft: 280, chipWidth: 48, gap: 8 })).toBe(168);
    expect(phoneStripScroll({ scrollLeft: 0, viewportWidth: 360, contentWidth: 2000, chipLeft: 56, chipWidth: 48, gap: 8 })).toBe(0);
  });
});
