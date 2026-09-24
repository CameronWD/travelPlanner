import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import GlobalError from "@/app/global-error";

describe("global-error", () => {
  it("renders a retry that calls reset", () => {
    const reset = vi.fn();
    render(<GlobalError error={Object.assign(new Error("x"), { digest: "d" })} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalled();
  });

  it("has no raw hex and no emoji (colours come from its own CSS variables)", () => {
    const src = readFileSync("app/global-error.tsx", "utf8");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  // `inherit` is a CSS-wide keyword: it can't sit inside the `font` shorthand
  // ("800 30px/1 inherit" is invalid, so the whole declaration is dropped).
  it("never puts `inherit` inside a font shorthand", () => {
    const src = readFileSync("app/global-error.tsx", "utf8");
    expect(src).not.toMatch(/font:\s*["']?[^;"'}]*\binherit\b/);
  });
});

// The boundary replaces the whole document, so it re-declares the tokens it
// uses. ADR 0060 exempts it on condition that each triple equals globals.css.
describe("global-error CSS variables mirror globals.css", () => {
  const src = readFileSync("app/global-error.tsx", "utf8");
  const globals = readFileSync("app/globals.css", "utf8");
  const block = (css: string, opener: string) => {
    const start = css.indexOf(opener);
    if (start < 0) throw new Error(`${opener} not found`);
    return css.slice(start, css.indexOf("}", start));
  };
  const vars = (css: string) =>
    Object.fromEntries([...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

  const localLight = vars(block(src, ":root{"));
  const localDark = vars(block(src.slice(src.indexOf("prefers-color-scheme: dark")), ":root{"));
  const rootLight = vars(block(globals, ":root {"));
  const rootDark = vars(block(globals, ".dark {"));

  it("declares the same set of variables for light and dark", () => {
    expect(Object.keys(localLight).length).toBeGreaterThan(0);
    expect(Object.keys(localDark).sort()).toEqual(Object.keys(localLight).sort());
  });

  it.each(Object.keys(localLight))("light --%s === globals.css :root", (name) => {
    expect(localLight[name]).toBe(rootLight[name]);
  });

  it.each(Object.keys(localDark))("dark --%s === globals.css .dark", (name) => {
    expect(localDark[name]).toBe(rootDark[name]);
  });
});
