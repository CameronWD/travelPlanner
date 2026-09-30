import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("Landing entrance motion (spec 2026-09-29 §1.4)", () => {
  it("defines the tilted-card keyframe from an overshot tilt, and the class rests at --tp-tilt", () => {
    expect(css).toMatch(/@keyframes tp-card-in \{ from \{ opacity: 0; transform: translateY\(24px\) rotate\(calc\(var\(--tp-tilt\) \* 1\.8\)\); \} \}/);
    expect(css).toMatch(/\.tp-card-in \{[^}]*transform: rotate\(var\(--tp-tilt\)\);[^}]*\}/);
  });
  it("staggers by --tp-i at 80ms on --ease-bounce and fills backwards only, so :hover can move the card afterwards", () => {
    expect(css).toMatch(/\.tp-card-in \{[^}]*animation: tp-card-in 420ms var\(--ease-bounce\) backwards;[^}]*animation-delay: var\(--tp-delay, calc\(var\(--tp-i\) \* 80ms\)\);[^}]*\}/);
    expect(css).toMatch(/\.tp-card-pop-in \{[^}]*animation: tp-zoom-in 320ms var\(--ease-bounce\) backwards;[^}]*animation-delay: var\(--tp-delay, calc\(var\(--tp-i\) \* 80ms\)\);[^}]*\}/);
    expect(css).not.toMatch(/tp-card-in 420ms var\(--ease-bounce\) both/);
  });
  it("lifts and straightens a card on hover, only on hover-capable devices without reduced motion (Minor #4)", () => {
    expect(css).toMatch(/@media \(hover: hover\) and \(prefers-reduced-motion: no-preference\) \{\s*\.tp-card-in:hover \{ transform: translateY\(-4px\) rotate\(calc\(var\(--tp-tilt\) \* 0\.8\)\); \}\s*\}/);
  });
  it("zeroes the stagger delay under prefers-reduced-motion (Review Focus 1)", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.tp-card-in, \.tp-card-pop-in, \.tp-pin-pop, \.tp-drop-in, \.tp-band-fill \{ animation-delay: 0s !important; \}\s*\}/);
  });
});
