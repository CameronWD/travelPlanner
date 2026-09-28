import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoverRouteSketch } from "./cover-route-sketch";
import { sketchModel } from "@/lib/trips/route-sketch";

const stops = [
  { id: "b", name: "Bali", lat: -8.65, lng: 115.13, nights: 4 },
  { id: "l", name: "London", lat: 51.5, lng: -0.12, nights: 5 },
  { id: "p", name: "Paris", lat: 48.85, lng: 2.35, nights: 4 },
  { id: "r", name: "Rome", lat: 41.9, lng: 12.5, nights: 6 },
];

describe("CoverRouteSketch", () => {
  it("draws a polyline through every point, dots, and the edge chip", () => {
    const model = sketchModel(stops, { w: 100, h: 133, pad: 0.12 })!;
    const { container } = render(<CoverRouteSketch model={model} size="hero" hue="coral" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    const poly = container.querySelector("polyline")!;
    expect(poly.getAttribute("points")!.split(" ")).toHaveLength(3);
    expect(container.querySelectorAll("[data-dot]")).toHaveLength(3);
    expect(container.querySelector("[data-dot='first']")).not.toBeNull();
    expect(container.querySelector("[data-dot='last']")).not.toBeNull();
    expect(screen.getByText("+ Bali")).toBeInTheDocument();
  });
  it("small size hides the chip when the box is under 80px", () => {
    const model = sketchModel(stops, { w: 100, h: 100, pad: 0.12 })!;
    render(<CoverRouteSketch model={model} size="small" hue="coral" boxPx={64} />);
    expect(screen.queryByText("+ Bali")).toBeNull();
  });
});
