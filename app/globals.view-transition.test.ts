import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(__dirname, "globals.css"), "utf8");

describe("globals.css view-transition rules (ADR 0063)", () => {
  it.each(["::view-transition-old(.tp-crossfade)", "::view-transition-new(.tp-crossfade)", "::view-transition-old(.day-forward)", "::view-transition-new(.day-forward)", "::view-transition-old(.day-back)", "::view-transition-new(.day-back)", "::view-transition-old(.day-text)", "::view-transition-new(.day-text)"])("defines %s", (selector) => {
    expect(css).toContain(selector);
  });
  it("switches off the browser's default root crossfade, so only the named boundaries animate", () => {
    expect(css).toMatch(/::view-transition-old\(root\),\s*::view-transition-new\(root\)\s*\{\s*animation:\s*none;?\s*\}/);
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
  it("section crossfade is out-then-in: the new section waits for the old one to finish", () => {
    const old = css.match(/::view-transition-old\(\.tp-crossfade\)\s*\{\s*animation:\s*(\d+)ms/);
    const neu = css.match(/::view-transition-new\(\.tp-crossfade\)\s*\{\s*animation:\s*(\d+)ms\s+[\w-]+\s+(\d+)ms/);
    expect(old && neu).toBeTruthy();
    expect(Number(neu![2])).toBeGreaterThanOrEqual(Number(old![1]));
  });
  it("layers the phone bars' transition groups above every section group", () => {
    expect(css).toMatch(/::view-transition-group\(tp-tab-bar\),\s*::view-transition-group\(tp-top-bar\)\s*\{\s*z-index:\s*\d+;?\s*\}/);
  });
  it("defines the navigation progress utility", () => {
    expect(css).toContain("@utility tp-nav-progress");
  });
  it("day heading text crossfades in 150ms, in step with the body slide (spec 2026-09-29 D4)", () => {
    expect(css).toMatch(/::view-transition-old\(\.day-text\)\s*\{\s*animation:\s*150ms/);
    expect(css).toMatch(/::view-transition-new\(\.day-text\)\s*\{\s*animation:\s*150ms/);
  });
});
