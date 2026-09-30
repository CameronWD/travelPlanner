import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");
const reducedDelayReset = () => css.slice(css.indexOf(".tp-card-in, .tp-card-pop-in"), css.indexOf("animation-delay: 0s !important"));

describe("New trip + Globe arrival motion utilities", () => {
  it("defines the Globe pin pop and settles its delay under reduced motion", () => {
    expect(css).toMatch(/@keyframes tp-pin-pop/);
    expect(css).toMatch(/@utility tp-pin-pop \{ animation: tp-pin-pop var\(--dur-slow\) var\(--ease-bounce\) both; \}/);
    expect(reducedDelayReset()).toMatch(/\.tp-pin-pop/);
  });

  it("defines the flow's bar drop and card drop-in (MOTION N1)", () => {
    expect(css).toMatch(/@keyframes tp-bar-drop \{ from \{ transform: translateY\(-84px\); \} \}/);
    expect(css).toMatch(/@keyframes tp-drop-in \{ from \{ opacity: 0; transform: translateY\(24px\) rotate\(-4deg\) scale\(0\.96\); \} \}/);
    expect(css).toMatch(/@utility tp-bar-drop \{ animation: tp-bar-drop var\(--dur-slow\) var\(--ease-pop\) both; \}/);
    expect(css).toMatch(/@utility tp-drop-in \{ animation: tp-drop-in 420ms var\(--ease-bounce\) 120ms both; \}/);
    expect(reducedDelayReset()).toMatch(/\.tp-drop-in/);
  });

  it("defines the stamp thunk and the range band fill (MOTION N6, N8)", () => {
    expect(css).toMatch(/@keyframes tp-stamp-thunk/);
    expect(css).toMatch(/@utility tp-stamp-thunk \{ animation: tp-stamp-thunk 360ms var\(--ease-bounce\) both; \}/);
    expect(css).toMatch(/@keyframes tp-band-fill \{ from \{ transform: scaleX\(0\); \} \}/);
    expect(css).toMatch(/@utility tp-band-fill \{ animation: tp-band-fill var\(--dur-base\) var\(--ease-pop\) both; \}/);
    expect(reducedDelayReset()).toMatch(/\.tp-band-fill/);
  });
});
