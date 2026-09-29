import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CollageCards, PhoneSampleCards, entrance } from "./sample-cards";

describe("entrance()", () => {
  it("sets tilt and index, and an explicit delay only when given", () => {
    const a = entrance(-5, 0) as Record<string, unknown>;
    expect(a["--tp-tilt"]).toBe("-5deg");
    expect(a["--tp-i"]).toBe(0);
    expect(a["--tp-delay"]).toBeUndefined();
    const b = entrance(3, 1, 520) as Record<string, unknown>;
    expect(b["--tp-delay"]).toBe("520ms");
  });
});

function pieces(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-piece]"));
}

describe("CollageCards (spec collage §1.3)", () => {
  it("renders nine decorative pieces, each tilted and animated, at uneven delays", () => {
    const { getByTestId } = render(<CollageCards />);
    const root = getByTestId("collage-cards");
    expect(root).toHaveAttribute("aria-hidden", "true");
    const ps = pieces(root);
    expect(ps).toHaveLength(9);
    for (const p of ps) {
      expect(p.className).toContain("tp-card-in");
      expect(p.style.getPropertyValue("--tp-tilt")).toMatch(/deg$/);
      expect(p.style.getPropertyValue("--tp-delay")).toMatch(/ms$/);
      expect(p.className).not.toMatch(/(^|\s)rotate-/);
    }
    const delays = ps.map((p) => parseInt(p.style.getPropertyValue("--tp-delay"), 10)).sort((a, b) => a - b);
    expect(delays[0]).toBeGreaterThanOrEqual(250);
    const steps = new Set(delays.slice(1).map((d, i) => d - delays[i]));
    expect(steps.size).toBeGreaterThan(2); // irregular, not a fixed beat
    expect(root.querySelector("button, a, input, [tabindex]")).toBeNull();
  });
  it("carries the agreed content and no stay/hotel wording", () => {
    const { getByTestId } = render(<CollageCards />);
    const t = getByTestId("collage-cards").textContent!;
    for (const s of ["Japan in Autumn", "26", "Zz Machiya near Gion", "Odawara 11:12", "Jess forked", "Tue 14 Oct", "Fushimi Inari", "21°", "¥2,400", "Jess owes you ¥1,200", "Wishlist", "Naoshima", "Tokyo", "Hakone", "Osaka"]) {
      expect(t).toContain(s);
    }
    expect(t).not.toMatch(/\bhotel\b|\bstay\b|staying/i);
  });
});

describe("PhoneSampleCards (spec collage §1.4)", () => {
  it("renders eight clipped pieces including the day plan, money, weather and wishlist cards", () => {
    const { getByTestId } = render(<PhoneSampleCards />);
    const root = getByTestId("sample-cards-phone");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toMatch(/overflow-hidden/);
    expect(root.className).toMatch(/flex-1/);
    expect(root.className).toMatch(/min-h-0/);
    expect(pieces(root)).toHaveLength(8);
    expect(root.textContent).toContain("Fushimi Inari");
    expect(root.textContent).toContain("¥2,400");
    expect(root.textContent).toContain("21°");
    expect(root.textContent).toContain("Naoshima");
    for (const p of pieces(root)) expect(p.style.getPropertyValue("--tp-delay")).toMatch(/ms$/);
  });
  it("nothing is focusable and no forbidden words appear", () => {
    const { getByTestId } = render(<PhoneSampleCards />);
    const root = getByTestId("sample-cards-phone");
    expect(root.querySelector("button, a, input, [tabindex]")).toBeNull();
    expect(root.textContent).not.toMatch(/\bhotel\b|\bstay\b|staying|free for up to/i);
  });
});
