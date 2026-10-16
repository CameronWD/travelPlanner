import { describe, it, expect } from "vitest";
import { decls, findRules, mentions, reducedMotion, rule, utility } from "@/test/helpers/css";

describe("globals.css view-transition rules (ADR 0063)", () => {
  it.each(["::view-transition-old(.day-forward)", "::view-transition-new(.day-forward)", "::view-transition-old(.day-back)", "::view-transition-new(.day-back)", "::view-transition-old(.day-text)", "::view-transition-new(.day-text)"])("defines %s", (selector) => {
    expect(findRules(selector)).not.toHaveLength(0);
  });
  it("switches off the browser's default root crossfade, so only the named boundaries animate", () => {
    expect(decls(rule(["::view-transition-old(root)", "::view-transition-new(root)"]))).toEqual({ animation: "none" });
  });
  it("lets clicks through while a transition runs", () => {
    expect(decls(rule("::view-transition"))).toEqual({ "pointer-events": "none" });
  });
  it("collapses every view transition to a cut under prefers-reduced-motion", () => {
    const groups = findRules("::view-transition-group(*)", reducedMotion());
    expect(groups).toHaveLength(1);
    expect(decls(groups[0])["animation-duration"]).toBe("0s !important");
  });
  it("has no section crossfade: a section switch is a cut (ADR 0065)", () => {
    expect(mentions("tp-crossfade")).toBe(false);
  });
  it("layers the phone bars' transition groups above every section group", () => {
    expect(decls(rule(["::view-transition-group(tp-tab-bar)", "::view-transition-group(tp-top-bar)"]))["z-index"]).toMatch(/^\d+$/);
  });
  it("defines the navigation progress utility", () => {
    expect(utility("tp-nav-progress").nodes?.length).toBeGreaterThan(0);
  });
  it("day heading text crossfades in 150ms, in step with the body slide (spec 2026-09-29 D4)", () => {
    expect(decls(rule("::view-transition-old(.day-text)")).animation).toMatch(/^150ms/);
    expect(decls(rule("::view-transition-new(.day-text)")).animation).toMatch(/^150ms/);
  });
  it("day page-turn: a far jump slides full-width with no fade, clipped to the body (ADR 0065)", () => {
    for (const cls of ["day-forward", "day-back"]) {
      for (const side of ["old", "new"]) {
        const block = Object.values(decls(rule(`::view-transition-${side}(.${cls})`))).join("; ");
        expect(block).not.toContain("tp-vt-fade");
        expect(block).toContain("100%");
        expect(block).toContain("300ms");
      }
    }
    expect(decls(rule(["::view-transition-image-pair(.day-forward)", "::view-transition-image-pair(.day-back)"]))).toEqual({ overflow: "clip" });
    expect(mentions("tp-vt-slide")).toBe(false);
  });
});
