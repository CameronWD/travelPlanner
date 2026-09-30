import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

/** Every `@media (prefers-reduced-motion: reduce) { … }` block's body, braces balanced. */
function reducedBlocks(src: string): string[] {
  const out: string[] = [];
  const re = /@media \(prefers-reduced-motion: reduce\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    out.push(src.slice(start, i - 1));
  }
  return out;
}
const reduced = reducedBlocks(css).join("\n");

describe("share motion (MOTION.md S1–S10)", () => {
  it.each(["tp-share-hero-in", "tp-share-polaroid-in", "tp-live-ring", "tp-progress-fill", "tp-strike", "tp-reveal", "tp-leg-draw", "tp-tag-drop"])(
    "defines %s",
    (name) => {
      expect(css).toContain(name);
    },
  );
  it("only the live ring loops (S2)", () => {
    const infinite = css.match(/animation:[^;]*infinite[^;]*;/g) ?? [];
    const shareInfinite = infinite.filter((a) => /tp-(share|live|progress|strike|reveal|leg|tag)/.test(a));
    expect(shareInfinite).toHaveLength(1);
    expect(shareInfinite[0]).toContain("tp-live-ring");
  });
  it("hero drop-in is 420ms bounce; progress fill is 700ms pop after 200ms", () => {
    expect(css).toMatch(/tp-share-hero-in[^;]*420ms var\(--ease-bounce\)/);
    expect(css).toMatch(/tp-progress-fill[^;]*700ms var\(--ease-pop\) 200ms/);
  });
  it("reduced motion stops the ring, shows unrevealed sections and draws legs solid", () => {
    expect(reduced).toMatch(/\.tp-live-ring\s*\{\s*animation: none !important;/);
    expect(reduced).toMatch(/\.tp-reveal\s*\{\s*opacity: 1;/);
    expect(reduced).toMatch(/\.tp-leg-draw\s*\{\s*animation: none;\s*stroke-dasharray: none;/);
  });
  it("reduced motion settles every delayed share entrance at once", () => {
    const rule = reduced.match(/([^{}]*)\{\s*animation-delay: 0s !important;\s*\}/g) ?? [];
    const selectors = rule.join(" ");
    for (const cls of [".tp-share-polaroid-in", ".tp-progress-fill", ".tp-strike", ".tp-reveal[data-revealed]", ".tp-tag-drop"]) {
      expect(selectors).toContain(cls);
    }
  });
});
