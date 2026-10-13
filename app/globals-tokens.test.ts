import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

describe("layout primitives in globals.css", () => {
  it("defines the three shared page widths as container tokens", () => {
    expect(css).toMatch(/--container-page-wide:\s*100rem;/);
    expect(css).toMatch(/--container-reading:\s*38em;/);
    expect(css).toMatch(/--container-dialog:\s*30rem;/);
  });

  it("defines a tap-target utility that expands the hit area to 44px", () => {
    const block = css.slice(css.indexOf("@utility tap-target"));
    expect(block).toMatch(/position:\s*relative/);
    expect(block).toMatch(/min-width:\s*2\.75rem/);
    expect(block).toMatch(/min-height:\s*2\.75rem/);
  });

  it("defines the range band colour once, from coral (NEW_TRIP.md §3)", () => {
    expect(css).toMatch(/--color-range:\s*hsl\(var\(--coral\) \/ 0\.25\);/);
  });

  it("publishes the Feedback launcher's footprint as --tp-fab-clearance beside --tp-tab-bar-h (spec 2026-10-12 W2)", () => {
    // size-11 button (2.75rem) + the gap it keeps: 1.5rem above the tab bar below md, 1rem corner inset from md.
    expect(css).toMatch(/:root\s*\{[^}]*--tp-tab-bar-h:\s*4\.75rem;[^}]*--tp-fab-clearance:\s*4\.25rem;/);
    expect(css).toMatch(/@media \(min-width: 48rem\)\s*\{\s*:root\s*\{\s*--tp-fab-clearance:\s*3\.75rem;/);
  });

  it("switches native controls to the dark scheme wherever the dark palette applies (LA-143)", () => {
    const start = css.indexOf("\n.dark {");
    const darkBlock = css.slice(start, css.indexOf("\n}", start));
    expect(darkBlock).toMatch(/color-scheme:\s*dark;/);
  });
});
