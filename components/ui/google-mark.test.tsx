import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GoogleMark } from "./google-mark";

describe("GoogleMark (spec 2026-10-01 §B)", () => {
  it("is an 18px decorative SVG in Google's four colours, never recoloured", () => {
    const { container } = render(<GoogleMark />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("height", "18");
    expect(svg).toHaveAttribute("data-testid", "google-mark");
    const fills = Array.from(svg.querySelectorAll("path")).map((p) => p.getAttribute("fill"));
    expect(fills).toEqual(["#EA4335", "#4285F4", "#FBBC05", "#34A853"]);
    expect(svg.outerHTML).not.toContain("currentColor");
  });
  it("takes a className for layout only", () => {
    const { container } = render(<GoogleMark className="mr-1" />);
    expect(container.querySelector("svg")!.className.baseVal).toContain("shrink-0");
    expect(container.querySelector("svg")!.className.baseVal).toContain("mr-1");
  });
});
