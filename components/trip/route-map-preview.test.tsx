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
});
