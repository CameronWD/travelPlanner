import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const DIR = join(process.cwd(), "app/share/[token]");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe("share page style bans (README ground rules)", () => {
  it.each(files(DIR))("%s has no banned classes and no raw hex", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("share motion client components are covered by the bans (Task 16)", () => {
  it.each(["share-reveal.tsx", "pending-link.tsx", "share-countdown.tsx"])("%s is scanned and clean", (name) => {
    const file = join(DIR, name);
    expect(files(DIR)).toContain(file);
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/shadow-soft-lg|shadow-soft|border-border\/70|bg-card\/40/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
