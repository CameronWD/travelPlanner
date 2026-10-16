import { describe, it, expect } from "vitest";
import { decls, reducedMotion, rule, utility } from "@/test/helpers/css";

describe("globals.css Money utilities (MONEY.md §1)", () => {
  it("defines bg-unpaid-stripe as a card / teal-12% repeating stripe, from tokens", () => {
    const block = Object.values(decls(utility("bg-unpaid-stripe"))).join("; ");
    expect(block).toContain("repeating-linear-gradient");
    expect(block).toContain("hsl(var(--card))");
    expect(block).toContain("hsl(var(--teal) / 0.12)");
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("zeroes tp-rise-in's stagger delay under prefers-reduced-motion (Task 15 review MINOR 2)", () => {
    // The global reduced-motion rule shortens animation-duration but not
    // animation-delay, so the Money page's M1 stagger (inline
    // animation-delay: 60/120/180ms) would otherwise sit invisible for that
    // whole delay before its now-instant animation played.
    expect(decls(rule(".tp-rise-in", reducedMotion()))).toEqual({ "animation-delay": "0s !important" });
  });
});
