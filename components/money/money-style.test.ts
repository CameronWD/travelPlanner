import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..", "..");
const files = [
  ...readdirSync(path.join(root, "components", "money"))
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    .map((f) => path.join("components", "money", f)),
  "components/ui/page-header.tsx",
  "components/trip/trip-header-trailing.tsx",
  "app/(app)/trips/[tripId]/budget/page.tsx",
];

describe("Money and PageHeader use the hard-edged kit only", () => {
  it.each(files)("%s has no soft styles, raw hex, island or off-scale radii", (file) => {
    const src = readFileSync(path.join(root, file), "utf8");
    expect(src).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
    expect(src).not.toMatch(/["'`\s(]#[0-9a-fA-F]{3,8}["'`\s)]/);
    expect(src).not.toMatch(/\bisland\b/);
    expect(src).not.toMatch(/rounded-2xl|rounded-3xl/);
  });
});
