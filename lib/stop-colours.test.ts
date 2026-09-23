import { describe, it, expect } from "vitest";
import { stopBandBorderClass, stopDotClass, stopPillClass } from "@/lib/stop-colours";

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
});
