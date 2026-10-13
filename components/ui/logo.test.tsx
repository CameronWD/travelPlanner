import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "@/components/ui/logo";

describe("Logo", () => {
  it("gives variant='mark' an accessible name, not just a hidden svg", () => {
    render(<Logo variant="mark" />);
    expect(screen.getByRole("img", { name: "Teepee" })).toBeInTheDocument();
  });

  it("gives variant='wordmark' an accessible name", () => {
    render(<Logo variant="wordmark" />);
    expect(screen.getByRole("img", { name: "Teepee" })).toBeInTheDocument();
  });

  it("gives the default lockup an accessible name", () => {
    render(<Logo />);
    expect(screen.getByRole("img", { name: "Teepee" })).toBeInTheDocument();
  });

  it("draws the mark's outline in the surface's ink so it survives dark surfaces (LA-193)", () => {
    const { container } = render(<Logo variant="mark" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toMatch(/\btext-foreground\b/);
    const paths = Array.from(svg.querySelectorAll("path"));
    const outlined = paths.filter((p) => p.getAttribute("stroke") !== null);
    expect(outlined.length).toBeGreaterThan(0);
    for (const p of outlined) expect(p.getAttribute("stroke")).toBe("currentColor");
    // The doorway is drawn in the same ink; the tent fill stays brand coral.
    expect(paths.some((p) => p.getAttribute("fill") === "currentColor")).toBe(true);
    expect(paths.some((p) => p.getAttribute("fill") === "#FF6B4A")).toBe(true);
    expect(container.innerHTML).not.toContain("#1D1D1B");
  });
});
