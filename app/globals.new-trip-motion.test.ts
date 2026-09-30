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
});
