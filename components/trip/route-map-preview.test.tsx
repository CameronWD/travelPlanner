import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RouteMapPreview } from "./route-map-preview";

const live = <div data-testid="live-map" />;

describe("RouteMapPreview", () => {
  it("shows the image and the button, not the live map, until tapped", () => {
    render(
      <RouteMapPreview imageUrl="https://img.test/m.png" alt="Route map of Alps" frameClassName="h-[200px]">
        {live}
      </RouteMapPreview>,
    );
    const img = screen.getByAltText("Route map of Alps");
    expect(img).toHaveAttribute("src", "https://img.test/m.png");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(screen.getByRole("button", { name: "Explore map" })).toBeInTheDocument();
    expect(screen.queryByTestId("live-map")).not.toBeInTheDocument();
  });

  it("swaps to the live map on tap", () => {
    render(
      <RouteMapPreview imageUrl="https://img.test/m.png" alt="Route map of Alps">
        {live}
      </RouteMapPreview>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Explore map" }));
    expect(screen.getByTestId("live-map")).toBeInTheDocument();
    expect(screen.queryByAltText("Route map of Alps")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explore map" })).not.toBeInTheDocument();
  });

  it("shows the live map at once without an image", () => {
    render(
      <RouteMapPreview imageUrl={null} alt="Route map of Alps">
        {live}
      </RouteMapPreview>,
    );
    expect(screen.getByTestId("live-map")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("moves focus to the live map wrapper after the tap", () => {
    render(
      <RouteMapPreview imageUrl="https://img.test/m.png" alt="Route map of Alps">
        {live}
      </RouteMapPreview>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Explore map" }));
    const wrapper = screen.getByRole("group", { name: "Route map" });
    expect(document.activeElement).toBe(wrapper);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("does not steal focus on first render without an image", () => {
    render(
      <RouteMapPreview imageUrl={null} alt="Route map of Alps">
        {live}
      </RouteMapPreview>,
    );
    expect(document.activeElement).toBe(document.body);
  });

  it("gives the image frame the live map's frame classes", () => {
    render(
      <RouteMapPreview imageUrl="https://img.test/m.png" alt="Route map of Alps" frameClassName="rounded-3xl h-[200px]">
        {live}
      </RouteMapPreview>,
    );
    const frame = screen.getByAltText("Route map of Alps").parentElement!;
    expect(frame).toHaveClass("rounded-3xl", "h-[200px]", "border-2", "border-border");
  });

  it("falls back to the live map when the image fails, without stealing focus", () => {
    render(
      <RouteMapPreview imageUrl="https://img.test/m.png" alt="Route map of Alps">
        {live}
      </RouteMapPreview>,
    );
    fireEvent.error(screen.getByAltText("Route map of Alps"));
    expect(screen.getByTestId("live-map")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explore map" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Route map" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it("contains the image rather than cropping it", () => {
    render(
      <RouteMapPreview imageUrl="https://img.test/m.png" alt="Route map of Alps">
        {live}
      </RouteMapPreview>,
    );
    const cls = screen.getByAltText("Route map of Alps").className;
    expect(cls).toContain("object-contain");
    expect(cls).toContain("bg-background");
  });
});
