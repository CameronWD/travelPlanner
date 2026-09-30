import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OG_COLOURS, ShareOgCard } from "./og-card";

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

describe("ShareOgCard", () => {
  const sketch = { points: [{ x: 10, y: 10 }, { x: 90, y: 120 }], vbH: 133 };

  it("draws the coral hero with the name, sub line and a polaroid polyline", () => {
    const html = renderToStaticMarkup(
      ShareOgCard({ name: "Christmas in Europe", subLine: "Dec 2026 – Jan 2027", sketch: { ...sketch, solid: true } }),
    );
    expect(html).toContain("Christmas in Europe");
    expect(html).toContain("Dec 2026 – Jan 2027");
    expect(html).toContain("SHARED TRIP");
    expect(html).toContain("<polyline");
    expect(html).toContain('points="10,10 90,120"');
    expect(html).not.toContain("stroke-dasharray");
    expect(html.toLowerCase()).toContain(OG_COLOURS.coral.toLowerCase());
  });

  it("dashes the sketch before the trip is over", () => {
    const html = renderToStaticMarkup(ShareOgCard({ name: "X", subLine: "Y", sketch: { ...sketch, solid: false } }));
    expect(html).toContain("stroke-dasharray");
  });

  it("falls back to the Mark when there is no sketch", () => {
    const html = renderToStaticMarkup(ShareOgCard({ name: "X", subLine: "Y", sketch: null }));
    expect(html).not.toContain("<polyline");
    expect(html).toContain('viewBox="0 0 48 48"');
  });
});
