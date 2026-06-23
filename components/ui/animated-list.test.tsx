import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedList, AnimatedItem } from "./animated-list";

describe("AnimatedList", () => {
  it("renders all items inside the given container element", () => {
    render(
      <AnimatedList as="ul" className="list-grid">
        <AnimatedItem as="li" key="a">Paris</AnimatedItem>
        <AnimatedItem as="li" key="b">Rome</AnimatedItem>
      </AnimatedList>,
    );
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("Rome")).toBeInTheDocument();
    // Container is a <ul> carrying the passed className.
    const ul = screen.getByText("Paris").closest("ul");
    expect(ul).not.toBeNull();
    expect(ul).toHaveClass("list-grid");
    // Items are <li>.
    expect(screen.getByText("Paris").tagName).toBe("LI");
  });

  it("defaults to a div container and div items", () => {
    render(
      <AnimatedList className="wrap">
        <AnimatedItem key="x">solo</AnimatedItem>
      </AnimatedList>,
    );
    expect(screen.getByText("solo").tagName).toBe("DIV");
  });
});
