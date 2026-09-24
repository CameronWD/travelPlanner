import { describe, expect, it } from "vitest";
import { COLLECTOR_SCRIPT, PAINTS_BACKGROUND_JS } from "./collector";

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
