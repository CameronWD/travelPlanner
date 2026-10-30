import { describe, it, expect } from "vitest";
import { decls, rule, mentions, allSelectors } from "@/test/helpers/css";

const S = ".tp-map .gm-style";
const CLOSE = `${S} .gm-style-iw-chr button.gm-ui-hover-effect`;

describe("Google InfoWindow shell", () => {
  it("takes the card surface, ink outline, radius and hard shadow from tokens", () => {
    const d = decls(rule(`${S} .gm-style-iw-c`));
    expect(d.background).toBe("hsl(var(--card))");
    expect(d.color).toBe("hsl(var(--foreground))");
    expect(d.border).toBe("2px solid hsl(var(--border))");
    expect(d["border-radius"]).toBe("var(--radius-md)");
    expect(d["box-shadow"]).toBe("var(--shadow-1)");
  });
  it("colours the content with the foreground token", () => {
    expect(decls(rule(`${S} .gm-style-iw-d`)).color).toBe("hsl(var(--foreground))");
  });
  it("fills the tail with the card and casts a clip-safe hard shadow from its container", () => {
    expect(decls(rule(`${S} .gm-style-iw-tc::after`)).background).toBe("hsl(var(--card))");
    expect(decls(rule(`${S} .gm-style-iw-tc`)).filter).toBe("drop-shadow(3px 3px 0 hsl(var(--shadow-ink)))");
  });
  it("themes the close button, its hover and its focus ring", () => {
    expect(decls(rule(CLOSE)).color).toBe("hsl(var(--muted-foreground))");
    expect(decls(rule(`${CLOSE} > span`))["background-color"]).toBe("hsl(var(--muted-foreground))");
    expect(decls(rule(`${CLOSE}:hover > span`))["background-color"]).toBe("hsl(var(--foreground))");
    expect(decls(rule(`${CLOSE}:focus-visible`)).outline).toContain("hsl(var(--ring))");
  });
  it("every InfoWindow rule outranks Google's own .gm-style rules", () => {
    const iw = allSelectors().filter((s) => s.includes("gm-style-iw"));
    expect(iw.length).toBeGreaterThan(0);
    for (const s of iw) expect(s.startsWith(`${S} `)).toBe(true);
  });
  it("no longer carries Leaflet rules", () => {
    expect(mentions("leaflet")).toBe(false);
  });
});
