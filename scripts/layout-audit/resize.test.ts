import { describe, expect, it } from "vitest";
import type { AutoFinding } from "./checks";
import { UP_WIDTHS, breakage, downWidths, mergeResize, widthRanges, type ResizeRouteResult } from "./resize";

describe("downWidths", () => {
  const widths = downWidths();
  it("runs 2560 → 320, never widening", () => {
    expect(widths[0]).toBe(2560);
    expect(widths.at(-1)).toBe(320);
    expect(widths.every((w, i) => i === 0 || w < widths[i - 1])).toBe(true);
  });
  it("steps 80px down to 800, then 20px", () => {
    expect(widths.slice(0, 3)).toEqual([2560, 2480, 2400]);
    expect(widths.slice(widths.indexOf(800), widths.indexOf(800) + 3)).toEqual([800, 780, 760]);
  });
  it("every width re-checked on the way up was measured on the way down", () =>
    expect(UP_WIDTHS.every((w) => widths.includes(w))).toBe(true));
});

describe("breakage", () => {
  const f = (check: AutoFinding["check"], detail = ""): AutoFinding => ({
    id: check, check, captureId: "resize/plan", selector: "a", rect: { x: 0, y: 0, w: 1, h: 1 }, detail,
  });
  it("keeps sideways scroll, spill and clipped text; drops tap targets and line length", () =>
    expect(breakage([f("sideways-scroll"), f("spill"), f("clipped-text"), f("small-target"), f("line-too-long")]).map((x) => x.check)).toEqual([
      "sideways-scroll",
      "spill",
      "clipped-text",
    ]));
  it("keeps only gross overlap", () => {
    expect(breakage([f("overlap", "text and text overlap by 30×14px")])).toHaveLength(1);
    expect(breakage([f("overlap", "text and text overlap by 30×6px")])).toHaveLength(0);
  });
});

describe("widthRanges", () => {
  it("folds neighbouring steps into ranges", () =>
    expect(widthRanges([400, 380, 340], [400, 380, 360, 340, 320])).toBe("340, 380–400"));
  it("a single width stays a single width", () => expect(widthRanges([800], [880, 800, 780])).toBe("800"));
});

describe("mergeResize", () => {
  const r = (label: string, ms: number): ResizeRouteResult => ({ id: `resize/${label}`, label, route: `/${label}`, steps: [], findings: [], notRecovered: [], ms });
  it("a re-run route replaces its old result; the rest are kept", () =>
    expect(mergeResize([r("plan", 1), r("day", 1)], [r("day", 2), r("home", 2)]).map((x) => `${x.label}:${x.ms}`)).toEqual(["plan:1", "day:2", "home:2"]));
});
