import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const APP = path.resolve(__dirname, "(app)");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const files = (basename: string) => walk(APP).filter((f) => path.basename(f) === basename).map((f) => path.relative(APP, f)).sort();

/**
 * ADR 0063: a loading.tsx anywhere between the shared shell and a changing
 * segment replaces the page with a skeleton on every sibling switch. The one
 * boundary that keeps its skeleton is entering/switching a Trip.
 */
describe("route conventions under app/(app) (ADR 0063)", () => {
  it("has exactly one loading.tsx — trips/loading.tsx", () => {
    expect(files("loading.tsx")).toEqual(["trips/loading.tsx"]);
  });
  it("has no template.tsx (ADR 0063 amends ADR 0006: SectionTransition replaces the remount-and-fade)", () => {
    expect(files("template.tsx")).toEqual([]);
  });
});

describe("New trip is a focus page (spec C6)", () => {
  it("lives in the (focus) group, outside the app shell", () => {
    expect(existsSync(path.resolve(__dirname, "(app)/trips/new"))).toBe(false);
    expect(existsSync(path.resolve(__dirname, "(focus)/trips/new/page.tsx"))).toBe(true);
  });
  it("(focus) has no loading.tsx or template.tsx (ADR 0063)", () => {
    const FOCUS = path.resolve(__dirname, "(focus)");
    const all = walk(FOCUS).map((f) => path.basename(f));
    expect(all).not.toContain("loading.tsx");
    expect(all).not.toContain("template.tsx");
  });
});
