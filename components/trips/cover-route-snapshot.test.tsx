import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CoverRouteSnapshot } from "./cover-route-snapshot";

const fallback = <div data-testid="fallback" />;

describe("CoverRouteSnapshot", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => false });
  });
  afterEach(() => {
    delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).complete;
    delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).naturalWidth;
  });

  it("renders the map image, with empty alt, over the map-fill ground", () => {
    const { container } = render(<CoverRouteSnapshot src="/map.png" chip={null} size="hero" fallback={fallback} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/map.png");
    expect(img.getAttribute("alt")).toBe("");
    expect((container.firstElementChild as HTMLElement).className).toContain("bg-map-fill");
    expect(screen.queryByTestId("fallback")).toBeNull();
  });
  it("shows the chip on the hero size only", () => {
    const { rerender } = render(<CoverRouteSnapshot src="/map.png" chip="+ Bali" size="hero" fallback={fallback} />);
    expect(screen.getByText("+ Bali")).toBeInTheDocument();
    rerender(<CoverRouteSnapshot src="/map.png" chip="+ Bali" size="small" fallback={fallback} />);
    expect(screen.queryByText("+ Bali")).toBeNull();
  });
  it("falls back when the image errors", () => {
    const { container } = render(<CoverRouteSnapshot src="/map.png" chip="+ Bali" size="hero" fallback={fallback} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByText("+ Bali")).toBeNull();
  });
  it("falls back when the image failed before hydration", () => {
    Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 0 });
    const { container } = render(<CoverRouteSnapshot src="/map.png" chip={null} size="hero" fallback={fallback} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
  });
});
