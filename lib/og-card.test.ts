import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { OG_COLOURS } from "./og-card";

// Satori can't read CSS variables, so og-card carries hex. ADR 0060 exempts it on condition that
// every value equals the globals.css token computed from its HSL triple — NOT the rounded hex
// comment beside it (those disagree; computing from them once turned 4.499 into 4.618).
function hslToHex(triple: string): string {
  const [h, s, l] = triple.trim().split(/\s+/).map((v) => parseFloat(v));
  const sat = s / 100, lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function rootToken(name: string): string {
  const css = readFileSync("app/globals.css", "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  const m = root.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token --${name} not found in :root`);
  return hslToHex(m[1]);
}

describe("OG_COLOURS mirror the light tokens", () => {
  it.each([
    ["paper", "background"], ["ink", "foreground"], ["muted", "muted-foreground"], ["card", "card"],
    ["coral", "coral"], ["sun", "sun"], ["teal", "teal"], ["lilac", "lilac"],
  ] as const)("%s === --%s", (key, token) => {
    expect(OG_COLOURS[key].toUpperCase()).toBe(rootToken(token));
  });
});
