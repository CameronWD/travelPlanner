import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(__dirname, "globals.css"), "utf8");

describe("globals.css view-transition rules (ADR 0063)", () => {
  it.each(["::view-transition-old(.tp-crossfade)", "::view-transition-new(.tp-crossfade)", "::view-transition-old(.day-forward)", "::view-transition-new(.day-forward)", "::view-transition-old(.day-back)", "::view-transition-new(.day-back)"])("defines %s", (selector) => {
    expect(css).toContain(selector);
  });
  it("lets clicks through while a transition runs", () => {
    expect(css).toMatch(/::view-transition\s*\{\s*pointer-events:\s*none;?\s*\}/);
  });
  it("collapses every view transition to a cut under prefers-reduced-motion", () => {
    const idx = css.indexOf("::view-transition-group(*)");
    expect(idx).toBeGreaterThan(-1);
    const block = css.slice(Math.max(0, idx - 400), idx + 400);
    expect(block).toContain("prefers-reduced-motion: reduce");
    expect(block).toContain("animation-duration: 0s !important");
  });
  it("defines the navigation progress utility", () => {
    expect(css).toContain("@utility tp-nav-progress");
  });
});
