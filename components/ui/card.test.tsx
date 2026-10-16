import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Card } from "./card";
import { HUES } from "@/lib/hues";
import { decls, lightTheme, utility } from "@/test/helpers/css";

describe("Card hue tones", () => {
  it.each(HUES)("tone=hue-%s is an island on the solid hue with on-accent text", (h) => {
    const { container } = render(<Card tone={`hue-${h}` as const}>x</Card>);
    const cls = (container.firstChild as HTMLElement).className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["island", `bg-hue-${h}`, "text-on-accent"]));
  });
  it("existing tones are unchanged", () => {
    const { container } = render(<Card tone="sun">x</Card>);
    expect((container.firstChild as HTMLElement).className).toContain("island bg-sun");
  });
});

describe("island utility (app/globals.css)", () => {
  it("re-scopes --primary-foreground to the light-theme ink-button text, so a primary Button inside a toned Card reads light-on-ink in both themes", () => {
    const island = decls(utility("island"));
    const lightPrimaryFg = decls(lightTheme())["--primary-foreground"];
    expect(island["--primary"]).toBe("var(--on-accent)");
    expect(island["--primary-foreground"]).toBe(lightPrimaryFg);
  });
});
