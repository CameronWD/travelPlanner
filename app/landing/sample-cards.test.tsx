import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DesktopSampleCards, PhoneSampleCards, entrance } from "./sample-cards";

describe("SampleCards (spec 2026-09-29 §1.1, §1.2, D3)", () => {
  it("entrance() yields the two custom properties the CSS reads", () => {
    expect(entrance(-5, 2)).toEqual({ "--tp-tilt": "-5deg", "--tp-i": 2 });
  });
  it("desktop: four kit cards with the kit copy, each animated with its tilt and stagger index", () => {
    render(<DesktopSampleCards />);
    const box = screen.getByTestId("sample-cards-desktop");
    expect(box).toHaveAttribute("aria-hidden", "true");
    expect(box).toHaveTextContent("Planning");
    expect(box).toHaveTextContent("Japan in Autumn");
    expect(box).toHaveTextContent("26");
    expect(box).toHaveTextContent("Kyoto · 4 nights");
    expect(box).toHaveTextContent("Zz Machiya near Gion");
    expect(box).toHaveTextContent("paid ✓");
    expect(box).toHaveTextContent("→ Shinkansen · Odawara 11:12");
    expect(box).toHaveTextContent("JM");
    expect(box).toHaveTextContent("AL");
    expect(box).toHaveTextContent(/Jess forked/);
    const animated = Array.from(box.querySelectorAll(".tp-card-in")) as HTMLElement[];
    expect(animated).toHaveLength(4);
    expect(animated.map((el) => el.style.getPropertyValue("--tp-tilt"))).toEqual(["-5deg", "3deg", "-7deg", "6deg"]);
    expect(animated.map((el) => el.style.getPropertyValue("--tp-i"))).toEqual(["0", "1", "2", "3"]);
    for (const el of animated) expect(el.className).not.toMatch(/(^|\s)-?rotate-/);
  });
  it("desktop: the box is the kit's fixed width, scaled down below 1280px (Important #1)", () => {
    render(<DesktopSampleCards />);
    const box = screen.getByTestId("sample-cards-desktop");
    expect(box.className).toContain("w-[744px]");
    expect(box.className).toContain("origin-bottom-left");
    expect(box.className).toContain("lg:scale-[.66]");
    expect(box.className).toContain("min-[1152px]:scale-[.82]");
    expect(box.className).toContain("min-[1280px]:scale-100");
  });
  it("desktop: the teal card is not hidden below xl any more", () => {
    render(<DesktopSampleCards />);
    const teal = screen.getByText(/Jess forked/).closest(".tp-card-in") as HTMLElement;
    expect(teal.className).not.toContain("hidden");
    expect(teal.className).not.toContain("xl:block");
  });
  it("phone: the mobile kit's four pieces, including the teal 'let's go' chip", () => {
    render(<PhoneSampleCards />);
    const box = screen.getByTestId("sample-cards-phone");
    expect(box).toHaveAttribute("aria-hidden", "true");
    expect(box).toHaveTextContent("Zz Machiya Gion ✓");
    expect(box).toHaveTextContent("Kyoto · 4 nights");
    expect(box).toHaveTextContent("→ Shinkansen · 11:12");
    expect(box).toHaveTextContent("let's go");
    const animated = Array.from(box.querySelectorAll(".tp-card-in")) as HTMLElement[];
    expect(animated.map((el) => el.style.getPropertyValue("--tp-tilt"))).toEqual(["-4deg", "5deg", "-8deg", "6deg"]);
  });
  it("nothing in either set is focusable (Review Focus 4) and no forbidden words appear", () => {
    const { container } = render(<><DesktopSampleCards /><PhoneSampleCards /></>);
    expect(container.querySelector("button, a, input, [tabindex]")).toBeNull();
    expect(container.textContent).not.toMatch(/\bhotel\b|\bstay\b|staying|free for up to/i);
  });
});
