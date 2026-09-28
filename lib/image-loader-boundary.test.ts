import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `next/image` is a Client Component, so a `loader` FUNCTION can only be
 * handed to it from another Client Component — a Server Component passing
 * one fails React Server Component serialisation at request time ("Functions
 * cannot be passed directly to Client Components"). In production that
 * surfaces to the Traveller as React error #441 with no message (it took
 * down every trip Home with a cover photo on 2026-09-28). Tests in jsdom
 * never exercise RSC serialisation, so this guard pins the boundary
 * statically: any module that passes `loader={…}` to `next/image` must be a
 * `"use client"` module.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("next/image loader functions stay inside Client Components", () => {
  const root = join(__dirname, "..");
  const offenders = [...walk(join(root, "app")), ...walk(join(root, "components"))].filter((file) => {
    const src = readFileSync(file, "utf8");
    if (!src.includes('from "next/image"') || !/\bloader=\{/.test(src)) return false;
    return !/^\s*["']use client["']/.test(src);
  });

  it("finds no Server Component passing loader= to next/image", () => {
    expect(offenders.map((f) => f.replace(root + "/", ""))).toEqual([]);
  });
});
