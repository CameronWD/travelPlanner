import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("Feedback launcher attention pulse (spec 2026-10-01 §G)", () => {
  it("defines a two-beat scale pulse on the bounce ease", () => {
    expect(css).toMatch(/@keyframes tp-attention \{ 0%, 100% \{ transform: scale\(1\); \} 50% \{ transform: scale\(1\.12\); \} \}/);
    expect(css).toMatch(/@utility tp-attention \{ animation: tp-attention 360ms var\(--ease-bounce\) 2; \}/);
  });
  it("is nothing at all under reduced motion — a pointer, not information", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.tp-attention \{ animation: none !important; \}\s*\}/);
  });
});
