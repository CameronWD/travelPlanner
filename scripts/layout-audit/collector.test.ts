import { afterEach, describe, expect, it } from "vitest";
import { classify } from "./checks";
import { COLLECTOR_SCRIPT, PAINTS_BACKGROUND_JS, type RawCollect } from "./collector";

describe("COLLECTOR_SCRIPT", () => {
  it("is a self-invoking expression string", () => {
    expect(typeof COLLECTOR_SCRIPT).toBe("string");
    expect(COLLECTOR_SCRIPT).not.toMatch(/__name/);
  });
  it("runs in a DOM and returns every RawCollect key", () => {
    document.body.innerHTML = `<main><p>Hello there</p><button>Go</button></main>`;
    HTMLCanvasElement.prototype.getContext = (() => ({ measureText: () => ({ width: 864 }), font: "" })) as never;
    window.scrollTo = () => {};
    const result = (0, eval)(COLLECTOR_SCRIPT);
    for (const k of ["viewport", "doc", "elementCount", "widest", "spills", "clipped", "boxes", "targets", "chrome", "lines"]) {
      expect(result).toHaveProperty(k);
    }
    expect(Array.isArray(result.boxes)).toBe(true);
  });
});

describe("PAINTS_BACKGROUND_JS", () => {
  const paints = (0, eval)(PAINTS_BACKGROUND_JS) as (cs: { backgroundColor: string; backgroundImage?: string }) => boolean;
  const bg = (backgroundColor: string) => paints({ backgroundColor, backgroundImage: "none" });
  it("reads transparent backgrounds as not painting", () => {
    for (const c of ["transparent", "rgba(0, 0, 0, 0)", "rgb(0 0 0 / 0)", "rgb(0 0 0 / 0%)", "oklab(0.99 0 0 / 0)", "hsla(0, 0%, 0%, 0)", ""]) {
      expect(bg(c), c).toBe(false);
    }
  });
  it("reads translucent and modern colour syntaxes as painting", () => {
    for (const c of ["rgb(255, 255, 255)", "rgba(255, 255, 255, 0.6)", "oklab(0.99 0.001 0.004 / 0.95)", "oklch(0.98 0.01 90)", "color(srgb 1 1 1 / 0.5)", "rgb(1 2 3 / 50%)"]) {
      expect(bg(c), c).toBe(true);
    }
  });
  it("counts anything it cannot parse as painting", () => {
    for (const c of ["color-mix(in oklab, rgb(0 0 0 / 0) 95%, red)", "canvas", "oklab(0.5 0 0 / garbage)"]) {
      expect(bg(c), c).toBe(true);
    }
  });
  it("counts a background image as painting", () =>
    expect(paints({ backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "linear-gradient(red, blue)" })).toBe(true));
});

// Final review: the collector keeps only the outermost spiller per container, but it used a
// 0.5px cut to decide what "spills" while checks.ts only reports spills > 2px — so a 1px
// parent spill (never reported) hid its 30px child (never recorded). Both now use SPILL_PX.
describe("COLLECTOR_SCRIPT spill dedupe", () => {
  const proto = Element.prototype;
  const saved = { bcr: proto.getBoundingClientRect, gcr: proto.getClientRects };
  afterEach(() => {
    proto.getBoundingClientRect = saved.bcr;
    proto.getClientRects = saved.gcr;
  });

  // jsdom has no layout: every element with data-r="x,y,w,h" gets that box, the rest none.
  const rectOf = (el: Element) => {
    const r = el.getAttribute("data-r");
    if (!r) return null;
    const [x, y, w, h] = r.split(",").map(Number);
    return { x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect;
  };
  const collect = (html: string): RawCollect => {
    proto.getBoundingClientRect = function (this: Element) {
      return rectOf(this) ?? ({ x: 0, y: 0, width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect);
    };
    proto.getClientRects = function (this: Element) {
      const r = rectOf(this);
      return (r ? [r] : []) as unknown as DOMRectList;
    };
    HTMLCanvasElement.prototype.getContext = (() => ({ measureText: () => ({ width: 864 }), font: "" })) as never;
    window.scrollTo = () => {};
    document.body.innerHTML = html;
    return (0, eval)(COLLECTOR_SCRIPT) as RawCollect;
  };

  it("a sub-threshold parent spill does not hide a real child spill", () => {
    const raw = collect(
      `<div style="overflow-x: hidden" data-r="0,0,100,50">` +
        `<div data-testid="row" data-r="0,0,101,50">` +
        `<div data-testid="chip" data-r="0,0,130,20">wide chip</div>` +
        `</div></div>`,
    );
    const spills = classify(raw, "cap").filter((f) => f.check === "spill");
    expect(spills.map((f) => f.selector)).toEqual(['[data-testid="chip"]']);
    expect(spills[0].detail).toMatch(/30px right/);
  });

  it("still keeps only the outermost real spiller per container", () => {
    const raw = collect(
      `<div style="overflow-x: hidden" data-r="0,0,100,50">` +
        `<div data-testid="row" data-r="0,0,140,50">` +
        `<div data-testid="chip" data-r="0,0,130,20">wide chip</div>` +
        `</div></div>`,
    );
    expect(raw.spills.map((s) => s.sel)).toEqual(['[data-testid="row"]']);
  });
});
