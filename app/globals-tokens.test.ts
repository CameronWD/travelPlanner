import { describe, expect, it } from "vitest";
import { atRule, decls, lightTheme, rule, utility } from "@/test/helpers/css";

describe("layout primitives in globals.css", () => {
  it("defines the three shared page widths as container tokens", () => {
    expect(decls(atRule("theme", "inline"))).toMatchObject({
      "--container-page-wide": "100rem",
      "--container-reading": "38em",
      "--container-dialog": "30rem",
    });
  });

  it("defines a tap-target utility that expands the hit area to 44px", () => {
    const tap = utility("tap-target");
    expect(decls(tap).position).toBe("relative");
    expect(decls(rule("&::before", tap))).toMatchObject({ "min-width": "2.75rem", "min-height": "2.75rem" });
  });

  it("defines the range band colour once, from coral (NEW_TRIP.md §3)", () => {
    expect(decls(atRule("theme", "inline"))["--color-range"]).toBe("hsl(var(--coral) / 0.25)");
  });

  it("publishes the Feedback launcher's footprint as --tp-fab-clearance beside --tp-tab-bar-h (spec 2026-10-12 W2)", () => {
    // size-11 button (2.75rem) + the gap it keeps: 1.5rem above the tab bar below md, 1rem corner inset from md.
    expect(decls(rule(":root"))).toMatchObject({ "--tp-tab-bar-h": "4.75rem", "--tp-fab-clearance": "4.25rem" });
    expect(decls(rule(":root", atRule("media", "(min-width: 48rem)")))["--tp-fab-clearance"]).toBe("3.75rem");
  });

  it("switches native controls to the dark scheme wherever the dark palette applies (LA-143)", () => {
    expect(decls(rule(".dark"))["color-scheme"]).toBe("dark");
  });

  it("locks native controls to the light scheme on light-locked surfaces ([data-theme=\"light\"])", () => {
    expect(decls(lightTheme())["color-scheme"]).toBe("light");
  });
});
