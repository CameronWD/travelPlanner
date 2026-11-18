import { describe, it, expect } from "vitest";
import type { Rule } from "postcss";
import { decls, keyframes, reducedMotion, rule, selectorsOf, utility } from "@/test/helpers/css";

function flashPeaks() {
  const duration = Number(/wx-flash ([\d.]+)s/.exec(decls(utility("wx-flash")).animation)![1]);
  const peaks = (keyframes("wx-flash").nodes ?? [])
    .filter((n): n is Rule => n.type === "rule")
    .flatMap((r) => selectorsOf(r).map((sel) => ({ at: (parseFloat(sel) / 100) * duration, opacity: Number(decls(r).opacity) })))
    .filter((k) => k.opacity > 0)
    .sort((a, b) => a.at - b.at);
  return { duration, peaks };
}

describe("storm lightning (wx-flash)", () => {
  it("flashes twice a cycle, the peaks at least half a second apart", () => {
    const { peaks } = flashPeaks();
    expect(peaks).toHaveLength(2);
    expect(peaks[1].at - peaks[0].at).toBeGreaterThanOrEqual(0.5);
  });
  it("never more than two flashes in any second, the cycle included", () => {
    const { duration, peaks } = flashPeaks();
    expect(duration - (peaks[1].at - peaks[0].at)).toBeGreaterThan(1);
  });
  it("stays soft: the first peak at most 0.35, the second lower", () => {
    const { peaks } = flashPeaks();
    expect(peaks[0].opacity).toBeLessThanOrEqual(0.35);
    expect(peaks[1].opacity).toBeLessThan(peaks[0].opacity);
  });
  it("rests invisible, and every scene animation stops under reduced motion", () => {
    expect(decls(utility("wx-flash")).opacity).toBe("0");
    expect(decls(rule("[data-scene] *", reducedMotion()))).toEqual({ animation: "none !important" });
  });
});
