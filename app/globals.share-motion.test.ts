import { describe, it, expect } from "vitest";
import { allSelectors, declValues, decls, findRules, keyframes, mentions, reducedMotion, rule, selectorsOf, utility } from "@/test/helpers/css";

describe("share motion (MOTION.md S1–S10)", () => {
  it.each(["tp-share-hero-in", "tp-share-polaroid-in", "tp-live-ring", "tp-progress-fill", "tp-strike", "tp-reveal", "tp-leg-draw", "tp-tag-drop"])(
    "defines %s",
    (name) => {
      expect(mentions(name)).toBe(true);
    },
  );
  it("only the live ring loops (S2)", () => {
    const infinite = declValues("animation").filter((a) => a.includes("infinite"));
    const shareInfinite = infinite.filter((a) => /tp-(share|live|progress|strike|reveal|leg|tag)/.test(a));
    expect(shareInfinite).toHaveLength(1);
    expect(shareInfinite[0]).toContain("tp-live-ring");
  });
  it("hero drop-in is 420ms bounce; progress fill is 700ms pop after 200ms", () => {
    expect(decls(utility("tp-share-hero-in")).animation).toContain("420ms var(--ease-bounce)");
    expect(decls(utility("tp-progress-fill")).animation).toContain("700ms var(--ease-pop) 200ms");
  });
  it("reduced motion stops the ring, shows unrevealed sections and draws legs solid", () => {
    const reduced = reducedMotion();
    expect(decls(rule(".tp-live-ring", reduced)).animation).toBe("none !important");
    expect(decls(rule(".tp-reveal", reduced)).opacity).toBe("1");
    expect(decls(rule(".tp-leg-draw", reduced))).toMatchObject({ animation: "none", "stroke-dasharray": "none" });
  });
  it("reduced motion settles every delayed share entrance at once", () => {
    const settled: string[] = [];
    for (const block of reducedMotion()) {
      block.walkRules((r) => { if (decls(r)["animation-delay"] === "0s !important") settled.push(...selectorsOf(r)); });
    }
    for (const cls of [".tp-share-polaroid-in", ".tp-progress-fill", "[data-revealed] .tp-strike", ".tp-reveal[data-revealed]", ".tp-tag-drop"]) {
      expect(settled).toContain(cls);
    }
  });
  it("entrances inside an armed, unrevealed section wait for the reveal", () => {
    const armed = rule(".tp-reveal[data-reveal-armed]:not([data-revealed]) :is(.tp-leg-draw, .tp-pin-pop, .tp-tag-drop)");
    expect(decls(armed)).toEqual({ "animation-play-state": "paused" });
    expect(allSelectors().filter((s) => s.startsWith(".tp-reveal:not([data-revealed]) :is("))).toEqual([]);
  });
  it("only a section JS hasn't armed unhides after 3s", () => {
    expect(decls(rule("to", keyframes("tp-unhide")))).toEqual({ opacity: "1" });
    expect(decls(rule(".tp-reveal:not([data-revealed]):not([data-reveal-armed])"))).toEqual({ animation: "tp-unhide 0s 3s forwards" });
    expect(findRules(".tp-reveal:not([data-revealed])").filter((r) => decls(r).animation?.startsWith("tp-unhide"))).toEqual([]);
  });
  it("a pending countdown hides its digits until the count starts, with the same failsafe", () => {
    expect(decls(rule("[data-count-pending] > [aria-hidden]"))).toEqual({ opacity: "0", animation: "tp-unhide 0s 3s forwards" });
  });
  it("a strike is drawn at rest and only animates once its section has revealed (S6)", () => {
    const strike = utility("tp-strike");
    expect(decls(strike).background).toContain("100% 2px");
    expect(declValues(/animation/, strike)).toEqual([]);
    expect(decls(rule("[data-revealed] .tp-strike"))).toEqual({
      animation: "tp-strike var(--dur-base) var(--ease-pop) backwards",
      "animation-delay": "calc(var(--tp-i, 0) * 60ms)",
    });
    expect(allSelectors().filter((s) => /:is\([^)]*tp-strike/.test(s))).toEqual([]);
  });
});
