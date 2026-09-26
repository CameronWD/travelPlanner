import { describe, it, expect } from "vitest";
import { stopBandBorderClass, stopDotClass, stopPillClass, stopHue, stopHex } from "@/lib/stop-colours";
import { hueHex } from "@/lib/map-palette";

describe("stop colours", () => {
  it("cycles the palette by index and wraps past the end", () => {
    expect(stopBandBorderClass(0)).toBe("border-l-hue-sky");
    expect(stopBandBorderClass(3)).toBe("border-l-hue-lilac"); // violet -> lilac hue
    expect(stopBandBorderClass(6)).toBe("border-l-hue-sky"); // wraps
  });
  it("exposes matching dot and pill classes for the same index", () => {
    expect(stopDotClass(0)).toContain("bg-hue-sky");
    expect(stopPillClass(0)).toContain("sky");
  });

  it("stopHue cycles sky, sun, leaf, lilac, pink, teal and wraps", () => {
    expect([0, 1, 2, 3, 4, 5, 6, -1].map(stopHue)).toEqual([
      "sky", "sun", "leaf", "lilac", "pink", "teal", "sky", "teal",
    ]);
  });

  it("stopHex is the map palette hex for the same hue, light and dark", () => {
    expect(stopHex(1)).toBe(hueHex("sun", false));
    expect(stopHex(1, true)).toBe(hueHex("sun", true));
  });
});
