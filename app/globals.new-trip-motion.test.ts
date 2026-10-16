import { describe, it, expect } from "vitest";
import { decls, findRules, keyframes, reducedMotion, rule, selectorsOf, utility } from "@/test/helpers/css";

/** Selectors of the reduced-motion rule that zeroes the entrance delays (the one that lists .tp-card-in). */
const reducedDelayReset = () =>
  findRules(".tp-card-in", reducedMotion())
    .filter((r) => decls(r)["animation-delay"] === "0s !important")
    .flatMap(selectorsOf);

describe("New trip + Globe arrival motion utilities", () => {
  it("defines the Globe pin pop and settles its delay under reduced motion", () => {
    expect(keyframes("tp-pin-pop").nodes?.length).toBeGreaterThan(0);
    expect(decls(utility("tp-pin-pop"))).toEqual({ animation: "tp-pin-pop var(--dur-slow) var(--ease-bounce) both" });
    expect(reducedDelayReset()).toContain(".tp-pin-pop");
  });

  it("defines the flow's bar drop and card drop-in (MOTION N1)", () => {
    expect(decls(rule("from", keyframes("tp-bar-drop")))).toEqual({ transform: "translateY(-84px)" });
    expect(decls(rule("from", keyframes("tp-drop-in")))).toEqual({ opacity: "0", transform: "translateY(24px) rotate(-4deg) scale(0.96)" });
    expect(decls(utility("tp-bar-drop"))).toEqual({ animation: "tp-bar-drop var(--dur-slow) var(--ease-pop) both" });
    expect(decls(utility("tp-drop-in"))).toEqual({ animation: "tp-drop-in 420ms var(--ease-bounce) 120ms both" });
    expect(reducedDelayReset()).toContain(".tp-drop-in");
  });

  it("defines the stamp thunk and the range band fill (MOTION N6, N8)", () => {
    expect(keyframes("tp-stamp-thunk").nodes?.length).toBeGreaterThan(0);
    expect(decls(utility("tp-stamp-thunk"))).toEqual({ animation: "tp-stamp-thunk 360ms var(--ease-bounce) both" });
    expect(decls(rule("from", keyframes("tp-band-fill")))).toEqual({ transform: "scaleX(0)" });
    expect(decls(utility("tp-band-fill"))).toEqual({ animation: "tp-band-fill var(--dur-base) var(--ease-pop) both" });
    expect(reducedDelayReset()).toContain(".tp-band-fill");
  });
});
