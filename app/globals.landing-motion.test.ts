import { describe, it, expect } from "vitest";
import { atRules, commentText, declValues, decls, findRules, keyframes, reducedMotion, rule } from "@/test/helpers/css";

const STAGGER = "var(--tp-delay, calc(var(--tp-i) * 80ms))";

describe("Landing entrance motion (spec 2026-09-29 §1.4)", () => {
  it("defines the tilted-card keyframe from an overshot tilt, and the class rests at --tp-tilt", () => {
    expect(decls(rule("from", keyframes("tp-card-in")))).toEqual({ opacity: "0", transform: "translateY(24px) rotate(calc(var(--tp-tilt) * 1.8))" });
    expect(decls(rule(".tp-card-in")).transform).toBe("rotate(var(--tp-tilt))");
  });
  it("staggers by --tp-i at 80ms on --ease-bounce and fills backwards only, so :hover can move the card afterwards", () => {
    expect(decls(rule(".tp-card-in"))).toMatchObject({ animation: "tp-card-in 420ms var(--ease-bounce) backwards", "animation-delay": STAGGER });
    expect(decls(rule(".tp-card-pop-in"))).toMatchObject({ animation: "tp-zoom-in 320ms var(--ease-bounce) backwards", "animation-delay": STAGGER });
    expect(declValues("animation").some((v) => v.includes("tp-card-in 420ms var(--ease-bounce) both"))).toBe(false);
  });
  it("lifts and straightens a card on hover, only on hover-capable devices without reduced motion (Minor #4)", () => {
    const hoverOnly = atRules("media", "(hover: hover) and (prefers-reduced-motion: no-preference)");
    expect(findRules(".tp-card-in:hover", hoverOnly).map(decls)).toEqual([{ transform: "translateY(-4px) rotate(calc(var(--tp-tilt) * 0.8))" }]);
  });
  it("zeroes the stagger delay under prefers-reduced-motion (Review Focus 1)", () => {
    const reset = rule([".tp-card-in", ".tp-card-pop-in", ".tp-pin-pop", ".tp-drop-in", ".tp-band-fill"], reducedMotion());
    expect(decls(reset)).toEqual({ "animation-delay": "0s !important" });
  });
});

describe("Landing route ribbon (handoff LANDING.md §5.4)", () => {
  it("defines the tp-marquee keyframe to -50% and loops it linearly on --tp-marquee-dur", () => {
    expect(decls(rule("to", keyframes("tp-marquee")))).toEqual({ transform: "translateX(-50%)" });
    expect(decls(rule(".tp-marquee"))).toEqual({ animation: "tp-marquee var(--tp-marquee-dur, 22s) linear infinite" });
  });
  it("pauses on press and is switched off, not run once, under reduced motion", () => {
    expect(decls(rule(".tp-marquee:active"))).toEqual({ "animation-play-state": "paused" });
    expect(decls(rule(".tp-marquee", reducedMotion()))).toEqual({ animation: "none" });
  });
  it("the card comment no longer claims nothing loops — the ribbon does", () => {
    expect(commentText()).not.toContain("nothing loops");
    expect(commentText()).toMatch(/ribbon/);
  });
});
