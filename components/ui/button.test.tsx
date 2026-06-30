import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Save trip</Button>);
    expect(
      screen.getByRole("button", { name: "Save trip" }),
    ).toBeInTheDocument();
  });

  it("applies the primary variant by default", () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-primary");
  });

  it("applies the destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-destructive");
  });

  it("applies the outline variant", () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("border");
    expect(btn).toHaveClass("bg-background");
  });

  it("applies size classes", () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-9");

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-12");

    rerender(<Button size="icon">Icon</Button>);
    expect(screen.getByRole("button")).toHaveClass("size-11");
  });

  it("shows a spinner and disables the button when loading", () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
  });

  it("does not show a spinner when not loading", () => {
    render(<Button>Idle</Button>);
    expect(screen.queryByTestId("button-spinner")).not.toBeInTheDocument();
  });

  it("includes press-feedback scale on the base, gated by motion-safe", () => {
    render(<Button>Press me</Button>);
    expect(screen.getByRole("button")).toHaveClass("motion-safe:active:scale-[0.98]");
  });

  it("renders as a child element via asChild", () => {
    render(
      <Button asChild>
        {/* href to a non-app path so the next/link lint rule does not trigger */}
        <a href="https://example.com/trips">Trips link</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Trips link" });
    expect(link).toHaveAttribute("href", "https://example.com/trips");
    expect(link).toHaveClass("bg-primary");
  });

  it("marks an asChild button inert and busy while loading", () => {
    render(
      <Button asChild loading>
        <a href="/x">Go</a>
      </Button>,
    );
    const el = screen.getByRole("link", { name: "Go" });
    expect(el).toHaveAttribute("aria-disabled", "true");
    expect(el).toHaveAttribute("aria-busy", "true");
    expect(el.className).toMatch(/pointer-events-none/);
  });
});
