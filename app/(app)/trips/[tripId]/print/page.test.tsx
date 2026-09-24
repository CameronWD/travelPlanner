import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// print/page.tsx is an async Server Component with many DB reads, and jsdom
// can't emulate print media — so this pins the restyle at the source level
// (Task 15: tokens only, print-appropriate, no dark-mode dependence).
const dir = join(process.cwd(), "app/(app)/trips/[tripId]/print");
const page = readFileSync(join(dir, "page.tsx"), "utf8");
const button = readFileSync(join(dir, "print-button.tsx"), "utf8");
const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

const RAW_PALETTE = /\b(bg|text|border)-(stone|slate|zinc|gray|amber|sky|emerald|violet|rose|indigo)-[0-9]/;

/** `--name: h s% l%` pairs declared in the first `:root {…}` block of globals.css (the light theme). */
function lightTokens(): Map<string, string> {
  const root = globals.slice(globals.indexOf(":root {"), globals.indexOf(".dark {"));
  const m = new Map<string, string>();
  for (const [, k, v] of root.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) m.set(k, v.trim());
  return m;
}

describe("Print view — tokens only (Task 15)", () => {
  it("uses no raw palette classes", () => {
    expect(page).not.toMatch(RAW_PALETTE);
    expect(button).not.toMatch(RAW_PALETTE);
  });

  it("uses no offset (hard) shadows", () => {
    expect(page).not.toMatch(/shadow-hard-|shadow-soft|shadow-cta/);
  });

  it("marks the printable root and keeps day / stop blocks whole across page breaks", () => {
    expect(page).toContain("data-print-root");
    expect(page).toMatch(/break-inside-avoid/);
  });

  it("prints in the light palette even when the app is in dark mode", () => {
    const style = page.slice(page.indexOf("@media print"), page.indexOf("`}</style>"));
    expect(style).toMatch(/html\.dark[^{]*\{[^}]*color-scheme:\s*light/);
    // Every token re-declared for print equals the light theme's value in globals.css.
    const light = lightTokens();
    const overrides = [...style.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)];
    expect(overrides.length).toBeGreaterThanOrEqual(6);
    for (const [, k, v] of overrides) expect(v.trim(), k).toBe(light.get(k));
    for (const k of ["--background", "--foreground", "--card", "--muted-foreground", "--border", "--border-soft"]) {
      expect(overrides.some(([, n]) => n === k), k).toBe(true);
    }
  });

  it("hides the trip layout's header block in print, so the trip name prints once", () => {
    const style = page.slice(page.indexOf("@media print"), page.indexOf("`}</style>"));
    const hide = style.slice(0, style.indexOf("display: none"));
    expect(hide).toContain("[data-trip-nav]");
    expect(hide).toContain("[data-trip-header]");
  });

  it("print button is the kit Button with the kit copy", () => {
    expect(button).toContain('from "@/components/ui/button"');
    expect(button).toContain("Print or save PDF");
  });
});
