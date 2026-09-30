import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const newTrip = readdirSync(__dirname)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test(-utils)?\.tsx?$/.test(f))
  .map((f) => path.join("components/new-trip", f));
const FILES = [
  ...newTrip,
  "components/ui/range-calendar.tsx",
  "components/ui/place-combobox.tsx",
  "components/ui/currency-row.tsx",
  "components/trips/trip-card-hero.tsx",
  "app/(focus)/layout.tsx",
  "app/(focus)/trips/new/page.tsx",
];

describe("New trip style bans", () => {
  it.each(FILES)("%s has no soft shadows, faint borders or card tints", (f) => {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    expect(src).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
  it.each(FILES)("%s has no raw hex colours", (f) => {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    expect(src).not.toMatch(/(?<![\w&])#[0-9a-fA-F]{3,8}\b/);
  });
});
