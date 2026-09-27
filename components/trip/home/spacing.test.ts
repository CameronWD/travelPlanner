import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard for spec §E / feedback cmuhvvx2a ("The spacing between cards on the
 * home screen isn't consistent?"): every Home phase uses ONE card-spacing
 * rule — 14px gaps on phones, 18px at `lg` (≥1024px), rows and columns
 * alike — via the shared components/trip/home/spacing.ts constants, not
 * ad-hoc `gap-*`/`mb-*` values.
 *
 * Reads the raw source of the four phase components and the trip Home page,
 * and asserts none of them still carries: a bare `gap-3` (12px) or `gap-6`
 * (24px), a `gap-3.5` with no paired `lg:gap-[18px]`, or an `mb-2` on the
 * cover band — inside a layout container (a `className` whose classes
 * include `flex-col` or `grid`, i.e. a stack/grid arranging cards or tiles).
 */

const PHASE_DIR = __dirname;
const PHASE_FILES = ["phase-sketching.tsx", "phase-planning.tsx", "phase-travelling.tsx", "phase-past.tsx"];
const PAGE_FILE = join(__dirname, "..", "..", "..", "app", "(app)", "trips", "[tripId]", "page.tsx");

/** Every `className="..."` / `className={\`...\`}` value in the source that
 * arranges a stack or grid of cards/tiles (contains `flex-col` or `grid`). */
function layoutContainerClassLists(source: string): string[] {
  const classNameRe = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = classNameRe.exec(source))) {
    const classes = match[1] ?? match[2] ?? "";
    const tokens = classes.split(/\s+/).filter(Boolean);
    if (tokens.includes("flex-col") || tokens.includes("grid")) {
      results.push(classes);
    }
  }
  return results;
}

/** Same check, but over an exported/local `const X = "..."` string whose
 * value is itself later interpolated into a layout container's className
 * (the phase files' `*_GRID_CLASS`/`*_ROW_CLASS` constants). */
function namedClassConstants(source: string): string[] {
  const constRe = /const\s+[A-Z][A-Z0-9_]*\s*=\s*(?:"([^"]*)"|`([^`]*)`)/g;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = constRe.exec(source))) {
    const classes = match[1] ?? match[2] ?? "";
    const tokens = classes.split(/\s+/).filter(Boolean);
    if (tokens.includes("flex-col") || tokens.includes("grid")) {
      results.push(classes);
    }
  }
  return results;
}

function assertOneSpacingRule(classes: string, label: string) {
  const tokens = classes.split(/\s+/).filter(Boolean);
  expect(tokens, `${label}: bare "gap-3" (12px) in "${classes}"`).not.toContain("gap-3");
  expect(tokens, `${label}: bare "gap-6" (24px) in "${classes}"`).not.toContain("gap-6");
  if (tokens.includes("gap-3.5")) {
    expect(
      tokens.some((t) => t === "lg:gap-[18px]"),
      `${label}: "gap-3.5" without the paired "lg:gap-[18px]" in "${classes}"`,
    ).toBe(true);
  }
  expect(tokens, `${label}: ad-hoc "mb-2" in "${classes}"`).not.toContain("mb-2");
}

describe("Home card spacing — one rule everywhere (spec §E)", () => {
  for (const file of PHASE_FILES) {
    it(`${file} has no ad-hoc gaps in its layout containers`, () => {
      const source = readFileSync(join(PHASE_DIR, file), "utf8");
      const found = [...layoutContainerClassLists(source), ...namedClassConstants(source)];
      expect(found.length).toBeGreaterThan(0); // guard against a rewrite that breaks the regex itself
      for (const classes of found) assertOneSpacingRule(classes, file);
    });
  }

  it("the trip Home page has no ad-hoc gaps or cover margin in its layout containers", () => {
    const source = readFileSync(PAGE_FILE, "utf8");
    const found = layoutContainerClassLists(source);
    expect(found.length).toBeGreaterThan(0);
    for (const classes of found) assertOneSpacingRule(classes, "page.tsx");
  });
});
