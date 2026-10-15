import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { walkSources } from "@/test/helpers/walk-sources";

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
describe("next/image loader functions stay inside Client Components", () => {
  const offenders = [...walkSources("app", { skipTests: true }), ...walkSources("components", { skipTests: true })].filter((file) => {
    const src = readFileSync(file, "utf8");
    if (!src.includes('from "next/image"') || !/\bloader=\{/.test(src)) return false;
    return !/^\s*["']use client["']/.test(src);
  });

  it("finds no Server Component passing loader= to next/image", () => {
    expect(offenders).toEqual([]);
  });
});
