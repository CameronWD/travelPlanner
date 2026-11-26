import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayRouteButtons } from "./day-route-buttons";
import type { DayMapPoint } from "@/lib/day-map";

const A: DayMapPoint = { kind: "item", id: "a", lat: 35.65, lng: 139.74, label: "Tower", order: 1 };
const B: DayMapPoint = { kind: "item", id: "b", lat: 35.7, lng: 139.8, label: "Dinner", order: 2 };

describe("DayRouteButtons", () => {
  it("renders two links styled as buttons", () => {
    render(<DayRouteButtons routePoints={[A, B]} />);
    expect(screen.getByText("Open today’s route in")).toBeInTheDocument();
    const google = screen.getByRole("link", { name: "Google Maps" });
    expect(google.getAttribute("href")).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
    expect(google).toHaveAttribute("target", "_blank");
    const apple = screen.getByRole("link", { name: "Apple Maps" });
    expect(apple.getAttribute("href")).toMatch(/^https:\/\/maps\.apple\.com\//);
    expect(google.className).toContain("min-h-11");
    expect(apple.className).toContain("min-h-11");
  });

  it("renders nothing with fewer than two points", () => {
    const { container } = render(<DayRouteButtons routePoints={[A]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
