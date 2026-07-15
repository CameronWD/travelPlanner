import { describe, it, expect } from "vitest";
import { stopBandBorderClass, stopDotClass, stopPillClass } from "@/lib/stop-colours";

describe("stop colours", () => {
  it("cycles the palette by index and wraps past the end", () => {
    expect(stopBandBorderClass(0)).toBe("border-l-sky-400");
    expect(stopBandBorderClass(3)).toBe("border-l-violet-400");
    expect(stopBandBorderClass(6)).toBe("border-l-sky-400"); // wraps
  });
  it("exposes matching dot and pill classes for the same index", () => {
    expect(stopDotClass(0)).toContain("bg-sky");
    expect(stopPillClass(0)).toContain("sky");
  });
});
