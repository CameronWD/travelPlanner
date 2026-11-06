import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrintMapImage } from "./print-map-image";

describe("PrintMapImage", () => {
  it("renders the image", () => {
    render(<PrintMapImage src="https://img.test/m.png" alt="Route map of Alps" />);
    expect(screen.getByAltText("Route map of Alps")).toHaveAttribute("src", "https://img.test/m.png");
  });

  it("renders nothing once the image errors", () => {
    const { container } = render(<PrintMapImage src="https://img.test/m.png" alt="Route map of Alps" />);
    fireEvent.error(screen.getByAltText("Route map of Alps"));
    expect(container).toBeEmptyDOMElement();
  });
});
