import { describe, it, expect } from "vitest";
import { decls, rule, mentions } from "@/test/helpers/css";

describe("Google InfoWindow shell", () => {
  it("takes the card surface, ink outline and foreground text from tokens", () => {
    const d = decls(rule(".tp-map .gm-style-iw-c"));
    expect(d.background).toBe("hsl(var(--card))");
    expect(d.color).toBe("hsl(var(--foreground))");
    expect(d.border).toBe("2px solid hsl(var(--border))");
  });
  it("themes the tail and the close button", () => {
    expect(decls(rule(".tp-map .gm-style-iw-tc::after")).background).toBe("hsl(var(--card))");
    expect(decls(rule(".tp-map .gm-style-iw-chr button.gm-ui-hover-effect")).color).toBe("hsl(var(--muted-foreground))");
    expect(decls(rule(".tp-map .gm-style-iw-chr button.gm-ui-hover-effect:focus-visible")).outline).toContain("hsl(var(--ring))");
  });
  it("no longer carries Leaflet rules", () => {
    expect(mentions("leaflet")).toBe(false);
  });
});
