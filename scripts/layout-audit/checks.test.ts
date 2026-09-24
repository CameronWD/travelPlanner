import { describe, expect, it } from "vitest";
import type { RawCollect } from "./collector";
import { classify, checkSideways, checkSpill, checkClipped, checkOverlap, checkTargets, checkChrome, checkLines } from "./checks";

const R = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
function raw(over: Partial<RawCollect> = {}): RawCollect {
  return {
    viewport: { w: 390, h: 800 }, doc: { scrollW: 390, scrollH: 2000 }, elementCount: 100,
    widest: [], spills: [], clipped: [], boxes: [], targets: [],
    chrome: { fixedBottom: [], lastContent: null, safeAreaBottom: 0 }, lines: [], ...over,
  };
}

describe("checkSideways", () => {
  it("flags a page wider than the viewport", () => {
    const f = checkSideways(raw({ doc: { scrollW: 420, scrollH: 10 }, widest: [{ sel: "table.budget", rect: R(0, 0, 420, 10) }] }));
    expect(f).toHaveLength(1);
    expect(f[0].selector).toBe("table.budget");
  });
  it("ignores a 1px rounding difference", () => expect(checkSideways(raw({ doc: { scrollW: 391, scrollH: 10 } }))).toEqual([]));
});

describe("checkSpill", () => {
  const base = { sel: "div.chip", containerSel: "div.card", containerRect: R(16, 0, 358, 100), inHScroller: false, inLeaflet: false };
  it("flags an element poking out of its clipping container", () =>
    expect(checkSpill(raw({ spills: [{ ...base, rect: R(300, 10, 100, 20) }] }))).toHaveLength(1));
  it("ignores ≤2px", () => expect(checkSpill(raw({ spills: [{ ...base, rect: R(300, 10, 76, 20) }] }))).toEqual([]));
  it("ignores intentional horizontal scrollers and Leaflet", () => {
    expect(checkSpill(raw({ spills: [{ ...base, rect: R(300, 10, 200, 20), inHScroller: true }] }))).toEqual([]);
    expect(checkSpill(raw({ spills: [{ ...base, rect: R(300, 10, 200, 20), inLeaflet: true }] }))).toEqual([]);
  });
});

describe("checkClipped", () => {
  const el = { sel: "span.name", rect: R(0, 0, 100, 20), scrollW: 180, clientW: 100, scrollH: 20, clientH: 20 };
  it("flags truncated text with no way to read it", () => expect(checkClipped(raw({ clipped: [{ ...el, hasLabel: false }] }))).toHaveLength(1));
  it("accepts truncation that has a title/aria-label", () => expect(checkClipped(raw({ clipped: [{ ...el, hasLabel: true }] }))).toEqual([]));
  it("ignores text that fits", () => expect(checkClipped(raw({ clipped: [{ ...el, scrollW: 100, hasLabel: false }] }))).toEqual([]));
});

describe("checkOverlap", () => {
  const box = (sel: string, rect: ReturnType<typeof R>, ancestorIdx: number[] = []) =>
    ({ sel, rect, kind: "interactive" as const, ancestorIdx, stackOk: false, inLeaflet: false });
  it("flags two unrelated boxes overlapping >4px both ways", () =>
    expect(checkOverlap(raw({ boxes: [box("a", R(0, 0, 50, 50)), box("b", R(40, 40, 50, 50))] }))).toHaveLength(1));
  it("ignores a touch/sliver", () =>
    expect(checkOverlap(raw({ boxes: [box("a", R(0, 0, 50, 50)), box("b", R(47, 0, 50, 50))] }))).toEqual([]));
  it("ignores ancestor/descendant", () =>
    expect(checkOverlap(raw({ boxes: [box("a", R(0, 0, 100, 100)), box("b", R(10, 10, 20, 20), [0])] }))).toEqual([]));
  it("ignores intentional stacks", () => {
    const b = { ...box("b", R(40, 40, 50, 50)), stackOk: true };
    expect(checkOverlap(raw({ boxes: [box("a", R(0, 0, 50, 50)), b] }))).toEqual([]);
  });
  it("reports each pair once", () =>
    expect(checkOverlap(raw({ boxes: [box("a", R(0, 0, 50, 50)), box("b", R(40, 40, 50, 50)), box("c", R(200, 0, 5, 5))] }))).toHaveLength(1));
});

describe("checkTargets", () => {
  const t = { sel: "button.icon", rect: R(0, 0, 32, 32), ancestorTargetOk: false };
  it("flags <44px targets on phones", () => expect(checkTargets(raw({ targets: [t] }))).toHaveLength(1));
  it("not on desktop", () => expect(checkTargets(raw({ viewport: { w: 1280, h: 900 }, targets: [t] }))).toEqual([]));
  it("fine when a 44px ancestor is the real target", () => expect(checkTargets(raw({ targets: [{ ...t, ancestorTargetOk: true }] }))).toEqual([]));
});

describe("checkChrome", () => {
  it("flags the last content hidden under the tab bar", () =>
    expect(checkChrome(raw({ chrome: { fixedBottom: [R(0, 1936, 390, 64)], lastContent: { sel: "button.save", rect: R(16, 1940, 200, 44) }, safeAreaBottom: 0 } }))).toHaveLength(1));
  it("passes when content clears the tab bar", () =>
    expect(checkChrome(raw({ chrome: { fixedBottom: [R(0, 1936, 390, 64)], lastContent: { sel: "p", rect: R(16, 1850, 200, 44) }, safeAreaBottom: 0 } }))).toEqual([]));
});

describe("checkLines", () => {
  it("flags a measure over 80 characters", () =>
    expect(checkLines(raw({ lines: [{ sel: "p", rect: R(0, 0, 900, 60), chars: 400, avgGlyph: 8 }] }))).toHaveLength(1));
  it("passes a readable measure", () =>
    expect(checkLines(raw({ lines: [{ sel: "p", rect: R(0, 0, 560, 60), chars: 400, avgGlyph: 8 }] }))).toEqual([]));
  it("skips short text", () =>
    expect(checkLines(raw({ lines: [{ sel: "p", rect: R(0, 0, 900, 60), chars: 40, avgGlyph: 8 }] }))).toEqual([]));
});

describe("classify", () => {
  it("stamps stable ids", () => {
    const f = classify(raw({ doc: { scrollW: 420, scrollH: 10 }, widest: [{ sel: "table", rect: R(0, 0, 420, 10) }] }), "deep/budget/deep/390-light");
    expect(f[0].id).toBe("deep/budget/deep/390-light#sideways-scroll#table");
    expect(f[0].captureId).toBe("deep/budget/deep/390-light");
  });
});

describe("classify — beyond the brief", () => {
  it("keeps ids unique when two hits share a selector", () => {
    const t = { sel: "button.icon", rect: R(0, 0, 32, 32), ancestorTargetOk: false };
    const ids = classify(raw({ targets: [t, { ...t, rect: R(0, 100, 32, 32) }] }), "c").map((f) => f.id);
    expect(ids).toEqual(["c#small-target#button.icon", "c#small-target#button.icon#2"]);
  });
  it("falls back to html when nothing wider was found", () =>
    expect(checkSideways(raw({ doc: { scrollW: 420, scrollH: 10 } }))[0].selector).toBe("html"));
  it("flags last content inside the bottom safe area while fixed chrome exists", () => {
    const chrome = { fixedBottom: [R(300, 1900, 60, 40)], lastContent: { sel: "p", rect: R(16, 1950, 200, 40) }, safeAreaBottom: 34 };
    expect(checkChrome(raw({ chrome }))).toHaveLength(1);
    expect(checkChrome(raw({ chrome: { ...chrome, fixedBottom: [] } }))).toEqual([]);
    expect(checkChrome(raw({ chrome: { ...chrome, lastContent: { sel: "p", rect: R(16, 1900, 200, 40) } } }))).toEqual([]);
  });
});
